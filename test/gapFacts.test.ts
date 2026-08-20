import { test } from "node:test";
import assert from "node:assert/strict";
import { factsFromLeg, factsToUpdate } from "../src/lib/gapFacts.js";

test("a filled-in leg yields every fact", () => {
  assert.deepEqual(factsFromLeg({ from: "Kalomo", to: "Mkushi", km: 100 }), {
    from: "Kalomo",
    to: "Mkushi",
    km: 100,
    originConfirmed: true,
  });
});

test("naming the origin confirms it, so the other screen may prefill", () => {
  const facts = factsFromLeg({ from: "Mkushi" });
  assert.equal(facts?.originConfirmed, true);
});

test("a blank field is an unanswered question, not an instruction to erase", () => {
  // The accountant may fill the distance first and the origin later; that must
  // not wipe an origin the other trip already recorded.
  assert.deepEqual(factsFromLeg({ from: "", to: "", km: 100 }), { km: 100 });
  assert.equal(factsFromLeg({ from: "  ", to: "  " }), null);
});

test("zero km is not a distance", () => {
  // Every leg starts at 0 in the form; treating that as a fact would overwrite a
  // real distance with nothing.
  assert.equal(factsFromLeg({ km: 0 }), null);
  assert.equal(factsFromLeg({ km: NaN }), null);
});

test("whitespace is trimmed off the city names", () => {
  assert.deepEqual(factsFromLeg({ from: " Kalomo ", to: " Mkushi " }), {
    from: "Kalomo",
    to: "Mkushi",
    originConfirmed: true,
  });
});

test("nothing at all yields nothing", () => {
  assert.equal(factsFromLeg(undefined), null);
  assert.equal(factsFromLeg({}), null);
});

test("the update uses the schema's field names", () => {
  assert.deepEqual(factsToUpdate({ from: "Kalomo", to: "Mkushi", km: 100, originConfirmed: true }), {
    fromLabel: "Kalomo",
    toLabel: "Mkushi",
    km: 100,
    originConfirmed: true,
  });
});

test("only the facts present are written, so a partial save stays partial", () => {
  assert.deepEqual(factsToUpdate({ km: 100 }), { km: 100 });
});
