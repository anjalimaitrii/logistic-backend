import mongoose, { Schema, Document } from "mongoose";

export interface ICompany extends Document {
  companyName: string;
  /** Zambian Taxpayer Identification Number, printed on the client invoice. */
  tpinNumber?: string;
  address: {
    street: string;
    // Same cascade the booking forms use, so a company address and a trip
    // endpoint name the same place the same way.
    country: string;
    state: string;
    city: string;
  };
  contact: {
    person: string;
    phone: string;
    email: string;
  };
  accounting: {
    billingName?: string;
  };
  status: string;
  clients: string[]; // Array of Client ObjectIds
  createdAt: Date;
  updatedAt: Date;
}

const CompanySchema: Schema = new Schema(
  {
    companyName: { type: String, required: true },
    tpinNumber: { type: String },
    address: {
      street:  { type: String },
      country: { type: String },
      state:   { type: String },
      city:    { type: String },
    },
    contact: {
      person: { type: String },
      phone: { type: String },
      email: { type: String },
    },
    accounting: {
      billingName: { type: String },
      gstNumber: { type: String },
      paymentTerms: { type: String },
    },
    status: { type: String, default: "Active" },
    clients: [{ type: Schema.Types.ObjectId, ref: 'Client' }],
  },
  { timestamps: true }
);

export default mongoose.model<ICompany>("Company", CompanySchema);
