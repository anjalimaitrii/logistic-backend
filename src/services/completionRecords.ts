import Invoice from "../models/Invoice.js";
import Cash from "../models/Cash.js";

// Next id based on the latest existing record — mirrors how tripId works, so
// deleting all records restarts the sequence from 001 (e.g. INV-001 / CASH-001).
async function nextId(Model: any, idField: string, prefix: string): Promise<string> {
  const last = await Model.findOne().sort({ createdAt: -1 }).select(idField);
  let n = 1;
  const lastId = last?.[idField];
  if (lastId) {
    const num = parseInt(String(lastId).replace(new RegExp(`${prefix}-`, "i"), ""), 10);
    if (!isNaN(num)) n = num + 1;
  }
  return `${prefix}-${String(n).padStart(3, "0")}`;
}

// On trip completion, file the booking into the right ledger:
//   with tax    → Invoice (INV-001, INV-002…)
//   without tax → Cash    (CASH-001, CASH-002…)
// One record per booking — bookingId is unique, so this is idempotent.
export async function fileCompletedBooking(booking: any): Promise<void> {
  if (!booking?._id) return;

  const isCash = booking.withTax === false;
  const Model: any = isCash ? Cash : Invoice;
  const idField = isCash ? "cashId" : "invoiceId";
  const prefix = isCash ? "CASH" : "INV";

  // Already filed → skip (dedup)
  const existing = await Model.findOne({ bookingId: booking._id });
  if (existing) return;

  const newId = await nextId(Model, idField, prefix);

  await Model.create({
    [idField]: newId,
    bookingId: booking._id,
    clientId: booking.clientId?._id || booking.clientId || null,
    tripId: booking.tripId || "",
    withTax: booking.withTax !== false,
  });
}
