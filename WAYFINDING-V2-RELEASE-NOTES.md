# OVspot Wayfinding V2 — goedgekeurde mockup

Datum: 6 november 2026
Broncommit: a2e7588
Branch: feature/ovspot-wayfinding-v2-20261106
Scope: uitsluitend aparte OVspot Wayfinding Test-app; originele OVspot/Preview, OVbord, kaart en KV8-shadow ongewijzigd.

## Wijzigingen
1. Ritverloop: bij ontbrekende betrouwbare GPS-positie geen 'Nu hier' meer. Gebruik 'Verwachte positie', neutrale blauwe marker en informatie 'Live positie onzeker'. Live tijden kunnen actueel zijn zonder bevestigde GPS.
2. Zoeken: exacte match eerst, haltegroepen met dezelfde naam blijven bij elkaar. Bij 'Leidse' worden alle vier Leidseplein-resultaten boven gedeeltelijke treffers getoond.
3. Geen vertrekken: 'Lijnen op deze halte' met echte GTFS-routes, ook bij een leeg vertrekbord. Geen hardcodes uit mockup of fictieve ritten.
4. Dichtbij: skeleton-kaarten in plaats van losse spinner, kop en navigatie blijven zichtbaar, plus 90s locatie-/straalspecifieke geheugen-cache.

## Backend-koppeling
De V2-app vraagt /app/v1/zoek?q=...&lijnen=1. De toevoeging is in een afzonderlijke test-API v2.0.13 op poort 8113 gecontroleerd. Bestaande publieke v2.0.12 negeert dit veld zonder fout. Live activering vereist aparte rollback en smoke.

## Teststatus
- TypeScript: geslaagd.
- V2 helper tests: 5/5 geslaagd.
- Backend unit tests: 139/139 geslaagd.
- Schaduwservice 127.0.0.1:8113: lijncatalogus inclusief echte tram 3 en ongewijzigd standaard zoekcontract.
- Android-bundel op VPS geblokkeerd door bestaande symlink-/Expo-projectroot-config; Windows QA-test nodig.
- Nog geen APK of API publicatie.

## Behoud
- Node_modules is tijdelijke symlink; niet committen.
- Originele app, kaart, OVbord, Nginx, GTFS en KV8 shadow ongewijzigd.
