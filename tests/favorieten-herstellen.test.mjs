import assert from "node:assert/strict";
import test from "node:test";
import {
  herstelFavorietOpPositie, maakLijnFavoriet, MAX_FAVORIETEN,
  normaliseerLijnFavorieten, vertrekBijLijnFavoriet
} from "../lib/favorieten.ts";

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

test("Lijnfavoriet bewaart de fysieke instaphalte en toont alleen dezelfde richting", () => {
  const vertrek = { lijn: "394", modus: "bus", vervoerder: "EBS", bestemming: "Amsterdam Noorderpark" };
  const lijn = maakLijnFavoriet({ ...vertrek, richting: vertrek.bestemming, halte: halte("stop-394") });
  const andereHalte = maakLijnFavoriet({ ...lijn, halte: halte("stop-naast") });
  assert.notEqual(lijn.id, andereHalte.id);
  assert.equal(vertrekBijLijnFavoriet({ ...vertrek, bestemming: "  AMSTERDAM  Noorderpark  " }, lijn), true);
  assert.equal(vertrekBijLijnFavoriet({ ...vertrek, bestemming: "Zaandam Station" }, lijn), false);
  assert.equal(vertrekBijLijnFavoriet({ ...vertrek, vervoerder: "Andere vervoerder" }, lijn), false);
  assert.equal(vertrekBijLijnFavoriet({ ...vertrek, modus: "tram" }, lijn), false);
  assert.equal(maakLijnFavoriet({ ...lijn, halte: halte("") }), null);
});

test("Lijnfavorieten worden zonder duplicaten gelezen en kunnen terug op hun plek", () => {
  const lijn = maakLijnFavoriet({ lijn: "395", modus: "bus", vervoerder: "EBS", richting: "Amsterdam", halte: halte("stop-395") });
  const anders = maakLijnFavoriet({ ...lijn, richting: "Zaandam Station" });
  assert.equal(lijn.richting, "Amsterdam Sloterdijk");
  assert.equal(vertrekBijLijnFavoriet({ ...lijn, bestemming: "Amsterdam" }, lijn), true);
  assert.deepEqual(normaliseerLijnFavorieten([null, { lijn: "7" }, lijn, { ...lijn, id: "gedupliceerd" }, anders]), [lijn, anders]);
  assert.deepEqual(herstelFavorietOpPositie([anders], lijn, 0), [lijn, anders]);
});
