import assert from 'node:assert/strict';
import test from 'node:test';
import {
  binnenLocatieTimeout, kiesLocatieFallback, LocatieTimeoutFout,
  STANDAARD_LOCATIE, vindGpsPositie
} from '../lib/locationTimeout.ts';

const gps = (lat = 52.38, lon = 4.90) => ({ coords: { latitude: lat, longitude: lon } });
const provider = (overrides = {}) => ({
  getForegroundPermissionsAsync: async () => ({ granted: true, canAskAgain: false }),
  requestForegroundPermissionsAsync: async () => { throw new Error('geen verzoek nodig'); },
  hasServicesEnabledAsync: async () => true,
  getLastKnownPositionAsync: async () => gps(),
  getCurrentPositionAsync: async () => gps(),
  ...overrides
});
const read = p => binnenLocatieTimeout(signal => vindGpsPositie(p, 3, signal), 35);

test('Amsterdam Centraal is een gegarandeerde niet-lege fallback', () => {
  assert.deepEqual(kiesLocatieFallback(null, null), STANDAARD_LOCATIE);
  assert.deepEqual(STANDAARD_LOCATIE, { lat: 52.3791, lon: 4.8994, bron: 'standaard' });
});
test('eerder GPS gaat voor thuis, thuis gaat voor standaard', () => {
  const thuis = { lat: 53.201, lon: 5.799 };
  assert.deepEqual(kiesLocatieFallback(null, thuis), { ...thuis, bron: 'thuis' });
  assert.deepEqual(kiesLocatieFallback({ lat: 52.2, lon: 4.8, bron: 'gps' }, thuis),
    { lat: 52.2, lon: 4.8, bron: 'gps' });
  assert.deepEqual(kiesLocatieFallback(null, { lat: NaN, lon: 5 }), STANDAARD_LOCATIE);
});
test('cached GPS is de primaire snelle bron, current GPS wordt overgeslagen', async () => {
  let current = 0;
  const result = await read(provider({
    getLastKnownPositionAsync: async ({ maxAge, requiredAccuracy }) => {
      assert.equal(maxAge, 120000); assert.equal(requiredAccuracy, 300); return gps(52.4, 4.9);
    },
    getCurrentPositionAsync: async () => { current++; return gps(); }
  }));
  assert.deepEqual(result, { lat: 52.4, lon: 4.9, bron: 'gps' });
  assert.equal(current, 0);
});
test('current GPS alleen gebruiken als er geen bruikbare cache is', async () => {
  let current = 0;
  const result = await read(provider({
    getLastKnownPositionAsync: async () => null,
    getCurrentPositionAsync: async () => { current++; return gps(53.1, 5.7); }
  }));
  assert.equal(result.lat, 53.1); assert.equal(current, 1);
});
test('provider uit, weigering en native fouten worden direct afgebroken', async () => {
  await assert.rejects(read(provider({ hasServicesEnabledAsync: async () => false })), /uit/);
  await assert.rejects(read(provider({
    getForegroundPermissionsAsync: async () => ({ granted: false, canAskAgain: false })
  })), /geweigerd-blijvend/);
  await assert.rejects(read(provider({ getLastKnownPositionAsync: async () => { throw Error('native'); } })), /native/);
});
test('hangende native promises bij elke stap krijgen een harde deadline', async () => {
  const stages = [
    'getForegroundPermissionsAsync', 'requestForegroundPermissionsAsync',
    'hasServicesEnabledAsync', 'getLastKnownPositionAsync', 'getCurrentPositionAsync'
  ];
  for (const stage of stages) {
    let p = provider({
      getForegroundPermissionsAsync: async () => ({ granted: stage !== 'requestForegroundPermissionsAsync', canAskAgain: true }),
      getLastKnownPositionAsync: async () => stage === 'getCurrentPositionAsync' ? null : gps()
    });
    p[stage] = () => new Promise(() => {});
    const start = Date.now();
    await assert.rejects(read(p), LocatieTimeoutFout, stage);
    assert.ok(Date.now() - start < 500, stage + ' mag nooit oneindig laden');
    assert.ok(kiesLocatieFallback(null, null), 'altijd de fallback tonen');
  }
});
test('een laat permissieantwoord na timeout start nooit alsnog GPS', async () => {
  let resolve;
  let currentCalls = 0;
  const request = new Promise(r => { resolve = r; });
  const p = provider({
    getForegroundPermissionsAsync: async () => ({ granted: false, canAskAgain: true }),
    requestForegroundPermissionsAsync: () => request,
    getCurrentPositionAsync: async () => { currentCalls++; return gps(); }
  });
  await assert.rejects(read(p), LocatieTimeoutFout);
  resolve({ granted: true, canAskAgain: true });
  await new Promise(r => setImmediate(r));
  assert.equal(currentCalls, 0);
});
