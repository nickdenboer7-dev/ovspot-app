# OVspot 1.1.1-KV8 — fix voor EBS-ritverloop (5 november 2026)

## Gebruikersfout
N14 richting Amsterdam Centraal liet `aankomst 04:59 · vertrek 05:04` zien bij De Zedde. De bron gaf echter uit KV8 **aankomst én vertrek 05:04**. De app combineerde GTFS-geplande aankomst met KV8-voorspeld vertrek.

## Oorzaak
`/home/ubuntu/ovbord/app.py` importeert `kv8_multi.py`; de KV8-proef staat al aan voor EBS en andere busoperators (`KV8_LIVE_ON`). Het OVbord-ritantwoord vult bij KV8 `estimated_arrival_at` en `estimated_departure_at`, maar verandert bij `kv8_expected` alleen `departure_time` en `epoch`. OVspot gebruikte ten onrechte `arrival_time` uit GTFS samen met `departure_time` uit KV8.

## Wijziging uitsluitend in OVspot-preview
- Voor EBS: KV8-prioriteit wanneer `kv8_fresh`, `timing_source=kv8_expected`, bronleeftijd maximaal 300 s (indien aanwezig), timestamp plausibel en beide gebeurtenissen logisch zijn.
- Gebruik voor dezelfde halte twee KV8-ISO-gebeurtenissen; geen gemengde GTFS-aankomst en KV8-vertrek.
- Bij geen betrouwbare KV8: **dienstregeling**, ook als GPS recent is. Een GPS-positie is geen haltevoorspelling.
- Bij KV8-verwacht vertrek vóór planning: toon de geplande vertrektijd (en corrigeer gelijktijdig aankomst) om onterecht vroeg vertrek te voorkomen.
- Behoud echte, onderbouwde halteertijd, bijvoorbeeld 05:16 aankomst en 05:18 vertrek.
- Per-halte `bron_tijd` en ritveld `tijden_bron` maken herkomst transparant. Preview-app toont `KV8` in statusregel.
- Geen wijziging aan OVbord, live OVspot, de kaart, en geen uitschakeling van KV8 voor andere apps.

## Controles
- De bestaande 25 tests en 9 nieuwe KV8-tests slagen: 34/34.
- TypeScript typecheck geslaagd.
- Afzonderlijke KV8-lab API draait op localhost poort 18112; getest tegen dezelfde OVbord-data als oude preview op 18111.
- N14 Splitsing verwachte aankomst/vertrek gelijk aan KV8; geen valse vijf minuten wachttijd.
- 111 zonder KV8 valt terug op dienstregeling.
- Native Android preview is al afzonderlijk geïnstalleerd op LDPlayer; een OTA naar uitsluitend `v11-preview` kan de nieuwe statuslabels leveren.

## Uitrollen/rollback
Voer voor de API in een geautoriseerde VPS-shell uit:
```bash
sudo bash /home/ubuntu/ovspot-v11-review-20261105/release/deploy-kv8-preview.sh
```
Alleen preview-service `ovspot-v11-preview-api.service` wordt herstart; productieservice niet. Het script controleert de bronhash van live en preview, maakt een nieuwe rollbackkopie, draait alle regressietests, en controleert de publieke API op versie `1.1.1-kv8-preview`.

Rollback bij een later probleem:
```bash
sudo bash /home/ubuntu/ovspot-v11-review-20261105/release/rollback-kv8-preview.sh
```
De rollback weigert een tussentijds gewijzigd bestand te overschrijven.
