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
