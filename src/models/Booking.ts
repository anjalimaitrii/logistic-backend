import mongoose, { Schema, Document } from "mongoose";

export interface IBooking extends Document {
  clientId?: mongoose.Types.ObjectId;
  cargoDetails: {
    goodsType: string;
    weight: number;
    loadingDate: string;
  };
  pickup: {
    contactPerson: string;
    contactNumber: string;
    address: {
      plotNo: string;
      street: string;
      city: string;
      pincode: string;
    };
    gpsEnabled: boolean;
  };
  dropoff: {
    contactPerson: string;
    contactNumber: string;
    address: {
      plotNo: string;
      street: string;
      city: string;
      pincode: string;
    };
    gpsEnabled: boolean;
  };
  requirement: {
    bodyType: string;
  };
  finalAmount?: number;
  advancePaid?: number;
  specialRequest?: string;
  status: string;

  metadata: {
    source: string;
    createdAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const BookingSchema: Schema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: "Client" },
    cargoDetails: {
      goodsType: { type: String, required: true },
      weight: { type: Number },
      loadingDate: { type: String },
    },
    pickup: {
      contactPerson: { type: String },
      contactNumber: { type: String, required: true },
      address: {
        plotNo: { type: String },
        street: { type: String },
        city: { type: String },
        pincode: { type: String },
      },
      gpsEnabled: { type: Boolean, default: false },
    },
    dropoff: {
      contactPerson: { type: String },
      contactNumber: { type: String, required: true },
      address: {
        plotNo: { type: String },
        street: { type: String },
        city: { type: String },
        pincode: { type: String },
      },
      gpsEnabled: { type: Boolean, default: false },
    },
    requirement: {
      bodyType: { type: String },
    },
    finalAmount: { type: Number },
    advancePaid: { type: Number },
    specialRequest: { type: String },
    status: { type: String, default: "pending" },

    metadata: {
      source: { type: String, default: "webapp_client" },
      createdAt: { type: Date, default: Date.now },
    },
  },
  { timestamps: true }
);

export default mongoose.model<IBooking>("Booking", BookingSchema);
