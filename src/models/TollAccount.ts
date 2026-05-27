import mongoose, { Schema, Document } from "mongoose";

export interface ITollTransaction {
  type: "recharge" | "deduction";
  amount: number;
  description: string;
  bookingId?: mongoose.Types.ObjectId;
  tripId?: string;
  date: Date;
}

export interface ITollAccount extends Document {
  balance: number;
  transactions: ITollTransaction[];
}

const TollTransactionSchema = new Schema(
  {
    type: { type: String, enum: ["recharge", "deduction"], required: true },
    amount: { type: Number, required: true },
    description: { type: String, required: true },
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking" },
    tripId: { type: String },
    date: { type: Date, default: Date.now }
  },
  { _id: false }
);

const TollAccountSchema: Schema = new Schema(
  {
    balance: { type: Number, default: 0 },
    transactions: [TollTransactionSchema]
  },
  { timestamps: true }
);

export default mongoose.model<ITollAccount>("TollAccount", TollAccountSchema);
