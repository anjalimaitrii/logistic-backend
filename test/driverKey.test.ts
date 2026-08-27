import { test } from "node:test";
import assert from "node:assert/strict";
import { driverDedupeKey } from "../src/lib/driverKey.js";

test("the same person on the same truck is one key however the name is spaced", () => {
  // Trakzee sends "Kennedy  Nyimba " one run and "Kennedy Nyimba" the next.
  const a = driverDedupeKey("Kennedy Nyimba", "6a3fc5f43c05e101e88e2f4e");
  const b = driverDedupeKey("Kennedy  Nyimba ", "6a3fc5f43c05e101e88e2f4e");
  const c = driverDedupeKey("KENNEDY NYIMBA", "6a3fc5f43c05e101e88e2f4e");
  assert.equal(a, b);
  assert.equal(a, c);
});

test("the same person on a different truck is a different key", () => {
  // Two trucks means two records on purpose — either one may turn up for a job.
  assert.notEqual(
    driverDedupeKey("Fenwell Lungu", "truck-a"),
    driverDedupeKey("Fenwell Lungu", "truck-b")
  );
});

test("two different people on one truck stay separate", () => {
  assert.notEqual(
    driverDedupeKey("Enock Banda", "truck-a"),
    driverDedupeKey("Enock Chiwesha", "truck-a")
  );
});

test("a driver with no truck yet still gets a usable key", () => {
  assert.equal(driverDedupeKey("Joel Muzizi", ""), "joel muzizi|");
  assert.equal(driverDedupeKey("Joel Muzizi", undefined), "joel muzizi|");
  assert.equal(driverDedupeKey("Joel Muzizi", null), "joel muzizi|");
});

test("an ObjectId and its string form are the same truck", () => {
  const asObject = { toString: () => "6a3fc5f43c05e101e88e2f4e" };
  assert.equal(
    driverDedupeKey("Layson Daka", asObject),
    driverDedupeKey("Layson Daka", "6a3fc5f43c05e101e88e2f4e")
  );
});

test("a nameless record does not collide with every other nameless one", () => {
  // Two blanks on different trucks must not be judged the same person.
  assert.notEqual(driverDedupeKey("", "truck-a"), driverDedupeKey("", "truck-b"));
});
