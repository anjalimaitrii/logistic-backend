/**
 * One-off repair for trips stranded before `onTripStarted` existed.
 *
 * Symptom: trip 1 was retargeted to end at trip 2's pickup, trip 2 then ran its
 * whole lifecycle from the ops panel (which never checked queueStatus), and
 * nothing ever closed trip 1. Result: trip 1 sits at "returning" with an active
 * assignment forever, and trip 2 runs with a "queued" assignment.
 *
 * This closes trip 1 at the moment trip 2 actually started, and promotes trip 2.
 * Idempotent: skips any pair that is already consistent.
 *
 * Run: node --import tsx src/scripts/repairStrandedTrip.ts
 */
import "../loadEnv.js";
import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import Assignment from "../models/Assignment.js";
import Driver from "../models/Driver.js";
import { fileCompletedBooking } from "../services/completionRecords.js";
import { isCargoDone } from "../lib/tripStatus.js";

const DONE = ["completed", "delivered"];

async function main() {
  const uri = process.env.MONGO_URL;
  if (!uri) throw new Error("MONGO_URL is not set");
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  console.log("[repair] connected to", mongoose.connection.name, "\n");

  // Every trip that was retargeted onto a successor and never closed.
  const stranded = await Booking.find({
    "lastPoint.source": "reassignment",
    tripStatus: { $nin: DONE },
  });

  if (stranded.length === 0) {
    console.log("[repair] nothing stranded — no changes made.");
    await mongoose.disconnect();
    return;
  }

  for (const prev of stranded) {
    const successorId = prev.lastPoint?.fromBookingId;
    const next = successorId ? await Booking.findById(successorId) : null;

    if (!next) {
      console.log(`[skip] ${prev.tripId}: successor not found — leaving alone`);
      continue;
    }
    if (!next.tripStartedAt) {
      console.log(`[skip] ${prev.tripId}: ${next.tripId} has not started yet — the normal flow will close this`);
      continue;
    }

    // The truck reached this point when the successor started there.
    const endedAt = next.tripStartedAt;

    console.log(`[fix ] ${prev.tripId}  returning -> completed  (ended ${endedAt.toISOString()}, because ${next.tripId} started there)`);

    const closed = await Booking.findByIdAndUpdate(
      prev._id,
      {
        $set: { tripStatus: "completed", tripEndedAt: endedAt },
        $push: {
          timeline: {
            title: "Completed",
            description: `${next.tripId} started at ${prev.lastPoint?.label || "its pickup"} — this trip ended there`,
            time: endedAt,
            status: "completed",
          },
        },
      },
      { new: true }
    );

    const prevAsg = await Assignment.findOneAndUpdate(
      { bookingId: prev._id },
      { queueStatus: "completed" },
      { new: true }
    );
    console.log(`       ${prev.tripId} assignment -> ${prevAsg?.queueStatus}`);

    const nextAsg = await Assignment.findOne({ bookingId: next._id });
    if (nextAsg && nextAsg.queueStatus === "queued") {
      await Assignment.findByIdAndUpdate(nextAsg._id, { queueStatus: "active" });
      console.log(`       ${next.tripId} assignment -> active`);
      if (nextAsg.driverId) {
        await Driver.findByIdAndUpdate(nextAsg.driverId, {
          $pull: { tripQueue: next._id },
        });
        console.log(`       driver tripQueue: pulled ${next.tripId}`);
      }
    }

    try {
      await fileCompletedBooking(closed);
      console.log(`       ${prev.tripId} filed to invoice/cash`);
    } catch (err: any) {
      console.error(`       ${prev.tripId} filing FAILED (non-fatal):`, err?.message || err);
    }
  }

  await repairDivertedStatuses();

  console.log("\n[repair] done.");
  await mongoose.disconnect();
}


/**
 * Second pass: trips diverted onto another job's pickup and left describing
 * themselves wrongly — sitting at "offloading" as though still standing at the
 * drop, or force-completed at the moment of assignment while the truck was still
 * far short of the point the same record claimed it ended at.
 *
 * Both become "repositioning": cargo off, still driving, aimed at another job's
 * pickup rather than the yard. They complete when the successor starts, which is
 * the only proof the truck actually arrived.
 *
 * Trips already completed are left alone — they may be filed to invoices, and
 * reopening them here would be a bigger lie than the one being fixed.
 */
async function repairDivertedStatuses() {
  const diverted = await Booking.find({
    "lastPoint.source": "reassignment",
    tripStatus: { $nin: [...DONE, "repositioning"] },
  });

  let fixed = 0;
  for (const b of diverted) {
    const pickups = (b.pickupLocations || []).length;
    const drops = (b.dropoffLocations || []).length;
    if (!isCargoDone(b.tripStatus, pickups, drops)) {
      console.log(`[skip ] ${b.tripId}: at ${b.tripStatus} with drops still outstanding`);
      continue;
    }

    await Booking.findByIdAndUpdate(b._id, {
      $set: { tripStatus: "repositioning" },
      $push: {
        timeline: {
          title: "Repositioning",
          description: `Running empty to ${b.lastPoint?.label || "the next job's pickup"} — this trip completes on arrival`,
          time: new Date(),
          status: "completed",
        },
      },
    });
    console.log(`[fix  ] ${b.tripId}  ${b.tripStatus} -> repositioning  (ends at ${b.lastPoint?.label})`);
    fixed++;
  }

  if (fixed === 0) console.log("[repair] no diverted statuses needed fixing.");
}

main().catch(async (e) => {
  console.error("[repair] failed:", e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
