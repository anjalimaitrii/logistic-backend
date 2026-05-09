import { Request, Response } from "express";
import Settlement from "../models/Settlement.js";
import Booking from "../models/Booking.js";

export const createOrUpdateSettlement = async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookingId, assignmentId, fuelDetails, expenses, financials } = req.body;

    const updateData: any = {};
    if (assignmentId) updateData.assignmentId = assignmentId;
    if (expenses) updateData.expenses = expenses;
    if (financials) updateData.financials = financials;
    
    if (fuelDetails) {
      const totalDistance = (Number(fuelDetails.pickupKm) || 0) + (Number(fuelDetails.dropoffKm) || 0);
      updateData.fuelDetails = { ...fuelDetails, totalDistance };
    }

    updateData.status = "Approved";

    const settlement = await Settlement.findOneAndUpdate(
       { bookingId },
       { $set: updateData },
       { new: true, upsert: true }
     );

    // Update Journey Timeline in Booking
    if (financials && financials.advancePaid) {
      await Booking.findByIdAndUpdate(bookingId, {
        $push: {
          timeline: {
            title: "Trip Approved",
            description: `Accountant approved trip with ₦${financials.advancePaid.toLocaleString()} allocation`,
            time: new Date(),
            status: "completed"
          }
        }
      });
    }

    if (expenses && expenses.length > 0) {
      const fuelExp = expenses.filter((e: any) => e.category === "Fuel").pop();
      if (fuelExp) {
        await Booking.findByIdAndUpdate(bookingId, {
          $push: {
            timeline: {
              title: "Petrol Refilled",
              description: `Refilled ${fuelExp.litres}L at ${fuelExp.description || "Station"}`,
              time: new Date(),
              status: "completed"
            }
          }
        });
      }
    }

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
