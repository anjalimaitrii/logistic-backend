import { test } from "node:test";
import assert from "node:assert/strict";
import { fleetSummaryFor, TRANSPORTER_NAME } from "../src/lib/fleetSummary.js";

test("an unassigned trip has no fleet to show", () => {
  assert.equal(fleetSummaryFor(null), null);
  assert.equal(fleetSummaryFor(undefined), null);
});

test("an assignment gives the client the transporter, truck and driver", () => {
  const s = fleetSummaryFor({
    truckNumber: "BAZ 5546 ZM",
    driverName: "Joel Muzizi",
    truckId: { truckId: "BAZ 5546 ZM", trailerNumber: "CAD 7808 ZM" },
    driverId: { name: "Joel Muzizi", phone: "+260975035330", nrc: "153013/10/1" },
  });
  assert.deepEqual(s, {
    transporter: TRANSPORTER_NAME,
    truckNumber: "BAZ 5546 ZM",
    trailerNumber: "CAD 7808 ZM",
    driverName: "Joel Muzizi",
    driverPhone: "+260975035330",
    driverNrc: "153013/10/1",
  });
});

test("the driver record wins over the name copied onto the assignment", () => {
  // The assignment's copy is a snapshot; a corrected spelling on the driver
  // record is the better one to show.
  const s = fleetSummaryFor({
    truckNumber: "CAD 7808",
    driverName: "joel muzizi",
    driverId: { name: "Joel Muzizi", phone: "0975035330" },
  });
  assert.equal(s?.driverName, "Joel Muzizi");
});

test("a deleted driver still leaves the name the assignment recorded", () => {
  const s = fleetSummaryFor({ truckNumber: "BAZ 49", driverName: "Butwell Malambo", driverId: null });
  assert.equal(s?.driverName, "Butwell Malambo");
  assert.equal(s?.driverPhone, "");
  assert.equal(s?.driverNrc, "");
});

test("nothing but the four client-safe fields comes out", () => {
  // The assignment also carries truckHealth, queueStatus, collectionArea and
  // internal ids. None of that is the client's business.
  const s = fleetSummaryFor({
    truckNumber: "BAZ 49", driverName: "X",
    driverId: { _id: "abc", name: "X", phone: "1", licenseNo: "L-1", password: "secret" },
    truckHealth: "Excellent", queueStatus: "active", collectionArea: "Yard 2",
  });
  assert.deepEqual(Object.keys(s!).sort(), ["driverName", "driverNrc", "driverPhone", "trailerNumber", "transporter", "truckNumber"]);
});

test("a rigid truck reports no trailer rather than a blank-looking one", () => {
  const s = fleetSummaryFor({ truckNumber: "BAZ 49", truckId: { truckId: "BAZ 49", trailerNumber: "" } });
  assert.equal(s?.trailerNumber, "");
  // No truck record populated at all is the same answer.
  assert.equal(fleetSummaryFor({ truckNumber: "BAZ 49" })?.trailerNumber, "");
});

test("a placeholder phone is treated as no phone", () => {
  // Every Trakzee-imported driver carries "--" here; a customer must not be
  // handed that as the number to call.
  const s = fleetSummaryFor({ truckNumber: "AIF 441", driverName: "festus Mulela", driverId: { name: "festus Mulela", phone: "--" } });
  assert.equal(s?.driverPhone, "");
  assert.equal(fleetSummaryFor({ driverId: { phone: "   " } })?.driverPhone, "");
  assert.equal(fleetSummaryFor({ driverId: { phone: "+260975035330" } })?.driverPhone, "+260975035330");
});

test("missing pieces come back blank, never undefined", () => {
  const s = fleetSummaryFor({});
  assert.equal(s?.truckNumber, "");
  assert.equal(s?.driverName, "");
  assert.equal(s?.driverPhone, "");
});
