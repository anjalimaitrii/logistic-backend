import mongoose, { Schema, Document } from "mongoose";
import type { LocationKind } from "../lib/locationKey.js";
import { LOCATION_KINDS } from "../lib/locationKey.js";

// Countries, provinces and towns an operator added because the shipped list did
// not have them. Read alongside that list, never instead of it — this holds only
// the additions.
export interface ILocation extends Document {
  kind: LocationKind;
  name: string;
  country?: string;
  state?: string;
  key: string;
}

const LocationSchema = new Schema<ILocation>(
  {
    kind:    { type: String, enum: [...LOCATION_KINDS], required: true },
    name:    { type: String, required: true, trim: true },
    // The path this entry hangs off. A province needs its country; a town needs
    // its country and, where the operator knew it, its province.
    country: { type: String, default: "" },
    state:   { type: String, default: "" },
    key:     { type: String, required: true },
  },
  { timestamps: true }
);

// One row per place. The index is what makes a repeat submission a duplicate-key
// error instead of a second "Ndola" in everyone's dropdown.
LocationSchema.index({ key: 1 }, { unique: true });

export default mongoose.model<ILocation>("Location", LocationSchema);
