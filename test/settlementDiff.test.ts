import { test } from "node:test";
import assert from "node:assert/strict";
import { diffFinancials, diffEmptyLegs, describeSettlementChange, kwacha, money } from "../src/lib/settlementDiff.js";

test("only moved money fields are reported", () => {
  const d = diffFinancials(
    { cashAllocation: 0, councilLevy: 50, tollAmount: 0 },
    { cashAllocation: 500, councilLevy: 50, tollAmount: 120 }
  );
  assert.deepEqual(d.map((c) => c.label), ["Driver's allowance", "Toll amount"]);
  assert.deepEqual(d[0], { label: "Driver's allowance", before: 0, after: 500, currency: "ZMW" });
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

// A cross-border trip pays the driver in both currencies. The two are tracked
// side by side and never added: there is no rate stored anywhere, and one that
// moved would rewrite settled figures.

test("the dollar side of a field is reported separately from the kwacha side", () => {
  const d = diffFinancials(
    { cashAllocation: 5000, cashAllocationUsd: 0 },
    { cashAllocation: 5000, cashAllocationUsd: 200 }
  );
  assert.deepEqual(d, [
    { label: "Driver's allowance", before: 0, after: 200, currency: "USD" },
  ]);
});

test("both sides moving are reported as two changes, kwacha first", () => {
  const d = diffFinancials(
    { cashAllocation: 5000, cashAllocationUsd: 100 },
    { cashAllocation: 4200, cashAllocationUsd: 150 }
  );
  assert.deepEqual(d, [
    { label: "Driver's allowance", before: 5000, after: 4200, currency: "ZMW" },
    { label: "Driver's allowance", before: 100, after: 150, currency: "USD" },
  ]);
});

test("a settlement that never mentions dollars reports nothing about them", () => {
  // Every settlement saved before cross-border trips existed is Kwacha-only, and
  // must not start logging "$0 -> $0" lines the moment the field exists.
  const d = diffFinancials({ cashAllocation: 0 }, { cashAllocation: 500 });
  assert.deepEqual(d.map((c) => c.currency), ["ZMW"]);
});

test("every money field has a dollar side", () => {
  const d = diffFinancials(
    {},
    { cashAllocationUsd: 1, councilLevyUsd: 2, tollAmountUsd: 3, fuelTotalUsd: 4 }
  );
  assert.deepEqual(d.map((c) => c.label), [
    "Driver's allowance", "Council levy", "Toll amount", "Fuel total",
  ]);
  assert.ok(d.every((c) => c.currency === "USD"));
});

test("money renders with the symbol of its own currency", () => {
  assert.equal(money(1200, "ZMW"), "K1,200");
  assert.equal(money(1200, "USD"), "$1,200");
  assert.equal(kwacha(1200), "K1,200", "the kwacha helper still reads the same");
});

test("the timeline sentence keeps the two currencies apart", () => {
  const line = describeSettlementChange(
    [
      { label: "Driver's allowance", before: 5000, after: 4200, currency: "ZMW" },
      { label: "Driver's allowance", before: 100, after: 150, currency: "USD" },
    ],
    [],
    false
  );
  assert.equal(
    line?.description,
    "Driver's allowance K5,000 → K4,200, Driver's allowance $100 → $150"
  );
});
