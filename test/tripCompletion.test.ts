import { test } from "node:test";
import assert from "node:assert/strict";
import { isTripCompleted } from "../src/lib/tripCompletion.js";

test("completed is completed", () => {
  assert.equal(isTripCompleted({ tripStatus: "completed" }), true);
});

test("delivered is completed", () => {
  assert.equal(isTripCompleted({ tripStatus: "delivered" }), true);
});

test("case and padding do not matter", () => {
  assert.equal(isTripCompleted({ tripStatus: " Completed " }), true);
});

test("returning is NOT completed, even mid-reassignment", () => {
  assert.equal(isTripCompleted({ tripStatus: "returning" }), false);
});

test("offloading is not completed", () => {
  assert.equal(isTripCompleted({ tripStatus: "offloading" }), false);
});

test("a trip that never started is not completed", () => {
  assert.equal(isTripCompleted({}), false);
});
