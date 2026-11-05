# OVspot V1.1 — separate preview-release

Datum: 5 november 2026

## Veiligheid en omgeving
- **Productie staat nog ongewijzigd.** De huidige API blijft op /app/v1/ via poort 8110; OVspot-webkaart en OVbord blijven intact.
- Preview is een afzonderlijke API op 127.0.0.1:18111.
- Publieke route na handmatige inzet: https://ovspot.nl/app/v1-preview/
- Preview Android-app heeft andere pakketnaam `nl.ovspot.preview`, versie 1.1.0, kanaal `v11-preview`, en kan naast de gewone app worden geïnstalleerd.
- Nginx-config in `ovspot-v11-preview.nginx`, unit in `ovspot-v11-preview-api.service`.
- Port18119 is uitsluitend voor een **niet-productie** Nginx-syntaxis- en proxytest; niet voor extern gebruik.

## Uitgevoerde controles
- Backendregressies: 25/25 geslaagd.
- Expo/TypeScript van afzonderlijke preview-app: geslaagd.
- Nginx-snippet syntax: geslaagd met afzonderlijke `nginx -t -c .../nginx-syntax-check.conf`.
- Previewproxy werkt op localhost (health, haltebord, storingen en zoeken).
- Regionale smoketests: Leeuwarden, Amsterdam Centraal, Rotterdam Centraal, Het Schouw; eerste beschikbare rit getest.
- Live backendhash tijdens preflight: 18e52128f075a45acbabd43fe4393b53749f93220ac8c7316fb8b80d1039b443
- Nginx baseline: 5cf2043614874af2a5b808378863cfe7c18c63008e017e059f64eb58706057db

## Beheerderstap voor HTTPS-preview
De gekoppelde Remote Desktop Commander-verbinding staat geen bevoegde Nginx-beheercommando's toe. Uitvoering moet plaatsvinden vanuit een door de eigenaar geautoriseerde VPS-shell:

```bash
sudo bash /home/ubuntu/ovspot-v11-review-20261105/release/deploy-preview.sh
```

Het script:
1. Checkt root, bronbestanden, hashes, vrije poort en bestaande previewconfig.
2. Maakt een Nginx-rollbackkopie in een unieke map.
3. Installeert alleen een preview-service en één Nginx-snippet.
4. Start de preview-service en checkt de localhost-API.
5. Voegt precies één include toe aan het HTTPS-serverblok.
6. Draait `nginx -t` vóór `systemctl reload nginx`.
7. Test de publieke preview én de bestaande productie-API.
8. Schakelt de preview-service voor herstart in.

Bij een fout probeert het script direct automatisch terug te draaien. Bij latere problemen kan de eigenaar expliciet terugdraaien:

```bash
sudo bash /home/ubuntu/ovspot-v11-review-20261105/release/rollback-preview.sh
```

De rollback controleert vooraf of Nginx sinds de preview-installatie niet door een ander proces is gewijzigd, en weigert om onverwachte wijzigingen te overschrijven.

## Acceptatie na livegaan van preview
- https://ovspot.nl/app/v1-preview/health geeft status 200 en `versie:1.1.0-staging`.
- https://ovspot.nl/app/v1/health blijft status 200 en versie 1.0.0.
- De hele OVspot-kaart moet blijven werken; renderer, kaartfrontend en Gunicorn zijn niet gewijzigd.
- Via de aparte Android-preview APK: Dichtbij 2 vertrekken, N06 richting Amsterdam Centraal, geen foute aankomst-vertrektijden, storingen met onderscheid tussen geen meldingen en geen verbinding.
- Preview-app werkt ook op een echte Android-telefoon zonder ADB/SSH-tunnel.
- Geen release naar `production` of het bestaande `preview`-kanaal totdat externe preview werkt en expliciet akkoord is gegeven.

## Open aandachtspunten
- De onderliggende bron levert niet voor alle livevoorspellingen een individuele meettijd.
- De preview wordt geen vervanging van productie zonder langere observatie en een expliciet releasebesluit.
