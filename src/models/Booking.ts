import mongoose, { Schema, Document } from "mongoose";

export interface LocationStop {
  sequence: number;
  contactPerson: string;
  contactNumber: string;
  contactPerson2?: string;
  contactNumber2?: string;
  clientName?: string;
  address: {
    plotNo?: string;
    street?: string;
    city: string;
    state?: string;
    country?: string;
  };
  gpsEnabled: boolean;
}

export interface IBooking extends Document {
  tripId: string;
  clientId?: mongoose.Types.ObjectId;
  cargoDetails: {
    goodsType: string[];
    weight: number;
    loadingDate: string;
  };
  pickupLocations: LocationStop[];
  dropoffLocations: LocationStop[];
  requirement: {
    bodyType: string;
  };
  finalAmount?: number;
  advancePaid?: number;
  specialRequest?: string;
  status: string;
  tripStatus?: string;
  timeline: Array<{
    title: string;
    description: string;
    time: Date;
    status: string;
  }>;

  tripStartCoords?: { lat: number; lng: number; location?: string };
  tripStartedAt?: Date;
  tripEndedAt?: Date;
  isSecret?: boolean;
  withTax?: boolean;
  metadata: {
    source: string;
    createdAt: Date;
    isSecret?: boolean;
    client?: string;
    referenceId?: string;
    advancePaid?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const LocationStopSchema = new Schema({
  sequence: { type: Number, required: true },
  contactPerson: { type: String },
  contactNumber: { type: String },
  contactPerson2: { type: String },
  contactNumber2: { type: String },
  clientName: { type: String },
  address: {
    plotNo: { type: String },
    street: { type: String },
    city: { type: String },
    state: { type: String },
    country: { type: String },
  },
  gpsEnabled: { type: Boolean, default: false },
}, { _id: false });

const BookingSchema: Schema = new Schema(
  {
    tripId: { type: String, unique: true, sparse: true },
    clientId: { type: Schema.Types.ObjectId, ref: "Client" },
    cargoDetails: {
      goodsType: { type: [String], required: true },
      weight: { type: Number },
      loadingDate: { type: String },
    },
    pickupLocations: [LocationStopSchema],
    dropoffLocations: [LocationStopSchema],
    requirement: {
      bodyType: { type: String },
    },
    finalAmount: { type: Number },
    advancePaid: { type: Number },
    specialRequest: { type: String },
    status: { type: String, default: "pending" },
    tripStatus: { type: String },
    timeline: [
      {
        title: { type: String },
        description: { type: String },
        time: { type: Date, default: Date.now },
        status: { type: String, default: "completed" }
      }
    ],

    tripStartCoords: {
      lat:      { type: Number },
      lng:      { type: Number },
      location: { type: String },
    },
    tripStartedAt: { type: Date },
    tripEndedAt:   { type: Date },
    isSecret: { type: Boolean, default: false },
    withTax:  { type: Boolean, default: true },
    metadata: {
      source:      { type: String, default: "webapp_client" },
      createdAt:   { type: Date, default: Date.now },
      isSecret:    { type: Boolean },
      client:      { type: String },
      referenceId: { type: String },
      advancePaid: { type: String },
    },
  },
  { timestamps: true }
);

export default mongoose.model<IBooking>("Booking", BookingSchema);
