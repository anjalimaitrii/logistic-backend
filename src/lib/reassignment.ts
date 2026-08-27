import { driverStatusFor } from "./tripStatus.js";

/**
 * Changing the fleet unit on a job that is already assigned.
 *
 * Ops may swap the driver/truck freely right up until the accountant approves
 * the settlement; after that the unit is locked, because the approved figures
 * were costed against that truck.
 *
 * The swap itself is not a field edit — it is a handover. Everything the
 * original assignment did to the outgoing driver has to be undone and redone
 * for the incoming one, which is what the two services around this module do.
 * The decisions they need are here, where they can be tested without a database.
 */

/** An approved settlement locks the fleet unit in place. */
export function isAssignmentLocked(settlementStatus?: string): boolean {
  return (settlementStatus || "").trim().toLowerCase() === "approved";
}

/** ObjectId | string | populated document → a comparable id. */
export function idOf(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value._id) return String(value._id);
  return String(value);
}

export function sameDriver(a: any, b: any): boolean {
  const x = idOf(a);
  const y = idOf(b);
  return Boolean(x) && x === y;
}

/**
 * What the outgoing driver goes back to once the job is taken off them.
 *
 * Derived from what they are STILL holding, never from what they happened to be
 * set to — that field is exactly what drifts. A driver left with no active
 * assignment is free, whatever it used to say; a driver still running a trip
 * takes that trip's status back.
 */
export function statusAfterRelease(opts: {
  hasActiveAssignment: boolean;
  activeTripStatus?: string;
  pickupCount?: number;
  dropoffCount?: number;
}): string {
  if (!opts.hasActiveAssignment) return "available";
  return (
    driverStatusFor(opts.activeTripStatus, opts.pickupCount ?? 1, opts.dropoffCount ?? 1) ||
    "on_trip"
  );
}

/**
 * The trip status to restore when a retarget is undone, or null to leave it be.
 *
 * Only a cargo-done trip with ground still to cover was flipped to
 * "repositioning"; every other diverted trip kept its own status and must come
 * back untouched. `prevTripStatus` is stamped on lastPoint at retarget time —
 * records written before that field existed fall back to "returning", which is
 * where a cargo-done trip with no next job belongs anyway.
 */
export function restoredTripStatus(
  currentTripStatus?: string,
  prevTripStatus?: string
): string | null {
  if ((currentTripStatus || "").trim().toLowerCase() !== "repositioning") return null;
  return prevTripStatus || "returning";
}
