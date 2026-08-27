/**
 * Remove driver records that duplicate an existing person on the SAME truck.
 *
 * A driver who appears on two vehicles is two records by design — either truck
 * may turn up for a job. What is not by design is the same person on the same
 * truck twice, which the Trakzee import produced because it de-duplicated on the
 * tracker's IMEI (different per vehicle) and on the raw name (Trakzee sends
 * "Kennedy  Nyimba " one run and "Kennedy Nyimba" the next).
 *
 * Keeps the OLDEST of each set: it is the one anything else may already point at.
 * Refuses to delete a record that is referenced anywhere, so a duplicate that has
 * since been given a trip is reported rather than removed.
 *
 *   node --import tsx src/scripts/dedupeDrivers.ts          # report only
 *   node --import tsx src/scripts/dedupeDrivers.ts --apply  # actually delete
 */
import mongoose from "mongoose";
import "../loadEnv.js";

const norm = (v: unknown) => String(v || "").trim().replace(/\s+/g, " ").toLowerCase();

async function run() {
  const apply = process.argv.includes("--apply");
  const url = process.env.MONGO_URL;
  if (!url) throw new Error("MONGO_URL is not set");

  await mongoose.connect(url);
  const db = mongoose.connection.db!;
  const drivers = db.collection("drivers");

  const all = await drivers.find({}).sort({ createdAt: 1 }).toArray();
  const groups = new Map<string, any[]>();
  for (const d of all) {
    const key = `${norm(d.name)}|${d.assignedTruck ? String(d.assignedTruck) : ""}`;
    groups.set(key, [...(groups.get(key) || []), d]);
  }

  let removed = 0;
  let kept = 0;
  let blocked = 0;

  for (const [, set] of groups) {
    if (set.length < 2) continue;
    const [keep, ...extras] = set;
    console.log(`\n${keep.name} — ${set.length} records`);
    console.log(`  keep   ${String(keep._id)}  (oldest)`);

    for (const extra of extras) {
      // Anything pointing at this record makes it not a spare copy.
      const [assignments, inspections] = await Promise.all([
        db.collection("assignments").countDocuments({ driverId: extra._id }),
        db.collection("truckinspections").countDocuments({ driverId: extra._id }).catch(() => 0),
      ]);
      const inUse = assignments > 0 || inspections > 0 || Boolean(extra.email);

      if (inUse) {
        blocked++;
        console.log(`  KEEP   ${String(extra._id)}  — in use (assignments ${assignments}, inspections ${inspections}, login ${extra.email ? "yes" : "no"})`);
        continue;
      }
      if (apply) await drivers.deleteOne({ _id: extra._id });
      removed++;
      console.log(`  ${apply ? "delete" : "would delete"} ${String(extra._id)}`);
    }
    kept++;
  }

  console.log(`\n${apply ? "removed" : "would remove"}: ${removed}`);
  console.log(`groups touched: ${kept}`);
  if (blocked) console.log(`left alone because something references them: ${blocked}`);
  console.log(`drivers now: ${await drivers.countDocuments()}`);
  if (!apply) console.log("\n(dry run — re-run with --apply to delete)");

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("[dedupe-drivers] failed:", err);
  process.exit(1);
});
