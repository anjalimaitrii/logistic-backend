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
