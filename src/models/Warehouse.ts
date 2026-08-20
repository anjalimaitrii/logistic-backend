import mongoose, { Schema, Document } from "mongoose";

// The base yard every trip dispatches from and returns to. Singleton, like
// Mileage. Deliberately address-only: nothing in CR-VL-001 computes a distance
// or a geo-fence from coordinates — every kilometre is typed by the accountant.
export interface IWarehouse extends Document {
  street: string;
  city: string;
  province: string;
  country: string;
}

const WarehouseSchema = new Schema<IWarehouse>(
  {
    street:   { type: String, default: "", trim: true },
    city:     { type: String, default: "", trim: true },
    province: { type: String, default: "", trim: true },
    country:  { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

export default mongoose.model<IWarehouse>("Warehouse", WarehouseSchema);
