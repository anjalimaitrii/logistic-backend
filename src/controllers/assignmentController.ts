import { Request, Response, NextFunction } from "express";
import Assignment from "../models/Assignment.js";
import Booking from "../models/Booking.js";
import Driver from "../models/Driver.js";
import TruckInspection from "../models/TruckInspection.js";
import { getVehiclePosition } from "./liveTrackingController.js";

// Internal helper: promote next queued trip for a driver, or set to returning
const promoteOrReturnDriver = async (driverId: string) => {
  const nextAssignment = await Assignment.findOne({
    driverId,
    queueStatus: "queued"
  }).sort({ sequence: 1 });

  if (nextAssignment) {
    await Assignment.findByIdAndUpdate(nextAssignment._id, { queueStatus: "active" });
    await Driver.findByIdAndUpdate(driverId, {
      $set: { driverStatus: "on_trip" },
      $pull: { tripQueue: nextAssignment.bookingId }
    });
    await Booking.findByIdAndUpdate(nextAssignment.bookingId, {
      $push: {
        timeline: {
          title: "Trip Activated",
          description: "Next queued trip is now active for this driver",
          time: new Date(),
          status: "completed"
        }
      }
    });
  } else {
    await Driver.findByIdAndUpdate(driverId, {
      driverStatus: "returning",
      needsTruckInspection: true
    });
  }
};

export const createAssignment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { bookingId, truckId, driverId, driverName, truckNumber, truckHealth, collectionArea, returningEndCoords } = req.body;

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

    if (driver.driverStatus === "on_trip" || driver.driverStatus === "offloading" || driver.driverStatus === "returning") {
      if (driver.driverStatus === "returning" || driver.driverStatus === "offloading") {
        try {
          // Find all assignments for this driver and get the one whose booking is on its
          // final leg (offloading or returning) — both mean the driver is assignable.
          const driverAssignments = await Assignment.find({ driverId }).select("bookingId").lean();
          const allBookingIds = driverAssignments.map((a: any) => a.bookingId);

          const currentLegBooking = await Booking.findOne({
            _id: { $in: allBookingIds },
            tripStatus: { $in: ["offloading", "returning"] }
          }).select("_id tripId tripStatus");

          if (currentLegBooking) {
            const newBookingDoc = await Booking.findById(bookingId).select("tripId");
            const newTripLabel = newBookingDoc?.tripId || `#${String(bookingId).slice(-6).toUpperCase()}`;

            // Assigning a new job ends the current leg — mark the offloading/returning trip
            // completed and freeze the truck's current position as its end point.
            // Prefer the coords the client captured; otherwise look them up
            // server-side so the end point is reliably set either way.
            const endCoords = returningEndCoords || (await getVehiclePosition(truckNumber));
            await Booking.findByIdAndUpdate(currentLegBooking._id, {
              tripStatus: "completed",
              tripEndedAt: new Date(),
              ...(endCoords ? { tripEndCoords: endCoords } : {}),
              $push: {
                timeline: {
                  title: "New Job Assigned",
                  description: `${newTripLabel} assigned to driver while ${currentLegBooking.tripStatus} — trip completed`,
                  time: new Date(),
                  status: "completed"
                }
              }
            });

            // Mark previous assignment as completed
            await Assignment.updateOne(
              { bookingId: currentLegBooking._id },
              { queueStatus: "completed" }
            );

            // Update driver to on_trip
            await Driver.findByIdAndUpdate(driverId, { driverStatus: "on_trip" });

            queueStatus = "active";
            sequence = 1;
          } else {
            // Queue fallback if returning booking not found
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
        } catch (err) {
          console.error("Failed to log new job on returning trip timeline:", err);
          // Queue fallback
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

    await promoteOrReturnDriver(driverIdStr);

    const updatedDriver = await Driver.findById(driverId);
    res.status(200).json({
      message: updatedDriver?.driverStatus === "returning"
        ? "All trips completed. Driver returning to warehouse."
        : "Next queued trip is now active.",
      driverStatus: updatedDriver?.driverStatus
    });
  } catch (error: any) {
    next(error);
  }
};

// Trips that were auto-completed while the driver was returning (a new job was
// assigned mid-return) never had their damages/DO recorded, because the truck
// never came back for inspection. Return those still missing an inspection so the
// completion modal can collect their damages/DO alongside the current trip.
export const getPendingInspections = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { truckNumber } = req.params;
  try {
    // Scope to the SAME TRUCK — documents/damages belong to the truck, not the driver.
    const truckAssignments = await Assignment.find({ truckNumber }).select("bookingId").lean();
    const bookingIds = truckAssignments.map((a: any) => a.bookingId);

    // Auto-completed-while-returning trips: completed + a "New Job Assigned" timeline entry
    const autoCompleted = await Booking.find({
      _id: { $in: bookingIds },
      tripStatus: "completed",
      "timeline.title": "New Job Assigned",
    }).select("_id tripId tripEndedAt").lean();

    // Drop the ones that already have an inspection on record for that trip
    const inspected = await TruckInspection.find({
      bookingId: { $in: autoCompleted.map((b: any) => b._id) },
    }).select("bookingId").lean();
    const inspectedIds = new Set(inspected.map((i: any) => String(i.bookingId)));

    const pending = autoCompleted
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
  const { bookingId, vehicleCondition, tyreCondition, tyreNumber, challans, notes } = req.body;
  try {
    const driver = await Driver.findById(driverId);

    // Save inspection record for the current (just-completed) trip
    const inspection = new TruckInspection({
      driverId,
      truckId:          driver?.assignedTruck || null,
      bookingId:        bookingId || null,
      vehicleCondition: vehicleCondition || "Good",
      tyreCondition:    tyreCondition || "Good",
      tyreNumber:       tyreNumber || "",
      challans:         challans || "",
      notes:            notes || "",
      inspectedAt:      new Date(),
    });
    await inspection.save();

    // Reset driver to available
    await Driver.findByIdAndUpdate(driverId, {
      driverStatus: "available",
      needsTruckInspection: false,
      tripQueue: []
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
      driverStatus: { $in: ["returning", "under_inspection"] }
    }).populate("assignedTruck");
    res.status(200).json(drivers);
  } catch (error: any) {
    next(error);
  }
};
