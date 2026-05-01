import mongoose, { Schema, Document } from "mongoose";

export interface ISettlement extends Document {
  bookingId: mongoose.Types.ObjectId;
  assignmentId: mongoose.Types.ObjectId;
  fuelDetails: {
    pickupKm: number;
    pickupMileage: number;
    dropoffKm: number;
    dropoffMileage: number;
    fuelRate: number;
    totalDistance: number;
  };
  expenses: Array<{
    description: string;
    amount: number;
    category: string;
    date: string;
  }>;
  financials: {
    advancePaid: number;
    grandTotal: number;
  };
  status: string; // e.g., "Pending", "Settled"
}

const SettlementSchema: Schema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true, unique: true },
    assignmentId: { type: Schema.Types.ObjectId, ref: "Assignment", required: true },
    fuelDetails: {
      pickupKm: { type: Number, default: 0 },
      pickupMileage: { type: Number, default: 0 },
      dropoffKm: { type: Number, default: 0 },
      dropoffMileage: { type: Number, default: 0 },
      fuelRate: { type: Number, default: 0 },
      totalDistance: { type: Number, default: 0 }
    },
    expenses: [
      {
        description: { type: String },
        amount: { type: Number },
        category: { type: String },
        date: { type: String }
      }
    ],
    financials: {
      advancePaid: { type: Number, default: 0 },
      grandTotal: { type: Number, default: 0 }
    },
    status: { type: String, default: "Approved" }
  },
  { timestamps: true }
);

export default mongoose.model<ISettlement>("Settlement", SettlementSchema);
