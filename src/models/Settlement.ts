import mongoose, { Schema, Document } from "mongoose";

export interface ISettlement extends Document {
  bookingId: mongoose.Types.ObjectId;
  fuelDetails: {
    legs: Array<{
      from: string;
      to: string;
      km: number;
      mileage: number;
      loadType: "loaded" | "unloaded";
      liters: number;
      amount: number;
    }>;
    fuelRate: number;
    totalDistance: number;
    totalLiters: number;
  };
  // Every EMPTY leg of the journey: the dispatch run out of the yard, the return
  // run back to it, and any empty transit claimed from a TripGap. Kept out of
  // fuelDetails.legs so the cargo route stays untouched (CR-VL-001 §3.2) — and
  // top-level, because settlementController replaces fuelDetails wholesale on
  // every approve, which would silently delete anything nested inside it.
  extraLegs: Array<{
    kind: "dispatch" | "return" | "trimmedReturn" | "transit";
    position: "prepend" | "append";
    from: string;
    to: string;
    km: number;
    mileage: number;
    liters: number;
    amount: number;
    gapId?: mongoose.Types.ObjectId;
    addedBy: string;
    addedAt: Date;
  }>;
  // The accountant struck the return leg off. A trip marked "returning" offers
  // one ready-made, and without a record of the dismissal it would come straight
  // back on the next load — reading as a delete button that does not work.
  // Not every returning truck drives a leg worth billing.
  returnLegDismissed: boolean;
  amendments: Array<{
    reason: string;
    field: string;
    before: any;
    after: any;
    triggeredAt: Date;
    approvedBy?: string;
    approvedAt?: Date;
  }>;
  expenses: Array<{
    description: string;
    amount: number;
    category: string;
    date: string;
  }>;
  financials: {
    // Actual values entered/approved by the accountant
    cashAllocation: number;
    fuelTotal: number;
    councilLevy: number;
    tollAmount: number; // NOT part of driver's allocation
    // Route Master values at approval time — kept alongside actuals for comparison
    assumeCashAllocation: number;
    assumeCouncilLevy: number;
    assumeTollAmount: number;
  };
  tollAmount?: number;
  status: string;
}

const SettlementSchema: Schema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true, unique: true },
    fuelDetails: {
      legs: [
        {
          from: { type: String, default: "" },
          to: { type: String, default: "" },
          km: { type: Number, default: 0 },
          mileage: { type: Number, default: 4 },
          // Stored, not re-derived from array position. Once the return leg moves
          // to extraLegs, "the last leg is the unloaded one" stops being true.
          loadType: { type: String, enum: ["loaded", "unloaded"], default: "loaded" },
          liters: { type: Number, default: 0 },
          amount: { type: Number, default: 0 }
        }
      ],
      fuelRate: { type: Number, default: 0 },
      totalDistance: { type: Number, default: 0 },
      totalLiters: { type: Number, default: 0 }
    },
    extraLegs: {
      type: [{
        kind:     { type: String, enum: ["dispatch", "return", "trimmedReturn", "transit"], required: true },
        position: { type: String, enum: ["prepend", "append"], required: true },
        from:     { type: String, default: "" },
        to:       { type: String, default: "" },
        km:       { type: Number, default: 0 },
        mileage:  { type: Number, default: 0 },
        liters:   { type: Number, default: 0 },
        amount:   { type: Number, default: 0 },
        gapId:    { type: Schema.Types.ObjectId, ref: "TripGap" },
        addedBy:  { type: String, default: "" },
        addedAt:  { type: Date, default: Date.now },
        _id: false,
      }],
      default: [],
    },
    returnLegDismissed: { type: Boolean, default: false },
    amendments: {
      type: [{
        reason:      { type: String, default: "" },
        field:       { type: String, default: "" },
        before:      { type: Schema.Types.Mixed },
        after:       { type: Schema.Types.Mixed },
        triggeredAt: { type: Date, default: Date.now },
        approvedBy:  { type: String },
        approvedAt:  { type: Date },
        _id: false,
      }],
      default: [],
    },
    expenses: [
      {
        description: { type: String },
        amount: { type: Number },
        category: { type: String },
        date: { type: String }
      }
    ],
    financials: {
      // actual values entered at approval
      cashAllocation: { type: Number, default: 0 },
      fuelTotal: { type: Number, default: 0 },
      councilLevy: { type: Number, default: 0 },
      tollAmount: { type: Number, default: 0 }, // not part of driver's allocation
      // Route Master values at approval time (for actual-vs-assumed comparison)
      assumeCashAllocation: { type: Number, default: 0 },
      assumeCouncilLevy: { type: Number, default: 0 },
      assumeTollAmount: { type: Number, default: 0 }
    },
    tollAmount: { type: Number, default: 0 },
    status: { type: String, default: "Approved" }
  },
  { timestamps: true }
);

export default mongoose.model<ISettlement>("Settlement", SettlementSchema);
