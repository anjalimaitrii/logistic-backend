/**
 * Remove licenseNo from every driver, and drop its unique index.
 *
 * The field never held a licence. The Trakzee import wrote the GPS tracker's
 * IMEI into it — a number belonging to the truck's tracking box, not to the
 * person — and the drivers table then showed the first seven digits of it under
 * the heading "License ID". Those seven digits are the device model, identical
 * across every tracker of the same make, so 25 drivers rendered as 9 distinct
 * ids, five of them sharing one.
 *
 * Nothing depended on it: the import de-duplicates on name, not on this field.
 *
 * Safe to run twice — $unset skips documents that no longer have the key, and
 * the index drop is tolerated when it is already gone.
 *
 *   node --import tsx src/scripts/dropDriverLicenseNo.ts
 */
import mongoose from "mongoose";
import "../loadEnv.js";

async function run() {
  const url = process.env.MONGO_URL;
  if (!url) throw new Error("MONGO_URL is not set");

  await mongoose.connect(url);
  const drivers = mongoose.connection.db!.collection("drivers");

  const before = await drivers.countDocuments({ licenseNo: { $exists: true } });

  // Index first, field second. The other way round fails on the second document:
  // unsetting the field leaves both holding null, and a unique index counts a
  // second missing value as a duplicate of the first.
  let indexNote = "no licenseNo index found";
  try {
    const names = (await drivers.indexes()).map((i: any) => i.name);
    const target = names.find((n: string) => n.startsWith("licenseNo"));
    if (target) { await drivers.dropIndex(target); indexNote = `dropped index ${target}`; }
  } catch (err: any) {
    indexNote = `index drop skipped: ${err?.message || err}`;
  }

  const result = await drivers.updateMany({ licenseNo: { $exists: true } }, { $unset: { licenseNo: "" } });

  console.log(`[drop-licenseNo] ${indexNote}`);
  console.log(`[drop-licenseNo] drivers holding the field: ${before}`);
  console.log(`[drop-licenseNo] cleared: ${result.modifiedCount}`);
  console.log(`[drop-licenseNo] still holding it: ${await drivers.countDocuments({ licenseNo: { $exists: true } })}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("[drop-licenseNo] failed:", err);
  process.exit(1);
});
