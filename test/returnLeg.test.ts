import { test } from "node:test";
import assert from "node:assert/strict";
import { upsertReturnLeg, costLeg } from "../src/lib/returnLeg.js";

const leg = (over: Partial<Parameters<typeof upsertReturnLeg>[1]> = {}) => ({
  from: "Kafue",
  to: "Lusaka",
  km: 100,
  mileage: 2.5,
  fuelRate: 40,
  ...over,
});

test("fuel is litres to one decimal and a whole-kwacha amount", () => {
  assert.deepEqual(costLeg(100, 2.5, 40), { liters: 40, amount: 1600 });
  assert.deepEqual(costLeg(55, 2.5, 40), { liters: 22, amount: 880 });
  assert.deepEqual(costLeg(10, 3, 40), { liters: 3.3, amount: 132 });
});

test("a zero mileage does not divide by zero", () => {
  assert.equal(Number.isFinite(costLeg(100, 0, 40).liters), true);
});

test("the return leg lands as an appended empty leg", () => {
  const out = upsertReturnLeg([], leg());
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "return");
  assert.equal(out[0].position, "append");
  assert.equal(out[0].km, 100);
  assert.equal(out[0].amount, 1600);
});

test("marking the return twice leaves ONE leg", () => {
  // A correction or a double click must not bill the same kilometres twice.
  const once = upsertReturnLeg([], leg());
  const twice = upsertReturnLeg(once, leg({ km: 120 }));
  assert.equal(twice.filter((e) => e.kind === "return").length, 1);
  assert.equal(twice[0].km, 120);
});

test("a trimmed return from an older record is replaced too", () => {
  const prior = [
    { kind: "trimmedReturn", position: "append", from: "Kafue", to: "", km: 50, mileage: 2.5, liters: 20, amount: 800 },
  ];
  const out = upsertReturnLeg(prior, leg());
  assert.deepEqual(out.map((e) => e.kind), ["return"]);
});

test("dispatch and transit legs are never touched", () => {
  const prior = [
    { kind: "dispatch", position: "prepend", from: "Lusaka", to: "Kafue", km: 10, mileage: 2.5, liters: 4, amount: 160 },
    { kind: "transit", position: "append", from: "Kafue", to: "Ndola", km: 30, mileage: 2.5, liters: 12, amount: 480 },
  ];
  const out = upsertReturnLeg(prior, leg());
  assert.deepEqual(out.map((e) => e.kind), ["dispatch", "transit", "return"]);
});

test("no prior legs at all is fine", () => {
  assert.equal(upsertReturnLeg(undefined, leg()).length, 1);
});
