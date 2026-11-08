import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dichtbijPad, DICHTBIJ_PAGINA_GROOTTE } from '../lib/dichtbijQuery.ts';

test('3km instelling wordt expliciet als radius=3000 doorgestuurd', () => {
  const pad = dichtbijPad(53.2016, 5.7999, 3000);
  const url = new URL(pad, 'https://ovspot.nl/app/v1');
  assert.equal(url.searchParams.get('radius'), '3000');
  assert.equal(url.searchParams.get('max'), '60');
  assert.equal(url.searchParams.get('offset'), '0');
  assert.equal(url.searchParams.get('lat'), '53.20160');
  assert.equal(url.searchParams.get('lon'), '5.79990');
  assert.equal(DICHTBIJ_PAGINA_GROOTTE, 60);
  assert.doesNotMatch(pad, /max=8(?:&|$)/);
});

test('Paginering behoudt radius, coordinaten en cursor', () => {
  const url = new URL(dichtbijPad(53.2016,5.7999,3000,77), 'https://ovspot.nl');
  assert.equal(url.searchParams.get('radius'),'3000');
  assert.equal(url.searchParams.get('offset'),'77');
  assert.equal(url.searchParams.get('max'),'60');
});

test('Straal accepteert 100 tot 5000 meter en heeft een veilige fallback', () => {
  assert.match(dichtbijPad(0,0,5000), /radius=5000&/);
  assert.match(dichtbijPad(0,0,7000), /radius=5000&/);
  assert.match(dichtbijPad(0,0,50), /radius=100&/);
  assert.match(dichtbijPad(0,0,NaN), /radius=1500&/);
  assert.match(dichtbijPad(0,0,3000, -1), /offset=0$/);
});

test('Dichtbij laadt volgende resultaten wanneer de gebruiker verder scrolt', () => {
  const code = readFileSync(new URL('../app/(tabs)/index.tsx', import.meta.url), 'utf8');
  assert.match(code,/const volgendeOffset =/);
  assert.match(code,/const laadMeer = useCallback\(async \(\) =>/);
  assert.match(code,/api\.dichtbij\(pos\.lat, pos\.lon, instellingen\.straal, volgendeOffset\)/);
  assert.match(code,/scrollEventThrottle=\{250\}/);
  assert.match(code,/layoutMeasurement\.height \+ contentOffset\.y >= contentSize\.height - 240/);
  assert.match(code,/Meer haltes binnen/);
  assert.match(code,/a\.afstand_m - b\.afstand_m/);
});
