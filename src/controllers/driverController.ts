import { Request, Response, NextFunction } from "express";
import Driver from "../models/Driver.js";
import Assignment from "../models/Assignment.js";
import Booking from "../models/Booking.js";
import { isFinalLeg } from "../lib/tripStatus.js";

export const createDriver = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const driver = new Driver(req.body);
    await driver.save();
    res.status(201).json(driver);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Every driver logs in with this same fixed password; only email differs per driver.
// Override via DRIVER_DEFAULT_PASSWORD in .env if this needs to change.
const DEFAULT_DRIVER_PASSWORD = process.env.DRIVER_DEFAULT_PASSWORD || "Fleet@123";

export const registerDriverCredentials = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ message: "Email is required" });
      return;
    }
    if (!EMAIL_PATTERN.test(email)) {
      res.status(400).json({ message: "Invalid email format" });
      return;
    }

    const driver = await Driver.findById(id);
    if (!driver) {
      res.status(404).json({ message: "Driver not found" });
      return;
    }

    if (driver.email) {
      res.status(400).json({ message: "Driver already registered" });
      return;
    }

    const emailTaken = await Driver.findOne({ email, _id: { $ne: id } });
    if (emailTaken) {
      res.status(409).json({ message: "Email already in use" });
      return;
    }

    driver.email = email;
    driver.password = DEFAULT_DRIVER_PASSWORD;
    await driver.save();

    const driverResponse = driver.toObject();
    delete (driverResponse as any).password;

    res.status(200).json({ message: "Driver registered successfully", driver: driverResponse });
  } catch (error: any) {
    next(error);
  }
};

export const getDrivers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const drivers = await Driver.find().populate("assignedTruck");

    // Sync driverStatus for any "on_trip"/"offloading" driver whose active booking tripStatus has moved on
    const onTripIds = drivers
      .filter(d => d.driverStatus === "on_trip" || d.driverStatus === "offloading")
      .map(d => d._id);

    if (onTripIds.length > 0) {
      const activeAssignments = await Assignment.find({
        driverId: { $in: onTripIds },
        queueStatus: "active"
      }).populate("bookingId");

      for (const assignment of activeAssignments) {
        const booking = assignment.bookingId as any;
        const ts = booking?.tripStatus?.toLowerCase();
        const d = drivers.find(dr => dr._id.toString() === assignment.driverId?.toString());

        // A driver repositioning to the next job's pickup is mid-trip by design.
        // Re-deriving their status from tripStatus would stamp them back to
        // "returning" on every admin page load and make them assignable again.
        if (d?.driverStatus === "repositioning") continue;

        // A driver with a queued trip is not free. Freeing them here would leave
        // that queued assignment with nothing left to promote it — nothing polls
        // for queued assignments.
        const queuedCount = await Assignment.countDocuments({
          driverId: assignment.driverId,
          queueStatus: "queued",
        });

        if (ts === "offloading" && d?.driverStatus !== "offloading") {
          await Driver.updateOne({ _id: assignment.driverId }, { driverStatus: "offloading" });
          if (d) (d as any).driverStatus = "offloading";
        } else if (isFinalLeg(ts)) {
          await Driver.updateOne({ _id: assignment.driverId }, { driverStatus: ts });
          if (d) (d as any).driverStatus = ts;
        } else if ((ts === "completed" || ts === "delivered") && queuedCount === 0) {
          // Trip finished and nothing queued → driver is free.
          await Driver.updateOne({ _id: assignment.driverId },
            { driverStatus: "available", needsTruckInspection: false, tripQueue: [] });
          await Assignment.updateOne({ _id: assignment._id }, { queueStatus: "completed" });
          if (d) (d as any).driverStatus = "available";
        } else if ((ts === "completed" || ts === "delivered") && queuedCount > 0) {
          // Trip finished with a queued successor → hand off to the one helper
          // that knows whether the next trip may start yet.
          await Assignment.updateOne({ _id: assignment._id }, { queueStatus: "completed" });
          const { promoteNextForDriver } = await import("../services/tripContinuity.js");
          await promoteNextForDriver(String(assignment.driverId));
          const refreshed = await Driver.findById(assignment.driverId).select("driverStatus").lean();
          if (d && refreshed) (d as any).driverStatus = refreshed.driverStatus;
        }
      }
    }

    res.json(drivers);
  } catch (error: any) {
    next(error);
  }
};

export const getDriverById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const driver = await Driver.findById(req.params.id).populate("assignedTruck");
    if (!driver) {
      res.status(404).json({ message: "Driver not found" });
      return;
    }
    res.json(driver);
  } catch (error: any) {
    next(error);
  }
};

export const updateDriver = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { password, email, ...safeUpdates } = req.body;
    const driver = await Driver.findByIdAndUpdate(req.params.id, safeUpdates, { new: true });
    if (!driver) {
      res.status(404).json({ message: "Driver not found" });
      return;
    }
    res.json(driver);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteDriver = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const driver = await Driver.findByIdAndDelete(req.params.id);
    if (!driver) {
      res.status(404).json({ message: "Driver not found" });
      return;
    }
    res.json({ message: "Driver deleted successfully" });
  } catch (error: any) {
    next(error);
  }
};

// Bring the driver roster in line with what Trakzee reports, in ONE place.
//
// The browser used to do this and could only ever insert, so a truck whose driver
// changed kept both people. The decision lives in lib/driverReconcile (pure, and
// tested); this only applies it and reports what happened, so a failure shows up
// instead of vanishing into an unread Promise.allSettled the way the licenseNo
// rejections did for eleven days.
export const syncTrakzeeDrivers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const vehicles = Array.isArray(req.body?.vehicles) ? req.body.vehicles : null;
    if (!vehicles) { res.status(400).json({ message: "vehicles[] is required" }); return; }

    const { planDriverSync } = await import("../lib/driverReconcile.js");
    const Truck = (await import("../models/Truck.js")).default;

    const [trucks, drivers] = await Promise.all([
      Truck.find().select("truckId").lean(),
      Driver.find().select("name assignedTruck status").lean(),
    ]);

    const plan = planDriverSync(vehicles, trucks as any, drivers as any);
    const errors: string[] = [];

    // Sequential on purpose: the batch is a handful of rows, and one failure must
    // be attributable to the driver it belongs to rather than lost in a race.
    const created: string[] = [];
    for (const c of plan.create) {
      try {
        await new Driver({ name: c.name, phone: "--", experience: 0, status: "Active", assignedTruck: c.assignedTruck }).save();
        created.push(c.name);
      } catch (err: any) {
        errors.push(`create "${c.name}": ${err?.message || err}`);
      }
    }

    const retired: string[] = [];
    for (const r of plan.retire) {
      try {
        await Driver.findByIdAndUpdate(r._id, { status: "Inactive" });
        retired.push(`${r.name} (${r.plate})`);
      } catch (err: any) {
        errors.push(`retire "${r.name}": ${err?.message || err}`);
      }
    }

    const reactivated: string[] = [];
    for (const r of plan.reactivate) {
      try {
        await Driver.findByIdAndUpdate(r._id, { status: "Active" });
        reactivated.push(`${r.name} (${r.plate})`);
      } catch (err: any) {
        errors.push(`reactivate "${r.name}": ${err?.message || err}`);
      }
    }

    if (errors.length) console.error("[driver-sync] failures:", errors);
    if (created.length || retired.length || reactivated.length) {
      console.log(`[driver-sync] created=${created.length} retired=${retired.length} reactivated=${reactivated.length}`);
    }

    res.status(200).json({ created, retired, reactivated, errors });
  } catch (error: any) { next(error); }
};
