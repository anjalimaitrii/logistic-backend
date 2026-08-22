import "../loadEnv.js";
import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import Assignment from "../models/Assignment.js";
import Driver from "../models/Driver.js";
import { driverStatusFor } from "../lib/tripStatus.js";

await mongoose.connect(process.env.MONGO_URL!, { serverSelectionTimeoutMS: 8000 });

const APPLY = process.argv.includes("--apply");
let n = 0;

for (const a of (await Assignment.find({ queueStatus: "active" }).lean()) as any[]) {
  const b: any = await Booking.findById(a.bookingId).select("tripId tripStatus pickupLocations dropoffLocations").lean();
  const d: any = await Driver.findById(a.driverId).select("name driverStatus").lean();
  if (!b || !d) continue;

  const should = driverStatusFor(
    b.tripStatus,
    (b.pickupLocations || []).length,
    (b.dropoffLocations || []).length
  );
  // null means "this status says nothing about the driver" — they are on the trip.
  const want = should || "on_trip";
  if (d.driverStatus === want) continue;

  console.log(`${b.tripId}  trip=${b.tripStatus}  drops=${(b.dropoffLocations||[]).length}  ${d.name}: ${d.driverStatus} -> ${want}`);
  if (APPLY) await Driver.findByIdAndUpdate(a.driverId, { driverStatus: want });
  n++;
}

console.log(n === 0 ? "\nevery driver is in step" : `\n${n} driver(s) ${APPLY ? "corrected" : "out of step (dry run — pass --apply to fix)"}`);
await mongoose.disconnect();
