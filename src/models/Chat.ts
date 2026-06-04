import mongoose, { Schema, Document } from "mongoose";

export interface IChat extends Document {
  roomId: string;
  sender: "admin" | "client";
  senderName: string;
  message: string;
  timestamp: Date;
}

const ChatSchema: Schema = new Schema({
  roomId: { type: String, required: true, index: true },
  sender: { type: String, enum: ["admin", "client"], required: true },
  senderName: { type: String, required: true },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

export default mongoose.model<IChat>("Chat", ChatSchema);
