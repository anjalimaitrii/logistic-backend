import { test } from "node:test";
import assert from "node:assert/strict";
import { describeCompanyUsage } from "../src/lib/clientUsage.js";

const u = (o: Record<string, number> = {}) =>
  ({ clients: 0, bookings: 0, invoices: 0, payments: 0, cash: 0, ...o }) as any;

test("an empty company says nothing", () => {
  assert.equal(describeCompanyUsage(u()), "");
});

test("clients with no trade behind them stand alone", () => {
  assert.equal(describeCompanyUsage(u({ clients: 1 })), "1 client");
  assert.equal(describeCompanyUsage(u({ clients: 3 })), "3 clients");
});

test("clients and their trade read as one sentence", () => {
  // SouthGreat's case — the clients go, and what they are attached to is what
  // makes the delete irreversible.
  assert.equal(
    describeCompanyUsage(u({ clients: 2, bookings: 2, invoices: 2 })),
    "2 clients, and they are attached to 2 bookings and 2 invoices"
  );
});

test("one client reads in the singular throughout", () => {
  assert.equal(
    describeCompanyUsage(u({ clients: 1, bookings: 1 })),
    "1 client, and they are attached to 1 booking"
  );
});

test("trade with no clients left is still named", () => {
  // Shouldn't normally happen, but silently dropping records from the warning
  // is the one outcome that must not occur.
  assert.equal(describeCompanyUsage(u({ bookings: 2 })), "2 bookings");
});

test("missing counts are treated as none", () => {
  assert.equal(describeCompanyUsage({} as any), "");
  assert.equal(describeCompanyUsage(undefined), "");
});
