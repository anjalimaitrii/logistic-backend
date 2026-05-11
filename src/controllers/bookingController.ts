import { Request, Response } from "express";
import Booking from "../models/Booking.js";

export const createBooking = async (req: Request, res: Response): Promise<void> => {
  try {
    const { cargoDetails, pickup, dropoff, requirement, status, metadata, clientId } = req.body;

    // Generate sequential Job ID
    const lastBooking = await Booking.findOne().sort({ createdAt: -1 }).select("jobId");
    let nextNumber = 1;
    if (lastBooking?.jobId) {
      const lastNum = parseInt(lastBooking.jobId.replace("JOB-", ""), 10);
      if (!isNaN(lastNum)) nextNumber = lastNum + 1;
    }
    const jobId = `JOB-${String(nextNumber).padStart(3, "0")}`;

    const newBooking = new Booking({
      jobId,
      clientId,
      cargoDetails,
      pickup,
      dropoff,
      requirement,
      status: status || "pending",
      timeline: [{
        title: "Booking Created",
        description: "Customer initiated the booking request through the portal",
        time: new Date(),
        status: "completed"
      }],
      metadata,
    });

    const savedBooking = await newBooking.save();

    res.status(201).json({
      message: "Booking posted successfully",
      booking: savedBooking,
    });
  } catch (error: any) {
    res.status(500).json({
      message: "Error posting booking",
      error: error.message,
    });
  }
};

export const getBookings = async (req: Request, res: Response): Promise<void> => {
  try {
    const clientId = req.query.clientId as string;
    const filter = clientId ? { clientId } : {};

    const bookings = await Booking.find()
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
    res.status(500).json({
      message: "Error fetching bookings",
      error: error.message,
    });
  }
};

export const getBookingById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const booking = await Booking.findById(id).populate("clientId", "name email contact");

    if (!booking) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }

    res.status(200).json(booking);
  } catch (error: any) {
    res.status(500).json({
      message: "Error fetching booking details",
      error: error.message,
    });
  }
};

export const updateBookingStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, finalAmount, advancePaid, specialRequest, assignment } = req.body;

    const updateData: any = {};
    if (status) updateData.status = status;
    if (finalAmount !== undefined) updateData.finalAmount = finalAmount;
    if (advancePaid !== undefined) updateData.advancePaid = advancePaid;
    if (specialRequest !== undefined) updateData.specialRequest = specialRequest;
    if (assignment !== undefined) updateData.assignment = assignment;

    // Construct timeline event if status is updated (skip 'finalized' as it's logged as 'Trip Approved')
    const timelineUpdate: any = {};
    if (status && status.toLowerCase() !== "finalized") {
      timelineUpdate.$push = {
        timeline: {
          title: status.charAt(0).toUpperCase() + status.slice(1),
          description: `Status updated to ${status}`,
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

    res.status(200).json({
      message: `Status updated to ${status}`,
      booking: updatedBooking,
    });
  } catch (error: any) {
    res.status(500).json({
      message: "Error updating status",
      error: error.message,
    });
  }
};

export const updateBooking = async (req: Request, res: Response): Promise<void> => {
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
    res.status(500).json({
      message: "Error updating booking",
      error: error.message,
    });
  }
};

export const changeDropoffAddress = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { newPickup, newDropoff, reason, financials } = req.body;

    const booking = await Booking.findById(id);
    if (!booking) {
      res.status(404).json({ message: "Booking not found" });
      return;
    }

    const setData: any = {};
    const historyPushes: any[] = [];
    let timelineDesc = "Address updated:";

    // Handle Pickup Change
    if (newPickup) {
      const isPickupChanged =
        newPickup.address?.city !== booking.pickup.address?.city ||
        newPickup.address?.street !== booking.pickup.address?.street;

      if (isPickupChanged) {
        historyPushes.push({
          type: "pickup",
          oldAddress: {
            contactPerson: booking.pickup.contactPerson,
            contactNumber: booking.pickup.contactNumber,
            address: { ...booking.pickup.address }
          },
          changedAt: new Date(),
          reason: reason || "Operational adjustment"
        });
        timelineDesc += ` [Pickup: ${booking.pickup.address?.city} -> ${newPickup.address?.city}]`;
      }

      setData["pickup.contactPerson"] = newPickup.contactPerson || booking.pickup.contactPerson;
      setData["pickup.contactNumber"] = newPickup.contactNumber || booking.pickup.contactNumber;
      setData["pickup.address.plotNo"] = newPickup.address?.plotNo || "";
      setData["pickup.address.street"] = newPickup.address?.street || "";
      setData["pickup.address.city"] = newPickup.address?.city || "";
      setData["pickup.address.pincode"] = newPickup.address?.pincode || "";
    }

    // Handle Dropoff Change
    if (newDropoff) {
      const isDropoffChanged =
        newDropoff.address?.city !== booking.dropoff.address?.city ||
        newDropoff.address?.street !== booking.dropoff.address?.street;

      if (isDropoffChanged) {
        historyPushes.push({
          type: "dropoff",
          oldAddress: {
            contactPerson: booking.dropoff.contactPerson,
            contactNumber: booking.dropoff.contactNumber,
            address: { ...booking.dropoff.address }
          },
          changedAt: new Date(),
          reason: reason || "Client request"
        });
        timelineDesc += ` [Dropoff: ${booking.dropoff.address?.city} -> ${newDropoff.address?.city}]`;
      }

      setData["dropoff.contactPerson"] = newDropoff.contactPerson || booking.dropoff.contactPerson;
      setData["dropoff.contactNumber"] = newDropoff.contactNumber || booking.dropoff.contactNumber;
      setData["dropoff.address.plotNo"] = newDropoff.address?.plotNo || "";
      setData["dropoff.address.street"] = newDropoff.address?.street || "";
      setData["dropoff.address.city"] = newDropoff.address?.city || "";
      setData["dropoff.address.pincode"] = newDropoff.address?.pincode || "";
    }

    // Update finalAmount if provided
    if (financials?.newFinalAmount) {
      setData.finalAmount = financials.newFinalAmount;
    }

    const updateQuery: any = { $set: setData };
    if (historyPushes.length > 0) {
      updateQuery.$push = {
        addressHistory: { $each: historyPushes },
        timeline: {
          title: "Address Changed",
          description: `${timelineDesc}. New Dist: ${financials?.newPickupKm || 0} (P) + ${financials?.newDropoffKm || 0} (D) KM. Reason: ${reason || "Update"}`,
          time: new Date(),
          status: "completed"
        }
      };
    }

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
    res.status(500).json({
      message: "Error changing job addresses",
      error: error.message,
    });
  }
};
