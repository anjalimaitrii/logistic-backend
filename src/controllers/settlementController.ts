import { Request, Response } from "express";
import Settlement from "../models/Settlement.js";

export const createOrUpdateSettlement = async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookingId, assignmentId, fuelDetails, expenses, financials } = req.body;

    // Calculate total distance for record keeping
    const totalDistance = (Number(fuelDetails.pickupKm) || 0) + (Number(fuelDetails.dropoffKm) || 0);

    const settlement = await Settlement.findOneAndUpdate(
      { bookingId },
      {
        assignmentId,
        fuelDetails: { ...fuelDetails, totalDistance },
        expenses,
        financials,
        status: "Approved"
      },
      { new: true, upsert: true }
    );

    res.status(200).json({
      message: "Settlement processed successfully",
      settlement
    });
  } catch (error: any) {
    res.status(500).json({ message: "Error processing settlement", error: error.message });
  }
};

export const getSettlementByBookingId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const settlement = await Settlement.findOne({ bookingId }).populate("assignmentId");
    if (!settlement) {
      res.status(404).json({ message: "Settlement not found" });
      return;
    }
    res.status(200).json(settlement);
  } catch (error: any) {
    res.status(500).json({ message: "Error fetching settlement", error: error.message });
  }
};

export const getAllSettlements = async (req: Request, res: Response): Promise<void> => {
  try {
    const settlements = await Settlement.find().populate("bookingId").populate("assignmentId");
    res.status(200).json(settlements);
  } catch (error: any) {
    res.status(500).json({ message: "Error fetching settlements", error: error.message });
  }
};
