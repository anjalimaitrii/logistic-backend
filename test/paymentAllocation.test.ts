import { test } from "node:test";
import assert from "node:assert/strict";
import { planAllocation } from "../src/lib/paymentAllocation.js";

const b = (id: string, finalAmount: number, advancePaid: number, currency?: string) =>
  ({ _id: id, finalAmount, advancePaid, currency });

test("a payment pays the oldest unsettled trips first", () => {
  const plan = planAllocation(
    [b("a", 1000, 0), b("b", 500, 0), b("c", 800, 0)],
    1200,
    "ZMW"
  );
  assert.deepEqual(plan.allocations, [
    { bookingId: "a", amount: 1000, settles: true },
    { bookingId: "b", amount: 200, settles: false },
  ]);
  assert.equal(plan.unallocated, 0);
});

test("trips already settled are skipped", () => {
  const plan = planAllocation([b("a", 1000, 1000), b("b", 500, 0)], 300, "ZMW");
  assert.deepEqual(plan.allocations.map((a) => a.bookingId), ["b"]);
});

test("only what is still due is taken from a part-paid trip", () => {
  const plan = planAllocation([b("a", 1000, 700)], 500, "ZMW");
  assert.deepEqual(plan.allocations, [{ bookingId: "a", amount: 300, settles: true }]);
  assert.equal(plan.unallocated, 200, "the surplus is reported, not forced onto a trip");
});

// The whole point of giving a payment its own currency: dollars received from an
// international client must not quietly settle a Kwacha invoice, which would
// leave both ledgers wrong and no record of the swap.
test("a dollar payment never touches a kwacha trip", () => {
  const plan = planAllocation(
    [b("kwacha-job", 1000, 0, "ZMW"), b("dollar-job", 400, 0, "USD")],
    400,
    "USD"
  );
  assert.deepEqual(plan.allocations, [{ bookingId: "dollar-job", amount: 400, settles: true }]);
});

test("a kwacha payment never touches a dollar trip", () => {
  const plan = planAllocation(
    [b("dollar-job", 400, 0, "USD"), b("kwacha-job", 1000, 0, "ZMW")],
    1000,
    "ZMW"
  );
  assert.deepEqual(plan.allocations, [{ bookingId: "kwacha-job", amount: 1000, settles: true }]);
});

// Every booking taken before the currency field existed was Kwacha.
test("a trip with no currency counts as kwacha", () => {
  const kwacha = planAllocation([b("legacy", 500, 0, undefined)], 500, "ZMW");
  assert.deepEqual(kwacha.allocations.map((a) => a.bookingId), ["legacy"]);

  const dollars = planAllocation([b("legacy", 500, 0, undefined)], 500, "USD");
  assert.deepEqual(dollars.allocations, [], "a dollar payment leaves legacy trips alone");
  assert.equal(dollars.unallocated, 500);
});

test("a payment with nothing to settle allocates nothing and reports the whole amount", () => {
  const plan = planAllocation([b("a", 1000, 1000)], 750, "ZMW");
  assert.deepEqual(plan.allocations, []);
  assert.equal(plan.unallocated, 750);
});

test("the order given is the order used", () => {
  // The caller sorts oldest-first; this must not re-sort and quietly change
  // which invoice a payment lands on.
  const plan = planAllocation([b("newer", 100, 0), b("older", 100, 0)], 150, "ZMW");
  assert.deepEqual(plan.allocations.map((a) => a.bookingId), ["newer", "older"]);
});

test("zero and negative payments do nothing", () => {
  for (const amount of [0, -50]) {
    assert.deepEqual(planAllocation([b("a", 1000, 0)], amount, "ZMW").allocations, [], String(amount));
  }
});

test("a trip billed at nothing is not treated as owing money", () => {
  const plan = planAllocation([b("unbilled", 0, 0), b("real", 300, 0)], 300, "ZMW");
  assert.deepEqual(plan.allocations, [{ bookingId: "real", amount: 300, settles: true }]);
});
