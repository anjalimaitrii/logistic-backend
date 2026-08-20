import type { LocationStop } from "../models/Booking.js";

// Bookings carry addresses, not coordinates, so a stop's identity is its city.
export function locationLabel(stop?: LocationStop): string {
  return (stop?.address?.city || "").trim();
}

// An empty interval exists when the next trip starts somewhere other than where
// the previous one ended. A blank endpoint proves nothing either way — flagging
// it would raise a settlement blocker with no place for the accountant to name.
export function hasEmptyInterval(prevDropLabel: string, nextPickupLabel: string): boolean {
  const a = (prevDropLabel || "").trim().toLowerCase();
  const b = (nextPickupLabel || "").trim().toLowerCase();
  if (!a || !b) return false;
  return a !== b;
}
