import mongoose, { Schema, Document } from "mongoose";

// One document per empty interval between two consecutive trips of the same
// truck. One row, one claimant — that is what makes double-billing impossible
// by construction rather than by convention (CR-VL-001 §6.2).
export interface ITripGap extends Document {
  truckId?: mongoose.Types.ObjectId;
  truckNumber: string;
  prevBookingId: mongoose.Types.ObjectId;
  nextBookingId: mongoose.Types.ObjectId;
  fromLabel: string;
  toLabel: string;
  detectedAt: Date;
  /**
   * What the truck was doing when this gap was created.
   *
   * "offloading" — still standing at the drop point, so fromLabel is where it
   *   actually is and can be trusted.
   * "returning"  — already left the drop point and is somewhere between there
   *   and the yard. fromLabel is NOT where the truck is; only the accountant
   *   knows that, so the UI leaves the origin blank for them to fill.
   */
  detectedDuring?: "offloading" | "returning";
  status: "unattributed" | "claimed";
  claimedByBookingId?: mongoose.Types.ObjectId;
  claimedSide?: "append" | "prepend";
  claimedKm?: number;
  claimedAt?: Date;
  claimedBy?: string;
}

const TripGapSchema = new Schema<ITripGap>(
  {
    truckId:       { type: Schema.Types.ObjectId, ref: "Truck" },
    truckNumber:   { type: String, default: "" },
    prevBookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true },
    nextBookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true },
    fromLabel:     { type: String, default: "" },
    toLabel:       { type: String, default: "" },
    detectedAt:    { type: Date, default: Date.now },
    detectedDuring: { type: String, enum: ["offloading", "returning"] },
    status:        { type: String, enum: ["unattributed", "claimed"], default: "unattributed" },
    claimedByBookingId: { type: Schema.Types.ObjectId, ref: "Booking" },
    claimedSide:   { type: String, enum: ["append", "prepend"] },
    claimedKm:     { type: Number },
    claimedAt:     { type: Date },
    claimedBy:     { type: String },
  },
  { timestamps: true }
);

// One gap per pair of consecutive trips. This is what makes a repeat detection a
// no-op instead of a duplicate row.
TripGapSchema.index({ prevBookingId: 1, nextBookingId: 1 }, { unique: true });

export default mongoose.model<ITripGap>("TripGap", TripGapSchema);
