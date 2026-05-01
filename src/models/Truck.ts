import mongoose, { Schema, Document } from "mongoose";

export interface ITruck {
  truckId: string;
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
  nextServiceKm: string;
  estNextServiceDate: string;

  createdAt: Date;
  updatedAt: Date;
}

const TruckSchema: Schema = new Schema(
  {
    truckId: { type: String, required: true, unique: true },
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
    nextServiceKm: { type: String },
    estNextServiceDate: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model<ITruck>("Truck", TruckSchema);
