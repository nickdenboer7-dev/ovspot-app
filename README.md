# OVspot-app

Simpele, snelle vertrektijden-app (Android) in de stijl van OVinfo. Los van OVbord.

## Schermen
- **Dichtbij** (start): zoekbalk + haltes rond je locatie met de eerstvolgende 2 vertrekken. Zonder GPS: thuislocatie uit Instellingen.
- **Favorieten**: favoriete haltes met 3 vertrekken; Bewerk = volgorde en verwijderen.
- **Haltebord**: vertrekken met live/gepland, vertraging, spoor/perron, vervallen ritten, storingen; filter Alles/Trein/Bus.
- **Ritverloop**: tijdlijn zoals OVinfo, maar ververst vanzelf (live elke 5 s): verwachte tijd groot, geplande doorgestreept, "Nu hier", vervallen haltes, eindhalte.
- **Storingen**: "Mijn haltes" (favorieten) en "Alles" (favorieten + Dichtbij).
- **Instellingen**: thema, standaard filter, afstand Dichtbij, thuislocatie, over/feedback.

## Kleurregels
- Groen stipje = echte live-data. Oranje = vertraging. Rood = vervalt. Grijs "Gepland" = alleen dienstregeling.
- Te vroeg rijden wordt niet getoond; aftellen gebeurt dan op de geplande tijd.

## Data
Alle data komt van `https://ovspot.nl/app/v1/` (dienst `ovspot-app-api` op de VPS, leest via OVbord).
Antwoorden zijn klein (gzip + ETag/304), de app vraagt alleen data als het scherm open is.

| Endpoint | Gebruik |
|---|---|
| `/dichtbij?lat&lon&straal&max` | Dichtbij |
| `/halte/<id>?modus=alles\|trein\|bus&max` | Haltebord, Favorieten |
| `/rit?trip&datum&voertuig` | Ritverloop |
| `/storingen?haltes=a,b` | Storingen + rood bolletje |
| `/zoek?q=` | Zoeken |

## Ontwikkelen
```bash
npm install
npx expo start
npm run typecheck
```

## Bouwen (APK)
```bash
eas build -p android --profile preview
```
