import mongoose, { Schema } from "mongoose";

// A completed WITHOUT-TAX trip, filed with its own id (cash-001, cash-002…).
// Holds only the new id + relations (by ObjectId) — full data lives on the Booking.
const CashSchema = new Schema(
  {
    cashId:    { type: String, required: true, unique: true }, // cash-001
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true, unique: true },
    clientId:  { type: Schema.Types.ObjectId, ref: "Client", default: null },
    tripId:    { type: String, default: "" }, // original trip id (e.g. TRIP-001) for reference
    withTax:   { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("Cash", CashSchema);
