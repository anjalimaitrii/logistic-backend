import { Request, Response, NextFunction } from "express";
import Assignment from "../models/Assignment.js";
import Booking from "../models/Booking.js";
import Driver from "../models/Driver.js";
import TruckInspection from "../models/TruckInspection.js";

// Internal helper: promote next queued trip for a driver, or set to returning
const promoteOrReturnDriver = async (driverId: string) => {
  const nextAssignment = await Assignment.findOne({
    driverId,
    queueStatus: "queued"
  }).sort({ sequence: 1 });

  if (nextAssignment) {
    await Assignment.findByIdAndUpdate(nextAssignment._id, { queueStatus: "active" });
    await Driver.findByIdAndUpdate(driverId, {
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

    if (driver.driverStatus === "on_trip" || driver.driverStatus === "returning") {
      // Driver is busy — queue this assignment
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

// Mark truck as inspected → save to TruckInspection history + driver becomes available
export const markTruckInspected = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { driverId } = req.params;
  const { vehicleCondition, tyreCondition, tyreNumber, challans, deliveryOrders, damages, notes, attachments } = req.body;
  try {
    const driver = await Driver.findById(driverId);

    // Save inspection record to history collection
    const inspection = new TruckInspection({
      driverId,
      truckId:          driver?.assignedTruck || null,
      vehicleCondition: vehicleCondition || "Good",
      tyreCondition:    tyreCondition || "Good",
      tyreNumber:       tyreNumber || "",
      challans:         challans || "",
      deliveryOrders:   deliveryOrders || [],
      damages:          damages || [],
      notes:            notes || "",
      inspectedAt:      new Date(),
      attachments:      attachments || [],
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
