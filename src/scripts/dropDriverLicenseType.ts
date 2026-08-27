/**
 * Remove licenseType from every driver.
 *
 * It was the companion of licenseNo, which held a GPS tracker's IMEI rather than
 * a licence and has already been removed. Every driver carried "NA" in this
 * field — the Trakzee import has no licence data to give — so what remained was
 * a licence class with no licence behind it.
 *
 * No index on this one, so a plain $unset is enough. Safe to run twice.
 *
 *   node --import tsx src/scripts/dropDriverLicenseType.ts
 */
import mongoose from "mongoose";
import "../loadEnv.js";

async function run() {
  const url = process.env.MONGO_URL;
  if (!url) throw new Error("MONGO_URL is not set");

  await mongoose.connect(url);
  const drivers = mongoose.connection.db!.collection("drivers");

  const before = await drivers.countDocuments({ licenseType: { $exists: true } });
  const result = await drivers.updateMany(
    { licenseType: { $exists: true } },
    { $unset: { licenseType: "" } }
  );

  console.log(`[drop-licenseType] drivers holding the field: ${before}`);
  console.log(`[drop-licenseType] cleared: ${result.modifiedCount}`);
  console.log(`[drop-licenseType] still holding it: ${await drivers.countDocuments({ licenseType: { $exists: true } })}`);
  console.log(`[drop-licenseType] drivers intact: ${await drivers.countDocuments()}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("[drop-licenseType] failed:", err);
  process.exit(1);
});
