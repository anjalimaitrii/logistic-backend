import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";

export interface IDriver {
  name: string;
  phone: string;
  email?: string;
  licenseType: string;
  licenseNo: string;
  experience: number;
  assignedTruck?: mongoose.Types.ObjectId;
  status: string; // Active, On Leave, Suspended
  driverStatus: string; // available, on_trip, offloading, returning, under_inspection
  tripQueue: mongoose.Types.ObjectId[];
  needsTruckInspection: boolean;
  password?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DriverSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, unique: true, sparse: true },
    licenseType: { type: String, required: true },
    licenseNo: { type: String, required: true, unique: true },
    experience: { type: Number, default: 0 },
    assignedTruck: { type: Schema.Types.ObjectId, ref: "Truck" },
    status: { type: String, default: "Active" },
    driverStatus: { type: String, default: "available" }, // available, on_trip, offloading, returning, under_inspection
    tripQueue: [{ type: Schema.Types.ObjectId, ref: "Booking" }],
    needsTruckInspection: { type: Boolean, default: false },
    password: { type: String },
  },
  { timestamps: true }
);

// Hash password before saving
DriverSchema.pre("save", async function (this: any) {
  if (!this.isModified("password") || !this.password) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

export default mongoose.model<IDriver & Document>("Driver", DriverSchema);
