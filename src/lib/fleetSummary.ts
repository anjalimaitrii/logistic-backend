/**
 * The fleet details a client is allowed to see for their own trip.
 *
 * Who is carrying their goods, on which truck, and who to ring — that is what a
 * customer asks for, and until now none of it reached them: /api/assignments is
 * admin-only, so the client app had no way to get it at all.
 *
 * Deliberately a whitelist, not a filter. The assignment also carries truck
 * health, queue position, collection area and the driver's licence — a client
 * has no business with any of it, and building the object field by field means a
 * new column on either record cannot leak by default.
 */

/** Us. Shown as the carrier on the client's trip view. */
export const TRANSPORTER_NAME = "Speedogistics Trucking Ltd";

export interface FleetSummary {
  transporter: string;
  truckNumber: string;
  trailerNumber: string;
  driverName: string;
  driverPhone: string;
  driverNrc: string;
}

/**
 * A phone with no digits in it is not a phone. Every driver imported from
 * Trakzee carries "--" in that field, and showing a customer "--" as the number
 * to ring is worse than showing nothing.
 */
const callable = (raw?: string): string => {
  const v = (raw || "").trim();
  return /\d/.test(v) ? v : "";
};

export function fleetSummaryFor(assignment: any): FleetSummary | null {
  if (!assignment) return null;
  const driver = assignment.driverId && typeof assignment.driverId === "object"
    ? assignment.driverId
    : null;
  const truck = assignment.truckId && typeof assignment.truckId === "object"
    ? assignment.truckId
    : null;
  return {
    transporter: TRANSPORTER_NAME,
    // The horse. Its number is snapshotted onto the assignment, so it survives
    // the truck record changing hands.
    truckNumber: assignment.truckNumber || truck?.truckId || "",
    // The trailer lives on the truck record and is not snapshotted — a rig can
    // swap trailers, and what matters is the one on it now. Blank for a rigid.
    trailerNumber: (truck?.trailerNumber || "").trim(),
    // The driver record first — the assignment's copy is a snapshot taken when
    // the job was handed over, so a corrected spelling lives on the driver.
    // The snapshot is the fallback, which is what keeps the name after the
    // driver record is gone.
    driverName: driver?.name || assignment.driverName || "",
    driverPhone: callable(driver?.phone),
    // Shown at the client's request: the gate and the weighbridge ask for it,
    // so the consignee needs it before the truck arrives. Only ever the current
    // driver's, and only on that client's own trip.
    driverNrc: (driver?.nrc || "").trim(),
  };
}
