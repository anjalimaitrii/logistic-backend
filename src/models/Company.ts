import mongoose, { Schema, Document } from "mongoose";

export interface ICompany extends Document {
  companyName: string;
  cinNumber?: string;
  address: {
    street: string;
    city: string;
    state: string;
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
    cinNumber: { type: String },
    address: {
      street: { type: String },
      city: { type: String },
      state: { type: String },
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
