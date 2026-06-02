import { Request, Response, NextFunction } from "express";
import Booking from "../models/Booking.js";
import { getIo } from "../socket.js";

export const createBooking = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      cargoDetails,
      pickupLocations,
      dropoffLocations,
      pickup,
      dropoff,
      requirement,
      status,
      metadata,
      clientId,
      isSecret,
      withTax,
    } = req.body;

    // Generate sequential Trip ID
    const lastBooking = await Booking.findOne().sort({ createdAt: -1 }).select("tripId");
    let nextNumber = 1;
    if (lastBooking?.tripId) {
      const lastNum = parseInt(lastBooking.tripId.replace("TRIP-", ""), 10);
      if (!isNaN(lastNum)) nextNumber = lastNum + 1;
    }
    const tripId = `TRIP-${String(nextNumber).padStart(3, "0")}`;

    const bookingData: any = {
      tripId,
      clientId,
      cargoDetails,
      requirement,
      status: status || "pending",
      timeline: [
        {
          title: "Booking Created",
          description: "Booking created successfully",
          time: new Date(),
          status: "completed",
        },
      ],
      metadata,
      isSecret: isSecret ?? false,
      withTax: withTax ?? true,
    };

    if (Array.isArray(pickupLocations) && pickupLocations.length > 0) {
      bookingData.pickupLocations = pickupLocations;
    } else if (pickup) {
      bookingData.pickupLocations = [
        {
          sequence: 1,
          contactPerson: pickup.contactPerson,
          contactNumber: pickup.contactNumber,
          address: pickup.address,
          gpsEnabled: pickup.gpsEnabled ?? false,
        },
      ];
    }

    if (Array.isArray(dropoffLocations) && dropoffLocations.length > 0) {
      bookingData.dropoffLocations = dropoffLocations;
    } else if (dropoff) {
      bookingData.dropoffLocations = [
        {
          sequence: 1,
          contactPerson: dropoff.contactPerson,
          contactNumber: dropoff.contactNumber,
          address: dropoff.address,
          gpsEnabled: dropoff.gpsEnabled ?? false,
        },
      ];
    }

    if (!Array.isArray(bookingData.pickupLocations) || bookingData.pickupLocations.length === 0) {
      res.status(400).json({
        message: "At least one pickup location is required",
      });
      return;
    }

    if (!Array.isArray(bookingData.dropoffLocations) || bookingData.dropoffLocations.length === 0) {
      res.status(400).json({
        message: "At least one dropoff location is required",
      });
      return;
    }

    const newBooking = new Booking(bookingData);

    const savedBooking = await newBooking.save();

    // Notify all connected admin clients
    try {
      getIo().emit("new_job", {
        tripId: savedBooking.tripId,
        pickup: savedBooking.pickupLocations?.[0]?.address?.city || "N/A",
        dropoff: savedBooking.dropoffLocations?.[0]?.address?.city || "N/A",
        goods: savedBooking.cargoDetails?.goodsType || "N/A",
        createdAt: savedBooking.createdAt,
      });
    } catch {
      // Socket not critical — ignore if not initialized
    }

    res.status(201).json({
      message: "Booking posted successfully",
      booking: savedBooking,
    });
  } catch (error: any) {
    next(error);
  }
};

export const getBookings = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const clientId = req.query.clientId as string;
    const filter = clientId ? { clientId } : {};

    const bookings = await Booking.find(filter)
      .populate({
        path: "clientId",
        select: "name email contact company",
        populate: {
          path: "company",
          select: "companyName cinNumber"
        }
      })
      .sort({ createdAt: -1 });

    res.status(200).json(bookings);
  } catch (error: any) {
    next(error);
  }
};

export const getBookingById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const booking = await Booking.findById(id).populate("clientId", "name email contact");

    if (!booking) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }

    res.status(200).json(booking);
  } catch (error: any) {
    next(error);
  }
};

export const updateBookingStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, tripStatus, finalAmount, advancePaid, specialRequest, assignment } = req.body;

    const updateData: any = {};
    if (status) updateData.status = status;
    if (tripStatus) updateData.tripStatus = tripStatus;
    if (finalAmount !== undefined) updateData.finalAmount = finalAmount;
    if (advancePaid !== undefined) updateData.advancePaid = advancePaid;
    if (specialRequest !== undefined) updateData.specialRequest = specialRequest;
    if (assignment !== undefined) updateData.assignment = assignment;

    // Construct timeline event if status or tripStatus is updated
    const timelineUpdate: any = {};
    const displayStatus = tripStatus || status;
    
    // Skip 'finalized' as it's usually logged separately as 'Trip Approved'
    if (displayStatus && displayStatus.toLowerCase() !== "finalized") {
      timelineUpdate.$push = {
        timeline: {
          title: displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1),
          description: `Trip status updated to ${displayStatus}`,
          time: new Date(),
          status: "completed"
        }
      };
    }

    const updatedBooking = await Booking.findByIdAndUpdate(
      id,
      { $set: updateData, ...timelineUpdate },
      { new: true }
    ).populate("clientId", "name email contact");

    if (!updatedBooking) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }

    // When driver marks returning → update their driverStatus so they appear available for queueing
    if (tripStatus === "returning") {
      try {
        const Assignment = (await import("../models/Assignment.js")).default;
        const Driver = (await import("../models/Driver.js")).default;

        const assignment = await Assignment.findOne({ bookingId: id });
        if (assignment?.driverId) {
          await Driver.findByIdAndUpdate(assignment.driverId, {
            driverStatus: "returning"
          });
        }
      } catch (err) {
        console.error("Driver returning status update failed (non-critical):", err);
      }
    }

    // When a trip is fully completed, mark assignment complete and promote next queued trip
    if (tripStatus === "completed") {
      try {
        const Assignment = (await import("../models/Assignment.js")).default;
        const Driver = (await import("../models/Driver.js")).default;

        const assignment = await Assignment.findOne({ bookingId: id });
        if (assignment?.driverId) {
          const driverId = assignment.driverId.toString();

          await Assignment.findByIdAndUpdate(assignment._id, { queueStatus: "completed" });

          const nextAssignment = await Assignment.findOne({
            driverId,
            queueStatus: "queued"
          }).sort({ sequence: 1 });

          if (nextAssignment) {
            await Assignment.findByIdAndUpdate(nextAssignment._id, { queueStatus: "active" });
            await Driver.findByIdAndUpdate(driverId, {
              $pull: { tripQueue: nextAssignment.bookingId }
            });
          } else {
            await Driver.findByIdAndUpdate(driverId, {
              driverStatus: "returning",
              needsTruckInspection: true
            });
          }
        }
      } catch (promoteErr) {
        console.error("Auto-promote failed (non-critical):", promoteErr);
      }
    }

    res.status(200).json({
      message: `Status updated to ${status || tripStatus}`,
      booking: updatedBooking,
    });
  } catch (error: any) {
    next(error);
  }
};

export const updateBooking = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const updatedBooking = await Booking.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );

    if (!updatedBooking) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }

    res.status(200).json({
      message: "Booking updated successfully",
      booking: updatedBooking,
    });
  } catch (error: any) {
    next(error);
  }
};

export const changeDropoffAddress = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { newPickup, newDropoff, reason, financials } = req.body;

    const booking = await Booking.findById(id);
    if (!booking) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }

    const currentPickup = booking.pickupLocations?.[0];
    const currentDropoff = booking.dropoffLocations?.[0];

    const setData: any = {};

    // Handle Pickup Change
    if (newPickup && currentPickup) {
      setData["pickupLocations.0.contactPerson"] = newPickup.contactPerson || currentPickup.contactPerson;
      setData["pickupLocations.0.contactNumber"] = newPickup.contactNumber || currentPickup.contactNumber;
      setData["pickupLocations.0.address.plotNo"] = newPickup.address?.plotNo || "";
      setData["pickupLocations.0.address.street"] = newPickup.address?.street || "";
      setData["pickupLocations.0.address.city"] = newPickup.address?.city || "";
      setData["pickupLocations.0.address.lga"] = (newPickup.address as any)?.lga || "";
    }

    // Handle Dropoff Change
    if (newDropoff && currentDropoff) {

      setData["dropoffLocations.0.contactPerson"] = newDropoff.contactPerson || currentDropoff.contactPerson;
      setData["dropoffLocations.0.contactNumber"] = newDropoff.contactNumber || currentDropoff.contactNumber;
      setData["dropoffLocations.0.address.plotNo"] = newDropoff.address?.plotNo || "";
      setData["dropoffLocations.0.address.street"] = newDropoff.address?.street || "";
      setData["dropoffLocations.0.address.city"] = newDropoff.address?.city || "";
      setData["dropoffLocations.0.address.lga"] = (newDropoff.address as any)?.lga || "";
    }

    // Update finalAmount if provided
    if (financials?.newFinalAmount) {
      setData.finalAmount = financials.newFinalAmount;
    }

    const updateQuery: any = { $set: setData };

    const updatedBooking = await Booking.findByIdAndUpdate(
      id,
      updateQuery,
      { new: true }
    );

    // Update Settlement pickupKm and dropoffKm if financials provided
    if (financials?.newPickupKm !== undefined || financials?.newDropoffKm !== undefined) {
      const Settlement = (await import("../models/Settlement.js")).default;
      const totalDist = (Number(financials?.newPickupKm) || 0) + (Number(financials?.newDropoffKm) || 0);

      await Settlement.findOneAndUpdate(
        { bookingId: id },
        {
          $set: {
            "fuelDetails.pickupKm": Number(financials?.newPickupKm) || 0,
            "fuelDetails.dropoffKm": Number(financials?.newDropoffKm) || 0,
            "fuelDetails.totalDistance": totalDist
          }
        },
        { upsert: true }
      );
    }

    res.status(200).json({
      message: "Job addresses updated successfully",
      booking: updatedBooking
    });
  } catch (error: any) {
    next(error);
  }
};
