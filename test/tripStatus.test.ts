import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isFinalLeg,
  isArrivalAtPickup,
  isLastOffloading,
  isCargoDone,
  ASSIGNABLE_STATUSES,
  isOffloading,
  driverStatusFor,
  ASSIGNABLE_STATUS_REGEX,
} from "../src/lib/tripStatus.js";

test("returning and repositioning are both final legs", () => {
  assert.equal(isFinalLeg("returning"), true);
  assert.equal(isFinalLeg("repositioning"), true);
});

test("final-leg check ignores case and padding", () => {
  assert.equal(isFinalLeg(" Repositioning "), true);
});

test("mid-trip statuses are not final legs", () => {
  for (const s of ["started", "loading", "departed", "reached", "offloading", "completed"]) {
    assert.equal(isFinalLeg(s), false, `${s} should not be a final leg`);
  }
  assert.equal(isFinalLeg(undefined), false);
});

test("a driver is assignable while offloading or on either final leg", () => {
  assert.deepEqual([...ASSIGNABLE_STATUSES], ["offloading", "returning", "repositioning"]);
});

test("arrived matches with and without a stop suffix", () => {
  assert.equal(isArrivalAtPickup("arrived"), true);
  assert.equal(isArrivalAtPickup("arrived_1"), true);
  assert.equal(isArrivalAtPickup("arrived_12"), true);
});

test("arrived does not match neighbouring statuses", () => {
  // `reached` is the dropoff-side arrival and must stay distinct.
  assert.equal(isArrivalAtPickup("reached"), false);
  assert.equal(isArrivalAtPickup("reached_1"), false);
  assert.equal(isArrivalAtPickup("arrivedx"), false);
  assert.equal(isArrivalAtPickup("arrived_"), false);
  assert.equal(isArrivalAtPickup(undefined), false);
});

test("single-stop trips use the unsuffixed offloading id", () => {
  assert.equal(isLastOffloading("offloading", 1, 1), true);
  assert.equal(isLastOffloading("offloading_1", 1, 1), false);
});

test("multi-drop trips count only the FINAL drop as done", () => {
  assert.equal(isLastOffloading("offloading_3", 1, 3), true);
  assert.equal(isLastOffloading("offloading_1", 1, 3), false);
  assert.equal(isLastOffloading("offloading_2", 1, 3), false);
});

test("a multi-PICKUP trip suffixes its single dropoff too", () => {
  // multi is (pickups > 1 || dropoffs > 1), mirroring the web and app builders.
  assert.equal(isLastOffloading("offloading_1", 2, 1), true);
  assert.equal(isLastOffloading("offloading", 2, 1), false);
});

test("cargo is done on the last drop or once already unladen", () => {
  assert.equal(isCargoDone("offloading_3", 1, 3), true);
  assert.equal(isCargoDone("returning", 1, 3), true);
  assert.equal(isCargoDone("repositioning", 1, 3), true);
  // Two drops still outstanding — a new job must not fast-forward past them.
  assert.equal(isCargoDone("offloading_1", 1, 3), false);
  assert.equal(isCargoDone("reached_2", 1, 3), false);
});

test("offloading is recognised with and without a stop suffix", () => {
  // A multi-stop trip reports "offloading_2"; comparing that to "offloading"
  // left the driver marked on_trip and unavailable for the next job.
  assert.equal(isOffloading("offloading"), true);
  assert.equal(isOffloading("offloading_1"), true);
  assert.equal(isOffloading("offloading_12"), true);
  assert.equal(isOffloading(" OFFLOADING_2 "), true);
});

test("offloading does not match its neighbours", () => {
  assert.equal(isOffloading("reached_1"), false);
  assert.equal(isOffloading("offloadingx"), false);
  assert.equal(isOffloading("offloading_"), false);
  assert.equal(isOffloading(undefined), false);
});

test("the driver status drops the stop number", () => {
  // Which stop it is belongs to the trip, not to the person.
  assert.equal(driverStatusFor("offloading_2"), "offloading");
  assert.equal(driverStatusFor("offloading"), "offloading");
  assert.equal(driverStatusFor("returning"), "returning");
  assert.equal(driverStatusFor("repositioning"), "repositioning");
});

test("statuses that do not change what the driver is doing yield null", () => {
  for (const s of ["started", "arrived_1", "loading_2", "departed", "reached_1", "completed"]) {
    assert.equal(driverStatusFor(s), null, `${s} should not set a driver status`);
  }
  assert.equal(driverStatusFor(undefined), null);
});

test("the assignable regex covers suffixed offloading", () => {
  for (const s of ["offloading", "offloading_1", "offloading_3", "returning", "repositioning"]) {
    assert.equal(ASSIGNABLE_STATUS_REGEX.test(s), true, `${s} should be assignable`);
  }
  for (const s of ["started", "reached_1", "completed", "loading_2"]) {
    assert.equal(ASSIGNABLE_STATUS_REGEX.test(s), false, `${s} must not be assignable`);
  }
});
