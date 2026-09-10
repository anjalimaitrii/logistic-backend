import { test } from "node:test";
import assert from "node:assert/strict";
import { planTruckSync } from "../src/lib/truckReconcile.js";

const v = (plate: string, imei: string, extra: Record<string, unknown> = {}) =>
  ({ plate, imei, vehicleModel: "FMB920", truckType: "Truck", status: "STOP", odometer: "100", ...extra });

test("a vehicle we have never seen is created, carrying its imei", () => {
  const plan = planTruckSync([v("BAV 7847", "111")], []);
  assert.equal(plan.create.length, 1);
  assert.equal(plan.create[0].truckId, "BAV 7847");
  assert.equal(plan.create[0].imei, "111");
  assert.deepEqual(plan.rename, []);
  assert.deepEqual(plan.linkImei, []);
});

test("a vehicle already matched by imei with the same plate needs nothing", () => {
  const plan = planTruckSync([v("BAV 7847", "111")], [{ _id: "t1", truckId: "BAV 7847", imei: "111" }]);
  assert.deepEqual(plan, { create: [], rename: [], linkImei: [], conflicts: [] });
});

// The whole reason imei exists here: Trakzee renamed CAN 6858 ZM to IT 3287 and
// plate-only matching created a second truck for the same physical vehicle.
test("a renamed vehicle is renamed, not duplicated", () => {
  const plan = planTruckSync([v("IT 3287", "111")], [{ _id: "t1", truckId: "CAN 6858 ZM", imei: "111" }]);
  assert.deepEqual(plan.create, []);
  assert.deepEqual(plan.rename, [{ _id: "t1", from: "CAN 6858 ZM", to: "IT 3287" }]);
});

// Every truck stored before imei existed has none. Matching it on plate once and
// writing the imei is what stops it being duplicated the first time it is renamed.
test("a truck with no imei is matched on its plate and given one", () => {
  const plan = planTruckSync([v("BAV 7847", "111")], [{ _id: "t1", truckId: "BAV 7847" }]);
  assert.deepEqual(plan.create, []);
  assert.deepEqual(plan.linkImei, [{ _id: "t1", imei: "111", truckId: "BAV 7847" }]);
});

test("plate matching ignores case and stray spacing", () => {
  for (const stored of ["bav 7847", "BAV  7847", " BAV 7847 "]) {
    const plan = planTruckSync([v("BAV 7847", "111")], [{ _id: "t1", truckId: stored }]);
    assert.deepEqual(plan.create, [], stored);
    assert.equal(plan.linkImei.length, 1, stored);
  }
});

// CAH 3848 is stored with a non-breaking space in its plate. It must still match.
test("a non-breaking space in a stored plate still matches", () => {
  const plan = planTruckSync([v("CAH 3848", "111")], [{ _id: "t1", truckId: "CAH 3848" }]);
  assert.deepEqual(plan.create, []);
  assert.equal(plan.linkImei.length, 1);
});

// Renaming onto a plate another truck already holds would break the unique index
// and silently lose the write. Report it instead so somebody merges the two.
test("a rename that would collide with another truck is refused and reported", () => {
  const plan = planTruckSync(
    [v("IT 3287", "111")],
    [
      { _id: "t1", truckId: "CAN 6858 ZM", imei: "111" },
      { _id: "t2", truckId: "IT 3287", imei: "222" },
    ]
  );
  assert.deepEqual(plan.rename, []);
  assert.equal(plan.conflicts.length, 1);
  assert.match(plan.conflicts[0], /IT 3287/);
});

test("a vehicle the feed sends without an imei is matched on plate alone", () => {
  const plan = planTruckSync([v("BAV 7847", "")], [{ _id: "t1", truckId: "BAV 7847" }]);
  assert.deepEqual(plan.create, []);
  assert.deepEqual(plan.linkImei, [], "nothing to write when the feed has no imei");
});

test("an unknown vehicle with no imei is still created", () => {
  const plan = planTruckSync([v("NEW 1", "")], []);
  assert.equal(plan.create.length, 1);
  assert.equal(plan.create[0].imei, "");
});

// Trucks vanish from the feed between calls, and they carry trips and history.
test("a truck missing from the feed is never touched", () => {
  const plan = planTruckSync([v("BAV 7847", "111")], [{ _id: "t9", truckId: "OLD 1", imei: "999" }]);
  assert.deepEqual(plan.rename, []);
  assert.deepEqual(plan.linkImei, []);
  assert.equal(plan.create.length, 1);
});

test("the same vehicle twice in one feed is decided once", () => {
  const plan = planTruckSync([v("BAV 7847", "111"), v("BAV 7847", "111")], []);
  assert.equal(plan.create.length, 1);
});

test("a blank plate is skipped rather than creating a nameless truck", () => {
  const plan = planTruckSync([v("", "111"), v("   ", "222")], []);
  assert.deepEqual(plan.create, []);
});

test("the created truck carries the feed's model, type and odometer", () => {
  const plan = planTruckSync(
    [v("NEW 1", "111", { vehicleModel: "FMC920", truckType: "Van", odometer: "4200" })],
    []
  );
  assert.equal(plan.create[0].vehicleModel, "FMC920");
  assert.equal(plan.create[0].truckType, "Van");
  assert.equal(plan.create[0].odometer, "4200");
});

test("the stored plate is normalised, so a feed with odd spacing does not store it", () => {
  const plan = planTruckSync([v("  it   3287 ", "111")], []);
  assert.equal(plan.create[0].truckId, "IT 3287");
});
