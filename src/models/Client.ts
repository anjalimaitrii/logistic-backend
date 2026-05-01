import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";

export interface IClient extends Document {
  name: string;
  email: string;
  contact: string;
  designation: string;
  password: string;
  status: string;
  mustChangePassword: boolean;
  company?: string; // Reference to Company ObjectId
  createdAt: Date;
  updatedAt: Date;
}

const ClientSchema: Schema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    contact: { type: String },
    designation: { type: String },
    password: { type: String, required: true },
    status: { type: String, default: "Active" },
    mustChangePassword: { type: Boolean, default: true },
    company: { type: Schema.Types.ObjectId, ref: 'Company' },
  },
  { timestamps: true }
);

// Hash password before saving
ClientSchema.pre<IClient>("save", async function () {
  if (!this.isModified("password")) {
    return;
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (error: any) {
    throw error;
  }
});

export default mongoose.model<IClient>("Client", ClientSchema);
