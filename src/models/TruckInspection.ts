import mongoose, { Schema, Document } from "mongoose";

export interface ITruckInspection extends Document {
  driverId: mongoose.Types.ObjectId;
  truckId: mongoose.Types.ObjectId;
  bookingId?: mongoose.Types.ObjectId;
  vehicleCondition: string;
  tyreCondition: string;
  tyreNumber?: string;
  challans?: string;
  deliveryOrders?: string[];
  damages?: Array<{ quantity: string; amount: string }>;
  notes: string;
  inspectedAt: Date;
  attachments: Array<{ name: string; data: string; mimeType: string; size: number }>;
}

const TruckInspectionSchema: Schema = new Schema(
  {
    driverId:       { type: Schema.Types.ObjectId, ref: "Driver", required: true },
    truckId:        { type: Schema.Types.ObjectId, ref: "Truck" },
    // The specific trip this inspection belongs to. Lets us tell which completed
    // trips still have no damages/DO recorded (e.g. trips auto-closed while returning).
    bookingId:      { type: Schema.Types.ObjectId, ref: "Booking" },
    vehicleCondition: { type: String, required: true },
    tyreCondition:  { type: String, required: true },
    tyreNumber:     { type: String, default: "" },
    challans:       { type: String, default: "" },
    deliveryOrders: [{ type: String }],
    damages: [
      {
        quantity: { type: String },
        amount:   { type: String },
      }
    ],
    notes:        { type: String, default: "" },
    inspectedAt:  { type: Date, default: Date.now },
    attachments: [
      {
        name:     { type: String },
        data:     { type: String },
        mimeType: { type: String },
        size:     { type: Number },
      }
    ],
  },
  { timestamps: true }
);

export default mongoose.model<ITruckInspection>("TruckInspection", TruckInspectionSchema);
