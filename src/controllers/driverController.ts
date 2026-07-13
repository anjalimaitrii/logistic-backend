import { Request, Response, NextFunction } from "express";
import Driver from "../models/Driver.js";
import Assignment from "../models/Assignment.js";
import Booking from "../models/Booking.js";

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
        if (ts === "offloading" && d?.driverStatus !== "offloading") {
          await Driver.updateOne({ _id: assignment.driverId }, { driverStatus: "offloading" });
          if (d) (d as any).driverStatus = "offloading";
        } else if (ts === "returning") {
          await Driver.updateOne({ _id: assignment.driverId }, { driverStatus: "returning" });
          if (d) (d as any).driverStatus = "returning";
        } else if (ts === "completed" || ts === "delivered") {
          // Trip finished → driver is free. Don't leave them stuck as "returning".
          await Driver.updateOne({ _id: assignment.driverId },
            { driverStatus: "available", needsTruckInspection: false, tripQueue: [] });
          await Assignment.updateOne({ _id: assignment._id }, { queueStatus: "completed" });
          if (d) (d as any).driverStatus = "available";
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
