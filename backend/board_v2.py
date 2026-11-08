"""OVspot API v2 halte/dichtbij - GTFS + KV8 + NS InfoPlus; alleen-lezen.

De publiek JSON-sleutels/types zijn gelijk aan v1; de v2-rit en /app/v1 blijven intact.
Planned blijft altijd de fallback: externe live-input wordt alleen bij verifieerbare
trip/dag/passage gebruikt. Geen gebruik van de OVbord-kaart API.
"""
import json
import math
import os
import re
import sqlite3
import threading
import time
import urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from kv8_normalisatie import TZ, normaliseer, tijd_ms

TRAIN_URL = os.environ.get("OVSPOT_NS_SOURCE", "http://127.0.0.1:5000/api/treinen")
CARRIERS = {
    "CXX":"Connexxion", "QBUZZ":"Qbuzz", "ARR":"Arriva", "ARRIVA":"Arriva",
    "EBS":"EBS", "RET":"RET", "GVB":"GVB", "HTM":"HTM", "KEOLIS":"Keolis",
    "NS":"NS", "IFF:NS":"NS", "IFF:ARRIVA":"Arriva",
    "IFF:RRREIS_A":"RRReis", "IFF:BLAUWNET_A":"Blauwnet",
    "IFF:BLAUWNET_K":"Blauwnet", "IFF:RRREIS_K":"RRReis",
    "UOV":"U-OV", "BRAVO:CXX":"Connexxion", "BRAVO:ARR":"Arriva",
}
MODES = {0:"tram", 1:"metro", 2:"train", 3:"bus", 4:"ferry"}
TRAIN_LINE = {"intercity":"IC","intercity direct":"ICD","sprinter":"SPR",
              "stoptrein":"ST","sneltrein":"ST","eurocity":"EC",
              "eurocity direct":"ECD","ice":"ICE","ice international":"ICE",
              "eurostar":"EST", "nightjet":"NJ", "trein":"Trein"}
MAX_ROWS = 5000
PRIMARY_HORIZON_S = 3 * 3600  # Volledige vertrekregels nabij nu, net als OVbord-arrivals
HORIZON_S = 12 * 3600           # Alleen aanvullend: eerste latere rit per nog ontbrekende lijn
LOCK = threading.Lock()
HALTE_CACHE = {}
NEARBY_CACHE = {}
ROUTE_CATALOG_CACHE = {}
NS_CACHE = {"at":0.0,"data":{}}
_GTFS_MAX_AGE = 72 * 3600


def _now_iso(now):
    return datetime.fromtimestamp(now, TZ).isoformat(timespec="seconds")


def _time_hh(ms):
    return datetime.fromtimestamp(ms/1000, TZ).strftime("%H:%M") if ms is not None else ""


def _split_name(raw, train=False):
    name = str(raw or "").strip() or "Halte"
    if ", " in name:
        city, short = name.split(", ", 1)
        short = short.strip()
        if short.startswith("(") and short.endswith(")"):
            short = short[1:-1].strip()
        return short or name, city.strip()
    if train:
        if name.casefold().endswith(" centraal"):
            return "Centraal Station", name[:-len(" centraal")].strip()
        return "Station " + name, name
    return name, ""


def _line_name(name, mode):
    v = str(name or "").strip()
    if mode == "train":
        low = v.lower()
        if low in TRAIN_LINE:
            return TRAIN_LINE[low]
        short = re.match(r"^(?:stoptrein|sneltrein|sprinter|intercity)\s+([A-Za-z]{1,3}\s?\d{1,3})$", v, re.I)
        if short:
            return short.group(1).replace(" ", "").upper()
    if "ipv trein" in v.lower() or "i.p.v. trein" in v.lower():
        return "Bus"
    if len(v) > 6:
        return v.split()[0][:6]
    return v or ("Trein" if mode == "train" else "Bus")


def _distance(lat, lon, a, b):
    x=math.radians(a-lat); y=math.radians(b-lon)
    q=math.sin(x/2)**2 + math.cos(math.radians(lat))*math.cos(math.radians(a))*math.sin(y/2)**2
    return 12742000*math.asin(min(1,math.sqrt(max(0,q))))


def _db_sig():
    try:
        stat=os.stat(os.environ.get("OVSPOT_GTFS_DB", "/home/ubuntu/kv15-bot/gtfs.db"))
        return (stat.st_ino, stat.st_mtime_ns)
    except OSError:
        return None


def _cached(cache,key,ttl,fn):
    now=time.monotonic()
    with LOCK:
        found=cache.get(key)
        if found and now-found[0]<ttl:
            return found[1]
    data=fn()
    with LOCK:
        cache[key]=(time.monotonic(),data)
        if len(cache)>320:
            for k,_ in sorted(cache.items(),key=lambda item:item[1][0])[:len(cache)-280]:
                cache.pop(k,None)
    return data


def _mode_sample(con, stop_ids):
    """Kleine, geindexeerde steekproef; twijfel => groepen NIET samenvoegen."""
    kinds=set()
    for sid in list(stop_ids)[:12]:
        # Maximaal 8 ritten per perron, ook bij grote GTFS-databases.
        rows=con.execute(
            "SELECT r.route_type FROM stop_times st INDEXED BY idx_stop_times_stop "
            "JOIN trips t ON t.trip_id=st.trip_id "
            "JOIN routes r ON r.route_id=t.route_id "
            "WHERE st.stop_id=? LIMIT 8", (sid,)
        ).fetchall()
        kinds.update(r[0] for r in rows if r[0] is not None)
    return frozenset(kinds)


def _resolve(con, stop_id):
    exact=con.execute("SELECT stop_id,stop_code,stop_name,lat,lon,parent_station,location_type,platform_code FROM stops WHERE stop_id=?",(stop_id,)).fetchone()
    if exact is None and stop_id.startswith("NL:Q:"):
        exact=con.execute("SELECT stop_id,stop_code,stop_name,lat,lon,parent_station,location_type,platform_code FROM stops WHERE stop_code=? LIMIT 1",(stop_id[5:],)).fetchone()
    if exact is None:
        return None
    stop_id,code,name,lat,lon,parent,kind,platform=exact
    if kind==0 and re.search(r"\(Perron [^)]+\)\s*$",str(name or ""),re.I):
        # Bij rechtstreeks aanklikken van Perron A niet het hele busstation
        # retourneren: vertrekregels blijven aan dit exacte GTFS-quay-ID.
        return {"id":str(stop_id),"name":str(name or ""),"lat":lat,"lon":lon,
                "ids":[str(stop_id)]}
    root=(stop_id if kind==1 else parent)
    if root:
        parent_row=con.execute("SELECT stop_name,lat,lon FROM stops WHERE stop_id=?",(root,)).fetchone()
        children=con.execute("SELECT stop_id,stop_name,lat,lon,platform_code FROM stops WHERE parent_station=? AND location_type=0 LIMIT 96",(root,)).fetchall()
    else:
        parent_row=None
        children=[]
    if children:
        ids=list(dict.fromkeys(str(r[0]) for r in children))
        rawname=parent_row[0] if parent_row else name
        center_lat=parent_row[1] if parent_row and parent_row[1] is not None else lat
        center_lon=parent_row[2] if parent_row and parent_row[2] is not None else lon
        # De zoek-API kan fysiek overlappende, gelijknamige GTFS-parents
        # als één resultaat tonen. Een klik moet dan ALLE echte vertrekken
        # opleveren, niet alleen de dienstregeling van het eerste parent.
        if parent_row and center_lat is not None and center_lon is not None:
            nearby=con.execute(
                "SELECT stop_id,lat,lon FROM stops "
                "WHERE location_type=1 AND stop_name=? AND stop_id<>? LIMIT 100",
                (rawname,str(root))
            ).fetchall()
            close=[p for p in nearby if p[1] is not None and p[2] is not None
                   and _distance(center_lat,center_lon,p[1],p[2]) <= 100.0]
            if close:
                base_modes=_mode_sample(con,ids)
                for other_root,other_lat,other_lon in close:
                    other_children=con.execute(
                        "SELECT stop_id FROM stops WHERE parent_station=? "
                        "AND location_type=0 LIMIT 96",(other_root,)
                    ).fetchall()
                    other_ids=[str(c[0]) for c in other_children]
                    if other_ids and base_modes and _mode_sample(con,other_ids)==base_modes:
                        ids=list(dict.fromkeys(ids+other_ids))
    else:
        ids=[str(stop_id)]
        rawname=name
        center_lat,center_lon=lat,lon
    if children:
        ids=_station_bus_group_ids(con,root,rawname,center_lat,center_lon,ids)
    return {"id":str(stop_id),"name":str(rawname or name),"lat":center_lat,"lon":center_lon,"ids":ids}



def _station_bus_group_ids(con, root, rawname, center_lat, center_lon, ids):
    """Add nearby GTFS busstation parents to a genuine rail-station parent.

    Individual perron lookups and separate distant busstations remain separate.
    Only real nearby parent_station children can be added (no fictitious stops).
    """
    if not root or center_lat is None or center_lon is None:
        return ids
    if "train" not in {MODES.get(k) for k in _mode_sample(con, ids)}:
        return ids
    name=str(rawname or "").strip()
    city=name.split(",",1)[0].strip()
    if city.lower().startswith("station "):
        city=city[8:].strip()
    if city.lower().endswith(" centraal"):
        city=city[:-8].strip()
    if not city:
        return ids
    # Within 220 m, and a matching city + Busstation name: no generic
    # nearby stops, roads, or unrelated stations can leak into the group.
    candidates=con.execute(
        "SELECT stop_id,stop_name,lat,lon FROM stops "
        "WHERE location_type=1 AND lat BETWEEN ? AND ? "
        "AND lon BETWEEN ? AND ? LIMIT 100",
        (center_lat-0.003,center_lat+0.003,center_lon-0.004,center_lon+0.004)
    ).fetchall()
    result=list(ids)
    included=set(ids)
    for sid,stop_name,lat,lon in candidates:
        if str(sid)==str(root) or lat is None or lon is None:
            continue
        if not str(stop_name or "").casefold().startswith((city+", busstation").casefold()):
            continue
        if _distance(center_lat,center_lon,lat,lon)>220:
            continue
        children=con.execute(
            "SELECT stop_id FROM stops WHERE parent_station=? AND location_type=0 LIMIT 96",
            (sid,)
        ).fetchall()
        other_ids=[str(x[0]) for x in children]
        if not other_ids or "bus" not in {MODES.get(k) for k in _mode_sample(con,other_ids)}:
            continue
        for quay_id in other_ids:
            if quay_id not in included:
                result.append(quay_id)
                included.add(quay_id)
    return result

def _service_days(now, horizon_s=7200):
    local=datetime.fromtimestamp(now, TZ)
    return [local.date()-timedelta(days=1),local.date(),local.date()+timedelta(days=1)]


def _clock(seconds):
    sec=max(0,int(seconds))
    return f"{sec//3600:02d}:{sec%3600//60:02d}:{sec%60:02d}"


def _gtfs_hex(value):
    """Slechts valide officiële RGB-kleurwaarden doorgeven; anders fallback."""
    text=str(value or "").strip().lstrip("#").upper()
    return "#"+text if re.fullmatch(r"[0-9A-F]{6}",text) else None


def _schedule(con, ids, now, limit=60, horizon_s=None):
    """Geïndexeerde GTFS-dienstregeling voor vorige/huidige/volgende dienstdag.

    De vorige GTFS-dag dekt ritten met 24:xx, behalve de terminale halte.
    """
    if not ids:
        return []
    lo=now-30
    horizon_s=HORIZON_S if horizon_s is None else max(1,int(horizon_s))
    hi=now+horizon_s
    ph=",".join("?" for _ in ids)
    sql=f"""SELECT st.trip_id,st.stop_id,st.stop_sequence,st.departure_time,
                   t.service_id,t.realtime_trip_id,t.destination,t.trip_short_name,
                   r.line,r.agency_id,r.route_type,s.platform_code,s.stop_name,
                   r.route_color,r.route_text_color
            FROM stop_times st INDEXED BY idx_stop_times_stop
            JOIN trips t ON t.trip_id=st.trip_id
            JOIN routes r ON r.route_id=t.route_id
            JOIN calendar_dates cd ON cd.service_id=t.service_id AND cd.date=? AND cd.exception_type=1
            JOIN stops s ON s.stop_id=st.stop_id
            WHERE st.stop_id IN ({ph})
              AND st.departure_time BETWEEN ? AND ?
              AND st.departure_time!='00:00:00'
              AND EXISTS (SELECT 1 FROM stop_times nxt
                          WHERE nxt.trip_id=st.trip_id AND nxt.stop_sequence>st.stop_sequence)
            LIMIT {MAX_ROWS}"""
    result=[]
    # De bestaande 12-uursaanroepen blijven ongewijzigd; langere vensters
    # omvatten alle GTFS-dienstdagen, inclusief >24:00 nachtritten.
    start_day=datetime.fromtimestamp(now,TZ).date()-timedelta(days=1)
    end_day=datetime.fromtimestamp(hi,TZ).date()
    for offset in range((end_day-start_day).days+1):
        day=start_day+timedelta(days=offset)
        date=day.isoformat()
        midnight=tijd_ms(date,"00:00:00")
        if midnight is None:
            continue
        min_sec=(lo*1000-midnight)/1000
        max_sec=(hi*1000-midnight)/1000
        if max_sec<0 or min_sec>47*3600:
            continue
        params=[day.strftime("%Y%m%d"),*ids,_clock(min_sec),_clock(max_sec)]
        for trip,sid,seq,dep,service,rt,dest,short,line,agency,typ,platform,stop_name,route_color,route_text_color in con.execute(sql,params):
            planned=tijd_ms(date,dep)
            if planned is None or planned<lo*1000 or planned>hi*1000:
                continue
            result.append({"trip":str(trip),"stop_id":str(sid),"seq":int(seq),"date":date,
                           "planned":planned,"realtime":str(rt or ""),"destination":str(dest or ""),
                           "short":str(short or ""),"line":str(line or ""), "agency":str(agency or ""),
                           "mode":MODES.get(typ,"bus"),"platform":str(platform or ""),
                           "stop_name":str(stop_name or ""),
                           "kleur":_gtfs_hex(route_color),"tekstkleur":_gtfs_hex(route_text_color)})
    result.sort(key=lambda r:(r["planned"],r["trip"],r["seq"]))
    unique={}
    for row in result:
        key=(row["trip"],row["date"],row["seq"])
        unique.setdefault(key,row)
    ordered=list(unique.values())
    # Iedere rit uit het 12-uursvenster blijft beschikbaar: geen beperking
    # tot één latere rit per lijn. Alleen het gevraagde maximum begrenst de array.
    return ordered[:max(1,int(limit))]


def _kv8(con,row,now):
    rt=row["realtime"].split(":")
    if len(rt)!=3 or row["mode"] not in ("bus","tram","metro"):
        return None
    op,line,journey=rt
    # De volledige KV8-passages hebben het echte vehicle-veld. Oude
    # testfixtures missen dit soms: gebruik dan dezelfde vaste velden.
    query="""SELECT operation_date,operator,line,journey,stop_order,quay,userstop,status,
                    target_arr,target_dep,expected_arr,expected_dep,cancelled,received_ts
             {vehicle}
             FROM passages
             WHERE operator=? AND operation_date=? AND line=? AND journey=? AND fortify='0'
               AND stop_order=? LIMIT 1"""
    params=(op,row["date"],line,journey,row["seq"])
    try:
        record=con.execute(query.format(vehicle=",vehicle"),params).fetchone()
    except sqlite3.OperationalError as exc:
        if "no such column: vehicle" not in str(exc):
            return None
        try:
            record=con.execute(query.format(vehicle=""),params).fetchone()
        except sqlite3.OperationalError:
            return None
    if record is None:
        return None
    keys=("OperationDate","DataOwnerCode","LinePlanningNumber","JourneyNumber",
          "UserStopOrderNumber","QuayCode","UserStopCode","TripStopStatus",
          "TargetArrivalTime","TargetDepartureTime","ExpectedArrivalTime","ExpectedDepartureTime")
    try:
        h=normaliseer(dict(zip(keys,record[:12])))
    except (ValueError,TypeError):
        return None
    if not h:
        return None
    if h["gepland_vertrek"] is not None and abs(h["gepland_vertrek"]-row["planned"])>180000:
        return None  # guard: verkeerde stop_order/dienstregeling
    status=h["status"]
    # KV8 timestamps mogen maximaal 30s voorlopen op de lokale klok.
    # Anders verdwijnen verse CXX/Qbuzz-passages tijdelijk uit live.
    fresh=bool(record[13] is not None and -30<=now-float(record[13])<=180)
    cancelled=bool(record[12])
    vehicle=""
    if fresh and not cancelled and status in ("ARRIVED","DRIVING","PASSED"):
        raw=str(record[14] or "").strip() if len(record)>14 else ""
        if re.fullmatch(r"[A-Za-z0-9-]{1,18}",raw):
            # Uit exact dezelfde operator/dag/rit/haltevolgorde als de passage.
            # Geen voertuig bij oude, gecancelde of onbekende passage.
            vehicle=op+"_"+raw
    if status=="PASSED":
        return {"cancelled":cancelled,"live":False,"vehicle":vehicle}
    predicted=h["live_vertrek"] if h["live_vertrek"] is not None else h["live_aankomst"]
    expected=record[10] is not None or record[11] is not None
    live=bool(fresh and status in ("ARRIVED","DRIVING") and expected and not cancelled)
    if live and not vehicle:
        # Geen voertuig verzinnen: alleen het echte NDOV-ritnummer van dezelfde
        # bevestigde operator/dag/lijn/rit/passage als bruikbare fallback.
        rt=str(row.get("realtime") or "")
        if re.fullmatch(r"[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+",rt):
            vehicle=rt
    return {"live":live,"cancelled":cancelled,"predicted":predicted if live else None,
            "vehicle":vehicle}


def _is_fresh_ns(update,now):
    if not isinstance(update,dict):
        return False
    try:
        t=datetime.fromisoformat(str(update.get("updated","")).replace("Z","+00:00")).timestamp()
        return -30<=now-t<=150
    except (ValueError,TypeError):
        return False


def _ns_snapshot(now):
    if time.monotonic()-NS_CACHE["at"]<12:
        return NS_CACHE["data"]
    try:
        req=urllib.request.Request(TRAIN_URL,headers={"Accept":"application/json","User-Agent":"ovspot-app-api-v2/board"})
        with urllib.request.urlopen(req,timeout=2.5) as response:
            raw=response.read(4500000)
        parsed=json.loads(raw)
        if not _is_fresh_ns(parsed,now):
            result={}
        else:
            result={}
            for item in parsed.get("trains") or []:
                if (item.get("carrier")=="NS" and item.get("passenger_service") is True
                        and item.get("rit_source")=="infoplus"):
                    result[str(item.get("train_id") or "")]=item
    except (OSError,TimeoutError,ValueError,KeyError):
        result={}
    NS_CACHE.update({"at":time.monotonic(),"data":result})
    return result


def _norm_station(name):
    name=str(name or "").casefold().strip()
    name=re.sub(r"\b(station|centraal station)\b","",name)
    return re.sub(r"[^\w]+","",name)


def _ns(row, trains, now):
    if row["mode"]!="train" or row["agency"].upper()!="IFF:NS":
        return None
    item=trains.get(row["short"])
    if item is None or item.get("train_date")!=row["date"]:
        return None
    try:
        gps=datetime.fromisoformat(str(item.get("gps_time") or "").replace("Z","+00:00")).timestamp()
        if not (-30<=now-gps<=150):
            return None
    except (ValueError,TypeError):
        return None
    station=_norm_station(row["stop_name"])
    if not station:
        return None
    for stop in item.get("route_stops") or []:
        if _norm_station(stop.get("name"))!=station:
            continue
        expected=stop.get("planned_departure") or stop.get("planned_arrival")
        actual=stop.get("departure") or stop.get("arrival")
        if not expected or not actual:
            continue
        try:
            tplan=datetime.fromisoformat(expected.replace("Z","+00:00")).timestamp()
            tactual=datetime.fromisoformat(actual.replace("Z","+00:00")).timestamp()
        except (ValueError,TypeError):
            continue
        if abs(tplan*1000-row["planned"])>180000:
            continue
        # Check the station-specific InfoPlus time, not a train-wide shift.
        return {"live":True,"predicted":int(tactual*1000),
                "platform":str(stop.get("track") or row["platform"])}
    return None


def _verified_train_passages(gtfs,rows,now,source=None):
    """One strict InfoPlus link for all departures on a board.

    Only claim live for complete GTFS trip + service day + carrier + train number,
    ordered stop-name/planned-time anchors and fresh, authentic InfoPlus.
    """
    selected=[r for r in rows if r["mode"]=="train"]
    if not selected:
        return {}
    try:
        from trein_compat import (
            _snapshot,_gtfs_trip,_matched_train,_feed_stop_time
        )
        snapshots=_snapshot(now) if source is None else source
        if not snapshots:
            return {}
        out={}
        seen={}
        for row in selected:
            key=(row["trip"],row["date"])
            if key not in seen:
                meta=_gtfs_trip(gtfs,row["trip"],row["date"])
                if meta is None:
                    seen[key]=(None,{})
                else:
                    train,matched=_matched_train(meta,snapshots,now)
                    by_passage={meta["stops"][i]["seq"]:info for i,info in matched.items()}
                    seen[key]=(train,by_passage)
            train,by_passage=seen[key]
            if train is None:
                continue
            info=by_passage.get(row["seq"])
            if info is None:
                continue
            predicted=_feed_stop_time(info,"departure")
            if predicted is None:
                predicted=_feed_stop_time(info,"arrival")
            if predicted is None or abs(predicted-row["planned"])>2*3600*1000:
                continue
            out[(row["trip"],row["date"],row["seq"])]={
                "live":True,"predicted":int(predicted),
                "platform":str(info.get("track") or row["platform"]),
                "vehicle":str(row["short"] or ""),
            }
        return out
    except (sqlite3.Error,TypeError,ValueError,OSError):
        return {}


def _departure(row,kv8,ns,now,verified_trains=None):
    planned=row["planned"]
    enriched=None
    if row["mode"]=="train":
        enriched=(
            verified_trains.get((row["trip"],row["date"],row["seq"]))
            if verified_trains is not None else _ns(row,ns,now)
        )
    elif row["mode"] in ("bus","tram","metro"):
        enriched=_kv8(kv8,row,now)
    live=bool(enriched and enriched.get("live"))
    cancelled=bool(enriched and enriched.get("cancelled"))
    predicted=enriched.get("predicted") if live else None
    effective=max(planned,predicted) if predicted is not None else planned
    # Minder dan 60 seconden vertraging tonen we net als v1 als 0 min.
    delta_s=max(0,(effective-planned)/1000) if live else 0
    delay=int(round(delta_s/60)) if delta_s>=60 else 0
    carrier=CARRIERS.get(row["agency"].upper())
    if not carrier:
        carrier=CARRIERS.get(row["realtime"].split(":")[0],row["agency"].removeprefix("IFF:"))
    short=_line_name(row["line"],row["mode"])
    tripref={"trip":row["trip"],"datum":row["date"]}
    # V1 doet dit alleen als het exacte voertuig bekend is; geen voertuig verzinnen.
    if row["mode"]=="train" and live and row["short"]:
        tripref["voertuig"]=row["short"]
    elif row["mode"] in ("bus","tram","metro") and enriched and enriched.get("vehicle"):
        tripref["voertuig"]=enriched["vehicle"]
    return {"lijn":short,"lijn_naam":row["line"],"modus":row["mode"],
            **({"kleur":row["kleur"]} if row.get("kleur") else {}),
            **({"tekstkleur":row["tekstkleur"]} if row.get("tekstkleur") else {}),
            "bestemming":row["destination"] or "Bestemming onbekend",
            "vervoerder":carrier or "", "gepland":_time_hh(planned),"verwacht":_time_hh(effective),
            "vertrek_ms":int(effective),"vertraging_min":int(delay),
            "live":live,"vervallen":cancelled,"spoor":(enriched or {}).get("platform") or row["platform"],
            "rit":tripref}



def _balanced_departures(deps, limit):
    """Show departures for every available mode, even at busy stations.

    The API still respects max; within it, reserve an equal initial quota for
    each mode, fill remaining spaces in chronological order, then sort by time.
    """
    if len(deps)<=limit:
        return deps
    modes=list(dict.fromkeys(d["modus"] for d in deps))
    if len(modes)<2:
        return deps[:limit]
    picked=set()
    quota=max(1,int(limit)//len(modes))
    for mode in modes:
        taken=0
        for i,d in enumerate(deps):
            if d["modus"]==mode and taken<quota:
                picked.add(i)
                taken+=1
    for i in range(len(deps)):
        if len(picked)>=limit:
            break
        picked.add(i)
    return [deps[i] for i in sorted(picked,key=lambda i:deps[i]["vertrek_ms"])][:limit]

def halte(stop_id,modus,limit,gtfs,kv8,now=None,ns=None):
    now=time.time() if now is None else now
    sig=_db_sig()
    key=(sig,str(stop_id),modus,int(limit))
    if ns is not None:
        return _halte_uncached(stop_id,modus,limit,gtfs,kv8,now,ns)
    return _cached(HALTE_CACHE,key,10,lambda:_halte_uncached(stop_id,modus,limit,gtfs,kv8,now,None))


def _halte_uncached(stop_id,modus,limit,gtfs,kv8,now,ns):
    stop=_resolve(gtfs,stop_id)
    if stop is None:
        return None
    rows=_schedule(gtfs,stop["ids"],now,limit=max(90,int(limit)*4))
    modes=sorted({r["mode"] for r in rows})  # v1: modi vóór het vertrekfilter bepalen
    if modus=="trein":
        rows=[r for r in rows if r["mode"]=="train"]
    elif modus=="bus":
        rows=[r for r in rows if r["mode"]!="train"]
    # Live-treininfo alleen na volledige, unieke trip-/dag-/route-matching.
    # Bij expliciet geïnjecteerde data (oude tests) blijft _ns() testbaar.
    trains=ns if ns is not None else {}
    verified=None if ns is not None else _verified_train_passages(gtfs,rows,now)
    deps=[_departure(r,kv8,trains,now,verified) for r in rows]
    deps=[d for d in deps if d["vertrek_ms"]>=now*1000-30000]
    deps.sort(key=lambda d:d["vertrek_ms"])
    name,city=_split_name(stop["name"],train="train" in modes)
    perron=re.search(r"\((Perron [^)]+)\)\s*$",name,re.I)
    if perron:
        name=perron.group(1)
    try:
        age=now-os.stat(os.environ.get("OVSPOT_GTFS_DB","/home/ubuntu/kv15-bot/gtfs.db")).st_mtime
    except OSError:
        age=float("inf")
    try:
        # Exact aangevraagde perron/halte-ID; geen melding van een andere halte.
        # Alleen lokale, verse GTFS-RT-alertbron; falen mag vertrektijden nooit blokkeren.
        from storingen_v2 import halte_storingen
        notices=halte_storingen(stop["ids"],gtfs,now,display_id=str(stop_id))
    except Exception:
        notices=[]
    return {"id":str(stop_id),"naam":name,"plaats":city,
            "lat":stop["lat"],"lon":stop["lon"],"modi":modes,
            "bijgewerkt":_now_iso(now),"verouderd":bool(age>_GTFS_MAX_AGE),
            "vertrekken":_balanced_departures(deps,limit) if modus=="alles" else deps[:limit],
            "storingen":notices}



CLUSTER_RADIUS_M = 200
BOARD_WINDOW_S = 120 * 60
BOARD_TYPES = frozenset(("train", "bus", "tram"))


def _quays_within_radius(gtfs, lat, lon, radius=CLUSTER_RADIUS_M):
    """Alle echte halte- en perron-ID's fysiek binnen 200 m; géén naamheuristiek."""
    dy=radius/111120.0
    dx=radius/(111120.0*max(0.1,math.cos(math.radians(lat))))
    rows=gtfs.execute(
        """SELECT stop_id,stop_name,lat,lon,platform_code FROM stops
           INDEXED BY idx_stops_latlon
           WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
             AND location_type=0""",
        (lat-dy,lat+dy,lon-dx,lon+dx)
    ).fetchall()
    result=[]
    for sid,name,slat,slon,platform in rows:
        if slat is None or slon is None:
            continue
        distance=_distance(lat,lon,slat,slon)
        if distance <= radius:
            result.append({
                "id":str(sid),"naam":str(name or ""),
                "afstand_m":round(distance,1),
                "perron":str(platform or ""),
            })
    result.sort(key=lambda x:(x["afstand_m"],x["id"]))
    return result


def _vertrektijden_pos(gtfs, stop_id, lat, lon):
    """Het ID is leidend; bij GPS-coördinaten is geen GTFS-parent vereist."""
    if stop_id:
        row=gtfs.execute(
            "SELECT stop_id,stop_name,lat,lon FROM stops WHERE stop_id=?",
            (stop_id,)
        ).fetchone()
        if row is None and stop_id.startswith("NL:Q:"):
            row=gtfs.execute(
                "SELECT stop_id,stop_name,lat,lon FROM stops WHERE stop_code=? LIMIT 1",
                (stop_id[5:],)
            ).fetchone()
        if row is None or row[2] is None or row[3] is None:
            return None
        return (str(row[0]),str(row[1] or ""),float(row[2]),float(row[3]))
    if lat is None or lon is None:
        return None
    return (None,"Haltes in de buurt",float(lat),float(lon))


def _vertrektijden_items(rows,gtfs,kv8,now,limit):
    """Echte geplande + gecontroleerde realtime tijd; dedup binnen haltecluster."""
    if not rows:
        return []
    # Voor toekomstige ochtendritten geen dure, betekenisloze live-treinmatch.
    # Alleen een rit binnen 2 uur kan een verifieerbare actuele livepassage hebben.
    active_train_rows=[r for r in rows
                       if r["mode"]=="train" and r["planned"]<=int((now+7200)*1000)]
    verified=_verified_train_passages(gtfs,active_train_rows,now) if active_train_rows else {}
    departures=[]
    seen=set()
    for row in rows:
        if row["mode"] not in BOARD_TYPES:
            continue
        dep=_departure(row,kv8,{},now,verified)
        if dep["vervallen"] or dep["vertrek_ms"]<int(now*1000)-30000:
            continue
        # Eén passage per rit/dienstdag voor haltes die 20-200 m uit elkaar liggen.
        # Het echte GTFS stop_sequence blijft in de ritreferentie behouden.
        key=(row["trip"],row["date"])
        if key in seen:
            continue
        seen.add(key)
        departure={
            **dep,
            "type":row["mode"],
            "lijnnummer":dep["lijn"],
            "stop_id":row["stop_id"],
            "halte":row["stop_name"],
            "haltepaal":row["stop_id"] if row["mode"]!="train" else None,
            "perron":dep["spoor"] if row["mode"]=="train" else None,
            "planned_departure":_now_iso(row["planned"]/1000),
            "expected_departure":_now_iso(dep["vertrek_ms"]/1000),
        }
        departures.append(departure)
    departures.sort(key=lambda d:(d["vertrek_ms"],d["lijnnummer"],d["stop_id"]))
    return departures[:max(1,int(limit))]


def vertrektijden(gtfs,kv8,stop_id=None,lat=None,lon=None,limit=30,now=None):
    """Multimodaal 200-m-haltebord; bij 0 vertrek in 120m de volgende 10.

    Bewust een apart opt-in-endpoint: de bestaande /halte- en /dichtbij-
    contracten, lijnfilters en KV8/GPS-matching veranderen niet.
    """
    now=time.time() if now is None else float(now)
    spot=_vertrektijden_pos(gtfs,stop_id,lat,lon)
    if spot is None:
        return None
    resolved_id,name,base_lat,base_lon=spot
    quays=_quays_within_radius(gtfs,base_lat,base_lon)
    ids=[q["id"] for q in quays]
    modes=("bus","train","tram")
    if not ids:
        return {
            "halte_id":resolved_id,"naam":name,"lat":base_lat,"lon":base_lon,
            "cluster_straal_m":CLUSTER_RADIUS_M,"haltes":quays,"types":[],
            "bijgewerkt":_now_iso(now),"venster_min":120,
            "nacht_fallback":False,"aantal":0,"vertrekken":[]
        }

    # Een ruime voorselectie voorkomt dat bij een groot station alle bus-/tram-
    # vertrekken verdwijnen doordat de trein de eerste 30 ritten vult.
    capacity=min(MAX_ROWS,max(300,int(limit)*15))
    rows=_schedule(gtfs,ids,now,limit=capacity,horizon_s=BOARD_WINDOW_S)
    found=_vertrektijden_items(rows,gtfs,kv8,now,limit)
    fallback=False
    horizon=BOARD_WINDOW_S
    if not found:
        fallback=True
        # Beschikbare GTFS-tijdspanne aflopen zonder een vaste 12u-afkap.
        # Geleidelijk verlengen; stop zodra er 10 komende vertrekken zijn.
        want=min(10,int(limit))
        for horizon in (24*3600,48*3600,7*86400,35*86400):
            rows=_schedule(gtfs,ids,now,limit=capacity,horizon_s=horizon)
            found=_vertrektijden_items(rows,gtfs,kv8,now,want)
            if len(found)>=want:
                break
    types=sorted({dep["type"] for dep in found})
    return {
        "halte_id":resolved_id,"naam":name,"lat":base_lat,"lon":base_lon,
        "cluster_straal_m":CLUSTER_RADIUS_M,"haltes":quays,"types":types,
        "bijgewerkt":_now_iso(now),"venster_min":120,
        "nacht_fallback":fallback,"zoekhorizon_uren":round(horizon/3600,2),
        "aantal":len(found),"vertrekken":found
    }


MAX_ROUTE_SHAPE_POINTS = 1200
MAX_ROUTE_SHAPE_READ = 16000
MAX_ROUTE_STOPS = 400


def _valid_geo(lat, lon):
    """Gebruik uitsluitend finite WGS84-coördinaten uit deze GTFS-rit."""
    try:
        a, b = float(lat), float(lon)
        return math.isfinite(a) and math.isfinite(b) and -90 <= a <= 90 and -180 <= b <= 180 and not (a == 0 and b == 0)
    except (TypeError, ValueError, OverflowError):
        return False


def _sample_shape(points, limit=MAX_ROUTE_SHAPE_POINTS):
    """Uniforme decimatie met behoud van eerste en laatste GTFS-vertex."""
    if len(points) <= limit:
        return points
    last = len(points) - 1
    return [points[(i * last) // (limit - 1)] for i in range(limit)]


def rit_kaart_geometrie(gtfs, trip_id):
    """Alleen-lezen shape en haltes van één exacte GTFS-trip.

    Shapevolgorde komt van shapes.seq; ontbrekende shape wordt vervangen door
    de fysieke haltevolgorde, nooit door een geschatte lijnverbinding.
    """
    meta=gtfs.execute(
        """SELECT t.shape_id, r.route_color FROM trips t
           LEFT JOIN routes r ON r.route_id=t.route_id WHERE t.trip_id=?""",
        (str(trip_id),)
    ).fetchone()
    if meta is None:
        return {"shape":[],"stops":[],"route_color":"#1E3A8A","shape_bron":"geen"}
    shape_id,raw_color=meta
    route_color=_gtfs_hex(raw_color) or "#1E3A8A"
    stops=[]
    rows=gtfs.execute(
        """SELECT st.stop_id, s.stop_name, s.lat, s.lon, st.stop_sequence
           FROM stop_times st LEFT JOIN stops s ON s.stop_id=st.stop_id
           WHERE st.trip_id=? ORDER BY st.stop_sequence LIMIT ?""",
        (str(trip_id), MAX_ROUTE_STOPS + 1)
    ).fetchall()
    if len(rows) > MAX_ROUTE_STOPS:
        # Geen half ritverloop aan de gebruiker suggereren.
        rows=[]
    for sid,name,lat,lon,seq in rows:
        if not _valid_geo(lat,lon):
            continue
        stops.append({
            "stop_id":str(sid or ""),"stop_name":str(name or ""),
            "latitude":float(lat),"longitude":float(lon),
            "stop_sequence":int(seq),
        })
    shape=[]
    if shape_id:
        for lat,lon in gtfs.execute(
            """SELECT lat,lon FROM shapes INDEXED BY idx_shapes_shape_seq
               WHERE shape_id=? ORDER BY seq LIMIT ?""",
            (shape_id, MAX_ROUTE_SHAPE_READ)
        ):
            if not _valid_geo(lat,lon):
                continue
            pos={"latitude":float(lat),"longitude":float(lon)}
            if shape and shape[-1]==pos:
                continue
            shape.append(pos)
    found_shape=len(shape)>=2
    if not found_shape:
        shape=[]
        for stop in stops:
            pos={"latitude":stop["latitude"],"longitude":stop["longitude"]}
            if not shape or shape[-1]!=pos:
                shape.append(pos)
    else:
        shape=_sample_shape(shape)
    return {
        "shape":shape,"stops":stops,
        "route_color":route_color,
        "shape_bron":"gtfs" if found_shape else "stops",
    }

def _nearby_stops(con,lat,lon,straal):
    dy=straal/111120
    dx=straal/(111120*max(.1,math.cos(math.radians(lat))))
    rows=con.execute(
        """SELECT stop_id,stop_name,lat,lon,parent_station
           FROM stops INDEXED BY idx_stops_latlon
           WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
             AND location_type=0""",
        (lat-dy,lat+dy,lon-dx,lon+dx)
    ).fetchall()
    groups={}
    for sid,name,slat,slon,parent in rows:
        if slat is None or slon is None:
            continue
        distance=_distance(lat,lon,slat,slon)
        if distance>straal:
            continue
        # Een expliciet perron is een eigen instapplaats. Het GTFS-parent
        # samenvoegen verwart Perron A/B/C en geeft de lijnen van álle perrons.
        perron=bool(re.search(r"\(Perron [^)]+\)\s*$",str(name or ""),re.I))
        key=sid if perron else (parent or sid)
        old=groups.get(key)
        if old is None or distance<old[0]:
            groups[key]=(distance,str(sid),str(name or ""))
    return sorted(groups.values(),key=lambda x:(x[0],x[1]))


def _route_catalog(con, stop_ids):
    """Volledige GTFS-lijnen en modi, ook zonder vertrek binnen het tijdvenster.

    Elke stop-ID komt van _resolve(): echte perrons van dezelfde haltegroep.
    Nooit alleen uit de eerstvolgende zes vertrekken afleiden.
    """
    ids=tuple(sorted({str(sid) for sid in stop_ids if sid}))
    if not ids:
        return [],[]
    key=(_db_sig(),ids)
    with LOCK:
        hit=ROUTE_CATALOG_CACHE.get(key)
        if hit:
            return hit
    names=set()
    modes=set()
    for start in range(0,len(ids),250):
        group=ids[start:start+250]
        q=",".join("?" for _ in group)
        # Laat de optimizer de bestaande covering index (stop_id,trip_id,seq)
        # kiezen; deze vermijdt extra stop_times-tabellezingen.
        sql=("SELECT DISTINCT r.line,r.route_type FROM stop_times st "
             "JOIN trips t ON t.trip_id=st.trip_id JOIN routes r ON r.route_id=t.route_id "
             "WHERE st.stop_id IN ("+q+")")
        for raw,typ in con.execute(sql,group):
            name=str(raw or "").strip()
            if name:
                names.add({"intercity":"IC","sprinter":"SPR"}.get(name.casefold(),name))
            mode=MODES.get(typ)
            if mode:
                modes.add(mode)
    def line_key(v):
        if v.isdecimal():
            return (0,int(v),"")
        night=re.fullmatch(r"N(\d+)",v,re.I)
        if night:
            return (1,int(night.group(1)),"")
        return (2,0,v.casefold())
    lines=sorted(names,key=line_key)
    order=("train","metro","tram","bus","ferry")
    result=(lines,[m for m in order if m in modes])
    with LOCK:
        ROUTE_CATALOG_CACHE[key]=result
        if len(ROUTE_CATALOG_CACHE)>600:
            for old in list(ROUTE_CATALOG_CACHE)[:200]:
                ROUTE_CATALOG_CACHE.pop(old,None)
    return result


def dichtbij(lat,lon,straal,max_haltes,gtfs,kv8,now=None,offset=0):
    now=time.time() if now is None else now
    sig=_db_sig()
    key=(sig,round(lat,4),round(lon,4),int(straal),int(max_haltes),int(offset))
    def build():
        nearby=_nearby_stops(gtfs,lat,lon,straal)
        items=[]
        selected_physical_ids=set()
        ns=None
        begin=max(0,int(offset))
        volgend=begin
        for idx in range(begin,len(nearby)):
            if len(items)>=max_haltes:
                break
            volgend=idx+1
            distance,sid,rawname=nearby[idx]
            resolved=_resolve(gtfs,sid)
            source_ids=(resolved["ids"] if resolved else [sid])
            if selected_physical_ids.intersection(source_ids):
                continue
            try:
                h=halte(sid,"alles",6,gtfs,kv8,now=now,ns=ns)
                if h is None:
                    continue
                explicit=re.search(r"\((Perron [^)]+)\)\s*$",rawname,re.I)
                source_ids=[sid] if explicit else source_ids
                lines,route_modes=_route_catalog(gtfs,source_ids)
                # Als dit een specifiek perron is: lees ook alleen vertrekregels
                # van dat éne perron, nooit van de hele parent-haltegroep.
                # halte(sid) gebruikt voor een expliciet perron nu hetzelfde
                # exacte quay-ID. Geen dubbele query of vreemde andere perrons.
                deps=h["vertrekken"][:2]
                nm,city=h["naam"],h["plaats"]
                lat2,lon2=h["lat"],h["lon"]
                # Volledige lijninformatie, niet alleen uit volgende 6 vertrekken.
                modes=route_modes or h["modi"]
                if not lines and not deps:
                    continue
                items.append({"id":sid,"naam":nm,"plaats":city,
                              "afstand_m":int(round(distance)),"lat":lat2,"lon":lon2,
                              "modi":modes,"lijnen":lines,"vertrekken":deps,
                              "fout":None,"storingen_aantal":len(h["storingen"])})
                selected_physical_ids.update(source_ids)
            except (sqlite3.OperationalError,TimeoutError):
                name,city=_split_name(rawname)
                items.append({"id":sid,"naam":name,"plaats":city,"afstand_m":int(round(distance)),
                              "lat":None,"lon":None,"modi":[],"lijnen":[],
                              "vertrekken":[],"fout":"Vertrektijden tijdelijk niet beschikbaar"})
        # Optionele tweede regel voor gelijknamige fysieke clusters.
        # Bestaande v1-sleutels blijven identiek; clients die 'sub' niet
        # kennen negeren deze optionele toevoeging.
        names={}
        for item in items:
            names.setdefault(str(item["naam"]).casefold(),[]).append(item)
        mode_label={"train":"Trein","metro":"Metro","tram":"Tram",
                    "bus":"Bus","ferry":"Veer"}
        for copies in names.values():
            if len(copies)<2:
                continue
            coords=[x for x in copies if x.get("lat") is not None and x.get("lon") is not None]
            use_lat=(max((x["lat"] for x in coords),default=0)
                     -min((x["lat"] for x in coords),default=0))*111000 >= (
                     max((x["lon"] for x in coords),default=0)
                     -min((x["lon"] for x in coords),default=0))*67000
            axis="lat" if use_lat else "lon"
            ordered=sorted(coords,key=lambda x:x[axis])
            for index,item in enumerate(ordered):
                kind=" en ".join(mode_label.get(m,m) for m in item["modi"]) or "Halte"
                side=("zuidzijde" if index==0 else "noordzijde" if index==len(ordered)-1 else "midden") if use_lat else (
                    "westzijde" if index==0 else "oostzijde" if index==len(ordered)-1 else "midden")
                item["sub"]=kind+" · "+side
        # Offset verwijst naar de gesorteerde GTFS-kandidaten, niet naar het
        # aantal afgeleverde kaarten: ook lege en samengevoegde haltes tellen
        # mee. Zo worden verder gelegen haltes niet overgeslagen bij scrollen.
        return {"bijgewerkt":_now_iso(now),"haltes":items,
                "radius":int(straal),"heeft_meer":volgend<len(nearby),
                "volgende_offset":volgend if volgend<len(nearby) else None}
    return _cached(NEARBY_CACHE,key,20,build)
