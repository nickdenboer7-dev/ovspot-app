import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const rit = readFileSync(new URL("../app/rit.tsx", import.meta.url), "utf8");

test("Geen Dienstregeling-banner of lege statuscontainer bij geplande ritten", () => {
  assert.doesNotMatch(rit, /<Text[^>]*>Dienstregeling<\/Text>/);
  assert.doesNotMatch(rit, /<Text[^>]*>Dienstregeling/);
  assert.match(rit, /\{rit && !isKaart && \(rit\.live \|\| rit\.vervallen \|\| isIncoming\) \? \(/);
  assert.match(rit, /\) : null\}\s*\{!isKaart \? \(/);
});

test("Vervallen, inkomend en live behouden hun relevante statusmelding", () => {
  assert.match(rit, /\{rit\.vervallen \? \(\s*<Text[^>]+>Deze rit vervalt<\/Text>/);
  assert.match(rit, /\) : isIncoming \? \(/);
  assert.match(rit, /\) : rit\.live \? \(/);
});

test("Bij niet-live sluit de eerste halte direct onder de ritheader aan", () => {
  assert.match(rit, /contentContainerStyle=\{\[s\.inhoud, rit && !rit\.live && !rit\.vervallen && !isIncoming \? s\.inhoudZonderStatus : null\]\}/);
  assert.match(rit, /inhoudZonderStatus: \{ paddingTop: 4 \}/);
  assert.match(rit, /<Kaart style=\{\{ paddingHorizontal: 13, paddingTop: 0, paddingBottom: 7 \}\}>/);
  assert.match(rit, /\{rijen\.map\(\(r, k\) => \{/);
});
