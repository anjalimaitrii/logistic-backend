/**
 * Backfill dedupeKey on every driver, then put the unique index on it.
 *
 * Order matters: the index cannot be created while two documents would already
 * violate it, and it cannot be created before the field exists at all — every
 * record would hold null and the second one would be rejected as a duplicate of
 * the first.
 *
 * Refuses to create the index if real duplicates are still present, and names
 * them, rather than failing with a key error that says nothing useful.
 *
 *   node --import tsx src/scripts/addDriverDedupeIndex.ts
 */
import mongoose from "mongoose";
import "../loadEnv.js";
import { driverDedupeKey } from "../lib/driverKey.js";

async function run() {
  const url = process.env.MONGO_URL;
  if (!url) throw new Error("MONGO_URL is not set");

  await mongoose.connect(url);
  const drivers = mongoose.connection.db!.collection("drivers");

  const all = await drivers.find({}).sort({ createdAt: 1 }).toArray();
  console.log(`[dedupe-index] drivers: ${all.length}`);

  // 1. Backfill.
  let written = 0;
  const seen = new Map<string, any>();
  const clashes: string[] = [];
  for (const d of all) {
    const key = driverDedupeKey(d.name, d.assignedTruck);
    if (seen.has(key)) {
      clashes.push(`${d.name} (${String(d._id)}) duplicates ${String(seen.get(key)._id)}`);
      continue;
    }
    seen.set(key, d);
    if (d.dedupeKey !== key) {
      await drivers.updateOne({ _id: d._id }, { $set: { dedupeKey: key } });
      written++;
    }
  }
  console.log(`[dedupe-index] keys written: ${written}`);

  // 2. Refuse rather than fail obscurely.
  if (clashes.length) {
    console.error(`\n[dedupe-index] ${clashes.length} duplicate(s) must be removed before the index can go on:`);
    for (const c of clashes) console.error(`  - ${c}`);
    console.error("\nRun: node --import tsx src/scripts/dedupeDrivers.ts --apply");
    await mongoose.disconnect();
    process.exit(1);
  }

  // 3. Index.
  const existing = (await drivers.indexes()).map((i: any) => i.name);
  if (existing.includes("dedupeKey_1")) {
    console.log("[dedupe-index] index already present");
  } else {
    await drivers.createIndex({ dedupeKey: 1 }, { unique: true, name: "dedupeKey_1" });
    console.log("[dedupe-index] created unique index dedupeKey_1");
  }

  console.log(`[dedupe-index] indexes now: ${(await drivers.indexes()).map((i: any) => i.name).join(", ")}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("[dedupe-index] failed:", err);
  process.exit(1);
});
