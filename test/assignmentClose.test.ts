import { test } from "node:test";
import assert from "node:assert/strict";
import { closesOnAssign } from "../src/lib/assignmentClose.js";

const at = (tripStatus: string, prevDropLabel: string, nextPickupLabel: string, dropoffCount = 1) =>
  closesOnAssign({ tripStatus, pickupCount: 1, dropoffCount, prevDropLabel, nextPickupLabel });

test("offloading where the next job starts at the same drop closes on the spot", () => {
  // Truck stands at Delhi, next job loads at Delhi — nothing to drive.
  assert.equal(at("offloading", "Delhi", "Delhi"), true);
});

test("offloading with ground to cover stays open", () => {
  // Kafue → Chongwe belongs to this trip; it ends when the truck gets there.
  assert.equal(at("offloading", "Kafue", "Chongwe"), false);
});

test("returning with ground to cover stays open", () => {
  // The Alwar → Mumbai case: still hundreds of km short of its own end point.
  assert.equal(at("returning", "Delhi", "Mumbai"), false);
});

test("returning to a yard that IS the next pickup closes on the spot", () => {
  assert.equal(at("returning", "Delhi", "Delhi"), true);
});

test("a trip still holding cargo never closes, same point or not", () => {
  // offloading_1 of three: two drops outstanding.
  assert.equal(at("offloading_1", "Delhi", "Delhi", 3), false);
  assert.equal(at("offloading_1", "Delhi", "Mumbai", 3), false);
  assert.equal(at("reached_2", "Delhi", "Delhi", 3), false);
});

test("the last drop of a multi-drop trip does close", () => {
  assert.equal(at("offloading_3", "Delhi", "Delhi", 3), true);
  assert.equal(at("offloading_3", "Delhi", "Mumbai", 3), false);
});

test("an already-diverted trip is still cargo-done", () => {
  assert.equal(at("repositioning", "Delhi", "Delhi"), true);
  assert.equal(at("repositioning", "Delhi", "Mumbai"), false);
});

test("case and padding do not create a phantom interval", () => {
  assert.equal(at("offloading", " delhi ", "Delhi"), true);
});

test("a blank endpoint proves nothing, so it does not hold the trip open", () => {
  // hasEmptyInterval returns false on a blank label — there is no place to name,
  // and no gap row would be raised either.
  assert.equal(at("offloading", "", "Mumbai"), true);
  assert.equal(at("offloading", "Delhi", ""), true);
});
