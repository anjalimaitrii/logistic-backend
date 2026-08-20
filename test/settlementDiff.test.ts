import { test } from "node:test";
import assert from "node:assert/strict";
import { diffFinancials, diffEmptyLegs, describeSettlementChange, kwacha } from "../src/lib/settlementDiff.js";

test("only moved money fields are reported", () => {
  const d = diffFinancials(
    { cashAllocation: 0, councilLevy: 50, tollAmount: 0 },
    { cashAllocation: 500, councilLevy: 50, tollAmount: 120 }
  );
  assert.deepEqual(d.map((c) => c.label), ["Driver's allowance", "Toll amount"]);
  assert.deepEqual(d[0], { label: "Driver's allowance", before: 0, after: 500 });
});

test("a field the client did not send is silence, not a change to zero", () => {
  // An expense sync posts no financials block at all; a partial post must not
  // log "Toll amount K120 -> K0" for a field it never mentioned.
  assert.deepEqual(diffFinancials({ tollAmount: 120 }, { cashAllocation: 500 }).map((c) => c.label), [
    "Driver's allowance",
  ]);
});

test("no financials at all yields no changes", () => {
  assert.deepEqual(diffFinancials({ cashAllocation: 5 }, undefined), []);
});

test("a first settlement counts every non-zero field as a change", () => {
  const d = diffFinancials(undefined, { cashAllocation: 500, councilLevy: 0, tollAmount: 0 });
  assert.deepEqual(d.map((c) => c.label), ["Driver's allowance"]);
});

test("empty legs report additions, distance edits and removals", () => {
  const before = [
    { kind: "dispatch", from: "Lusaka", to: "Kafue", km: 100 },
    { kind: "transit", from: "Kafue", to: "Ndola", km: 50 },
  ];
  const after = [
    { kind: "dispatch", from: "Lusaka", to: "Kafue", km: 120 },
    { kind: "return", from: "Ndola", to: "Lusaka", km: 300 },
  ];
  assert.deepEqual(diffEmptyLegs(before, after), [
    "Lusaka → Kafue 100 km → 120 km",
    "added Ndola → Lusaka (300 km)",
    "removed Kafue → Ndola",
  ]);
});

test("an unchanged leg list produces nothing", () => {
  const legs = [{ kind: "return", from: "Ndola", to: "Lusaka", km: 300 }];
  assert.deepEqual(diffEmptyLegs(legs, [...legs]), []);
});

test("legs not sent at all are silence", () => {
  assert.deepEqual(diffEmptyLegs([{ kind: "return", from: "A", to: "B", km: 1 }], undefined), []);
});

test("a save that changed nothing produces no timeline entry", () => {
  assert.equal(describeSettlementChange([], [], false), null);
});

test("an update names both the old and the new figure", () => {
  const entry = describeSettlementChange(
    [{ label: "Toll amount", before: 0, after: 1200 }],
    [],
    false
  );
  assert.equal(entry?.title, "Settlement Updated");
  assert.equal(entry?.description, "Toll amount K0 → K1,200");
});

test("a first approval is titled as an approval and survives empty figures", () => {
  const entry = describeSettlementChange([], [], true);
  assert.equal(entry?.title, "Trip Approved");
  assert.match(entry!.description, /no figures entered/);
});

test("leg changes ride along with the money", () => {
  const entry = describeSettlementChange(
    [{ label: "Driver's allowance", before: 0, after: 500 }],
    ["added Ndola → Lusaka (300 km)"],
    false
  );
  assert.equal(
    entry?.description,
    "Driver's allowance K0 → K500. Empty legs: added Ndola → Lusaka (300 km)"
  );
});

test("money is kwacha, thousands separated", () => {
  assert.equal(kwacha(1200), "K1,200");
  assert.equal(kwacha(0), "K0");
});
