"""OVspot API v2 storingen uit actuele KV15/GVB-alerts via eigen SQLite-index.

De huidige GTFS-RT-alerts zijn de gezaghebbende KV15/GVB-invoer. Alleen
leeftijd-gecontroleerde alerts.pb wordt in een eigen SQLite-index gespiegeld.
De verouderde, gedeelde live_data.db wordt niet gebruikt. Geen OVbord HTTP.
JSON-structuur identiek aan v1, ook bij clusters.
"""
from collections import defaultdict
from datetime import datetime
from hashlib import sha1
import os
import re
import sqlite3
import sys
import threading
import time

from kv8_normalisatie import TZ
from board_v2 import _split_name
from notice_rules_v2 import (active_periods, dutch_text, mentioned_lines,
                              normalize_notices, selector_routes)
from storingen_sqlite_v2 import load_or_update

FEED_FILE = os.environ.get(
    "OVSPOT_GTFS_ALERTS_PB", "/home/ubuntu/kv15-bot/.gtfs_rt_cache/alerts.pb"
)
PROTO_SITE = os.environ.get(
    "OVSPOT_PROTO_SITE",
    "/home/ubuntu/kv15-bot/venv/lib/python3.12/site-packages",
)
MAX_AGE = 300
MAX_SIZE = 8 * 1024 * 1024
SERVE_CACHE_SEC = 25
_LOCK = threading.Lock()
_FEED = {"key": None, "by_stop": {}, "timestamp": 0}
_STOP_CACHE = {}
_KNOWN_ROUTE = {}


class Unavailable(Exception):
    """Bron ontbreekt, is verouderd of onleesbaar; dit is niet 'nul storingen'."""


def _pb():
    if PROTO_SITE not in sys.path:
        sys.path.insert(0, PROTO_SITE)
    from google.transit import gtfs_realtime_pb2
    return gtfs_realtime_pb2


def _load_feed(now):
    try:
        st = os.stat(FEED_FILE)
        if st.st_size > MAX_SIZE or st.st_size < 5 or not (0 <= now-st.st_mtime <= MAX_AGE):
            raise Unavailable("GTFS-RT-alertbestand ontbreekt, is oud of te groot")
        key = (st.st_ino, st.st_mtime_ns, st.st_size)
    except OSError as exc:
        raise Unavailable("GTFS-RT-alertbestand niet beschikbaar") from exc
    with _LOCK:
        if _FEED["key"] == key:
            return _FEED
        try:
            proto = _pb()
            feed = proto.FeedMessage()
            with open(FEED_FILE, "rb") as fh:
                data = fh.read(MAX_SIZE+1)
            if len(data) > MAX_SIZE:
                raise Unavailable("GTFS-RT-alertbestand te groot")
            feed.ParseFromString(data)
            stamp = int(feed.header.timestamp or 0)
            if stamp and not (0 <= now-stamp <= MAX_AGE):
                raise Unavailable("GTFS-RT-alertfeed-timestamp verouderd")
            by_stop,stored_stamp,store_source=load_or_update(feed,key,proto)
            _FEED.update(key=key, by_stop=by_stop,timestamp=stored_stamp,
                         opslag=store_source)
            _STOP_CACHE.clear()  # nieuwe feed moet onmiddellijk nieuwe notices opleveren
            return _FEED
        except Unavailable:
            raise
        except Exception as exc:
            raise Unavailable("GTFS-RT-alertfeed kan niet worden gelezen") from exc


def _rt_text(value):
    trans=list(getattr(value,"translation",()) or ())
    for lang in ("nl","nl-NL","NL","en","en-US",""):
        for item in trans:
            if str(item.language or "")==lang and str(item.text or "").strip():
                return str(item.text).strip()
    return str(trans[0].text or "").strip() if trans else ""


def _routes(con,sid,now):
    day=datetime.fromtimestamp(now,TZ).strftime("%Y%m%d")
    sql="""SELECT DISTINCT r.route_id,r.line,r.route_type,r.agency_id
           FROM stop_times st INDEXED BY idx_stop_times_stop
           JOIN trips t ON t.trip_id=st.trip_id
           JOIN routes r ON r.route_id=t.route_id
           JOIN calendar_dates cd ON cd.service_id=t.service_id
             AND cd.date=? AND cd.exception_type=1
           WHERE st.stop_id=?"""
    served={}
    for rid,line,typ,agency in con.execute(sql,(day,sid)):
        served[str(rid)]={"line":str(line or ""),"route_type":int(typ or 0),
                          "agency_id":str(agency or "")}
    return served


def _trip_lookup(con,sid,trip,cache):
    key=(str(trip.trip_id or ""),str(trip.start_date or ""))
    if key not in cache:
        rows=con.execute(
            """SELECT DISTINCT t.route_id,t.service_id
               FROM trips t JOIN stop_times st ON st.trip_id=t.trip_id
               WHERE t.trip_id=? AND st.stop_id=?""",
            (key[0],sid)
        ).fetchall()
        cache[key]={str(rid) for rid,service in rows
                    if not key[1] or con.execute(
                        "SELECT 1 FROM calendar_dates WHERE service_id=? AND date=? AND exception_type=1",
                        (service,key[1])
                    ).fetchone()}
    return cache[key]


def _direction_lookup(con,sid,rid,direction,cache):
    key=(rid,int(direction))
    if key not in cache:
        cache[key]=bool(con.execute(
            """SELECT 1 FROM trips t JOIN stop_times st ON st.trip_id=t.trip_id
               WHERE t.route_id=? AND t.direction_id=? AND st.stop_id=? LIMIT 1""",
            (rid,int(direction),sid)
        ).fetchone())
    return cache[key]


def _entries(con,sid,now,alert_index):
    served=_routes(con,sid,now)
    if not served:
        return []
    try:
        proto=_pb()
    except Exception as exc:
        raise Unavailable("Protobuf-bibliotheek ontbreekt") from exc
    stops={str(sid)}
    trip_cache,dir_cache={},{}
    raw=[]
    for eid,alert in alert_index.get(sid,()):
        periods=[[int(p.start or 0) or None,int(p.end or 0) or None]
                 for p in alert.active_period]
        if not active_periods(periods,now):
            continue
        title=dutch_text(_rt_text(alert.header_text))
        detail=dutch_text(_rt_text(alert.description_text))
        # Alleen een rituitval hoort bij de betreffende vertrekregel, niet als
        # algemene haltewaarschuwing. NO_SERVICE voor een hele lijn blijft wel.
        if re.search(r"\brit(?:ten)?(?:\s+\d{1,6})?\s+(?:(?:is|zijn)\s+)?vervallen\b",title,re.I):
            continue
        named=mentioned_lines(title+" "+detail)
        matched=set()
        stop_ids=set()
        trips=set()
        for selector in alert.informed_entity:
            if str(selector.stop_id or "")!=sid:
                continue
            routes=selector_routes(
                selector,stops,served,
                lambda trip:_trip_lookup(con,sid,trip,trip_cache),
                lambda rid,direct:_direction_lookup(con,sid,rid,direct,dir_cache),
            )
            if named and not selector.route_id and not (
                selector.HasField("trip") and selector.trip.route_id
            ):
                routes={rid for rid in routes
                        if str(served[rid].get("line") or "").upper() in named}
            if not routes:
                continue
            matched.update(routes)
            stop_ids.add(sid)
            if selector.HasField("trip") and selector.trip.trip_id:
                trips.add(str(selector.trip.trip_id))
        if not matched:
            continue
        effect=proto.Alert.Effect.Name(int(alert.effect))
        first=served[sorted(matched)[0]]
        raw.append({
            "id":"gtfsrt:"+eid,"title":title or "Actuele reisinformatie",
            "description":detail or title or "Actuele reisinformatie",
            "line":first["line"],"mode":{0:"tram",1:"metro",2:"train",3:"bus",4:"ferry"}.get(first["route_type"],"ov"),
            "severity":"high" if effect in ("NO_SERVICE","DETOUR","STOP_MOVED")
                else "medium" if effect=="SIGNIFICANT_DELAYS" else "low",
            "time":datetime.fromtimestamp(
                next((p[0] for p in periods if p[0]),None) or now,TZ
            ).isoformat(),
            "source":"GTFS-RT","sources":["GTFS-RT"],
            "carrier":first["agency_id"],"effect":effect,
            "count":1,"route_ids":sorted(matched),
            "stop_ids":sorted(stop_ids),
            "gtfs_trip_ids":sorted(trips),"realtime_trip_ids":[],
            "active_periods":periods,
        })
    return normalize_notices(raw,served,now)


def _kind(notice):
    badge=str(notice.get("badge") or "").strip()
    effect=str(notice.get("effect") or "").upper()
    if effect in ("NO_SERVICE","REDUCED_SERVICE"):
        return "minder","Minder vervoer"
    if badge in ("Halte vervalt","Niet instappen"):
        return "halte",badge
    if badge=="Haltewijziging":
        return "omleiding",badge
    if badge=="Omleiding" or effect=="DETOUR":
        return "omleiding","Omleiding"
    if badge=="Vertraging" or effect=="SIGNIFICANT_DELAYS":
        return "omleiding","Vertraging"
    return "info",badge or "Info"


def _public(row):
    title=str(row.get("title") or "").strip()
    detail=str(row.get("description") or "").strip()
    if detail.casefold()==title.casefold():
        detail=""
    kind,label=_kind(row)
    periods=row.get("active_periods") or []
    starts=[p[0] for p in periods if p and p[0]]
    ends=[p[1] for p in periods if p and len(p)>1 and p[1]]
    ident=sha1((title+"\n"+detail).casefold().encode("utf-8")).hexdigest()[:12]
    return {
        "id":ident,"soort":kind,"label":label,"titel":title or label,"tekst":detail,
        "lijnen":[str(x) for x in (row.get("lines") or []) if str(x).strip()],
        # Modus van de GTFS-route van de storing; frontends filteren hiermee
        # Bus N89-omleidingen weg uit het Metro- en Tram-tabblad.
        "modi":[row["mode"]] if row.get("mode") in ("train","metro","tram","bus","ferry") else [],
        "ernst":str(row.get("severity") or "low"),
        "vanaf_ms":int(min(starts))*1000 if starts else None,
        "tot_ms":int(max(ends))*1000 if ends else None,
        "halte_ids":[str(x) for x in (row.get("stop_ids") or [])],
    }


def _single(con,sid,now,feed):
    key=(sid,feed["key"],datetime.fromtimestamp(now,TZ).strftime("%Y%m%d"))
    with _LOCK:
        hit=_STOP_CACHE.get(key)
        if hit and time.monotonic()-hit[0]<SERVE_CACHE_SEC:
            return hit[1]
    result=_entries(con,sid,now,feed["by_stop"])
    with _LOCK:
        _STOP_CACHE[key]=(time.monotonic(),result)
        if len(_STOP_CACHE)>800:
            _STOP_CACHE.clear()
    return result


def _stop_display(con,sid):
    row=con.execute("SELECT stop_name FROM stops WHERE stop_id=?",(sid,)).fetchone()
    if not row:
        return None
    name,city=_split_name(row[0])
    return name + (", "+city if city else "")


def _cluster_ids(con,sid):
    """Vertaal zoekresultaat naar uitsluitend onderliggende fysieke GTFS-haltes.

    Bij een minimale test-database zonder coördinaten is het exacte stop-ID
    nog steeds geldig; in productie gebruikt dit dezelfde _resolve als halte.
    """
    try:
        from board_v2 import _resolve
        item=_resolve(con,sid)
        if item:
            return list(dict.fromkeys(str(x) for x in item["ids"]))
    except sqlite3.Error:
        pass
    return [str(sid)]


def storingen(stop_ids,gtfs,now=None,source=None):
    now=time.time() if now is None else now
    ids=list(dict.fromkeys(str(x).strip() for x in stop_ids if str(x).strip()))[:30]
    if not ids:
        return {
            "bijgewerkt":datetime.fromtimestamp(now,TZ).isoformat(timespec="seconds"),
            "aantal":0,"storingen":[],"niet_geladen":0
        }
    merged={}
    failed=0
    try:
        feed=source if source is not None else _load_feed(now)
    except Unavailable:
        feed=None
    for sid in ids:
        if feed is None:
            failed+=1
            continue
        try:
            label=_stop_display(gtfs,sid)
            if label is None:
                failed+=1
                continue
            # Eén publiek halte-ID kan meerdere fysieke perrons en nabijgelegen
            # GTFS-parents representeren; exact perron blijft één fysieke stop.
            physical=_cluster_ids(gtfs,sid)
            partial=False
            for physical_sid in physical:
                # Sla dure kalender-/ritjoins over als de huidige feed voor
                # dit concrete perron geen selector bevat.
                if not feed["by_stop"].get(physical_sid):
                    continue
                try:
                    notices=_single(gtfs,physical_sid,now,feed)
                except (sqlite3.Error,Unavailable,KeyError,ValueError,TypeError):
                    partial=True
                    continue
                for entry in notices:
                    notice=_public(entry)
                    ident=notice["id"]
                    item=merged.setdefault(ident,{**notice,"haltes":[]})
                    stop={"id":sid,"naam":label}
                    if stop not in item["haltes"]:
                        item["haltes"].append(stop)
                    item["lijnen"]=sorted(
                        set(item["lijnen"]) | set(notice["lijnen"]),
                        key=lambda v:(len(v),v)
                    )
                    item["modi"]=sorted(set(item["modi"]) | set(notice["modi"]))
                    item["halte_ids"]=sorted(
                        set(item["halte_ids"]) | set(notice["halte_ids"])
                    )
            if partial:
                failed+=1
        except (sqlite3.Error,Unavailable,KeyError,ValueError,TypeError):
            failed+=1
    ranking={"minder":0,"halte":1,"omleiding":2,"info":3}
    items=sorted(merged.values(),key=lambda n:(
        ranking.get(n["soort"],9),-(n["vanaf_ms"] or 0)
    ))
    return {
        "bijgewerkt":datetime.fromtimestamp(now,TZ).isoformat(timespec="seconds"),
        "aantal":len(items),"storingen":items,"niet_geladen":failed,
    }


def halte_storingen(stop_ids,gtfs,now=None,display_id=None):
    """V1-structuur voor haltebord, inclusief alle fysieke cluster-perrons."""
    if display_id is None:
        display_id=(stop_ids if isinstance(stop_ids,str)
                    else next(iter(stop_ids),None))
    if not display_id:
        return []
    return [{k:v for k,v in item.items() if k!="haltes"}
            for item in storingen([display_id],gtfs,now)["storingen"]]