import test from 'node:test';
import assert from 'node:assert/strict';
import { vertrekTijden } from '../lib/format.ts';

const nu = new Date('2026-11-07T20:00:00Z').getTime();
const defaultRit = { vertrek_ms: nu + 8 * 60_000, gepland: '21:08', verwacht: '21:08', vervallen: false, vertraging_min: 0 };

test('Geplande rit toont altijd afteltijd EN kloktijd onder elkaar', () => {
  assert.deepEqual(vertrekTijden(defaultRit, nu), {
    vertrokken: false, vertraagd: false, tijd: '8 min', kloktijd: '21:08', tweedeTijd: '21:08', oorspronkelijk: ''
  });
});
test('Live rit toont net zo goed de exacte tijd', () => {
  const v = vertrekTijden({ ...defaultRit, verwacht:'21:08' }, nu);
  assert.equal(v.tijd, '8 min'); assert.equal(v.tweedeTijd, '21:08');
});
test('Vertraagde rit toont afteltijd, verwachte kloktijd én originele geplande kloktijd', () => {
  const v = vertrekTijden({ ...defaultRit, verwacht:'21:11', vertraging_min: 3 }, nu);
  assert.equal(v.tijd, '8 min'); assert.equal(v.tweedeTijd, '21:11'); assert.equal(v.oorspronkelijk, '21:08');
});
test('Vertrekken na 60 minuten tonen de kloktijd als hoofdwaarde zonder duplicatie', () => {
  const v = vertrekTijden({ ...defaultRit, vertrek_ms: nu + 80 * 60_000, gepland: '22:20', verwacht:'22:20' }, nu);
  assert.equal(v.tijd, '22:20'); assert.equal(v.tweedeTijd, '');
});
test('Vervallen rit wordt nooit als normaal gepland tijdstip getoond', () => {
  const v = vertrekTijden({ ...defaultRit, vervallen:true }, nu);
  assert.equal(v.tijd, '–'); assert.equal(v.tweedeTijd, '');
});
test('Ontbrekende berekende vertrektijd behoudt wel de kloktijd uit de dienstregeling', () => {
  const v = vertrekTijden({ ...defaultRit, vertrek_ms:null }, nu);
  assert.equal(v.tijd, '21:08');assert.equal(v.kloktijd, '21:08');
});
