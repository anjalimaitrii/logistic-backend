import { Response, NextFunction } from "express";
import { AuthedRequest } from "../middleware/auth.js";
import Driver from "../models/Driver.js";
import Assignment from "../models/Assignment.js";
import Booking from "../models/Booking.js";
import Settlement from "../models/Settlement.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { fileCompletedBooking } from "../services/completionRecords.js";
import { getFreshVehiclePosition } from "./liveTrackingController.js";
import { isFinalLeg, isLastOffloading } from "../lib/tripStatus.js";

// POST /api/driver-app/login
export const loginDriver = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ message: "Email and password are required" });
      return;
    }

    const driver = await Driver.findOne({ email });
    if (!driver || !driver.password) {
      // No email match, or a driver record that was never registered with credentials
      res.status(404).json({ message: "Driver not found" });
      return;
    }

    const isMatch = await bcrypt.compare(password, driver.password);
    if (!isMatch) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const token = jwt.sign(
      { id: driver._id, role: "driver", email: driver.email },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "30d" }
    );

    res.status(200).json({
      message: "Login successful",
      token,
      driver: {
        _id: driver._id,
        name: driver.name,
        phone: driver.phone,
        email: driver.email,
        licenseNo: driver.licenseNo,
        driverStatus: driver.driverStatus
      }
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/driver-app/me
export const getDriverMe = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const driver = await Driver.findById(req.user?.id);
    if (!driver) {
      res.status(404).json({ message: "Driver not found" });
      return;
    }
    res.status(200).json(driver);
  } catch (error) {
    next(error);
  }
};

// GET /api/driver-app/trips
export const getDriverTrips = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const driverId = req.user?.id;
    const assignments = await Assignment.find({ driverId, queueStatus: "active" })
      .populate({
        path: "bookingId",
        populate: {
          path: "clientId"
        }
      })
      .lean();

    // A trip reaches the driver only after the accountant approves it —
    // approval = a Settlement doc with status "Approved" for that booking.
    const bookingIds = assignments
      .filter((a) => a.bookingId)
      .map((a) => (a.bookingId as any)._id);
    const approvedSettlements = await Settlement.find({
      bookingId: { $in: bookingIds },
      status: "Approved"
    }).select("bookingId").lean();
    const approvedIds = new Set(approvedSettlements.map((s) => s.bookingId.toString()));

    const trips = assignments
      .filter((a) => a.bookingId && approvedIds.has((a.bookingId as any)._id.toString()))
      .map((a) => ({
        assignment: {
          _id: a._id,
          queueStatus: a.queueStatus,
          truckNumber: a.truckNumber
        },
        booking: a.bookingId
      }));

    res.status(200).json({ data: trips });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/driver-app/trips/:bookingId/status
export const updateDriverTripStatus = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const { tripStatus, tripStartCoords, tripEndCoords, deliveryOrders, damages, attachments } = req.body;

    if (!tripStatus) {
      res.status(400).json({ message: "tripStatus is required" });
      return;
    }

    const updateData: any = { tripStatus: tripStatus.toLowerCase() };

    if (deliveryOrders !== undefined) updateData.deliveryOrders = deliveryOrders;
    if (damages !== undefined) updateData.damages = damages;
    if (attachments !== undefined) updateData.attachments = attachments;

    const assignment = await Assignment.findOne({ bookingId });
    const truckNumber = assignment?.truckNumber;

    if (tripStatus.toLowerCase() === "started") {
      updateData.tripStartedAt = new Date();
      let startCoords = tripStartCoords;
      if (truckNumber) {
        const trakzeeCoords = await getFreshVehiclePosition(truckNumber);
        if (trakzeeCoords) {
          startCoords = trakzeeCoords;
        }
      }
      if (startCoords) {
        updateData.tripStartCoords = startCoords;
      }
    }

    if (tripStatus.toLowerCase() === "completed") {
      updateData.tripEndedAt = new Date();
      let endCoords = tripEndCoords;
      if (truckNumber) {
        const trakzeeCoords = await getFreshVehiclePosition(truckNumber);
        if (trakzeeCoords) {
          endCoords = trakzeeCoords;
        }
      }
      if (endCoords) {
        updateData.tripEndCoords = endCoords;
      }
    }

    const timelineUpdate = {
      $push: {
        timeline: {
          title: tripStatus.charAt(0).toUpperCase() + tripStatus.slice(1),
          description: `Trip status updated to ${tripStatus} by driver`,
          time: new Date(),
          status: "completed"
        }
      }
    };

    const updatedBooking = await Booking.findByIdAndUpdate(
      bookingId,
      { $set: updateData, ...timelineUpdate },
      { new: true }
    );

    if (!updatedBooking) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }

    // Starting closes the previous trip (the truck reached its last point — this
    // trip's pickup) and promotes this one if it was still queued.
    if (tripStatus.toLowerCase() === "started") {
      const { onTripStarted } = await import("../services/tripContinuity.js");
      await onTripStarted(String(bookingId));
    }

    // Offloading logic: the driver becomes assignable for a new trip — but only at
    // the LAST drop. A truck emptying the first of three still has two loads
    // aboard and cannot be sent anywhere else.
    const forDriver = await Booking.findById(bookingId)
      .select("pickupLocations dropoffLocations")
      .lean();
    if (
      isLastOffloading(
        tripStatus,
        (forDriver?.pickupLocations || []).length,
        (forDriver?.dropoffLocations || []).length
      )
    ) {
      const assignment = await Assignment.findOne({ bookingId });
      if (assignment?.driverId) {
        await Driver.findByIdAndUpdate(assignment.driverId, {
          // Stored without the stop number: which stop it is belongs to the trip.
          driverStatus: "offloading"
        });
      }
    }

    // Returning logic: update driver status to 'returning'
    // Final unladen leg — to the yard ("returning") or to the next job's pickup
    // ("repositioning"). The driver status mirrors whichever it is.
    if (isFinalLeg(tripStatus)) {
      const assignment = await Assignment.findOne({ bookingId });
      if (assignment?.driverId) {
        await Driver.findByIdAndUpdate(assignment.driverId, {
          driverStatus: tripStatus.toLowerCase()
        });
      }
    }

    // Completed logic: promote queued trip or set driver to 'available'
    if (tripStatus.toLowerCase() === "completed") {
      const assignment = await Assignment.findOne({ bookingId });
      if (assignment?.driverId) {
        await Assignment.findByIdAndUpdate(assignment._id, { queueStatus: "completed" });
        // One shared helper for both completion paths (ops and driver app). It
        // refuses to activate a trip the accountant has not approved, so the
        // driver never holds an active assignment their app cannot show.
        const { promoteNextForDriver } = await import("../services/tripContinuity.js");
        await promoteNextForDriver(assignment.driverId.toString());
      }

      // File Completed booking into Invoice or Cash
      try {
        await fileCompletedBooking(updatedBooking);
      } catch (fileErr) {
        console.error("[DriverAppController] Invoice/Cash filing failed:", fileErr);
      }
    }

    res.status(200).json({
      message: `Status updated to ${tripStatus}`,
      booking: updatedBooking
    });
  } catch (error) {
    next(error);
  }
};
