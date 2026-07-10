import mongoose, { Schema, Document } from "mongoose";

// One row from an uploaded eToll Zambia sheet. Entries are matched to trips
// (bookings) by truck reg + toll timestamp falling inside the trip's
// tripStartedAt → tripEndedAt window.
export interface ITollEntry extends Document {
  date: Date;
  regNo: string; // normalized: uppercase, alphanumeric only (e.g. "AIE5452")
  rawRegNo: string; // as it appeared in the sheet
  charge: number;
  plaza: string;
  vehicleClass?: string;
  bookingId?: mongoose.Types.ObjectId | null;
  tripId?: string | null;
  matchStatus: "matched" | "unmatched";
}

const TollEntrySchema: Schema = new Schema(
  {
    date: { type: Date, required: true },
    regNo: { type: String, required: true },
    rawRegNo: { type: String },
    charge: { type: Number, required: true },
    plaza: { type: String, default: "" },
    vehicleClass: { type: String },
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking", default: null },
    tripId: { type: String, default: null },
    matchStatus: { type: String, enum: ["matched", "unmatched"], default: "unmatched" },
  },
  { timestamps: true }
);

// Re-uploading the same sheet must not double-count rows
TollEntrySchema.index({ regNo: 1, date: 1, plaza: 1 }, { unique: true });
TollEntrySchema.index({ bookingId: 1 });

export default mongoose.model<ITollEntry>("TollEntry", TollEntrySchema);
