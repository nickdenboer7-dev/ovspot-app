# OVspot Wayfinding UI V1 — goedgekeurde mockup naar appcode

**Status:** uitgewerkt en uitsluitend getest in Git worktree. **Niet** gepubliceerd als APK/OTA.
**Datum:** 2026-11-06
**Bronrepo:** `nickdenboer7-dev/ovspot-app`
**Branch:** `feature/ovspot-wayfinding-ui-20261106`
**Worktree:** `/home/ubuntu/ovspot-wayfinding-ui-20261106`
**Herstelbasis:** `ef86358e488d7ff1b49eb3716a638c447e2eb38e`

## Inhoud
- Zoekkaarten: een sterkere hiërarchie voor haltenaam, plaats en exacte haltegroep, card-border, kleine schaduw en vervoersicoon.
- Multimodaal: één eenvoudig overstapicoon in plaats van het onrustige 2×2 pictogram.
- Voorbeeldlijnbadges: echte lijnen uit `/app/v1/halte/{id}` voor maximaal vier resultaten als zoekterm voldoende specifiek is. Resultaten verschijnen direct; badges worden aanvullend geladen en blijven optioneel. Bij 0 vertrekken verschijnt het actuele `lijnen_aantal` als tekst, **nooit verzonnen lijnnummers**.
- Vertrekbord: echte vervoerderskleuren op lijnbadge, betere witruimte, contrast en subtiele live-achtergrond.
- Ondertitel in haltebord: gekozen haltegroep blijft zichtbaar zodat vier resultaten met dezelfde naam niet verwisseld worden.
- Onderbalk: zachte actieve pill i.p.v. dikke blauwe lijn. Ook zichtbaar in de zoekweergave.
- Light en dark: bestaande palette en tekstcontrast blijven toegepast; uitrol vereist toesteltest voor beide thema's.

## Kleurbronnen (alleen-lezen geverifieerd op de VPS)
- Huidige frontend: `/home/ubuntu/kv15-bot/static/ovspot-v81-6-34-9-3-leaflet/v81-marker-carrier-colors-20261021-r1.js`
- Gecontroleerde bronhash: `5ce2ac8027231d2081ae22bb5cde150e3acdab8a1c3c046c252c06322ffd23a1`
- NS #ffc917 / #003082; GVB #0863b5; Connexxion #d1ea32; EBS #0ec5ff; Arriva #00becd; Qbuzz #ff9622; RET #d82331; HTM #cb3b2c.
- GVB metro-kleuren uit live GTFS `routes.route_color`: 50 #187a36, 51 #ff6600, 52 #00adef, 53 #d81118, 54 #fff200. Bijbehorend tekstcontrast volgt `routes.route_text_color`.
- Niet-geïdentificeerde vervoerder: toegankelijke groene fallback.
- Live website gebruikt soms *route*-specifieke kleuren; de huidige app-API levert geen `route_color`. Voor trams zonder routekleuren geldt daarom een onderscheidende rode UI-fallback, voor bussen de herkenbare vervoerderskleur.

## Uitgevoerde checks
1. `npm run typecheck` — geslaagd.
2. `git diff --check` — geslaagd.
3. `EXPO_NO_TELEMETRY=1 EXPO_OFFLINE=1 CI=1 expo export --platform android` — geslaagd, Hermes-bundel gegenereerd, zonder publicatie.
4. Live API: 4 Amsterdam Centraal-groepen en 4 Leidseplein-groepen, correct aantal vertrekken bij de geselecteerde GTFS-halte-ID's.
5. 8 paletcontroles: NS, GVB bus, CXX, Qbuzz, metro 52, metro 54, CXX-alias, multimodaal icoon — geslaagd.

## Niet uitgevoerd
- Geen EAS Update, EAS Build, APK, Play Store of installatie op de telefoon.
- Geen herstart of wijziging aan API, GTFS, Nginx, OVbord, KV8-shadow of OVspot-kaart.
- Nog geen handmatige beoordeling van de daadwerkelijk gerenderde React Native-schermen op Android bij 360–480dp breedte.
- Geen live UI-performance-meting voor de aanvullende badge-aanvragen.

## Volgende release-gate
Op een testtoestel/vervangbare QA-installatie controleren: small-screen labels, iconen, overscroll/keyboard, dark mode, 4 stationsgroepen, openen van borden en ritten, offline lege badges. Na die controle pas de Android-release publiceren met een expliciet vervolgakkoord. De originele bronbranch blijft ongewijzigd.
