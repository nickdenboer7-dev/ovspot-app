import assert from 'node:assert/strict';
import test from 'node:test';
import { maakZoekKaarten, zoekKaartSubtitel, sorteerZoekLijnen } from '../lib/wayfindingV2.ts';

const lijn = (nummer, modus, kleur = '#E1251B') =>
  ({ lijn: nummer, modus, vervoerder: 'TEST', kleur, tekstkleur: '#FFFFFF' });
const maak = (id, modi, lijnen, other = {}) => ({
  id, soort: 'halte', naam: 'Centraal Station', plaats: 'Amsterdam',
  modi, lijnen_aantal: lijnen.length, lijnen, lat: 52.38, lon: 4.9,
  ...other
});

test('Amsterdam Centraal: één API-halte wordt vier afzonderlijke moduskaarten', () => {
  const halte = maak('3979722', ['metro', 'tram', 'bus', 'ferry'], [
    lijn('51', 'metro'), lijn('52', 'metro'),
    lijn('1', 'tram'), lijn('2', 'tram'),
    lijn('314', 'bus'), lijn('316', 'bus'), lijn('N47', 'bus'),
    lijn('F2', 'ferry')
  ], { sub: 'Metro en Tram en Bus en Veer · midden',
    omschrijving: 'Amsterdam',
    modus_omschrijvingen: {
      metro: 'Amsterdam', tram: 'Perron A3, B2, C1',
      bus: 'Perron B, C, D, H, J, K', ferry: 'Perron D, E'
    }
  });
  const kaarten = maakZoekKaarten([halte]);
  assert.deepEqual(kaarten.map(x => x.modus), ['metro', 'tram', 'bus', 'ferry']);
  assert.equal(new Set(kaarten.map(x => x.key)).size, 4);
  for (const k of kaarten) {
    assert.equal(k.halte.id, '3979722');
    assert.equal(k.gesplitst, true);
    assert.ok(k.lijnen.length >= 1);
    assert.ok(k.lijnen.every(l => l.modus === k.modus));
    assert.equal(zoekKaartSubtitel(k), halte.modus_omschrijvingen[k.modus]);
    assert.ok(!/midden|westzijde|oostzijde/.test(zoekKaartSubtitel(k)));
  }
  assert.deepEqual(kaarten.find(x => x.modus === 'bus').lijnen.map(x => x.lijn), ['314', '316', 'N47']);
  assert.equal(kaarten.find(x => x.modus === 'bus').lijnen[0].kleur, '#E1251B');
});

test('Alle beschikbare lijnbadges blijven zichtbaar, inclusief >24 stuks', () => {
  const lijnen = Array.from({ length: 40 }, (_, i) => lijn(String(i + 1), 'bus'));
  const [kaart] = maakZoekKaarten([maak('3184386', ['bus'], lijnen)]);
  assert.equal(kaart.gesplitst, false);
  assert.equal(kaart.lijnen.length, 40);
  assert.deepEqual(kaart.lijnen.map(x => x.lijn), lijnen.map(x => x.lijn));
});

test('Treinen: binnenlandse Sprinter en Intercity vóór internationale/intercity-afgeleiden', () => {
  const lijnen = [
    'Eurocity Direct', 'European Sleeper', 'Eurostar', 'ICE', 'Nightjet', 'GoVolta',
    'Sneltrein', 'Stoptrein', 'Intercity direct', 'Intercity', 'Sprinter', 'Nachttrein'
  ].map(x => lijn(x, 'train'));
  const kopie = [...lijnen];
  const sorted = sorteerZoekLijnen(lijnen).map(x => x.lijn);
  assert.deepEqual(sorted.slice(0, 5), ['Sprinter', 'Intercity', 'Intercity direct', 'Sneltrein', 'Stoptrein']);
  assert.ok(sorted.indexOf('Eurocity Direct') > sorted.indexOf('Nachttrein'));
  assert.ok(sorted.indexOf('Nightjet') > sorted.indexOf('Intercity direct'));
  assert.deepEqual(lijnen, kopie);
});

test('Treinen en vervangende bus worden afzonderlijk weergegeven', () => {
  const halte = maak('2992167', ['train', 'bus'], [
    lijn('Eurostar', 'train'), lijn('Intercity', 'train'), lijn('Sprinter', 'train'),
    lijn('Snelbus ipv trein', 'bus')
  ]);
  const kaarten = maakZoekKaarten([halte]);
  assert.deepEqual(kaarten.map(x => x.modus), ['train', 'bus']);
  assert.deepEqual(kaarten[0].lijnen.map(x => x.lijn), ['Sprinter', 'Intercity', 'Eurostar']);
  assert.deepEqual(kaarten[1].lijnen.map(x => x.lijn), ['Snelbus ipv trein']);
});

test('Eén modus of oude API zonder lijncatalogus: niet kunstmatig splitsen', () => {
  const enkel = maak('3184386', ['bus'], [lijn('314', 'bus')]);
  const zonder = maak('zonder', ['metro', 'tram', 'bus'], []);
  const kaarten = maakZoekKaarten([enkel, zonder]);
  assert.equal(kaarten.length, 2);
  assert.equal(kaarten[0].key, '3184386:alles');
  assert.equal(kaarten[1].key, 'zonder:alles');
  assert.equal(kaarten[1].lijnen.length, 0);
});

test('Oude gegokte windrichting wordt genegeerd; alleen bronomschrijving of plaats', () => {
  const halte = maak('bus-west', ['bus', 'tram'], [lijn('314','bus'), lijn('2','tram')], {
    sub: 'Bus en Tram · westzijde', omschrijving: 'Stationsplein',
    modus_omschrijvingen: { bus: 'Busstation IJ-Zijde, Bushalte M', tram: 'Stationsplein' }
  });
  const kaarten = maakZoekKaarten([halte]);
  assert.deepEqual(kaarten.map(zoekKaartSubtitel), ['Busstation IJ-Zijde, Bushalte M', 'Stationsplein']);
  const oud = maak('oud', ['bus', 'tram'], [lijn('314','bus'), lijn('2','tram')], {
    sub: 'Bus en Tram · westzijde'
  });
  assert.deepEqual(maakZoekKaarten([oud]).map(zoekKaartSubtitel), ['Amsterdam', 'Amsterdam']);
  const geenPlaats = maak('geenPlaats', ['bus'], [lijn('5','bus')], { plaats:'', sub:'Bus · midden' });
  assert.equal(zoekKaartSubtitel(maakZoekKaarten([geenPlaats])[0]), '');
});

test('Bestaande enkele halte toont officiële omschrijving zonder modifier', () => {
  const halte = maak('3184386', ['bus'], [lijn('314','bus')], { omschrijving:'Perron A' });
  const [kaart] = maakZoekKaarten([halte]);
  assert.equal(kaart.gesplitst, false);
  assert.equal(zoekKaartSubtitel(kaart), 'Perron A');
});
