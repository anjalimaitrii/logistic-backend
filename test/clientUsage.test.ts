import { test } from "node:test";
import assert from "node:assert/strict";
import { totalClientRecords, describeClientUsage } from "../src/lib/clientUsage.js";

const u = (o: Partial<Record<string, number>> = {}) =>
  ({ bookings: 0, invoices: 0, payments: 0, cash: 0, ...o }) as any;

test("a client nobody has traded with counts nothing", () => {
  assert.equal(totalClientRecords(u()), 0);
  assert.equal(describeClientUsage(u()), "");
});

test("one of a kind is singular", () => {
  assert.equal(describeClientUsage(u({ invoices: 1 })), "1 invoice");
  assert.equal(describeClientUsage(u({ bookings: 1 })), "1 booking");
});

test("several kinds read in the order they matter", () => {
  // UTKARSH's case: the invoices are the part that hurts, but the bookings are
  // what the operator recognises, so they lead.
  assert.equal(
    describeClientUsage(u({ bookings: 4, invoices: 3 })),
    "4 bookings and 3 invoices"
  );
});

test("three or more are comma separated with a final and", () => {
  assert.equal(
    describeClientUsage(u({ bookings: 2, invoices: 2, payments: 1 })),
    "2 bookings, 2 invoices and 1 payment"
  );
});

test("kinds with nothing in them are left out entirely", () => {
  assert.equal(describeClientUsage(u({ payments: 5 })), "5 payments");
  assert.equal(describeClientUsage(u({ cash: 2 })), "2 cash entries");
});

test("the total counts every kind", () => {
  assert.equal(totalClientRecords(u({ bookings: 4, invoices: 3, payments: 1, cash: 2 })), 10);
});

test("missing or malformed counts are treated as none, not as NaN", () => {
  assert.equal(totalClientRecords({} as any), 0);
  assert.equal(describeClientUsage({ bookings: undefined } as any), "");
});
