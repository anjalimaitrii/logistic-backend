/**
 * What makes one driver record distinct from another.
 *
 * A person driving two trucks is two records on purpose — either vehicle may
 * turn up for a job, and the assignment screen picks the fleet unit, not the
 * human. What must never exist twice is the same person on the same truck.
 *
 * The Trakzee import used to decide that on the raw name, and Trakzee is not
 * consistent about spacing: "Kennedy  Nyimba " and "Kennedy Nyimba" arrived on
 * different runs and were filed as two people. Comparing on this key instead —
 * and putting a unique index on it — makes the duplicate impossible rather than
 * merely unlikely, which matters because the import runs on every page load and
 * two tabs can race each other.
 */
export function driverDedupeKey(name: unknown, assignedTruck?: unknown): string {
  const person = String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
  // Accepts an ObjectId, a populated document or a plain string.
  const truck = assignedTruck
    ? String((assignedTruck as any)?._id ?? assignedTruck)
    : "";
  return `${person}|${truck}`;
}
