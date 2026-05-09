import mongoose, { Schema, Document } from "mongoose";

export interface ICollection extends Document {
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

const CollectionSchema: Schema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model<ICollection>("Collection", CollectionSchema);
