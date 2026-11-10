import assert from "node:assert/strict";
import test from "node:test";
import { herstelFavorietOpPositie, MAX_FAVORIETEN } from "../lib/favorieten.ts";

const halte = (id) => ({ id, naam: id, plaats: "Zaandam" });

test("Ongedaan maken herstelt de haltegegevens op de oorspronkelijke positie", () => {
  const eerste = halte("a");
  const verwijderd = halte("b");
  const laatste = halte("c");
  const lijst = [eerste, laatste];
  assert.deepEqual(herstelFavorietOpPositie(lijst, verwijderd, 1), [eerste, verwijderd, laatste]);
  assert.deepEqual(lijst, [eerste, laatste]);
  assert.deepEqual(herstelFavorietOpPositie([], verwijderd, 0), [verwijderd]);
});

test("Ongedaan maken overschrijft geen inmiddels toegevoegde favorieten", () => {
  const bestaand = [halte("a")];
  assert.equal(herstelFavorietOpPositie(bestaand, halte("a"), 0), bestaand);
  const vol = Array.from({ length: MAX_FAVORIETEN }, (_, index) => halte(String(index)));
  assert.equal(herstelFavorietOpPositie(vol, halte("b"), 0), vol);
});
