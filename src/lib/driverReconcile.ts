/**
 * Works out what the driver roster should become, given what Trakzee reports.
 *
 * Trakzee is the authority on who is behind the wheel of a truck right now. Until
 * this existed the import only ever INSERTED: a truck whose driver changed ended
 * up carrying both people, both selectable, both counted, forever.
 *
 * The replaced driver is RETIRED (status "Inactive"), never renamed and never
 * deleted:
 *   - Renaming would rewrite history. The driver profile lists trips by driver id,
 *     so the new person would inherit the previous one's trips, and their login.
 *   - Deleting loses what the client can see. A trip's driver phone and NRC are
 *     read through driverId at display time, so the row has to survive the person
 *     leaving the truck.
 * Inactive is already wired end to end: the assignment drawer only offers Active
 * drivers, so a retired one drops out of the dropdown immediately, and nothing
 * else in the backend reads the field. It is also reversible, which deletion is not.
 *
 * Retiring the driver of a RUNNING trip is deliberate and safe: the assignment
 * carries its own copy of the name, so the trip keeps reading correctly — the row
 * only stops being offered for new work, which is exactly right for someone who is
 * no longer on that truck.
 *
 * A truck Trakzee reports with NO driver retires whoever we still show on it. The
 * roster mirrors Trakzee, and clearing a driver there is a deliberate act — leaving
 * the old name behind makes the roster claim someone is on a truck they left. What
 * this must never do is read a truck's ABSENCE from a response as "no driver": the
 * feed drops vehicles in and out between calls, so only trucks it actually mentions
 * are decided.
 *
 * Pure on purpose: no database, no network, so the decision can be tested.
 */

/** Trakzee's placeholders for an unmanned vehicle. None of these is a person. */
const NOT_A_DRIVER = new Set(["", "no driver", "driver not defined", "--", "null"]);

const normName = (v: unknown): string =>
  String(v ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** Plates arrive with stray spacing and inconsistent case on both sides. */
const normPlate = (v: unknown): string =>
  String(v ?? "").trim().replace(/\s+/g, " ").toUpperCase();

/** Accepts an id, a populated document or a plain string. */
const truckIdOf = (assignedTruck: unknown): string =>
  assignedTruck ? String((assignedTruck as any)?._id ?? assignedTruck) : "";

export interface FeedVehicle {
  plate: string;
  driverName: string;
}

export interface TruckRow {
  _id: unknown;
  truckId: string;
}

export interface DriverRow {
  _id: unknown;
  name: string;
  assignedTruck: unknown;
  status?: string;
}

export interface SyncPlan {
  /** Drivers Trakzee reports that we have no row for on that truck. */
  create: { name: string; assignedTruck: string }[];
  /** Rows on a truck whose driver Trakzee has since changed. */
  retire: { _id: string; name: string; plate: string }[];
  /** Rows retired earlier that Trakzee has put back on the truck. */
  reactivate: { _id: string; name: string; plate: string }[];
}

export function planDriverSync(
  feed: FeedVehicle[],
  trucks: TruckRow[],
  drivers: DriverRow[]
): SyncPlan {
  const plan: SyncPlan = { create: [], retire: [], reactivate: [] };

  const truckIdByPlate = new Map<string, string>();
  for (const t of trucks) truckIdByPlate.set(normPlate(t.truckId), String(t._id));

  const rowsByTruck = new Map<string, DriverRow[]>();
  for (const d of drivers) {
    const tid = truckIdOf(d.assignedTruck);
    if (!tid) continue; // a driver with no truck is not this sync's business
    if (!rowsByTruck.has(tid)) rowsByTruck.set(tid, []);
    rowsByTruck.get(tid)!.push(d);
  }

  // One truck may appear twice in a single feed; decide it once.
  const handled = new Set<string>();

  for (const v of feed) {
    const truckId = truckIdByPlate.get(normPlate(v.plate));
    // A plate we have no truck for: the truck pass creates it, and the next run
    // picks the driver up. Guessing here would file the driver against nothing.
    if (!truckId || handled.has(truckId)) continue;
    handled.add(truckId);

    const plate = normPlate(v.plate);
    const rows = rowsByTruck.get(truckId) ?? [];
    const wanted = normName(v.driverName);
    // Nobody on this truck: no row to match and none to create, so every row we
    // still show on it falls through to the retire loop.
    const manned = !NOT_A_DRIVER.has(wanted);
    const match = manned ? rows.find((d) => normName(d.name) === wanted) : undefined;

    if (manned && !match) {
      plan.create.push({ name: String(v.driverName).trim().replace(/\s+/g, " "), assignedTruck: truckId });
    } else if (match?.status === "Inactive") {
      plan.reactivate.push({ _id: String(match._id), name: match.name, plate });
    }

    for (const d of rows) {
      if (d === match) continue;
      if (d.status === "Inactive") continue; // already retired on an earlier run
      plan.retire.push({ _id: String(d._id), name: d.name, plate });
    }
  }

  return plan;
}
