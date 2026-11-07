import assert from 'node:assert/strict';
import { test } from 'node:test';
import { freshApiUrl } from '../lib/freshRequest.ts';

test('Elke halteverversing heeft een unieke URL, ook in dezelfde milliseconde', () => {
  const a = freshApiUrl('https://ovspot.nl/app/v1', '/halte/3183779?modus=alles&max=60', 12345);
  const b = freshApiUrl('https://ovspot.nl/app/v1', '/halte/3183779?modus=alles&max=60', 12345);
  assert.notEqual(a, b);
  assert.match(a, /^https:\/\/ovspot\.nl\/app\/v1\/halte\/3183779\?modus=alles&max=60&_fresh=12345-\d+$/);
});

test('Parameters en halte-ID blijven ongewijzigd', () => {
  const url = new URL(freshApiUrl('https://ovspot.nl/app/v1', '/halte/3183780?modus=alles&max=60', 99));
  assert.equal(url.pathname, '/app/v1/halte/3183780');
  assert.equal(url.searchParams.get('modus'), 'alles');
  assert.equal(url.searchParams.get('max'), '60');
  assert.ok(url.searchParams.get('_fresh'));
});

test('Zonder bestaande query wordt een vraagteken gebruikt', () => {
  const url = new URL(freshApiUrl('https://ovspot.nl/app/v1', '/halte/3183779', 555));
  assert.ok(url.search.startsWith('?_fresh='));
});
