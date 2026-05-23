import mongoose, { Schema, Document } from "mongoose";

export interface ITruckInspection extends Document {
  driverId: mongoose.Types.ObjectId;
  truckId: mongoose.Types.ObjectId;
  vehicleCondition: string; // Excellent, Good, Fair, Poor
  tyreCondition: string;
  notes: string;
  inspectedAt: Date;
}

const TruckInspectionSchema: Schema = new Schema(
  {
    driverId: { type: Schema.Types.ObjectId, ref: "Driver", required: true },
    truckId: { type: Schema.Types.ObjectId, ref: "Truck" },
    vehicleCondition: { type: String, required: true },
    tyreCondition: { type: String, required: true },
    notes: { type: String, default: "" },
    inspectedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

export default mongoose.model<ITruckInspection>("TruckInspection", TruckInspectionSchema);
