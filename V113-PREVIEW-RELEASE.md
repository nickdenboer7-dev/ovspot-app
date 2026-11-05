# OVspot V1.1.3 — GPS-positie (gecontroleerde preview)

Datum: 5 november 2026. Nooit direct uitrollen naar `/app/v1` of de website.

## Probleem en oorzaak
- Bij lijn 394 en 395 verscheen "Nu hier" wanneer de bus volgens de planning dicht bij een halte moest zijn, terwijl alleen de GPS-versheid bekend was.
- De oude functie gebruikte de geplande haltetijd in plaats van de daadwerkelijke GPS-afstand tot de halte.
- De KV8-betrouwbaarheid van vertrektijden is een **andere** status dan de betrouwbaarheid van de locatie.

## Aangepast
- Toon "Nu hier" alleen als de GPS-fix maximaal 120 seconden oud is, de gekozen haltetijd binnen 6 minuten valt, de ruwe OVbord-haltecoördinaten bekend zijn en de afstand tot de halte maximaal 80 meter bedraagt.
- Bij een afstand van 80 tot 2.000 meter: toon "Onderweg · Volgende halte", niet "Nu hier".
- Bij onmogelijke, ontbrekende of oude GPS: geen bevestigde huidige halte.
- Status van vertrektijden wordt korter: "Tijden gepland" als de eerstvolgende halte geen bevestigde KV8-verwachting heeft. KV8 op latere haltes blijft per halte herkenbaar.
- De volledige rit blijft vanaf de eerste tot de laatste halte beschikbaar.
- Lijn 395 De Vlinder 10:33 aankomst / 10:35 vertrek is de echte GTFS-wachttijd en blijft terecht zichtbaar.

## Tests
- 49/49 backendtests, inclusief 8 geografische regressies en de minuutgrenstest.
- TypeScript-controle en Android-bundel geslaagd.
- LDPlayer-QA: live lijn 394 "Nu hier" bij Noordwachter, gevolgd door "Onderweg — Barkstraat" terwijl het voertuig nog niet bij Barkstraat was.
- Werkelijke GPS-locaties en haltecoördinaten vergeleken. Geen ADB-testdata gefabriceerd; de QA-app gebruikte de tijdelijke API op poort 18115 via een PC/ADB-tunnel.
- API en UI blijven in de preview los van `nl.ovspot.app` voor gewone gebruikers. Het QA-kanaal `ldplayer-v11-qa` is afzonderlijk bijgewerkt.

## Veilige productie-isolatie
- De huidige preview blijft `1.1.2-kv8-preview` totdat het deployscript met sudo is uitgevoerd.
- De gewone app-API blijft `1.0.0`; OVspot-kaartservice en Nginx worden niet gewijzigd.
- Rollback maakt een gedateerde kopie van de huidige preview-API, controleert checksums en wijzigt uitsluitend `ovspot-v11-preview-api.service`.

## Previewbackend deploy
```bash
sudo bash /home/ubuntu/ovspot-v11-review-20261105/release/deploy-v113-preview.sh
```
Bij succes: `V113_PREVIEW_DEPLOYED_OK`. Controleer de publieke gezondheidsroute.

## Backend rollback
```bash
sudo bash /home/ubuntu/ovspot-v11-review-20261105/release/rollback-v113-preview.sh
```
Het script weigert terugzetten als het kandidaatbestand intussen is veranderd.

## Android OTA
Na succesvolle publieke API-smoketest: publiceer een OTA uitsluitend naar `v11-preview` vanuit `app-position-preview` met `--environment preview`. Geen productie- of reguliere previewkanalen van andere apps bijwerken.
