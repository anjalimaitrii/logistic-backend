import mongoose, { Schema, Document } from "mongoose";

export interface IAssignment extends Document {
  bookingId: mongoose.Types.ObjectId;
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
