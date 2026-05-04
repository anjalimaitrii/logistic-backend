import { Request, Response } from "express";
import Booking from "../models/Booking.js";

export const createBooking = async (req: Request, res: Response): Promise<void> => {
  try {
    const { cargoDetails, pickup, dropoff, requirement, status, metadata, clientId } = req.body;

    const newBooking = new Booking({
      clientId, // This could also be extracted from a JWT token in middleware
      cargoDetails,
      pickup,
      dropoff,
      requirement,
      status,
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

    const updatedBooking = await Booking.findByIdAndUpdate(
      id,
      { status, finalAmount, advancePaid, specialRequest, assignment },
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
