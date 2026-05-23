import { Request, Response } from "express";
import Driver from "../models/Driver.js";
import Assignment from "../models/Assignment.js";
import Booking from "../models/Booking.js";

export const createDriver = async (req: Request, res: Response): Promise<void> => {
  try {
    const driver = new Driver(req.body);
    await driver.save();
    res.status(201).json(driver);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const getDrivers = async (req: Request, res: Response): Promise<void> => {
  try {
    const drivers = await Driver.find().populate("assignedTruck");

    // Sync driverStatus for any "on_trip" driver whose active booking tripStatus has moved on
    const onTripIds = drivers
      .filter(d => d.driverStatus === "on_trip")
      .map(d => d._id);

    if (onTripIds.length > 0) {
      const activeAssignments = await Assignment.find({
        driverId: { $in: onTripIds },
        queueStatus: "active"
      }).populate("bookingId");

      for (const assignment of activeAssignments) {
        const booking = assignment.bookingId as any;
        const ts = booking?.tripStatus?.toLowerCase();
        if (ts === "returning" || ts === "completed") {
          await Driver.updateOne(
            { _id: assignment.driverId },
            { driverStatus: "returning" }
          );
          // Update in-memory so the response reflects the correct state
          const d = drivers.find(dr => dr._id.toString() === assignment.driverId?.toString());
          if (d) (d as any).driverStatus = "returning";
        }
      }
    }

    res.json(drivers);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getDriverById = async (req: Request, res: Response): Promise<void> => {
  try {
    const driver = await Driver.findById(req.params.id).populate("assignedTruck");
    if (!driver) {
      res.status(404).json({ message: "Driver not found" });
      return;
    }
    res.json(driver);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateDriver = async (req: Request, res: Response): Promise<void> => {
  try {
    const driver = await Driver.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!driver) {
      res.status(404).json({ message: "Driver not found" });
      return;
    }
    res.json(driver);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteDriver = async (req: Request, res: Response): Promise<void> => {
  try {
    const driver = await Driver.findByIdAndDelete(req.params.id);
    if (!driver) {
      res.status(404).json({ message: "Driver not found" });
      return;
    }
    res.json({ message: "Driver deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
