/**
 * The trip lifecycle, in order:
 *
 *   started
 *   → arrived_1 → loading_1 → departed_1 → arrived_2 …   (one triple per pickup)
 *   → reached_1 → offloading_1 → reached_2 …             (one pair per dropoff)
 *   → returning | repositioning
 *   → completed
 *
 * `arrived_N` was added so a trip that begins at the warehouse shows the drive
 * out to the pickup as its own step instead of jumping straight from "started"
 * to "loading". Pickups now mirror dropoffs, which already had an arrival step
 * (`reached_N`) before their action step (`offloading_N`).
 *
 * `repositioning` replaces `returning` once a trip has been diverted to another
 * job's pickup — it is no longer heading for the yard, and calling it "returning"
 * told the driver the wrong destination.
 *
 * Single-pickup / single-dropoff trips drop the `_n` suffix, matching what the
 * web panel and the driver app both build.
 */

/** Statuses meaning "the truck is on its final unladen leg of this trip". */
export const FINAL_LEG_STATUSES = ["returning", "repositioning"] as const;

/** Statuses at which a driver may be handed a new job. */
export const ASSIGNABLE_STATUSES = ["offloading", ...FINAL_LEG_STATUSES] as const;

const norm = (s?: string) => (s || "").trim().toLowerCase();

export function isFinalLeg(tripStatus?: string): boolean {
  return (FINAL_LEG_STATUSES as readonly string[]).includes(norm(tripStatus));
}

/** True for `arrived`, `arrived_1`, `arrived_2`, … */
export function isArrivalAtPickup(tripStatus?: string): boolean {
  return /^arrived(_\d+)?$/.test(norm(tripStatus));
}

/**
 * True when the truck has finished its LAST drop — all cargo is off.
 *
 * The `_n` suffix only appears on trips with more than one pickup or more than
 * one dropoff; the web panel and the driver app both build ids that way, so this
 * has to mirror it.
 *
 * Matters because a trip may only be fast-forwarded past its cargo once every
 * drop is done. Doing it at `offloading_1` of three would silently skip two.
 */
export function isLastOffloading(
  tripStatus: string | undefined,
  pickupCount: number,
  dropoffCount: number
): boolean {
  const ts = norm(tripStatus);
  const multi = pickupCount > 1 || dropoffCount > 1;
  return ts === (multi ? `offloading_${dropoffCount}` : "offloading");
}

/** All cargo delivered: the last drop is done, or the truck is already unladen. */
export function isCargoDone(
  tripStatus: string | undefined,
  pickupCount: number,
  dropoffCount: number
): boolean {
  return isFinalLeg(tripStatus) || isLastOffloading(tripStatus, pickupCount, dropoffCount);
}

/** True for `offloading`, `offloading_1`, `offloading_2`, … */
export function isOffloading(tripStatus?: string): boolean {
  return /^offloading(_\d+)?$/.test(norm(tripStatus));
}

/**
 * The driver status that goes with a trip status, or null when the trip has not
 * reached a point that changes what the driver is doing.
 *
 * "offloading" means the driver is finishing up and can be handed another job.
 * That is only true at the LAST drop — a truck emptying the first of three still
 * has two loads aboard and cannot go anywhere else. Marking them free at every
 * drop offered a driver for reassignment mid-route.
 *
 * The `_n` suffix is dropped from what gets stored: a driver is offloading, not
 * "offloading_2". Which stop it is belongs to the trip, not to the person, and
 * the suffix leaking through made every screen comparing driverStatus with
 * "offloading" read a multi-stop driver as still mid-trip.
 */
export function driverStatusFor(
  tripStatus: string | undefined,
  pickupCount: number,
  dropoffCount: number
): string | null {
  if (isLastOffloading(tripStatus, pickupCount, dropoffCount)) return "offloading";
  if (isFinalLeg(tripStatus)) return norm(tripStatus);
  // Mid-route drops change nothing about the driver: they are still on the trip.
  return null;
}

/**
 * Matches any status a RUNNING trip can hold when a new job is assigned to its
 * driver, including the suffixed forms a multi-stop trip uses. Used to FIND the
 * running trip; whether it may be closed or retargeted is a separate question
 * that isCargoDone answers, and it is stricter — only the last drop counts.
 *
 * A plain `$in: ASSIGNABLE_STATUSES` query silently skipped every multi-stop trip.
 */
export const ASSIGNABLE_STATUS_REGEX = /^(offloading(_\d+)?|returning|repositioning)$/i;
