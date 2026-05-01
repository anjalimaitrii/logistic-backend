import mongoose, { Schema, Document } from "mongoose";

export interface IDriver {
  name: string;
  phone: string;
  licenseType: string;
  licenseNo: string;
  experience: number;
  assignedTruck?: mongoose.Types.ObjectId;
  status: string; // Active, On Leave, Suspended
  createdAt: Date;
  updatedAt: Date;
}

const DriverSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    licenseType: { type: String, required: true },
    licenseNo: { type: String, required: true, unique: true },
    experience: { type: Number, default: 0 },
    assignedTruck: { type: Schema.Types.ObjectId, ref: "Truck" },
    status: { type: String, default: "Active" },
  },
  { timestamps: true }
);

export default mongoose.model<IDriver>("Driver", DriverSchema);
