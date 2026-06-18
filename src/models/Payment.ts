import mongoose, { Schema } from "mongoose";

const PaymentSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", default: null },
    clientId:  { type: Schema.Types.ObjectId, ref: "Client",  default: null },
    amount: { type: Number, required: true },
    note:   { type: String, default: "" },
    paidAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("Payment", PaymentSchema);
