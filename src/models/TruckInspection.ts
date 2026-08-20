import mongoose, { Schema, Document } from "mongoose";

export interface ITruckInspection extends Document {
  driverId: mongoose.Types.ObjectId;
  truckId: mongoose.Types.ObjectId;
  bookingId?: mongoose.Types.ObjectId;
  vehicleCondition: string;
  // Every tyre inspected, each with its own condition. A truck's tyres do not
  // wear evenly, and the pair below cannot hold that.
  tyres: Array<{ position: string; number: string; condition: string }>;
  // Derived from `tyres` for readers written before it existed: the worst
  // condition on the truck, and every number joined.
  tyreCondition: string;
  tyreNumber?: string;
  challans?: string;
  notes: string;
  inspectedAt: Date;
}

const TruckInspectionSchema: Schema = new Schema(
  {
    driverId:       { type: Schema.Types.ObjectId, ref: "Driver", required: true },
    truckId:        { type: Schema.Types.ObjectId, ref: "Truck" },
    // The specific trip this inspection belongs to. Lets us tell which completed
    // trips still have no damages/DO recorded (e.g. trips auto-closed while returning).
    bookingId:      { type: Schema.Types.ObjectId, ref: "Booking" },
    vehicleCondition: { type: String, required: true },
    tyres: {
      type: [{
        position:  { type: String, default: "" },
        number:    { type: String, default: "" },
        condition: { type: String, default: "Good" },
        _id: false,
      }],
      default: [],
    },
    tyreCondition:  { type: String, required: true },
    tyreNumber:     { type: String, default: "" },
    challans:       { type: String, default: "" },
    notes:        { type: String, default: "" },
    inspectedAt:  { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model<ITruckInspection>("TruckInspection", TruckInspectionSchema);
