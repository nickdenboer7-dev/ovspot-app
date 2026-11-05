#!/usr/bin/env python3
"""Non-destructive regression for isolated public V1.1.3 GPS preview."""
import json, urllib.request, urllib.parse
BASE="https://ovspot.nl"
def get(url):
    with urllib.request.urlopen(url, timeout=12) as response:
        assert response.status == 200, (url,response.status)
        return json.load(response)
preview=get(BASE+"/app/v1-preview/health")
live=get(BASE+"/app/v1/health")
assert preview.get("ok") and preview.get("versie")=="1.1.3-position-preview",preview
assert live.get("ok") and live.get("versie")=="1.0.0",live
board=get(BASE+"/app/v1-preview/halte/4161400?max=15")
assert board.get("ok") and board.get("vertrekken"),board
search=get(BASE+"/app/v1-preview/zoek?q=Het%20Schouw")
assert search.get("ok") and search.get("resultaten"),search
outages=get(BASE+"/app/v1-preview/storingen?haltes=4161400")
assert outages.get("ok"),outages
for line,trip,expected in [("394","382999881",18),("395","383000057",12)]:
    q=urllib.parse.urlencode(dict(trip=trip,datum="2026-11-05"))
    route=get(BASE+"/app/v1-preview/rit?"+q)
    assert route.get("ok") and len(route["haltes"])==expected,(line,route.get("haltes_totaal"))
    pos=route.get("nu_hier")
    if pos is not None:
        meters=pos.get("afstand_tot_halte_m")
        assert meters is not None and meters <= 2000,(line,pos)
        if pos["bij_halte"]:
            assert meters <= 80,(line,pos)
    print("ROUTE",line,"stops",len(route["haltes"]),"position_verified",pos is not None)
print("V113_PUBLIC_PREVIEW_OK")
print("PREVIEW",preview["versie"],"PRODUCTION",live["versie"])
