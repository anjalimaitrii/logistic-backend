import { test } from "node:test";
import assert from "node:assert/strict";
import { computeLegTotals } from "../src/lib/legTotals.js";

test("sums cargo legs alone when there are no extras", () => {
  const r = computeLegTotals([{ km: 120, liters: 48 }, { km: 80, liters: 32 }], []);
  assert.equal(r.totalDistance, 200);
  assert.equal(r.totalLiters, 80);
});

test("includes extra legs in both totals", () => {
  const r = computeLegTotals([{ km: 120, liters: 48 }], [{ km: 95, liters: 31.7 }]);
  assert.equal(r.totalDistance, 215);
  assert.equal(r.totalLiters, 79.7);
});

test("rounds distance to a whole number and litres to one decimal", () => {
  const r = computeLegTotals([{ km: 120.4, liters: 48.26 }], [{ km: 95.1, liters: 31.71 }]);
  assert.equal(r.totalDistance, 216);
  assert.equal(r.totalLiters, 80);
});

test("treats missing and non-numeric values as zero", () => {
  const r = computeLegTotals([{ km: undefined, liters: null } as any], [{} as any]);
  assert.equal(r.totalDistance, 0);
  assert.equal(r.totalLiters, 0);
});

test("handles both arrays being absent", () => {
  const r = computeLegTotals(undefined as any, undefined as any);
  assert.equal(r.totalDistance, 0);
  assert.equal(r.totalLiters, 0);
});
