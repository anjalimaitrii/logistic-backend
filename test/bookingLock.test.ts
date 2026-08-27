import { test } from "node:test";
import assert from "node:assert/strict";
import { editsBookingDetails, BOOKING_DETAIL_FIELDS } from "../src/lib/bookingLock.js";

test("changing where or what the truck hauls counts as a detail edit", () => {
  assert.equal(editsBookingDetails({ pickupLocations: [] }), true);
  assert.equal(editsBookingDetails({ dropoffLocations: [] }), true);
  assert.equal(editsBookingDetails({ cargoDetails: { goodsType: ["Tiles"] } }), true);
  assert.equal(editsBookingDetails({ clientId: "abc" }), true);
  assert.equal(editsBookingDetails({ requirement: { bodyType: "Flat Bed" } }), true);
});

test("the money and invoice editors are not detail edits", () => {
  // The jobs-page drawer sends these three; InvoiceDrawer sends zraInvoiceNo.
  // Both run on trips that already have a driver, and must keep working.
  assert.equal(editsBookingDetails({ finalAmount: 5000, advancePaid: 1000, specialRequest: "call first" }), false);
  assert.equal(editsBookingDetails({ zraInvoiceNo: "ZRA-114" }), false);
});

test("an empty or absent body changes nothing", () => {
  assert.equal(editsBookingDetails({}), false);
  assert.equal(editsBookingDetails(undefined), false);
  assert.equal(editsBookingDetails(null), false);
});

test("a detail field explicitly set to undefined is still a write", () => {
  // $set with undefined would blank the field, so presence of the key is what
  // counts — not whether it carries a value.
  assert.equal(editsBookingDetails({ pickupLocations: undefined }), true);
});

test("a mixed body is locked by its detail half", () => {
  assert.equal(editsBookingDetails({ finalAmount: 100, cargoDetails: {} }), true);
});

test("the field list is the one the booking form writes", () => {
  assert.deepEqual([...BOOKING_DETAIL_FIELDS].sort(), [
    "cargoDetails", "clientId", "dropoffLocations", "pickupLocations", "requirement",
  ]);
});
