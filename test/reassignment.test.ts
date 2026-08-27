import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAssignmentLocked,
  sameDriver,
  statusAfterRelease,
  restoredTripStatus,
} from "../src/lib/reassignment.js";

test("an approved settlement locks the fleet unit in place", () => {
  assert.equal(isAssignmentLocked("Approved"), true);
  assert.equal(isAssignmentLocked("approved"), true);
});

test("anything short of approved leaves the unit changeable", () => {
  assert.equal(isAssignmentLocked("Pending"), false);
  assert.equal(isAssignmentLocked(undefined), false);
  assert.equal(isAssignmentLocked(""), false);
});

test("driver identity compares across ObjectId, string and populated doc", () => {
  const id = "6a8d430905b7fabfa2c12511";
  assert.equal(sameDriver(id, { _id: id }), true);
  assert.equal(sameDriver({ _id: id }, { toString: () => id }), true);
  assert.equal(sameDriver(id, "6a8d768005b7fabfa2c126ac"), false);
});

test("a driver left holding nothing is free", () => {
  // Kemmy Cheelo's case: driverStatus said on_trip with zero assignments.
  assert.equal(statusAfterRelease({ hasActiveAssignment: false }), "available");
});

test("a driver still holding a running trip keeps it", () => {
  assert.equal(
    statusAfterRelease({ hasActiveAssignment: true, activeTripStatus: "loading" }),
    "on_trip"
  );
});

test("a released driver goes back to what their remaining trip is doing", () => {
  // They were flipped to repositioning when the new job was queued behind them.
  // Taking that job away puts them back on their own trip's final leg.
  assert.equal(
    statusAfterRelease({ hasActiveAssignment: true, activeTripStatus: "returning" }),
    "returning"
  );
  assert.equal(
    statusAfterRelease({
      hasActiveAssignment: true,
      activeTripStatus: "offloading_3",
      pickupCount: 1,
      dropoffCount: 3,
    }),
    "offloading"
  );
});

test("a mid-route drop is still on_trip, not offloading", () => {
  assert.equal(
    statusAfterRelease({
      hasActiveAssignment: true,
      activeTripStatus: "offloading_1",
      pickupCount: 1,
      dropoffCount: 3,
    }),
    "on_trip"
  );
});

test("undoing a retarget restores the status the trip was diverted from", () => {
  assert.equal(restoredTripStatus("repositioning", "offloading_2"), "offloading_2");
  assert.equal(restoredTripStatus("repositioning", undefined), "returning");
});

test("a trip never flipped to repositioning is left exactly as it is", () => {
  // Only cargo-done trips with ground to cover were restatused; the rest kept
  // their own status and must not be rewritten on the way back.
  assert.equal(restoredTripStatus("offloading", "offloading"), null);
  assert.equal(restoredTripStatus("returning", undefined), null);
  assert.equal(restoredTripStatus("loading", undefined), null);
});
