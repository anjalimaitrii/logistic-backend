/**
 * cinNumber → tpinNumber on every company.
 *
 * The field always held a Zambian TPIN — the invoice printed it as one, under a
 * comment explaining that the TPIN lived in `cinNumber`. The name was left over
 * from an Indian CIN and made every reader check. Renaming the field is what
 * removes the need for that comment; this moves the data with it.
 *
 * Safe to run twice: $rename only touches documents that still have the old key.
 *
 *   node --import tsx src/scripts/renameCinToTpin.ts
 */
import mongoose from "mongoose";
import "../loadEnv.js";

async function run() {
  const url = process.env.MONGO_URL;
  if (!url) throw new Error("MONGO_URL is not set");

  await mongoose.connect(url);
  const companies = mongoose.connection.db!.collection("companies");

  const before = await companies.countDocuments({ cinNumber: { $exists: true } });
  const result = await companies.updateMany(
    { cinNumber: { $exists: true } },
    { $rename: { cinNumber: "tpinNumber" } }
  );
  const left = await companies.countDocuments({ cinNumber: { $exists: true } });

  console.log(`[rename] companies holding cinNumber: ${before}`);
  console.log(`[rename] renamed: ${result.modifiedCount}`);
  console.log(`[rename] still holding the old key: ${left}`);
  console.log(`[rename] now holding tpinNumber: ${await companies.countDocuments({ tpinNumber: { $exists: true } })}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("[rename] failed:", err);
  process.exit(1);
});
