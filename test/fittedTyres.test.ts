import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeFittedTyres, fittedTyresChanged } from "../src/lib/fittedTyres.js";

const t = (position: string, number: string, condition = "Good") => ({ position, number, condition });

test("a corrected serial replaces the one on the truck", () => {
  const merged = mergeFittedTyres(
    [{ position: "Front Left (1)", serial: "002" }],
    [t("Front Left (1)", "003")]
  );
  assert.deepEqual(merged, [{ position: "Front Left (1)", serial: "003" }]);
});

test("position matching ignores case and padding", () => {
  const merged = mergeFittedTyres(
    [{ position: "Front Left (1)", serial: "002" }],
    [t(" front left (1) ", "003")]
  );
  assert.deepEqual(merged, [{ position: "Front Left (1)", serial: "003" }]);
});

test("wheels the inspection never mentioned are left alone", () => {
  // Checking four tyres is not testimony that the other eighteen are gone.
  const merged = mergeFittedTyres(
    [
      { position: "Front Left (1)", serial: "001" },
      { position: "Front Right (2)", serial: "002" },
      { position: "Spare Tyre (23)", serial: "023" },
    ],
    [t("Front Right (2)", "999")]
  );
  assert.deepEqual(merged, [
    { position: "Front Left (1)", serial: "001" },
    { position: "Front Right (2)", serial: "999" },
    { position: "Spare Tyre (23)", serial: "023" },
  ]);
});

test("a wheel the truck did not know about is added", () => {
  const merged = mergeFittedTyres([], [t("Spare Tyre (23)", "023")]);
  assert.deepEqual(merged, [{ position: "Spare Tyre (23)", serial: "023" }]);
});

test("a blank serial does not wipe one already on record", () => {
  // Blank means "not recorded here", not "this wheel is bare".
  const merged = mergeFittedTyres([{ position: "Front Left (1)", serial: "001" }], [t("Front Left (1)", "")]);
  assert.deepEqual(merged, [{ position: "Front Left (1)", serial: "001" }]);
});

test("a serial with no position cannot be placed, so it changes nothing", () => {
  const merged = mergeFittedTyres([{ position: "Front Left (1)", serial: "001" }], [t("", "999")]);
  assert.deepEqual(merged, [{ position: "Front Left (1)", serial: "001" }]);
});

test("an empty inspection leaves the truck untouched", () => {
  const before = [{ position: "Front Left (1)", serial: "001" }];
  assert.deepEqual(mergeFittedTyres(before, []), before);
  assert.deepEqual(mergeFittedTyres(undefined, []), []);
});

test("a merge that changed nothing is detectable, so no write is made", () => {
  const before = [{ position: "Front Left (1)", serial: "001" }];
  assert.equal(fittedTyresChanged(before, mergeFittedTyres(before, [t("Front Left (1)", "001")])), false);
  assert.equal(fittedTyresChanged(before, mergeFittedTyres(before, [t("Front Left (1)", "003")])), true);
  assert.equal(fittedTyresChanged(before, mergeFittedTyres(before, [t("Spare Tyre (23)", "023")])), true);
});

test("a truck with nothing on record and nothing inspected needs no write", () => {
  assert.equal(fittedTyresChanged(undefined, []), false);
});
