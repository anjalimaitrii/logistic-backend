import mongoose, { Schema } from "mongoose";

const PaymentSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", default: null },
    clientId:  { type: Schema.Types.ObjectId, ref: "Client",  default: null },
    amount: { type: Number, required: true },
    // Domestic clients pay Kwacha; an international one pays dollars. The payment
    // is only ever allocated to invoices in this same currency — nothing here
    // converts between them, and no rate is stored anywhere to do it with.
    // Payments recorded before this field existed have no value and read as ZMW.
    currency: { type: String, enum: ["ZMW", "USD"], default: "ZMW" },
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
