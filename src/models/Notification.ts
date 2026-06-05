import mongoose, { Schema, Document } from "mongoose";

export interface INotification extends Document {
  icon: string;
  title: string;
  body: string;
  unread: boolean;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    icon:   { type: String, default: "🔔" },
    title:  { type: String, required: true },
    body:   { type: String, required: true },
    unread: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.model<INotification>("Notification", NotificationSchema);
