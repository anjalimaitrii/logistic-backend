import { test } from "node:test";
import assert from "node:assert/strict";
import { locationLabel, hasEmptyInterval } from "../src/lib/gapDetection.js";

test("label is the city", () => {
  assert.equal(locationLabel({ address: { city: "Mkushi" } } as any), "Mkushi");
});

test("label trims and survives a missing address", () => {
  assert.equal(locationLabel({ address: { city: "  Ndola " } } as any), "Ndola");
  assert.equal(locationLabel({} as any), "");
  assert.equal(locationLabel(undefined as any), "");
});

test("same place means no empty interval — S1", () => {
  assert.equal(hasEmptyInterval("Mkushi", "Mkushi"), false);
});

test("comparison ignores case and padding", () => {
  assert.equal(hasEmptyInterval("Mkushi", " mkushi "), false);
});

test("different place means an empty interval — S2", () => {
  assert.equal(hasEmptyInterval("Mkushi", "Kabwe"), true);
});

test("an unknown endpoint is not treated as a gap", () => {
  // A blank label proves nothing. Flagging it would raise a blocker the
  // accountant cannot resolve, because there is no place to name.
  assert.equal(hasEmptyInterval("", "Kabwe"), false);
  assert.equal(hasEmptyInterval("Mkushi", ""), false);
});
