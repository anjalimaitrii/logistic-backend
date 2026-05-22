import { Request, Response } from "express";
import Settlement from "../models/Settlement.js";
import Booking from "../models/Booking.js";

export const createOrUpdateSettlement = async (req: Request, res: Response): Promise<void> => {
  try {
    const { bookingId, fuelDetails, expenses, financials } = req.body;

    const updateData: any = {};
    if (expenses) updateData.expenses = expenses;
    if (financials) updateData.financials = financials;

    if (fuelDetails) {
      const legs = Array.isArray(fuelDetails.legs) ? fuelDetails.legs : [];
      const totalDistance = legs.reduce((sum: number, leg: any) => sum + (Number(leg.km) || 0), 0);
      const totalLiters = legs.reduce((sum: number, leg: any) => sum + (Number(leg.liters) || 0), 0);
      updateData.fuelDetails = {
        legs,
        fuelRate: fuelDetails.fuelRate,
        totalDistance: Math.round(totalDistance),
        totalLiters: Math.round(totalLiters * 10) / 10
      };
    }

    updateData.status = "Approved";

    const settlement = await Settlement.findOneAndUpdate(
       { bookingId },
       { $set: updateData },
       { new: true, upsert: true }
     );

    // Update Journey Timeline in Booking
    if (financials && financials.cashAllocation) {
      await Booking.findByIdAndUpdate(bookingId, {
        $push: {
          timeline: {
            title: "Trip Approved",
            description: `Accountant approved trip with ₦${Number(financials.cashAllocation).toLocaleString()} cash allocation`,
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
    const settlement = await Settlement.findOne({ bookingId });
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
    const settlements = await Settlement.find().populate("bookingId");
    res.status(200).json(settlements);
  } catch (error: any) {
    res.status(500).json({ message: "Error fetching settlements", error: error.message });
  }
};
