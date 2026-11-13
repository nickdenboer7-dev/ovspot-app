import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const knop = readFileSync(new URL("../components/FeedbackKnop.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/_layout.tsx", import.meta.url), "utf8");

test("feedbackknop hangt globaal in de root layout", () => {
  assert.match(layout, /import \{ FeedbackKnop \}/);
  assert.match(layout, /<FeedbackKnop \/>/);
});

test("feedbackknop zit rechtsonder boven de onderbalk en opent het bestaande formulier", () => {
  assert.match(knop, /right: 14/);
  assert.match(knop, /62 \+ Math\.max\(insets\.bottom, 6\)/);
  assert.match(knop, /<FeedbackModal/);
});

test("feedbackknop is verborgen op zoeken, info en instellingen", () => {
  assert.match(knop, /VERBERG = \["\/zoek", "\/info", "\/instellingen"\]/);
});

test("feedbackknop stuurt alleen bekende view-waarden mee", () => {
  assert.match(knop, /"halte"/);
  assert.match(knop, /"rit"/);
  assert.match(knop, /view: "instellingen"/);
});
