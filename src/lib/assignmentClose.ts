import { isCargoDone } from "./tripStatus.js";
import { hasEmptyInterval } from "./gapDetection.js";

/**
 * Does handing this driver a new job end their running trip on the spot?
 *
 * Only when there is nothing left to drive. Two conditions, both required:
 *
 *  1. the cargo is off — a trip at offloading_1 of three still owes two drops;
 *  2. the new job starts where this trip already ends — no empty interval.
 *
 * When there IS an interval, that drive belongs to this trip: a truck at Alwar
 * handed a job out of Mumbai still has Alwar → Mumbai in front of it, and the
 * trip is not finished until it gets there. Closing it at the moment of
 * assignment stamped an end time while the truck was still hundreds of km short
 * of the point the same record claimed it ended at.
 *
 * What closes it instead is the successor starting — see onTripStarted. A trip
 * cannot start anywhere but its own pickup, so trip 2 starting IS proof the truck
 * arrived where trip 1 was retargeted to end.
 */
export function closesOnAssign(opts: {
  tripStatus?: string;
  pickupCount: number;
  dropoffCount: number;
  prevDropLabel: string;
  nextPickupLabel: string;
}): boolean {
  const { tripStatus, pickupCount, dropoffCount, prevDropLabel, nextPickupLabel } = opts;
  if (!isCargoDone(tripStatus, pickupCount, dropoffCount)) return false;
  return !hasEmptyInterval(prevDropLabel, nextPickupLabel);
}
