import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import Assignment from "../models/Assignment.js";
import Driver from "../models/Driver.js";
import Settlement from "../models/Settlement.js";
import TripGap from "../models/TripGap.js";
import { locationLabel, hasEmptyInterval } from "../lib/gapDetection.js";
import { isCargoDone } from "../lib/tripStatus.js";
import { closesOnAssign } from "../lib/assignmentClose.js";
import { restoredTripStatus } from "../lib/reassignment.js";
import { getFreshVehiclePosition } from "../controllers/liveTrackingController.js";
import { fileCompletedBooking } from "./completionRecords.js";

// CR-VL-001 §3: assigning a new job to an offloading/returning driver does NOT
// end the running trip. It changes WHERE that trip ends — to the new job's
// pickup — so the empty distance in between belongs to a trip and can be costed.
export async function retargetRunningTrip(opts: {
  runningBooking: any;
  nextBooking: any;
  truckNumber: string;
  truckId?: mongoose.Types.ObjectId | string;
}): Promise<{ closedImmediately: boolean }> {
  const { runningBooking, nextBooking, truckNumber, truckId } = opts;

  const drops = runningBooking.dropoffLocations || [];
  const prevDrop = locationLabel(drops[drops.length - 1]);
  const nextPickup = locationLabel((nextBooking.pickupLocations || [])[0]);

  const previousLabel = runningBooking.lastPoint?.label || "Warehouse";
  const nextTripLabel = nextBooking.tripId || `#${String(nextBooking._id).slice(-6).toUpperCase()}`;
  const newLabel = nextPickup
    ? `${nextPickup} (${nextTripLabel} pickup)`
    : `${nextTripLabel} pickup`;

  const wasReturning = String(runningBooking.tripStatus).toLowerCase() === "returning";

  // All cargo delivered? Only then may the trip be moved past its drops — a trip
  // sitting at offloading_1 of three still owes two.
  const cargoDone = isCargoDone(
    runningBooking.tripStatus,
    (runningBooking.pickupLocations || []).length,
    drops.length
  );
  const emptyInterval = hasEmptyInterval(prevDrop, nextPickup);

  // Ends here and now, or ends when the truck gets to the new pickup.
  const closeNow = closesOnAssign({
    tripStatus: runningBooking.tripStatus,
    pickupCount: (runningBooking.pickupLocations || []).length,
    dropoffCount: drops.length,
    prevDropLabel: prevDrop,
    nextPickupLabel: nextPickup,
  });

  await Booking.findByIdAndUpdate(runningBooking._id, {
    $set: {
      lastPoint: {
        label: newLabel,
        source: "reassignment",
        fromBookingId: nextBooking._id,
        setAt: new Date(),
        // Stamped so undoRetarget can put the trip back where it was if ops
        // swaps the fleet unit on the job that caused this diversion.
        prevTripStatus: runningBooking.tripStatus,
      },
      // Cargo is off but the truck still has ground to cover, and it is not
      // heading for the yard — it is running empty to another job's pickup.
      // "returning" would name the wrong destination, and leaving it at
      // "offloading" would claim it is still standing at the drop.
      ...(cargoDone && !closeNow ? { tripStatus: "repositioning" } : {}),
    },
    $push: {
      timeline: {
        title: "Next Job Queued",
        description: cargoDone && !emptyInterval
          ? `${nextTripLabel} queued — this trip now ends at ${newLabel}`
          : `${nextTripLabel} queued — this trip now ends at ${newLabel}, and completes when the truck gets there`,
        time: new Date(),
        status: "completed",
      },
    },
  });

  // Audit trail on the running trip's settlement. A trip is approved before it
  // starts, so in practice one exists; if not, this is a harmless no-op.
  await Settlement.updateOne(
    { bookingId: runningBooking._id },
    {
      $push: {
        amendments: {
          reason: `Mid-return reassignment — ${nextTripLabel} assigned`,
          field: "lastPoint",
          before: previousLabel,
          after: newLabel,
          triggeredAt: new Date(),
        },
      },
    }
  );

  // Closes on the spot ONLY when the new job starts where this trip already
  // stands. With ground still to cover, that drive is this trip's last leg and
  // the trip ends when the truck arrives — which onTripStarted detects, because
  // trip 2 can only start at trip 2's pickup.
  if (closeNow) {
    // Every other completion path stamps where the truck finished; this one
    // closed a trip without it, leaving the jobs screen reading "GPS unavailable
    // at end". No distance is derived from this — it is the end-point marker.
    const endCoords = await getFreshVehiclePosition(truckNumber);
    const closed = await Booking.findByIdAndUpdate(
      runningBooking._id,
      {
        $set: {
          tripStatus: "completed",
          tripEndedAt: new Date(),
          ...(endCoords ? { tripEndCoords: endCoords } : {}),
        },
        $push: {
          timeline: {
            title: "Completed",
            description: `${nextTripLabel} starts at this same point (${prevDrop || "the drop"}) — nothing left to drive`,
            time: new Date(),
            status: "completed",
          },
        },
      },
      { new: true }
    );
    await Assignment.updateOne({ bookingId: runningBooking._id }, { queueStatus: "completed" });
    try {
      await fileCompletedBooking(closed);
    } catch (err) {
      console.error("[TripContinuity] Invoice/Cash filing failed on assignment close:", err);
    }
  }

  if (emptyInterval) {
    // upsert, not create: the unique index turns a repeat detection into a no-op
    // rather than a duplicate-key crash.
    await TripGap.findOneAndUpdate(
      { prevBookingId: runningBooking._id, nextBookingId: nextBooking._id },
      {
        $setOnInsert: {
          truckId: truckId || undefined,
          truckNumber,
          // Where the empty run began. Trustworthy only when the truck was still
          // standing at the drop; once it is returning it has already moved on,
          // and only the accountant knows where it actually is.
          fromLabel: prevDrop,
          toLabel: nextPickup,
          detectedAt: new Date(),
          detectedDuring: wasReturning ? "returning" : "offloading",
          status: "unattributed",
        },
      },
      { upsert: true }
    );
  }

  return { closedImmediately: closeNow };
}

/**
 * Reverse of retargetRunningTrip, for when the job that caused the diversion
 * stops being this driver's next job — handed to another fleet unit, or
 * cancelled outright.
 *
 * The predecessor was made to end at this job's pickup — a place its truck now
 * has no reason to go. Left in place it would sit at "repositioning" forever,
 * ending at a point nothing will ever reach, and the empty leg between them
 * would still be on the accountant's desk.
 *
 * A gap the accountant has already claimed is NOT deleted: a settlement's
 * extraLegs point at that row by id, and stranding an entered figure is worse
 * than leaving one stale row. It is logged for a human instead.
 *
 * Returns the restored predecessor so the caller can derive the driver's status
 * from it, or null when this job never displaced anything.
 */
export async function undoRetarget(nextBookingId: string): Promise<any | null> {
  const predecessor = await Booking.findOne({
    "lastPoint.fromBookingId": nextBookingId,
    "lastPoint.source": "reassignment",
    tripStatus: { $nin: ["completed", "delivered"] },
  });
  if (!predecessor) return null;

  const restore = restoredTripStatus(
    predecessor.tripStatus,
    (predecessor.lastPoint as any)?.prevTripStatus
  );
  const divertedTo = predecessor.lastPoint?.label || "the next job's pickup";

  const updated = await Booking.findByIdAndUpdate(
    predecessor._id,
    {
      $unset: { lastPoint: "" },
      ...(restore ? { $set: { tripStatus: restore } } : {}),
      $push: {
        timeline: {
          title: "Diversion Cancelled",
          description: `The job queued behind this trip is no longer running behind it — this trip no longer ends at ${divertedTo}`,
          time: new Date(),
          status: "completed",
        },
      },
    },
    { new: true }
  );

  // The empty leg no longer exists: there is no next job for this truck to run
  // to. Drop it only while it is still untouched.
  const gap = await TripGap.findOne({
    prevBookingId: predecessor._id,
    nextBookingId,
  }).select("status").lean();
  if (gap) {
    if (String(gap.status) === "unattributed") {
      await TripGap.deleteOne({ _id: (gap as any)._id });
    } else {
      // Already claimed onto a settlement, whose extraLegs point at this row by
      // id. Deleting it would strand that leg, so it stays and is logged for a
      // human to unpick.
      console.warn(
        `[TripContinuity] Gap ${String((gap as any)._id)} was already claimed; reassignment left it in place.`
      );
    }
  }

  // The original diversion wrote an amendment; the reversal gets its own line
  // rather than erasing it.
  await Settlement.updateOne(
    { bookingId: predecessor._id },
    {
      $push: {
        amendments: {
          reason: "Diversion reversed — the job queued behind this trip is no longer running behind it",
          field: "lastPoint",
          before: divertedTo,
          after: "restored",
          triggeredAt: new Date(),
        },
      },
    }
  );

  return updated;
}

/**
 * A trip starting is proof that the truck reached that trip's pickup — which is
 * exactly where its predecessor was retargeted to end. So starting trip 2 IS the
 * event that closes trip 1; asking an operator to also remember to tap
 * "Completed" on trip 1 left it hanging at "returning" indefinitely while trip 2
 * ran its whole course.
 *
 * Called on every transition into "started", from both the ops panel and the
 * driver app. Safe to call when there is no predecessor and when the trip was
 * never queued — it simply does nothing.
 */
export async function onTripStarted(bookingId: string): Promise<void> {
  // 1. Close whichever trip was retargeted to end at this trip's pickup.
  const predecessor = await Booking.findOne({
    "lastPoint.fromBookingId": bookingId,
    tripStatus: { $nin: ["completed", "delivered"] },
  });

  if (predecessor) {
    const prevAssignment = await Assignment.findOne({ bookingId: predecessor._id }).select("truckNumber").lean();
    const endCoords = prevAssignment?.truckNumber
      ? await getFreshVehiclePosition(prevAssignment.truckNumber)
      : null;
    const closed = await Booking.findByIdAndUpdate(
      predecessor._id,
      {
        $set: {
          tripStatus: "completed",
          tripEndedAt: new Date(),
          ...(endCoords ? { tripEndCoords: endCoords } : {}),
        },
        $push: {
          timeline: {
            title: "Completed",
            description: `Next trip started at ${predecessor.lastPoint?.label || "its pickup"} — this trip ended there`,
            time: new Date(),
            status: "completed",
          },
        },
      },
      { new: true }
    );

    await Assignment.updateOne({ bookingId: predecessor._id }, { queueStatus: "completed" });

    // Filing is not critical to the state machine; a failure here must not stop
    // the successor from starting.
    try {
      await fileCompletedBooking(closed);
    } catch (err) {
      console.error("[TripContinuity] Invoice/Cash filing failed for predecessor:", err);
    }
  }

  // 2. Starting a queued trip promotes it. The ops status stepper does not check
  //    queueStatus, so without this a trip could run its entire lifecycle while
  //    its assignment sat in the queue — which is how trip 1 above got stranded.
  const assignment = await Assignment.findOne({ bookingId });
  if (assignment && assignment.queueStatus === "queued") {
    await Assignment.findByIdAndUpdate(assignment._id, { queueStatus: "active" });
    if (assignment.driverId) {
      await Driver.findByIdAndUpdate(assignment.driverId, {
        $set: { driverStatus: "on_trip" },
        $pull: { tripQueue: assignment.bookingId },
      });
    }
  }
}

// The ONLY path by which a queued trip ever starts. It refuses to activate a
// trip the accountant has not approved — otherwise the driver would hold an
// active assignment while their app showed an empty list, because getDriverTrips
// filters on an approved settlement.
export async function promoteNextForDriver(
  driverId: string
): Promise<{ promoted: boolean; reason?: string }> {
  // createdAt is the tie-break: `sequence` counts active+queued assignments, so
  // it resets across completion boundaries and two queued trips can share a
  // number. Creation order never collides.
  const next = await Assignment.findOne({ driverId, queueStatus: "queued" })
    .sort({ sequence: 1, createdAt: 1 });

  if (!next) {
    // Nothing queued: the driver heads back to the yard and owes an inspection.
    //
    // Unless they have already been inspected — the ops completion modal can
    // call markTruckInspected around this, and blindly re-flagging would undo a
    // finished inspection and leave a free driver showing as RETURNING.
    const driver = await Driver.findById(driverId).select("driverStatus").lean();
    if (driver?.driverStatus === "available") {
      return { promoted: false, reason: "no queued trip — driver already free" };
    }
    await Driver.findByIdAndUpdate(driverId, {
      driverStatus: "returning",
      needsTruckInspection: true,
    });
    return { promoted: false, reason: "no queued trip" };
  }

  const settlement = await Settlement.findOne({ bookingId: next.bookingId })
    .select("status")
    .lean();

  if (settlement?.status !== "Approved") {
    // Leave it queued. The driver is free; the accountant still has to attribute
    // the empty leg and approve. Nobody is stranded on an empty trip list.
    await Driver.findByIdAndUpdate(driverId, {
      driverStatus: "available",
      needsTruckInspection: true,
    });
    return { promoted: false, reason: "next trip is not approved yet" };
  }

  await Assignment.findByIdAndUpdate(next._id, { queueStatus: "active" });
  await Driver.findByIdAndUpdate(driverId, {
    $set: { driverStatus: "on_trip" },
    $pull: { tripQueue: next.bookingId },
  });
  await Booking.findByIdAndUpdate(next.bookingId, {
    $push: {
      timeline: {
        title: "Trip Activated",
        description: "Previous trip completed — this trip is now active",
        time: new Date(),
        status: "completed",
      },
    },
  });

  return { promoted: true };
}
