#!/usr/bin/env python3
"""Non-invasive checks for the publicly reachable isolated preview API."""
import json
import urllib.request

ROOT = "https://ovspot.nl"
PREVIEW = ROOT + "/app/v1-preview"
LIVE = ROOT + "/app/v1"

def get(url):
    with urllib.request.urlopen(url, timeout=12) as response:
        if response.status != 200:
            raise RuntimeError(f"{url} -> {response.status}")
        return json.load(response)

p = get(PREVIEW + "/health")
l = get(LIVE + "/health")
assert p["ok"] and p["ovbord"] and p["versie"] == "1.1.0-staging", p
assert l["ok"] and l["ovbord"], l
board = get(PREVIEW + "/halte/4161400?modus=alles&max=30")
assert board["ok"] and board["naam"] == "Splitsing", board
outages = get(PREVIEW + "/storingen?haltes=4161400")
assert outages["gevraagd"] == 1, outages
assert outages["gecontroleerd"] + outages["niet_geladen"] == 1
result = get(PREVIEW + "/zoek?q=Het%20Schouw")
assert result["ok"] and result["resultaten"], result
print("PUBLIC_PREVIEW_OK")
print("PREVIEW", p["versie"], "LIVE", l["versie"])
print("HALTE", board["naam"], "departures", len(board["vertrekken"]))
print("OUTAGES", outages["aantal"], "checked", outages["gecontroleerd"])
print("SEARCH", len(result["resultaten"]))
