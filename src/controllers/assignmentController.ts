import { Request, Response, NextFunction } from "express";
import Assignment from "../models/Assignment.js";
import Booking from "../models/Booking.js";
import Driver from "../models/Driver.js";
import TruckInspection from "../models/TruckInspection.js";
import { retargetRunningTrip, promoteNextForDriver } from "../services/tripContinuity.js";
import { ASSIGNABLE_STATUSES } from "../lib/tripStatus.js";
import { normalizeTyres, worstTyreCondition, joinTyreNumbers } from "../lib/tyreInspection.js";
import { mergeFittedTyres, fittedTyresChanged } from "../lib/fittedTyres.js";
import Truck from "../models/Truck.js";

export const createAssignment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // No returningEndCoords: this flow no longer freezes a GPS end point, because
    // it no longer ends the running trip (CR-VL-001 §3, and no GPS is used at all).
    const { bookingId, truckId, driverId, driverName, truckNumber, truckHealth, collectionArea } = req.body;

    const existing = await Assignment.findOne({ bookingId });
    if (existing) {
      res.status(400).json({ message: "Job already assigned" });
      return;
    }

    const driver = await Driver.findById(driverId);
    if (!driver) {
      res.status(404).json({ message: "Driver not found" });
      return;
    }

    let queueStatus = "active";
    let sequence = 1;
    // Set when the previous trip closed on the spot because this job starts at
    // the same point — the queued trip is then eligible to start right away.
    let closedOnAssign = false;

    if (
      driver.driverStatus === "on_trip" ||
      driver.driverStatus === "offloading" ||
      driver.driverStatus === "returning" ||
      driver.driverStatus === "repositioning"
    ) {
      if (driver.driverStatus === "returning" || driver.driverStatus === "offloading") {
        // CR-VL-001 §3: do NOT complete the running trip. Retarget it to end at
        // this new job's pickup, and queue the new job behind it. The empty
        // distance in between is what the accountant then bills.

        // A driver may hold at most one queued trip. Without this, a third job
        // would retarget the running trip again and orphan the first gap.
        const alreadyQueued = await Assignment.countDocuments({ driverId, queueStatus: "queued" });
        if (alreadyQueued > 0) {
          res.status(400).json({
            message: "This driver already has a queued trip. Complete it before assigning another.",
          });
          return;
        }

        const driverAssignments = await Assignment.find({ driverId }).select("bookingId").lean();
        const allBookingIds = driverAssignments.map((a: any) => a.bookingId);

        const runningBooking = await Booking.findOne({
          _id: { $in: allBookingIds },
          // repositioning included so a trip already diverted once is still found
          // (the single-queued-trip guard above is what stops a second diversion)
          tripStatus: { $in: [...ASSIGNABLE_STATUSES] }
        });

        const nextBooking = await Booking.findById(bookingId);

        if (runningBooking && nextBooking) {
          const { closedImmediately } = await retargetRunningTrip({
            runningBooking, nextBooking, truckNumber, truckId,
          });
          // Only mark the driver as repositioning when there is ground to cover.
          // If the next job starts where the truck already stands, that trip is
          // already closed and the driver is simply between jobs.
          if (!closedImmediately) {
            await Driver.findByIdAndUpdate(driverId, { driverStatus: "repositioning" });
          }
          closedOnAssign = closedImmediately;
        }

        // Queue either way — including the fallback where no running trip was
        // found, which previously activated the new job immediately instead.
        const existingCount = await Assignment.countDocuments({
          driverId,
          queueStatus: { $in: ["active", "queued"] }
        });
        queueStatus = "queued";
        sequence = existingCount + 1;
        await Driver.findByIdAndUpdate(driverId, {
          $push: { tripQueue: bookingId }
        });
      } else {
        // Driver is busy on a non-returning leg — queue this assignment
        const existingCount = await Assignment.countDocuments({
          driverId,
          queueStatus: { $in: ["active", "queued"] }
        });
        queueStatus = "queued";
        sequence = existingCount + 1;

        await Driver.findByIdAndUpdate(driverId, {
          $push: { tripQueue: bookingId }
        });
      }
    } else {
      // available (or legacy driver without driverStatus) — start immediately
      await Driver.findByIdAndUpdate(driverId, { driverStatus: "on_trip" });
    }

    const newAssignment = new Assignment({
      bookingId,
      truckId,
      driverId,
      driverName,
      truckNumber,
      truckHealth,
      collectionArea,
      queueStatus,
      sequence
    });

    const savedAssignment = await newAssignment.save();

    // The previous trip ended the moment this one was assigned, so hand the
    // queued trip to the one helper that knows whether it may start yet — it
    // still refuses to activate a trip the accountant has not approved.
    if (closedOnAssign) {
      await promoteNextForDriver(String(driverId));
    }

    const timelineMsg = queueStatus === "queued"
      ? `Driver ${driverName} queued (position ${sequence}) with Truck ${truckNumber}`
      : `Driver ${driverName} assigned with Truck ${truckNumber}`;

    await Booking.findByIdAndUpdate(bookingId, {
      $push: {
        timeline: {
          title: queueStatus === "queued" ? "Driver Queued" : "Driver Assigned",
          description: timelineMsg,
          time: new Date(),
          status: "completed"
        }
      }
    });

    res.status(201).json({
      message: queueStatus === "queued" ? "Job queued successfully" : "Job assigned successfully",
      assignment: savedAssignment,
      queued: queueStatus === "queued"
    });
  } catch (error: any) {
    next(error);
  }
};

export const getAssignments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const assignments = await Assignment.find().populate("bookingId");
    res.status(200).json(assignments);
  } catch (error: any) {
    next(error);
  }
};

export const getAssignmentByBookingId = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const assignment = await Assignment.findOne({ bookingId });
    if (!assignment) {
      res.status(404).json({ message: "Assignment not found" });
      return;
    }
    res.status(200).json(assignment);
  } catch (error: any) {
    next(error);
  }
};

export const updateAssignment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const { driverName, driverId, truckId, truckNumber, truckHealth, collectionArea, queueStatus } = req.body;

    const updateFields: any = {};
    if (driverName !== undefined) updateFields.driverName = driverName;
    if (driverId !== undefined) updateFields.driverId = driverId;
    if (truckId !== undefined) updateFields.truckId = truckId;
    if (truckNumber !== undefined) updateFields.truckNumber = truckNumber;
    if (truckHealth !== undefined) updateFields.truckHealth = truckHealth;
    if (collectionArea !== undefined) updateFields.collectionArea = collectionArea;
    if (queueStatus !== undefined) updateFields.queueStatus = queueStatus;

    const assignment = await Assignment.findOneAndUpdate(
      { bookingId },
      updateFields,
      { new: true }
    );

    if (!assignment) {
      res.status(404).json({ message: "Assignment not found" });
      return;
    }

    res.status(200).json({ message: "Assignment updated successfully", assignment });
  } catch (error: any) {
    next(error);
  }
};

export const getAssignmentsByTruck = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { truckId } = req.params;
    const assignments = await Assignment.find({ truckId }).populate("bookingId");
    res.status(200).json(assignments);
  } catch (error: any) {
    next(error);
  }
};

export const getAssignmentsByDriver = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { driverId } = req.params;
    const assignments = await Assignment.find({ driverId }).populate("bookingId");
    res.status(200).json(assignments);
  } catch (error: any) {
    next(error);
  }
};

// Promote the next queued trip for a driver (called manually or after trip completion)
export const promoteNextTrip = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { driverId } = req.params;
  const driverIdStr = Array.isArray(driverId) ? driverId[0] : driverId;
  try {
    // Mark current active assignment as completed
    const activeAssignment = await Assignment.findOne({ driverId: driverIdStr, queueStatus: "active" });
    if (activeAssignment) {
      await Assignment.findByIdAndUpdate(activeAssignment._id, { queueStatus: "completed" });
    }

    const result = await promoteNextForDriver(driverIdStr);

    const updatedDriver = await Driver.findById(driverId);
    res.status(200).json({
      message: result.promoted
        ? "Next queued trip is now active."
        : result.reason === "next trip is not approved yet"
          ? "Next trip is queued but not yet approved by the accountant."
          : "All trips completed. Driver returning to warehouse.",
      driverStatus: updatedDriver?.driverStatus,
      promoted: result.promoted,
      reason: result.reason,
    });
  } catch (error: any) {
    next(error);
  }
};

// Trips that completed away from the yard — the driver went straight on to the
// next job's pickup, so the truck never came back for inspection. Return those
// still missing one so the completion modal can collect their damages/DO
// alongside the current trip.
export const getPendingInspections = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { truckNumber } = req.params;
  try {
    // Scope to the SAME TRUCK — documents/damages belong to the truck, not the driver.
    const truckAssignments = await Assignment.find({ truckNumber }).select("bookingId").lean();
    const bookingIds = truckAssignments.map((a: any) => a.bookingId);

    // Completed trips for this truck. The old query also required a timeline
    // marker, which no longer implies completion — a retargeted trip carries the
    // marker while still running, and completes long afterwards.
    const uninspected = await Booking.find({
      _id: { $in: bookingIds },
      tripStatus: { $in: ["completed", "delivered"] },
    }).select("_id tripId tripEndedAt").lean();

    // Drop the ones that already have an inspection on record for that trip
    const inspected = await TruckInspection.find({
      bookingId: { $in: uninspected.map((b: any) => b._id) },
    }).select("bookingId").lean();
    const inspectedIds = new Set(inspected.map((i: any) => String(i.bookingId)));

    const pending = uninspected
      .filter((b: any) => !inspectedIds.has(String(b._id)))
      .map((b: any) => ({
        bookingId: b._id,
        tripId: b.tripId || `#${String(b._id).slice(-6).toUpperCase()}`,
        completedAt: b.tripEndedAt || null,
      }));

    res.status(200).json(pending);
  } catch (error: any) {
    next(error);
  }
};

// Mark truck as inspected → save to TruckInspection history + driver becomes available.
export const markTruckInspected = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { driverId } = req.params;
  const { bookingId, vehicleCondition, tyreCondition, tyreNumber, tyres, challans, notes } = req.body;
  try {
    const driver = await Driver.findById(driverId);

    // Accepts the tyre list or a legacy flat pair, whichever the client sent.
    const inspectedTyres = normalizeTyres({ tyres, tyreNumber, tyreCondition });

    // The truck that ran THIS trip, not whatever the driver is currently assigned
    // to. Those differ the moment a driver is moved onto another vehicle, and the
    // tyre serials below are written to whichever this resolves to — stamping
    // them on the wrong truck is worse than not stamping them at all.
    const tripAssignment = bookingId
      ? await Assignment.findOne({ bookingId }).select("truckId").lean()
      : null;
    const inspectedTruckId = tripAssignment?.truckId || driver?.assignedTruck || null;

    // Save inspection record for the current (just-completed) trip
    const inspection = new TruckInspection({
      driverId,
      truckId:          inspectedTruckId,
      bookingId:        bookingId || null,
      vehicleCondition: vehicleCondition || "Good",
      tyres:            inspectedTyres,
      // Kept in step with the list so nothing reading the old flat pair breaks.
      tyreCondition:    worstTyreCondition(inspectedTyres, tyreCondition || "Good"),
      tyreNumber:       joinTyreNumbers(inspectedTyres) || tyreNumber || "",
      challans:         challans || "",
      notes:            notes || "",
      inspectedAt:      new Date(),
    });
    await inspection.save();

    // The inspection is the more recent look at the truck, so a serial corrected
    // at the gate has to reach the compliance record too — otherwise the two
    // screens disagree about which tyre is on which wheel. Additive: wheels this
    // inspection never mentioned are left exactly as they were.
    const truckId = inspectedTruckId;
    if (truckId && inspectedTyres.some((t) => t.position)) {
      try {
        const truck = await Truck.findById(truckId).select("tyres").lean();
        const merged = mergeFittedTyres(truck?.tyres as any, inspectedTyres);
        if (fittedTyresChanged(truck?.tyres as any, merged)) {
          await Truck.findByIdAndUpdate(truckId, {
            $set: {
              tyres: merged,
              // Positions only — the flat field older readers still use.
              tireSerialNumber: merged.map((t) => t.position).filter(Boolean),
            },
          });
        }
      } catch (err) {
        // The inspection itself is already saved; a stale compliance record is
        // worth a log, not a failed completion.
        console.error("[Inspection] Could not sync fitted tyres to the truck:", err);
      }
    }

    // Reset driver to available. tripQueue is NOT cleared here: the ops
    // completion modal calls this BEFORE marking the trip completed, so wiping
    // the queue would destroy it one request before promotion reads it.
    // promoteNextForDriver $pulls each booking as it activates, which is the
    // right granularity.
    await Driver.findByIdAndUpdate(driverId, {
      driverStatus: "available",
      needsTruckInspection: false,
    });

    res.status(200).json({ message: "Truck inspection complete. Driver is now available.", inspection });
  } catch (error: any) {
    next(error);
  }
};

// Get drivers that are returning or under inspection
export const getReturningDrivers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const drivers = await Driver.find({
      driverStatus: { $in: ["returning", "repositioning", "under_inspection"] }
    }).populate("assignedTruck");
    res.status(200).json(drivers);
  } catch (error: any) {
    next(error);
  }
};
