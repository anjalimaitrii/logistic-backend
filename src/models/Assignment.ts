import mongoose, { Schema, Document } from "mongoose";

export interface IAssignment extends Document {
  bookingId: mongoose.Types.ObjectId;
  truckId: mongoose.Types.ObjectId; // New reference
  driverId: mongoose.Types.ObjectId; // Driver reference
  driverName: string;
  truckNumber: string;
  truckHealth: string;
  collectionArea: string;
  assignedAt: Date;
  status: string; // e.g., "Assigned", "Started", "Completed"
}

const AssignmentSchema: Schema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true, unique: true },
    truckId: { type: Schema.Types.ObjectId, ref: "Truck" }, // Added truckId reference
    driverId: { type: Schema.Types.ObjectId, ref: "Driver" }, // Added driverId reference
    driverName: { type: String, required: true },
    truckNumber: { type: String, required: true },
    truckHealth: { type: String },
    collectionArea: { type: String },
    assignedAt: { type: Date, default: Date.now },
    status: { type: String, default: "Assigned" }
  },
  { timestamps: true }
);

export default mongoose.model<IAssignment>("Assignment", AssignmentSchema);
