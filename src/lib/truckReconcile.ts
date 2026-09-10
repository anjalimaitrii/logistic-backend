/**
 * Works out what the truck list should become, given what Trakzee reports.
 *
 * A truck is identified by its device IMEI, not by its plate. Trakzee renamed
 * CAN 6858 ZM to IT 3287 and, because the import matched on the plate string, the
 * rename read as a brand-new vehicle: both rows now exist for one physical truck,
 * each with its own driver row hanging off it. The IMEI does not change when the
 * plate does, so it is the only thing here that can tell a rename from an arrival.
 *
 * Trucks stored before the IMEI field existed have none. Those are matched on the
 * plate ONCE and the IMEI written to them — after which they are rename-proof.
 *
 * Nothing is ever deleted. A truck carries assignments, settlements and mileage,
 * and the feed drops vehicles in and out between calls, so absence from one
 * response is not evidence a truck is gone.
 *
 * Pure on purpose: no database, no network, so the decision can be tested.
 */

/** Plates arrive with stray spacing, mixed case, and the odd non-breaking space. */
const normPlate = (v: unknown): string =>
  String(v ?? "").trim().replace(/\s+/g, " ").toUpperCase();

const str = (v: unknown): string => String(v ?? "").trim();

export interface FeedTruck {
  plate: string;
  imei: string;
  vehicleModel?: string;
  truckType?: string;
  status?: string;
  odometer?: string;
}

export interface TruckRow {
  _id: unknown;
  truckId: string;
  imei?: string;
}

export interface TruckSyncPlan {
  create: { truckId: string; imei: string; vehicleModel: string; truckType: string; status: string; odometer: string }[];
  /** Same vehicle, new plate. */
  rename: { _id: string; from: string; to: string }[];
  /** A pre-IMEI truck matched on its plate: stamp the IMEI so it never duplicates. */
  linkImei: { _id: string; imei: string; truckId: string }[];
  /** Renames refused because the target plate is already taken by another truck. */
  conflicts: string[];
}

/** Trakzee's status words mapped onto ours. */
function truckStatus(feedStatus: unknown): string {
  const s = String(feedStatus ?? "").toUpperCase();
  if (s === "RUNNING") return "Active";
  if (s === "IDLE") return "Idle";
  return "Maint.";
}

export function planTruckSync(feed: FeedTruck[], trucks: TruckRow[]): TruckSyncPlan {
  const plan: TruckSyncPlan = { create: [], rename: [], linkImei: [], conflicts: [] };

  const byImei = new Map<string, TruckRow>();
  const byPlate = new Map<string, TruckRow>();
  for (const t of trucks) {
    const imei = str(t.imei);
    if (imei) byImei.set(imei, t);
    byPlate.set(normPlate(t.truckId), t);
  }

  // Plates spoken for, so a rename cannot be planned onto one already in use —
  // truckId is uniquely indexed and the write would simply fail.
  const takenPlates = new Set(trucks.map((t) => normPlate(t.truckId)));
  const handled = new Set<string>();

  for (const v of feed) {
    const plate = normPlate(v.plate);
    if (!plate) continue; // a nameless truck helps nobody
    const imei = str(v.imei);

    const key = imei || `plate:${plate}`;
    if (handled.has(key)) continue; // the same vehicle twice in one response
    handled.add(key);

    const existing = (imei && byImei.get(imei)) || byPlate.get(plate);

    if (!existing) {
      plan.create.push({
        truckId: plate,
        imei,
        vehicleModel: str(v.vehicleModel) || "--",
        truckType: str(v.truckType) || "--",
        status: truckStatus(v.status),
        odometer: str(v.odometer) || "0",
      });
      takenPlates.add(plate);
      continue;
    }

    const stored = normPlate(existing.truckId);
    if (stored !== plate) {
      if (takenPlates.has(plate)) {
        plan.conflicts.push(
          `${existing.truckId} was renamed to ${plate} in Trakzee, but another truck already uses that plate — merge them by hand.`
        );
      } else {
        plan.rename.push({ _id: String(existing._id), from: existing.truckId, to: plate });
        takenPlates.delete(stored);
        takenPlates.add(plate);
      }
    }

    if (imei && !str(existing.imei)) {
      plan.linkImei.push({ _id: String(existing._id), imei, truckId: existing.truckId });
    }
  }

  return plan;
}
