# OVspot Preview 1.1.3 — GPS-positie en ritstatus (testkandidaat)

Datum: 5 november 2026. Niet gepubliceerd; alleen geïsoleerde worktree `app-position-qa`.

## Aanleiding
- Gebruikerscreenshot lijn 394, 10:30: Barkstraat 10:31 maar "Nu hier" en GPS 15s oud.
- Gebruikerscreenshot lijn 395, 10:30: Westkolkdijk 10:32 maar "Nu hier" en GPS 13s oud.
- Header "Gepland · KV8 later" suggereert een live-status voor de hele rit, terwijl KV8 bij de huidige halte ontbreekt.

## Oorzaak en oplossing
- Vorige code baseerde `bij_halte` op de verhouding tussen een geplande stoptijd en de huidige klok, zonder afstand te controleren.
- Nieuwe code controleert ook voertuigpositie (lat/lon) en haltecoördinaten; GPS-leeftijd maximaal 120 seconden, halteepoch binnen 6 minuten.
- Binnen **80 meter** van de huidige halte: "Nu hier" mogelijk; verder weg tot **2 km**: een bescheidener interstop-markering "Onderweg".
- Bij ontbrekende/ongeldige coördinaten of onwaarschijnlijke afstand: geen bevestigde haltepositie, in plaats van een verzonnen "Nu hier".
- De linker status in de app noemt "Tijden gepland" als de eerstvolgende halte geen bevestigde KV8-tijden heeft, onafhankelijk van recente GPS.
- Per-halte KV8-tijden blijven met hun eigen live-kleur herkenbaar, zonder dat hiervoor de volledige ritstatus live moet zijn.

## Exacte controle dienstregeling
Lijn 395, GTFS-rit 383000057: Zaandam, De Vlinder heeft gepland aankomst **10:33**, vertrek **10:35**. Die twee minuten zijn echt GTFS, geen gemixte KV8/GTFS-fout. Niet aangepast.

## Verificatie
- 49/49 backendregressies geslaagd (41 bestaand/aangepast + 8 nieuwe positiechecks).
- `npm run typecheck` geslaagd.
- Er is geen OTA naar v11-preview gepubliceerd en er is geen previewbackend bijgewerkt.
- Productie en OVspot-kaart zijn onaangeroerd.

## Beperkingen
- Een GPS-positie bij een halte betekent niet noodzakelijk dat het voertuig stilstaat.
- De OVbord bron kan een halte als `current` labelen zonder exacte voertuighalte-afstand. Daarom is de geocontrole nodig.
- De positie tussen twee haltes blijft een benadering totdat shape-distance/voertuigtrace volledig is gekoppeld.

## Aangeraden vervolg
Test de afzonderlijke kandidaat eerst op LDPlayer met ruwe KV6/GPS-gegevens, inclusief bussen die **te vroeg**, **te laat** en door een **lusrit** rijden. Daarna pas een gecontroleerde OTA naar het previewkanaal overwegen; nooit direct productie.
