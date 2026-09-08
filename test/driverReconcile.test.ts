import { test } from "node:test";
import assert from "node:assert/strict";
import { planDriverSync } from "../src/lib/driverReconcile.js";

const TRUCKS = [
  { _id: "t1", truckId: "BAV 7847" },
  { _id: "t2", truckId: "CAH 3838" },
  { _id: "t3", truckId: "AIF 1632" },
];

test("a truck with no driver row gets one created", () => {
  const plan = planDriverSync(
    [{ plate: "BAV 7847", driverName: "Mike sinkala" }],
    TRUCKS,
    []
  );
  assert.deepEqual(plan.create, [{ name: "Mike sinkala", assignedTruck: "t1" }]);
  assert.deepEqual(plan.retire, []);
  assert.deepEqual(plan.reactivate, []);
});

test("the driver Trakzee already names is left completely alone", () => {
  const plan = planDriverSync(
    [{ plate: "BAV 7847", driverName: "Mike sinkala" }],
    TRUCKS,
    [{ _id: "d1", name: "Mike sinkala", assignedTruck: "t1", status: "Active" }]
  );
  assert.deepEqual(plan.create, []);
  assert.deepEqual(plan.retire, []);
  assert.deepEqual(plan.reactivate, []);
});

test("a driver replaced on a truck is retired, and the new one created", () => {
  const plan = planDriverSync(
    [{ plate: "BAV 7847", driverName: "Mike sinkala" }],
    TRUCKS,
    [{ _id: "d1", name: "Humphrieshy Chikasa", assignedTruck: "t1", status: "Active" }]
  );
  assert.deepEqual(plan.create, [{ name: "Mike sinkala", assignedTruck: "t1" }]);
  assert.deepEqual(plan.retire, [{ _id: "d1", name: "Humphrieshy Chikasa", plate: "BAV 7847" }]);
});

test("when both the old and the new row already exist, only the old one is retired", () => {
  const plan = planDriverSync(
    [{ plate: "BAV 7847", driverName: "Mike sinkala" }],
    TRUCKS,
    [
      { _id: "d1", name: "Humphrieshy Chikasa", assignedTruck: "t1", status: "Active" },
      { _id: "d2", name: "Mike sinkala", assignedTruck: "t1", status: "Active" },
    ]
  );
  assert.deepEqual(plan.create, []);
  assert.deepEqual(plan.retire.map((r) => r._id), ["d1"]);
});

test("a driver Trakzee brings back is reactivated, not duplicated", () => {
  const plan = planDriverSync(
    [{ plate: "BAV 7847", driverName: "Mike sinkala" }],
    TRUCKS,
    [{ _id: "d1", name: "Mike sinkala", assignedTruck: "t1", status: "Inactive" }]
  );
  assert.deepEqual(plan.create, []);
  assert.deepEqual(plan.reactivate.map((r) => r._id), ["d1"]);
  assert.deepEqual(plan.retire, []);
});

test("already-retired rows are not retired again", () => {
  const plan = planDriverSync(
    [{ plate: "BAV 7847", driverName: "Mike sinkala" }],
    TRUCKS,
    [
      { _id: "d1", name: "Humphrieshy Chikasa", assignedTruck: "t1", status: "Inactive" },
      { _id: "d2", name: "Mike sinkala", assignedTruck: "t1", status: "Active" },
    ]
  );
  assert.deepEqual(plan.retire, []);
  assert.deepEqual(plan.create, []);
});

// Trakzee sends "Kennedy  Nyimba " one run and "Kennedy Nyimba" the next, and the
// plate arrives as "BAV 7847 " on some rows. Neither may look like a change.
test("spacing and case differences are not treated as a different person or truck", () => {
  const plan = planDriverSync(
    [{ plate: "bav 7847 ", driverName: "  MIKE   SINKALA " }],
    TRUCKS,
    [{ _id: "d1", name: "Mike sinkala", assignedTruck: "t1", status: "Active" }]
  );
  assert.deepEqual(plan.create, []);
  assert.deepEqual(plan.retire, []);
});

// A vehicle with nobody on it must not retire the driver we already know about —
// Trakzee reports "No Driver" for a parked unit whose allocation is intact.
test("a vehicle reporting no driver changes nothing", () => {
  const rows = [{ _id: "d1", name: "Someone", assignedTruck: "t3", status: "Active" }];
  for (const driverName of ["No Driver", "", "  ", "Driver not defined", "--"]) {
    const plan = planDriverSync([{ plate: "AIF 1632", driverName }], TRUCKS, rows);
    assert.deepEqual(plan, { create: [], retire: [], reactivate: [] }, driverName);
  }
});

// The same person legitimately drives two vehicles; those are two records by design.
test("the same person on another truck is untouched", () => {
  const plan = planDriverSync(
    [{ plate: "BAV 7847", driverName: "Mike sinkala" }],
    TRUCKS,
    [{ _id: "d1", name: "Humphrieshy Chikasa", assignedTruck: "t2", status: "Active" }]
  );
  assert.deepEqual(plan.retire, [], "CAH 3838 is not in this feed slice");
  assert.deepEqual(plan.create, [{ name: "Mike sinkala", assignedTruck: "t1" }]);
});

test("a plate the database does not know is skipped rather than guessed at", () => {
  const plan = planDriverSync(
    [{ plate: "ZZZ 0000", driverName: "Nobody Known" }],
    TRUCKS,
    []
  );
  assert.deepEqual(plan, { create: [], retire: [], reactivate: [] });
});

// Two feed rows for one truck would otherwise queue two creates for the same person.
test("a duplicated feed row does not queue the work twice", () => {
  const plan = planDriverSync(
    [
      { plate: "BAV 7847", driverName: "Mike sinkala" },
      { plate: "BAV 7847", driverName: "Mike sinkala" },
    ],
    TRUCKS,
    []
  );
  assert.deepEqual(plan.create, [{ name: "Mike sinkala", assignedTruck: "t1" }]);
});

test("drivers with no truck at all are never touched", () => {
  const plan = planDriverSync(
    [{ plate: "BAV 7847", driverName: "Mike sinkala" }],
    TRUCKS,
    [{ _id: "d9", name: "Floating Person", assignedTruck: null, status: "Active" }]
  );
  assert.deepEqual(plan.retire, []);
});

test("a populated assignedTruck object is read the same as a plain id", () => {
  const plan = planDriverSync(
    [{ plate: "BAV 7847", driverName: "Mike sinkala" }],
    TRUCKS,
    [{ _id: "d1", name: "Humphrieshy Chikasa", assignedTruck: { _id: "t1", truckId: "BAV 7847" }, status: "Active" }]
  );
  assert.deepEqual(plan.retire.map((r) => r._id), ["d1"]);
});
