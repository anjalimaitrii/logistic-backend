import mongoose, { Schema } from "mongoose";

// A completed WITH-TAX trip, filed with its own id (inv-001, inv-002…).
// Holds only the new id + relations (by ObjectId) — full data lives on the Booking.
const InvoiceSchema = new Schema(
  {
    invoiceId: { type: String, required: true, unique: true }, // inv-001
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true, unique: true },
    clientId:  { type: Schema.Types.ObjectId, ref: "Client", default: null },
    tripId:    { type: String, default: "" }, // original trip id (e.g. TRIP-001) for reference
    withTax:   { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Invoice", InvoiceSchema);
