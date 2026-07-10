import mongoose, { Schema, Document } from "mongoose";

export interface ISettlement extends Document {
  bookingId: mongoose.Types.ObjectId;
  fuelDetails: {
    legs: Array<{
      from: string;
      to: string;
      km: number;
      mileage: number;
      liters: number;
      amount: number;
    }>;
    fuelRate: number;
    totalDistance: number;
    totalLiters: number;
  };
  expenses: Array<{
    description: string;
    amount: number;
    category: string;
    date: string;
  }>;
  financials: {
    // Actual values entered/approved by the accountant
    cashAllocation: number;
    fuelTotal: number;
    councilLevy: number;
    tollAmount: number; // NOT part of driver's allocation
    // Route Master values at approval time — kept alongside actuals for comparison
    assumeCashAllocation: number;
    assumeCouncilLevy: number;
    assumeTollAmount: number;
  };
  tollAmount?: number;
  status: string;
}

const SettlementSchema: Schema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true, unique: true },
    fuelDetails: {
      legs: [
        {
          from: { type: String, default: "" },
          to: { type: String, default: "" },
          km: { type: Number, default: 0 },
          mileage: { type: Number, default: 4 },
          liters: { type: Number, default: 0 },
          amount: { type: Number, default: 0 }
        }
      ],
      fuelRate: { type: Number, default: 0 },
      totalDistance: { type: Number, default: 0 },
      totalLiters: { type: Number, default: 0 }
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
      // actual values entered at approval
      cashAllocation: { type: Number, default: 0 },
      fuelTotal: { type: Number, default: 0 },
      councilLevy: { type: Number, default: 0 },
      tollAmount: { type: Number, default: 0 }, // not part of driver's allocation
      // Route Master values at approval time (for actual-vs-assumed comparison)
      assumeCashAllocation: { type: Number, default: 0 },
      assumeCouncilLevy: { type: Number, default: 0 },
      assumeTollAmount: { type: Number, default: 0 }
    },
    tollAmount: { type: Number, default: 0 },
    status: { type: String, default: "Approved" }
  },
  { timestamps: true }
);

export default mongoose.model<ISettlement>("Settlement", SettlementSchema);
