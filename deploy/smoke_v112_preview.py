#!/usr/bin/env python3
"""Check new KV8-only preview endpoint and unchanged production API."""
import json, urllib.request, urllib.parse
def request(url):
    with urllib.request.urlopen(url,timeout=10) as res:
        assert res.status == 200, (res.status,url)
        return json.load(res)
base='https://ovspot.nl'
preview=request(base+'/app/v1-preview/health')
live=request(base+'/app/v1/health')
assert preview.get('ok') and preview.get('versie')=='1.1.2-kv8-preview',preview
assert live.get('ok') and live.get('versie')=='1.0.0',live
stops=request(base+'/app/v1-preview/halte/4161400?max=15')
assert stops.get('ok') and stops.get('vertrekken'), stops
q=request(base+'/app/v1-preview/zoek?q=Het%20Schouw')
assert q.get('ok') and q.get('resultaten'), q
out=request(base+'/app/v1-preview/storingen?haltes=4161400')
assert out.get('ok'),out
print("V112_PUBLIC_PREVIEW_OK")
print("PREVIEW",preview['versie'],"PRODUCTION",live['versie'])
print("HALTE",stops['naam'],len(stops['vertrekken']))
print("OUTAGES_CHECKED",out['gecontroleerd'])
