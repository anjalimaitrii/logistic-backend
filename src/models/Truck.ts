import mongoose, { Schema, Document } from "mongoose";

export interface ITruck {
  truckId: string;
  /**
   * The tracker's IMEI — the only stable identity a vehicle has. Trakzee lets a
   * plate be edited, and matching on the plate turned one such rename into a
   * second truck row for the same physical vehicle. Trucks stored before this
   * existed have none until the sync matches them on plate once and fills it in.
   */
  imei?: string;
  /**
   * The trailer's own registration. A rig is two separately registered vehicles
   * — the horse (truckId) pulls it — and the gate or weighbridge may check
   * either one, so the client is shown both.
   */
  trailerNumber?: string;
  vehicleModel: string;
  capacity: number;
  year: string;
  fuelType: string;
  health: string;
  truckType: string;
  length: number;
  width: number;
  height: number;
  maintenanceDate: string;
  status: string;
  odometer: string;
  
  // Compliance & Technical Fields
  complianceDocs: {
    type: string;
    dueDate: string;
    file?: string; // To store filename or URL
  }[];
  fastagBalance: string;
  tireNumbers: string;
  // Each fitted tyre: where it sits on the truck and the serial stamped on it.
  // A position on its own cannot answer "which tyre failed" — that is the serial.
  tyres: { position: string; serial: string }[];
  // Positions only, derived from `tyres`. Kept because records written before the
  // serials existed hold their positions here.
  tireSerialNumber: string[];
  nextServiceKm: string;
  estNextServiceDate: string;
  maintenanceFareCost?: string;
  currentService?: string;
  nextService?: string;
  nextServiceDate?: string;
  collections: {
    _id?: any;
    name: string;
    description: string;
    quantity: number;
    createdAt?: Date;
    renewedAt?: Date;
  }[];

  activityLog?: {
    title: string;
    description: string;
    time: Date;
  }[];

  createdAt: Date;
  updatedAt: Date;
}

const TruckSchema: Schema = new Schema(
  {
    truckId: { type: String, required: true, unique: true },
    // Sparse: the trucks that predate this field have no value, and a plain
    // unique index would reject every one of them past the first.
    imei: { type: String, unique: true, sparse: true, default: undefined },
    // Not required: a rigid truck has no trailer, and the Trakzee import brings
    // none. Not unique either — a trailer can be re-registered onto another horse.
    trailerNumber: { type: String, default: "" },
    vehicleModel: { type: String, required: true },
    capacity: { type: Number },
    year: { type: String },
    fuelType: { type: String, default: "Diesel" },
    health: { type: String, default: "Excellent" },
    truckType: { type: String },
    length: { type: Number },
    width: { type: Number },
    height: { type: Number },
    maintenanceDate: { type: String },
    status: { type: String, default: "Idle" }, // Active, Inactive, Idle, Maint.
    odometer: { type: String, default: "0 km" },

    // Compliance & Technical
    complianceDocs: {
      type: [
        {
          type: { type: String },
          dueDate: { type: String },
          file: { type: String },
          _id: false // This removes the automatic _id for each document entry
        }
      ],
      default: []
    },
    fastagBalance: { type: String, default: "0" },
    tireNumbers: { type: String },
    tyres: {
      type: [{
        position: { type: String, default: "" },
        serial:   { type: String, default: "" },
        _id: false,
      }],
      default: [],
    },
    tireSerialNumber: { type: [String], default: [] },
    nextServiceKm: { type: String },
    estNextServiceDate: { type: String },
    maintenanceFareCost: { type: String },
    currentService: { type: String },
    nextService: { type: String },
    nextServiceDate: { type: String },
    collections: {
      type: [
        {
          name: { type: String, required: true },
          description: { type: String, default: "" },
          quantity: { type: Number, default: 1 },
          createdAt: { type: Date, default: Date.now },
          renewedAt: { type: Date, default: null },
        }
      ],
      default: [],
    },
    activityLog: {
      type: [
        {
          title:       { type: String, required: true },
          description: { type: String, default: "" },
          time:        { type: Date, default: Date.now },
          _id: false,
        }
      ],
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.model<ITruck>("Truck", TruckSchema);
