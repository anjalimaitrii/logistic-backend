import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";
import { driverDedupeKey } from "../lib/driverKey.js";

export interface IDriver {
  name: string;
  phone: string;
  email?: string;
  /** National Registration Card number, e.g. 153013/10/1. */
  nrc?: string;
  experience: number;
  assignedTruck?: mongoose.Types.ObjectId;
  /** name + truck, normalised. Carries the unique index — see lib/driverKey. */
  dedupeKey: string;
  status: string; // Active, On Leave, Suspended
  driverStatus: string; // available, on_trip, offloading, returning, repositioning, under_inspection
  // repositioning = still on the current trip, driving empty to the NEXT job's
  // pickup after a reassignment. Not assignable.
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
    // Not unique and not required: drivers arrive from the Trakzee import
    // without one, and a unique index would reject every one of them past the
    // first empty value.
    nrc: { type: String, default: "" },
    experience: { type: Number, default: 0 },
    assignedTruck: { type: Schema.Types.ObjectId, ref: "Truck" },
    dedupeKey: { type: String },
    status: { type: String, default: "Active" },
    driverStatus: { type: String, default: "available" }, // available, on_trip, offloading, returning, repositioning, under_inspection
  // repositioning = still on the current trip, driving empty to the NEXT job's
  // pickup after a reassignment. Not assignable.
    tripQueue: [{ type: Schema.Types.ObjectId, ref: "Booking" }],
    needsTruckInspection: { type: Boolean, default: false },
    password: { type: String },
  },
  { timestamps: true }
);

// One record per person per truck, enforced by the database rather than by
// whichever screen happens to be creating them. The Trakzee import runs on every
// page load, and two tabs open at once will both read an empty list and both
// write — a check in the browser cannot see the other browser.
DriverSchema.index({ dedupeKey: 1 }, { unique: true });

// Keep the key in step with the two fields it is made of.
DriverSchema.pre("save", function (this: any) {
  if (this.isModified("name") || this.isModified("assignedTruck") || !this.dedupeKey) {
    this.dedupeKey = driverDedupeKey(this.name, this.assignedTruck);
  }
});

// findByIdAndUpdate skips the save hook, so moving a driver to another truck
// would otherwise leave the key pointing at the old one.
DriverSchema.pre("findOneAndUpdate", async function (this: any) {
  const update = this.getUpdate() || {};
  const set = { ...(update.$set || {}), ...update };
  if (set.name === undefined && set.assignedTruck === undefined) return;

  const current = await this.model.findOne(this.getQuery()).select("name assignedTruck").lean();
  if (!current) return;
  const name = set.name !== undefined ? set.name : current.name;
  const truck = set.assignedTruck !== undefined ? set.assignedTruck : current.assignedTruck;
  this.set({ dedupeKey: driverDedupeKey(name, truck) });
});

// Hash password before saving
DriverSchema.pre("save", async function (this: any) {
  if (!this.isModified("password") || !this.password) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

export default mongoose.model<IDriver & Document>("Driver", DriverSchema);
