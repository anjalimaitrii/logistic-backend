import Assignment from "../models/Assignment.js";
import Booking from "../models/Booking.js";
import Driver from "../models/Driver.js";
import { retargetRunningTrip, undoRetarget } from "./tripContinuity.js";
import { ASSIGNABLE_STATUS_REGEX } from "../lib/tripStatus.js";
import { statusAfterRelease } from "../lib/reassignment.js";

/**
 * The driver-side half of an assignment, in one place.
 *
 * Creating an assignment used to do all of this inline while changing one only
 * wrote the Assignment document — so a driver swap left the outgoing driver
 * marked on_trip with no job (they never came back to available, because the
 * getDrivers sync only looks at drivers that still hold an active assignment)
 * and the incoming driver marked available while holding one. Both showed as
 * ON TRIP for the same trip, from two different sources.
 *
 * Handing a job over is release-then-acquire. Both halves live here so the
 * create and update paths cannot drift apart again.
 */

export type AcquireResult =
  | { ok: true; queueStatus: string; sequence: number; closedOnAssign: boolean }
  | { ok: false; message: string };

/**
 * Put a job onto a driver: decide whether it starts now or queues behind what
 * they are already running, and move the driver's own state to match.
 *
 * `excludeBookingId` keeps this job out of its own counts, so a job being moved
 * between drivers is not mistaken for a second one stacked on the target.
 */
export async function acquireBookingForDriver(opts: {
  driverId: string;
  bookingId: string;
  truckNumber: string;
  truckId?: string;
  excludeBookingId?: string;
}): Promise<AcquireResult> {
  const { driverId, bookingId, truckNumber, truckId, excludeBookingId } = opts;

  const driver = await Driver.findById(driverId);
  if (!driver) return { ok: false, message: "Driver not found" };

  const notThisJob = excludeBookingId ? { bookingId: { $ne: excludeBookingId } } : {};

  const busy =
    driver.driverStatus === "on_trip" ||
    driver.driverStatus === "offloading" ||
    driver.driverStatus === "returning" ||
    driver.driverStatus === "repositioning";

  if (!busy) {
    // available (or a legacy driver with no driverStatus) — start immediately
    await Driver.findByIdAndUpdate(driverId, { driverStatus: "on_trip" });
    return { ok: true, queueStatus: "active", sequence: 1, closedOnAssign: false };
  }

  let closedOnAssign = false;

  if (driver.driverStatus === "returning" || driver.driverStatus === "offloading") {
    // CR-VL-001 §3: do NOT complete the running trip. Retarget it to end at this
    // new job's pickup, and queue the new job behind it. The empty distance in
    // between is what the accountant then bills.

    // A driver may hold at most one queued trip. Without this, a third job would
    // retarget the running trip again and orphan the first gap.
    const alreadyQueued = await Assignment.countDocuments({
      driverId,
      queueStatus: "queued",
      ...notThisJob,
    });
    if (alreadyQueued > 0) {
      return {
        ok: false,
        message: "This driver already has a queued trip. Complete it before assigning another.",
      };
    }

    const driverAssignments = await Assignment.find({ driverId, ...notThisJob })
      .select("bookingId")
      .lean();
    const allBookingIds = driverAssignments.map((a: any) => a.bookingId);

    const runningBooking = await Booking.findOne({
      _id: { $in: allBookingIds },
      // repositioning included so a trip already diverted once is still found
      // (the single-queued-trip guard above is what stops a second diversion).
      // Regex, not $in: a multi-stop trip sits at "offloading_2", which no list
      // of plain statuses matches.
      tripStatus: { $regex: ASSIGNABLE_STATUS_REGEX },
    });

    const nextBooking = await Booking.findById(bookingId);

    if (runningBooking && nextBooking) {
      const { closedImmediately } = await retargetRunningTrip({
        runningBooking, nextBooking, truckNumber, truckId,
      });
      // Only mark the driver as repositioning when there is ground to cover. If
      // the next job starts where the truck already stands, that trip is already
      // closed and the driver is simply between jobs.
      if (!closedImmediately) {
        await Driver.findByIdAndUpdate(driverId, { driverStatus: "repositioning" });
      }
      closedOnAssign = closedImmediately;
    }
  }

  // Queue either way — including the fallback where no running trip was found,
  // which previously activated the new job immediately instead.
  const existingCount = await Assignment.countDocuments({
    driverId,
    queueStatus: { $in: ["active", "queued"] },
    ...notThisJob,
  });
  await Driver.findByIdAndUpdate(driverId, { $push: { tripQueue: bookingId } });

  return { ok: true, queueStatus: "queued", sequence: existingCount + 1, closedOnAssign };
}

/**
 * Take a job off a driver and leave them in the state their REMAINING work puts
 * them in — never in whatever the field happened to say.
 *
 * Also undoes the diversion this job caused, if it caused one: a trip retargeted
 * to end at this job's pickup has no reason to go there once another unit has
 * the job.
 */
export async function releaseBookingFromDriver(
  driverId: string,
  bookingId: string
): Promise<void> {
  if (!driverId) return;

  await undoRetarget(bookingId);

  await Driver.findByIdAndUpdate(driverId, { $pull: { tripQueue: bookingId } });

  const active = await Assignment.findOne({
    driverId,
    queueStatus: "active",
    bookingId: { $ne: bookingId },
  })
    .select("bookingId")
    .lean();

  const booking = active
    ? await Booking.findById((active as any).bookingId)
        .select("tripStatus pickupLocations dropoffLocations")
        .lean()
    : null;

  await Driver.findByIdAndUpdate(driverId, {
    driverStatus: statusAfterRelease({
      hasActiveAssignment: Boolean(active),
      activeTripStatus: (booking as any)?.tripStatus,
      pickupCount: ((booking as any)?.pickupLocations || []).length || 1,
      dropoffCount: ((booking as any)?.dropoffLocations || []).length || 1,
    }),
  });
}
