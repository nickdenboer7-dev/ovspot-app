import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { maakZoekKaarten, zoekKaartSubtitel } from '../lib/wayfindingV2.ts';

const halte = (overrides = {}) => ({
  id: '3966419', soort: 'halte', naam: 'Hoogendijk', plaats: 'Alblasserdam',
  modi: ['bus'], lijnen_aantal: 1, lijnen: [],
  lat: 51.86, lon: 4.66, ...overrides
});
const subtitle = (overrides = {}) => zoekKaartSubtitel(maakZoekKaarten([halte(overrides)])[0]);

test('Oude zoek-API: plaatsnaam als fallback en nooit technische halte-ID', () => {
  assert.equal(subtitle(), 'Alblasserdam');
  assert.equal(subtitle({ plaats: '', omschrijving: '3966419' }), '');
  assert.equal(subtitle({ plaats: '', omschrijving: 'stop_id: 3966419' }), '');
  assert.equal(subtitle({ plaats: '', omschrijving: '3966419', stop_desc: 'Straat richting centrum' }), 'Straat richting centrum');
});

test('GTFS stop_desc heeft voorrang boven perroncode en plaats', () => {
  assert.equal(subtitle({ stop_desc: 'Oostzijde', perroncode: 'B', plaats: 'Alblasserdam' }), 'Oostzijde');
  assert.equal(subtitle({ omschrijving: 'Busstation', stop_desc: 'Oostzijde', perroncode: 'B' }), 'Busstation');
});

test('GTFS perroncode wordt leesbaar als perronlabel gepresenteerd', () => {
  assert.equal(subtitle({ perroncode: 'A3' }), 'Perron A3');
  assert.equal(subtitle({ platform_code: 'Perron B2' }), 'Perron B2');
  assert.equal(subtitle({ platform_code: '12' }), 'Perron 12');
});

test('Geen Alblasserdam dubbel wanneer halte- of beschrijvingsnaam identiek is', () => {
  assert.equal(subtitle({ naam: 'Alblasserdam', plaats: 'Alblasserdam' }), '');
  assert.equal(subtitle({ naam: 'Alblasserdam', plaats: 'Alblasserdam', omschrijving: 'Alblasserdam' }), '');
  assert.equal(subtitle({ naam: 'Hoogendijk', omschrijving: 'Alblasserdam' }), 'Alblasserdam');
});

test('Gedeelde naam met modaliteiten houdt echte GTFS-subtitels en geen ID', () => {
  const item = halte({
    naam: 'Centraal Station', plaats: 'Amsterdam',
    modi: ['bus', 'tram'],
    lijnen: [
      { lijn: '1', modus: 'tram', vervoerder: 'GVB' },
      { lijn: '22', modus: 'bus', vervoerder: 'GVB' }
    ],
    modus_omschrijvingen: { bus: 'Perron B', tram: '3966419' },
    omschrijving: 'Amsterdam'
  });
  assert.deepEqual(maakZoekKaarten([item]).map(zoekKaartSubtitel), ['Perron B', 'Amsterdam']);
});

test('Dichtbij-haltenamen worden in twee regels getoond met flexibel tekstvlak', () => {
  const source = readFileSync(new URL('../components/HalteKaart.tsx', import.meta.url), 'utf8');
  assert.match(source, /<Text style=\{\[s\.naam, \{ color: colors\.text \}\]\} numberOfLines=\{2\}>/);
  assert.match(source, /naam: \{[^}]*flex: 1, minWidth: 0, flexWrap: "wrap"/);
  assert.match(source, /naamRij: \{[^}]*flexWrap: "wrap"/);
});

test('Zoekresultaten tonen plaats niet nogmaals als subtitel', () => {
  const source = readFileSync(new URL('../app/zoek.tsx', import.meta.url), 'utf8');
  assert.match(source, /const subZichtbaar = !!sub &&/);
  assert.match(source, /sub\.trim\(\)\.toLocaleLowerCase\("nl"\) !== item\.plaats\.trim\(\)\.toLocaleLowerCase\("nl"\)/);
  assert.doesNotMatch(source, /\|\| r\.id\)/);
});
