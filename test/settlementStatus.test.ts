import { test } from "node:test";
import assert from "node:assert/strict";
import { isApprovalWrite } from "../src/lib/settlementStatus.js";

test("a write carrying financials is an approval", () => {
  assert.equal(isApprovalWrite({ financials: { cashAllocation: 500 } }), true);
});

test("an expense-only write is not an approval", () => {
  assert.equal(isApprovalWrite({ expenses: [{ amount: 10 }] } as any), false);
});

test("an empty body is not an approval", () => {
  assert.equal(isApprovalWrite({}), false);
});

test("an explicitly undefined financials is not an approval", () => {
  assert.equal(isApprovalWrite({ financials: undefined }), false);
});

test("a null financials is not an approval", () => {
  assert.equal(isApprovalWrite({ financials: null } as any), false);
});

test("saving legs while claiming a gap is NOT an approval", () => {
  // The claim button posts the route and its costs but no financials. Treating
  // that as an approval let one click approve a trip whose fuel rate was still
  // zero, past every guard the Approve button applies.
  const legOnlyWrite = {
    bookingId: "b1",
    fuelDetails: { fuelRate: 0, legs: [] },
    extraLegs: [{ kind: "transit", gapId: "g1", km: 40 }],
    returnLegDismissed: false,
    expenses: [],
  };
  assert.equal(isApprovalWrite(legOnlyWrite), false);
});

test("the same write WITH financials is an approval", () => {
  assert.equal(
    isApprovalWrite({ extraLegs: [{ kind: "transit" }], financials: { cashAllocation: 500 } }),
    true
  );
});
