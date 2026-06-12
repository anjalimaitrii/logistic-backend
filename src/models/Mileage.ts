import mongoose, { Schema, Document } from "mongoose";

export interface IMileage extends Document {
  loadedMileage: number;
  unloadedMileage: number;
}

const MileageSchema = new Schema<IMileage>(
  {
    loadedMileage:   { type: Number, required: true, min: 0 },
    unloadedMileage: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

export default mongoose.model<IMileage>("Mileage", MileageSchema);
