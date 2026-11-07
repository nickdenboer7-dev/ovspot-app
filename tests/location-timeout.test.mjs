import assert from 'node:assert/strict';
import test from 'node:test';
import { binnenLocatieTimeout, LocatieTimeoutFout, LOCATIE_TIMEOUT_MS } from '../lib/locationTimeout.ts';

test('GPS-keten heeft standaard een harde deadline van maximaal 4 seconden', () => {
  assert.equal(LOCATIE_TIMEOUT_MS, 4000);
});

test('Bruikbare cached GPS-positie kan meteen worden toegepast', async () => {
  const value = await binnenLocatieTimeout(async signal => {
    assert.equal(signal.aborted, false);
    return { latitude: 52.38, longitude: 4.90 };
  }, 50);
  assert.deepEqual(value, { latitude: 52.38, longitude: 4.90 });
});

test('Een hangende GPS-fix stopt de UI na de deadline en markeert het signal', async () => {
  let signal;
  const started = Date.now();
  await assert.rejects(
    binnenLocatieTimeout(async s => {
      signal = s;
      return new Promise(() => {});
    }, 30),
    error => error instanceof LocatieTimeoutFout
  );
  assert.equal(signal.aborted, true);
  assert.ok(Date.now() - started < 400, 'de UI moet niet op native GPS blijven wachten');
});

test('Een trage toestemmingsaanvraag blokkeert het volgende native GPS-verzoek niet na timeout', async () => {
  let resolvePermission;
  let calledGPS = 0;
  const permission = new Promise(resolve => { resolvePermission = resolve; });
  await assert.rejects(binnenLocatieTimeout(async signal => {
    await permission; // Android permissie-/Play Services-dialog die niet antwoordt
    if (signal.aborted) return null;
    calledGPS += 1;
    return 'gps';
  }, 20), LocatieTimeoutFout);
  resolvePermission(true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calledGPS, 0, 'geen GPS-call na oude verlopen poging');
});

test('Systeemfouten en geweigerde locatiepermissie worden niet voor een timeout aangezien', async () => {
  await assert.rejects(
    binnenLocatieTimeout(async () => { throw new Error('geweigerd-blijvend'); }, 100),
    /geweigerd-blijvend/
  );
  await assert.rejects(
    binnenLocatieTimeout(async () => { throw new Error('uit'); }, 100),
    /uit/
  );
});

test('Ongeldige tijdslimieten worden geweigerd', async () => {
  await assert.rejects(binnenLocatieTimeout(async () => 1, 0), RangeError);
});
