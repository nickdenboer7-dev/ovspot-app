# OVspot Android V1.1 – stagingreview (5 november 2026)

**Nog niet gepubliceerd.** Live OVspot-webkaart, OVbord, ovspot-app-api-service en de bestaande APK zijn ongemoeid gelaten.

## Probleem en broncontrole

- OVspot-app GitHub-main: 3c5331958304f32e9f8a795fdf700c0653114419.
- Live ovspot_app_api.py is gelijk aan herstelarchief /home/ubuntu/kv15-bot/payload/ovspot-app-api-v1.0.0.tar.gz.
- N06: Het Schouw/Splitsing 03:18 richting Amsterdam Centraal gebruikte dezelfde GTFS-trip 382997176 als een lusrit van 46 haltes, met eerste passage 02:35 ten onrechte als 'current'.
- Bron levert haltes 4161400 (heen) en 4161401 (terug). De terugrit is in staging op basis van halte-naam + vertrek-epoch gekoppeld aan 9 relevante haltes.

## Aanpassingen

**App** (lokale Git branch feature/v11-betrouwbare-ritten-ui):
- Stuur instaphalte, naam, tijdstip en richting mee naar de rit-API.
- Toon volledige bestemmingen over maximaal twee regels met status onder bestemming.
- Korter ritverloop met inklapbare eerdere haltes; geen dubbel 'Op tijd'.
- GPS-leeftijd alleen tonen als positie betrouwbaar is; anders 'Positie niet bevestigd'.
- Dichtbij maximaal twee vertrekken per halte (mits beschikbaar).
- Storingen: onderscheid geen meldingen, onbereikbare bron, gedeeltelijke bron en oude gegevens.

**Backend (alleen staging)**:
- Een state=current wordt alleen betrouwbaar met GPS-leeftijd tot 120 s en halte-epoch binnen zes minuten van nu.
- Foutieve aankomst/vertrekvolgorde onderdrukken, met epoch als alternatief; kort verblijf over middernacht blijft geldig.
- Selecteer juiste luspassage met halte-id of naam plus dienstregelingstijd, ook bij afwijkende halte-id per perron.
- Voeg positie_betrouwbaar, gps_leeftijd_s en gevraagd/gecontroleerd toe.
- Demoveer haltevertrekken naar gepland wanneer bron stale aangeeft.

## Tests

- Bestaande backendtests: 15/15.
- Nieuwe regressietests: 9/9.
- TypeScript: npm run typecheck geslaagd.
- Expo Android export: geslaagd op voorlopige app-versie.
- HTTP-smoketest op aparte localhost-poort 18110: health, haltebord, N06-rit, storingen, zoeken geslaagd.
- Android LDPlayer hands-on, OTA-build en productie-update nog NIET uitgevoerd.

## Beperkingen

- OVbord geeft niet voor ieder vertrek het meettijdstip door: versheid van alle voorspellingen kan niet onafhankelijk bevestigd worden.
- Een onmogelijke combinatie van aankomst-/vertrektijden kan worden onderdrukt; de werkelijke tijd wordt niet uitgevonden.
- GitHub-connector geeft 403 voor branchcreatie; VPS heeft geen GitHub-schrijfauthenticatie. Branch staat voorlopig alleen lokaal.
- Geen productie-deploy zonder GitHub-publicatie, apparaatcontrole en post-deploy monitoring.

## Herstel

- VPS-backend origineel: /home/ubuntu/kv15-bot/payload/ovspot-app-api-v1.0.0.tar.gz (hash gelijk aan live bij controle).
- GitHub-main 3c5331958304 blijft ongewijzigd.
- Lokale werkbranch kan zonder live impact worden weggegooid.
