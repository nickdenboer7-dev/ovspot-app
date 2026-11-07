import assert from 'node:assert/strict';
import test from 'node:test';
import { lijnBadgeHeeftRand, lijnKleur } from '../constants/wayfinding.ts';
import { geldigeLijnen } from '../lib/wayfindingV2.ts';

test('Officiële GTFS-kleur wint van GVB-metrokleur en fallback', () => {
  const k = lijnKleur('52', 'metro', 'GVB', '00A3E0', 'FFFFFF');
  assert.equal(k.bg, '#00A3E0');
  assert.equal(k.fg, '#FFFFFF');
  assert.equal(lijnKleur('52', 'metro', 'GVB').bg, '#00adef');
});

test('Bestaande vervoerderskleuren blijven fallback bij ontbrekende en ongeldige GTFS-kleur', () => {
  const basis = lijnKleur('395', 'bus', 'MEERPLUS');
  assert.deepEqual(lijnKleur('395', 'bus', 'MEERPLUS', undefined, undefined), basis);
  assert.deepEqual(lijnKleur('395', 'bus', 'MEERPLUS', 'red;position:absolute', '#oops'), basis);
});

test('Witte badge krijgt border, gebroken witte badge niet', () => {
  const wit = lijnKleur('N81', 'bus', 'GVB', 'FFFFFF', '0F172A');
  assert.equal(wit.bg, '#FFFFFF');
  assert.equal(wit.fg, '#0F172A');
  assert.equal(lijnBadgeHeeftRand(wit), true);
  assert.equal(lijnBadgeHeeftRand(lijnKleur('395', 'bus', 'MEERPLUS')), false);
});

test('GTFS zonder tekstkleur krijgt leesbare zwart/wit-tekst', () => {
  assert.equal(lijnKleur('M4', 'bus', 'ALLGO', 'FDC300').fg, '#000000');
  assert.equal(lijnKleur('M3', 'bus', 'ALLGO', 'E00713').fg, '#FFFFFF');
});

test('Catalogus bewaart optionele kleuren en tot veertig lijnen', () => {
  const input = Array.from({ length: 45 }, (_, i) => ({
    lijn: String(i + 1), modus: 'bus', vervoerder: 'ALLGO',
    kleur: i === 0 ? '#FFFFFF' : 'E00713', tekstkleur: '#000000'
  }));
  const out = geldigeLijnen(input);
  assert.equal(out.length, 40);
  assert.equal(out[0].kleur, '#FFFFFF');
  assert.equal(out[0].tekstkleur, '#000000');
  assert.equal(out.at(-1).lijn, '40');
});

test('Catalogus blijft compatibel met oudere API zonder kleurvelden', () => {
  const [line] = geldigeLijnen([{ lijn: '395', modus: 'bus', vervoerder: 'MEERPLUS' }]);
  assert.deepEqual(line, { lijn: '395', modus: 'bus', vervoerder: 'MEERPLUS' });
});
