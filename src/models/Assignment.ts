import mongoose, { Schema, Document } from "mongoose";

export interface IAssignment extends Document {
  bookingId: mongoose.Types.ObjectId;
  truckId: mongoose.Types.ObjectId;
  driverId: mongoose.Types.ObjectId;
  driverName: string;
  truckNumber: string;
  truckHealth: string;
  collectionArea: string;
  assignedAt: Date;
  status: string; // e.g., "Assigned", "Started", "Completed"
  queueStatus: string; // active, queued, completed
  sequence: number;
}

const AssignmentSchema: Schema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true, unique: true },
    truckId: { type: Schema.Types.ObjectId, ref: "Truck" },
    driverId: { type: Schema.Types.ObjectId, ref: "Driver" },
    driverName: { type: String, required: true },
    truckNumber: { type: String, required: true },
    truckHealth: { type: String },
    collectionArea: { type: String },
    assignedAt: { type: Date, default: Date.now },
    status: { type: String, default: "Assigned" },
    queueStatus: { type: String, default: "active" }, // active, queued, completed
    sequence: { type: Number, default: 1 }
  },
  { timestamps: true }
);

export default mongoose.model<IAssignment>("Assignment", AssignmentSchema);
