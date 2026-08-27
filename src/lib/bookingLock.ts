/**
 * A booking is locked once a fleet unit is committed to it.
 *
 * Until a driver is assigned, ops may change anything — the job is just a
 * request. The moment a truck is on it, the route and the load are what that
 * truck was chosen and costed for, so they stop being editable.
 *
 * The lock is on the FIELDS, not on the endpoint: the same PATCH also carries
 * the agreed price, the advance and the ZRA invoice number, and those are
 * entered precisely while a trip is running. Locking the whole endpoint would
 * take the jobs-page money drawer and the invoice drawer down with it.
 */

/** What the booking form writes — where the truck goes and what it carries. */
export const BOOKING_DETAIL_FIELDS = [
  "clientId",
  "cargoDetails",
  "pickupLocations",
  "dropoffLocations",
  "requirement",
] as const;

/**
 * True when an update would change the job itself rather than its paperwork.
 *
 * Presence of the key decides it, not its value: `$set` with undefined blanks
 * the field, so a key that is there at all is a write.
 */
export function editsBookingDetails(body?: Record<string, unknown> | null): boolean {
  if (!body || typeof body !== "object") return false;
  return BOOKING_DETAIL_FIELDS.some((field) => field in body);
}
