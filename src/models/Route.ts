import mongoose, { Schema, Document } from "mongoose";

export interface IRoute extends Document {
  pickupCity: string;
  pickupProvince: string;
  pickupCountry: string;
  dropoffCity: string;
  dropoffProvince: string;
  dropoffCountry: string;
  distance: number;
  tollCount: number;
  tollAmount: number;
  allocationMoney: number;
  councilLevy: number;
  // Cross-border routes are costed in both currencies. Kept as parallel figures
  // rather than one converted number: no rate is stored anywhere, and a moving
  // rate would keep rewriting what a route was quoted at.
  tollAmountUsd?: number;
  allocationMoneyUsd?: number;
  councilLevyUsd?: number;
}

const RouteSchema = new Schema<IRoute>(
  {
    pickupCity:       { type: String, required: true, trim: true },
    pickupProvince:   { type: String, default: "", trim: true },
    pickupCountry:    { type: String, default: "", trim: true },
    dropoffCity:      { type: String, required: true, trim: true },
    dropoffProvince:  { type: String, default: "", trim: true },
    dropoffCountry:   { type: String, default: "", trim: true },
    distance:         { type: Number, required: true, min: 0 },
    tollCount:        { type: Number, default: 0, min: 0 },
    tollAmount:       { type: Number, default: 0, min: 0 },
    allocationMoney:  { type: Number, required: true, min: 0 },
    councilLevy:      { type: Number, default: 0, min: 0 },
    // Not required: a domestic route has no dollar side, and every route saved
    // before cross-border trips existed reads as zero, i.e. Kwacha-only.
    tollAmountUsd:      { type: Number, default: 0, min: 0 },
    allocationMoneyUsd: { type: Number, default: 0, min: 0 },
    councilLevyUsd:     { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

RouteSchema.index({ pickupCity: 1, dropoffCity: 1 });

export default mongoose.model<IRoute>("Route", RouteSchema);
