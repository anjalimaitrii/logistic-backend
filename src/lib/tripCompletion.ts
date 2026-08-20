// A trip is finished when its own status says so — never because a later job
// was queued behind it. Under CR-VL-001 a trip stays live while it drives the
// empty leg to its next pickup, so a queued successor proves nothing.
export function isTripCompleted(booking: { tripStatus?: string }): boolean {
  const ts = (booking.tripStatus || "").trim().toLowerCase();
  return ts === "completed" || ts === "delivered";
}
