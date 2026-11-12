import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const lees=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("usePolling kan het vorige antwoord bewaren en toont het als niet-vers",()=>{
  const h=lees("lib/hooks.ts");
  assert.match(h,/POLL_CACHE_MAX_MS = 5 \* 60_000/);
  assert.match(h,/uitCache: boolean/);
  assert.match(h,/if \(vers\.current \|\| keyRef\.current !== key \|\| dataRef\.current !== null\) return;/); // verse data wint altijd
  assert.match(h,/vers\.current = true;/);
  assert.match(h,/bewaar && d/);
});
test("Haltebord gebruikt de bewaarde stand maar toont hem nooit als live",()=>{
  const s=lees("app/halte/[id].tsx");
  assert.match(s,/\{ bewaar: true \}/);
  assert.match(s,/poll\.uitCache/);
  assert.match(s,/live: false/);
  assert.match(s,/live=\{!!h && !poll\.uitCache/);
});
