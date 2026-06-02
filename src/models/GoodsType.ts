import mongoose, { Schema, Document } from "mongoose";

export interface IGoodsType extends Document {
  name: string;
}

const GoodsTypeSchema: Schema = new Schema(
  { name: { type: String, required: true, unique: true, trim: true } },
  { timestamps: true }
);

export default mongoose.model<IGoodsType>("GoodsType", GoodsTypeSchema);
