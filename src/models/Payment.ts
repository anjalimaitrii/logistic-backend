import mongoose, { Schema } from "mongoose";

const PaymentSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", default: null },
    clientId:  { type: Schema.Types.ObjectId, ref: "Client",  default: null },
    amount: { type: Number, required: true },
    note:   { type: String, default: "" },
    paidAt: { type: Date, default: Date.now },
    // How this payment's amount was distributed across bookings (FIFO at creation).
    // Used to precisely reverse the allocation if the payment is later deleted.
    allocations: [
      {
        bookingId: { type: Schema.Types.ObjectId, ref: "Booking" },
        amount:    { type: Number },
        _id: false,
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("Payment", PaymentSchema);
