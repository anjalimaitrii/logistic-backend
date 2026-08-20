import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTyres, worstTyreCondition, joinTyreNumbers } from "../src/lib/tyreInspection.js";

test("a list of tyres comes back trimmed and intact", () => {
  const t = normalizeTyres({
    tyres: [
      { position: "Front Left (1)", number: " TY-1 ", condition: "Fair" },
      { position: "Front Right (2)", number: "TY-2", condition: "Good" },
    ],
  });
  assert.deepEqual(t, [
    { position: "Front Left (1)", number: "TY-1", condition: "Fair" },
    { position: "Front Right (2)", number: "TY-2", condition: "Good" },
  ]);
});

test("a legacy flat pair becomes a one-tyre list with no position", () => {
  assert.deepEqual(normalizeTyres({ tyreNumber: "TY-9", tyreCondition: "Poor — Replace" }), [
    { position: "", number: "TY-9", condition: "Poor — Replace" },
  ]);
});

test("a position with no serial is still a tyre that was inspected", () => {
  // The truck may have no serial on record yet; where it sits is enough to log
  // that someone looked at it.
  assert.deepEqual(normalizeTyres({ tyres: [{ position: "Spare Tyre (23)", condition: "Fair" }] }), [
    { position: "Spare Tyre (23)", number: "", condition: "Fair" },
  ]);
});

test("rows with neither position nor number are dropped", () => {
  const t = normalizeTyres({
    tyres: [{ position: "", number: "", condition: "Good" }, { number: "TY-1" }],
  });
  assert.deepEqual(t, [{ position: "", number: "TY-1", condition: "Good" }]);
});

test("a missing condition defaults rather than blanking", () => {
  assert.deepEqual(normalizeTyres({ tyres: [{ number: "TY-1" }] }), [
    { position: "", number: "TY-1", condition: "Good" },
  ]);
});

test("the same POSITION twice keeps the later row", () => {
  // A tyre can be swapped for a different serial in the same place, so position
  // is the identity — the second row is a correction, not a second tyre.
  const t = normalizeTyres({
    tyres: [
      { position: "Front Left (1)", number: "TY-1", condition: "Good" },
      { position: "front left (1)", number: "TY-9", condition: "Fair" },
    ],
  });
  assert.deepEqual(t, [{ position: "front left (1)", number: "TY-9", condition: "Fair" }]);
});

test("serial-only rows still dedupe on the serial", () => {
  const t = normalizeTyres({
    tyres: [{ number: "TY-1", condition: "Good" }, { number: "ty-1", condition: "Fair" }],
  });
  assert.deepEqual(t, [{ position: "", number: "ty-1", condition: "Fair" }]);
});

test("the same serial in two DIFFERENT positions is two rows", () => {
  // Two positions were walked and looked at; a duplicated serial is a typo the
  // inspector can see, not something to silently collapse into one tyre.
  const t = normalizeTyres({
    tyres: [
      { position: "Front Left (1)", number: "TY-1", condition: "Good" },
      { position: "Front Right (2)", number: "TY-1", condition: "Fair" },
    ],
  });
  assert.equal(t.length, 2);
});

test("nothing sent yields nothing", () => {
  assert.deepEqual(normalizeTyres({}), []);
  assert.deepEqual(normalizeTyres({ tyres: [] }), []);
});

test("the flat condition is the WORST tyre on the truck", () => {
  const t = [
    { position: "Front Left (1)", number: "TY-1", condition: "Excellent" },
    { position: "Front Right (2)", number: "TY-2", condition: "Poor — Replace" },
    { position: "Spare Tyre (23)", number: "TY-3", condition: "Good" },
  ];
  assert.equal(worstTyreCondition(t), "Poor — Replace");
});

test("an unrecognised condition never outranks a real Poor", () => {
  const t = [
    { position: "", number: "TY-1", condition: "banana" },
    { position: "", number: "TY-2", condition: "Poor — Replace" },
  ];
  assert.equal(worstTyreCondition(t), "Poor — Replace");
});

test("an empty list falls back rather than returning nothing", () => {
  assert.equal(worstTyreCondition([]), "Good");
  assert.equal(worstTyreCondition([], "Excellent"), "Excellent");
});

test("the flat number lists every serial, skipping the blanks", () => {
  const t = [
    { position: "Front Left (1)", number: "TY-1", condition: "Good" },
    { position: "Front Right (2)", number: "", condition: "Fair" },
    { position: "Spare Tyre (23)", number: "TY-2", condition: "Fair" },
  ];
  assert.equal(joinTyreNumbers(t), "TY-1, TY-2");
  assert.equal(joinTyreNumbers([]), "");
});
