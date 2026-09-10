/**
 * Keeps the fleet in step with Trakzee, on a timer, without anyone opening a page.
 *
 * This used to run in the browser: it only fired when an admin happened to open
 * the drivers page, and it could only ever INSERT. So a rename in Trakzee became
 * a second truck, a driver change became a second driver, a driver removed there
 * stayed here forever — and none of it moved at all unless somebody was looking.
 *
 * What it mirrors, every run:
 *   trucks   — new ones created; a renamed one renamed (matched on IMEI, which
 *              does not change when the plate does); pre-IMEI trucks stamped with
 *              theirs the first time they are seen.
 *   drivers  — new ones created; a replaced one retired and the new one created;
 *              a truck Trakzee shows as driverless has its rows retired; a driver
 *              put back is reactivated rather than duplicated.
 *
 * Nothing is ever deleted. Trucks and drivers carry trips, settlements, mileage
 * and logins, and the feed drops vehicles in and out between calls — absence from
 * one response is not evidence anything is gone. Retiring is a status flip, so it
 * is reversible; the next run puts a returning driver back.
 *
 * Both decisions live in pure, tested modules (lib/truckReconcile, lib/driverReconcile).
 * This file only fetches, applies, and reports.
 */
import cron from "node-cron";
import Truck from "../models/Truck.js";
import Driver from "../models/Driver.js";
import { planTruckSync, type FeedTruck } from "../lib/truckReconcile.js";
import { planDriverSync } from "../lib/driverReconcile.js";
import { fetchLiveFleet } from "../controllers/liveTrackingController.js";

/** Trakzee's placeholders mean "nobody", not a person called "--". */
const driverNameOf = (v: any): string => {
  const parts = [v?.Driver_First_Name, v?.Driver_Middle_Name, v?.Driver_Last_Name].filter(
    (s: any) => s && s !== "--" && String(s).trim().toLowerCase() !== "null"
  );
  return parts.length ? String(parts.join(" ")).trim().replace(/\s+/g, " ") : "No Driver";
};

export interface SyncReport {
  vehicles: number;
  trucksCreated: string[];
  trucksRenamed: string[];
  trucksLinked: number;
  driversCreated: string[];
  driversRetired: string[];
  driversReactivated: string[];
  errors: string[];
}

export async function runTrakzeeSync(): Promise<SyncReport> {
  const report: SyncReport = {
    vehicles: 0,
    trucksCreated: [],
    trucksRenamed: [],
    trucksLinked: 0,
    driversCreated: [],
    driversRetired: [],
    driversReactivated: [],
    errors: [],
  };

  const { vehicles } = await fetchLiveFleet();
  report.vehicles = vehicles.length;
  // An empty response is a Trakzee hiccup, not an empty fleet. Acting on it would
  // read every truck as "gone" and every driver as "no longer on a truck".
  if (!vehicles.length) {
    report.errors.push("Trakzee returned no vehicles — skipped this run");
    return report;
  }

  // ── Trucks first: a driver can only be filed against a truck that exists ──
  const feedTrucks: FeedTruck[] = vehicles.map((v: any) => ({
    plate: String(v?.Vehicle_No || v?.Vehicle_Name || ""),
    imei: String(v?.Imeino || ""),
    vehicleModel: v?.Vehicletype || v?.DeviceModel,
    truckType: v?.Vehicletype,
    status: v?.Status,
    odometer: v?.Odometer,
  }));

  const truckPlan = planTruckSync(feedTrucks, await Truck.find().select("truckId imei").lean() as any);
  report.errors.push(...truckPlan.conflicts);

  for (const t of truckPlan.create) {
    try {
      await Truck.create({ ...t, imei: t.imei || undefined });
      report.trucksCreated.push(t.truckId);
    } catch (err: any) {
      report.errors.push(`create truck ${t.truckId}: ${err?.message || err}`);
    }
  }
  for (const r of truckPlan.rename) {
    try {
      await Truck.findByIdAndUpdate(r._id, {
        truckId: r.to,
        $push: { activityLog: { title: "Renamed in Trakzee", description: `${r.from} → ${r.to}`, time: new Date() } },
      });
      report.trucksRenamed.push(`${r.from} → ${r.to}`);
    } catch (err: any) {
      report.errors.push(`rename truck ${r.from}: ${err?.message || err}`);
    }
  }
  for (const l of truckPlan.linkImei) {
    try {
      await Truck.findByIdAndUpdate(l._id, { imei: l.imei });
      report.trucksLinked++;
    } catch (err: any) {
      report.errors.push(`link imei ${l.truckId}: ${err?.message || err}`);
    }
  }

  // ── Drivers, against the truck list as it now stands ──
  const [trucks, drivers] = await Promise.all([
    Truck.find().select("truckId").lean(),
    Driver.find().select("name assignedTruck status").lean(),
  ]);

  const driverPlan = planDriverSync(
    vehicles.map((v: any) => ({
      plate: String(v?.Vehicle_No || v?.Vehicle_Name || ""),
      driverName: driverNameOf(v),
    })),
    trucks as any,
    drivers as any
  );

  // Sequential on purpose: a handful of rows, and one failure must be
  // attributable to the driver it belongs to rather than lost in a race.
  for (const c of driverPlan.create) {
    try {
      await new Driver({ name: c.name, phone: "--", experience: 0, status: "Active", assignedTruck: c.assignedTruck }).save();
      report.driversCreated.push(c.name);
    } catch (err: any) {
      report.errors.push(`create driver "${c.name}": ${err?.message || err}`);
    }
  }
  for (const r of driverPlan.retire) {
    try {
      await Driver.findByIdAndUpdate(r._id, { status: "Inactive" });
      report.driversRetired.push(`${r.name.trim()} (${r.plate})`);
    } catch (err: any) {
      report.errors.push(`retire driver "${r.name}": ${err?.message || err}`);
    }
  }
  for (const r of driverPlan.reactivate) {
    try {
      await Driver.findByIdAndUpdate(r._id, { status: "Active" });
      report.driversReactivated.push(`${r.name.trim()} (${r.plate})`);
    } catch (err: any) {
      report.errors.push(`reactivate driver "${r.name}": ${err?.message || err}`);
    }
  }

  return report;
}

/** True when a run actually changed something worth a log line. */
function changed(r: SyncReport): boolean {
  return Boolean(
    r.trucksCreated.length || r.trucksRenamed.length || r.trucksLinked ||
    r.driversCreated.length || r.driversRetired.length || r.driversReactivated.length
  );
}

export function describeSync(r: SyncReport): string {
  const parts: string[] = [];
  if (r.trucksCreated.length) parts.push(`trucks +${r.trucksCreated.length} (${r.trucksCreated.join(", ")})`);
  if (r.trucksRenamed.length) parts.push(`renamed ${r.trucksRenamed.join(", ")}`);
  if (r.trucksLinked) parts.push(`imei linked ${r.trucksLinked}`);
  if (r.driversCreated.length) parts.push(`drivers +${r.driversCreated.length} (${r.driversCreated.join(", ")})`);
  if (r.driversRetired.length) parts.push(`retired ${r.driversRetired.join(", ")}`);
  if (r.driversReactivated.length) parts.push(`reactivated ${r.driversReactivated.join(", ")}`);
  return parts.join(" · ") || "no changes";
}

let running = false;

/**
 * Every five minutes. A run overlapping the previous one is skipped rather than
 * queued: the work is idempotent, so the next tick picks up whatever was missed,
 * and two concurrent runs would race each other creating the same rows.
 */
export function startTrakzeeSyncCron(): void {
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const report = await runTrakzeeSync();
      if (changed(report)) console.log(`[TrakzeeSync] ${describeSync(report)}`);
      if (report.errors.length) console.error("[TrakzeeSync] failures:", report.errors);
    } catch (err: any) {
      console.error("[TrakzeeSync] run failed:", err?.message || err);
    } finally {
      running = false;
    }
  };

  cron.schedule("*/5 * * * *", tick);
  // One run at boot, after a short delay so the first request does not race the
  // database connection settling.
  setTimeout(tick, 20_000);
  console.log("[TrakzeeSync] scheduled — every 5 min");
}
