# OVspot Wayfinding UI V1 — LDPlayer praktijktest

**Datum:** 6 november 2026, 04:57–05:17 Europe/Amsterdam
**Resultaat:** testbuild functioneert, met kleine UI-correcties na visuele inspectie. Niet uitgerold.

## Isolatie
- Windows PC: DESKTOP-U661OBP, tijdelijke QA-code in `C:\Users\Nick\ovspot-wayfinding-ldplayer-qa-20261106`.
- LDPlayer 14: `emulator-5554`, Android 14, Expo Go 57.0.9 (`host.exp.exponent`).
- Met `app.config.js`: naam `OVspot Wayfinding QA`, testpackage `nl.ovspot.wayfindingqa`, `updates.enabled=false`, `apiBase=https://ovspot.nl/app/v1`.
- Geïnstalleerde pakketten `nl.ovspot.app` en `nl.ovspot.v2qa` **niet** gewijzigd.
- Geen EAS build, APK-installatie, OTA, Git push of publicatie.

## Geteste handelingen
| Test | Uitkomst |
|---|---|
| Expo Go openen en React Native app starten | OK |
| Zoeken Amsterdam Centraal | OK, 4 geclusterde resultaten |
| Werkelijke lijnen/badges (NS, GVB, EBS, Connexxion) | OK, API-data, niet hardcoded |
| GVB-groep openen | OK, haltebord toont bussen, metro, tram en pont |
| Echte GVB-lijnkleuren (o.a. metro 52 cyaan, 54 geel, tram 26 rood) | OK |
| Rit N83 openen | OK, volledig ritverloop met haltes, Live en Nu hier |
| Compact telefoonscherm | OK bij tijdelijk 800×360 (oriëntatie 3 -> 360×800) |
| Donkere modus zoekresultaten | OK, leesbare tekst en kleurcontrast |
| Donkere modus vertrekbord | OK, leesbare lijnbadge en live-label |
| Zoekfunctie Leidseplein | OK, 4 haltegroepen incl. N47/N57/397/357, echte kleurcodes |
| Aparte Leidseplein-tramhalte | OK, 'Geen vertrekken'; geen verzonnen lijnen |
| Android logcat crash/ReactNativeJS Error | Geen getroffen |
| TypeScript-check ontwikkelversie | OK |
| Productieservices en standaard app | Onaangeroerd |

## Tijdens de echte visuele test gevonden en opgelost
1. De invoerbalk op de zoekpagina klapte in door `flex:1` onder een verticale kop: opgelost met `width:100%, flexShrink:0` en vaste hoogte; opnieuw visueel bevestigd.
2. Volledig lichtgroen gearceerde live-vertrekregels ogen te druk: verwijderd; alleen een compacte status-pill blijft groen.
3. Complexe ondertitels zoals 'Metro en Tram en Bus en Veer · midden' waren te lang. In de UI verkort naar 'Metro, tram, bus en pont'; eerste spoorcluster heet 'Treinen · spoorperrons'.

## Open ontwerpafweging
- De vierde Leidseplein-tramhalte had op het meetmoment geen komende vertrekken: daardoor kan de bestaande app-API geen lijnbadge vanuit vertrekdata leveren. Er staat terecht '1 lijn' als fallback. Een altijd gevulde, actuele catalogusbadge voor nul-vertreklocaties vereist een later (apart goed te keuren) API-metadataveld. Niets hardgecodeerd.
- Test op een echt fysiek toestel en een uiteindelijke interne APK is nog niet uitgevoerd; dit was een Expo Go test.

## Herstel & afsluiting
- VPS-ontwikkelbranch: `feature/ovspot-wayfinding-ui-20261106` (aparte Git worktree).
- Originele repo blijft op `feature/v11-betrouwbare-ritten-ui` met ongewijzigde bestanden.
- Android `wm size` en `wm density` zijn gereset (origineel 1920×1080, dpi 160, rotatie 3).
- QA-thema terug op 'Systeem', Expo Go gestopt, `adb reverse tcp:8081` verwijderd, oorspronkelijke reverse `tcp:8096` behouden, test-Metroproces beëindigd.
- Publieke API blijft v2.0.12; geen productiewijzigingen.

**Conclusie:** GO voor de uitgewerkte UI naar de volgende release-gate (interne APK-test); nog **geen** productie-uitrol zonder apart akkoord.
