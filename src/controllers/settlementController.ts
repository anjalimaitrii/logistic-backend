import { Request, Response, NextFunction } from "express";
import Settlement from "../models/Settlement.js";
import Booking from "../models/Booking.js";
import TripGap from "../models/TripGap.js";
import { isApprovalWrite } from "../lib/settlementStatus.js";
import { computeLegTotals } from "../lib/legTotals.js";

export const createOrUpdateSettlement = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { bookingId, fuelDetails, expenses, financials, tollAmount, extraLegs, returnLegDismissed } = req.body;

    // Only a genuine approval (one carrying financials) may set the status, and
    // only an approval may bring a settlement into existence. Expense syncs from
    // the jobs screen post to this same endpoint; letting them stamp "Approved"
    // is what unlocked unapproved trips in the driver app.
    const isApproval = isApprovalWrite(req.body);

    // CR-VL-001 §9: a trip cannot be approved while an empty leg leading INTO it
    // is unattributed. Only approvals are gated — an expense sync carries no
    // financials, so it passes through and never 409s.
    if (isApproval) {
      const blocking = await TripGap.findOne({
        nextBookingId: bookingId,
        status: "unattributed",
      })
        .populate("prevBookingId", "tripId")
        .lean();

      if (blocking) {
        const prevLabel = (blocking.prevBookingId as any)?.tripId || "the previous trip";
        res.status(409).json({
          message: `Empty leg ${blocking.fromLabel} → ${blocking.toLabel} is unattributed. Assign it to this trip or to ${prevLabel} before approving.`,
          gap: blocking,
        });
        return;
      }
    }

    const updateData: any = {};
    if (expenses) updateData.expenses = expenses;
    if (financials) updateData.financials = financials;
    if (tollAmount !== undefined) updateData.tollAmount = Number(tollAmount);

    const incomingExtraLegs = Array.isArray(extraLegs) ? extraLegs : undefined;
    if (incomingExtraLegs) updateData.extraLegs = incomingExtraLegs;
    if (returnLegDismissed !== undefined) updateData.returnLegDismissed = !!returnLegDismissed;

    if (fuelDetails) {
      const legs = Array.isArray(fuelDetails.legs) ? fuelDetails.legs : [];
      // Journey totals must span the empty legs too, or every consumer of
      // totalDistance under-reports the truck's real distance. An approve that
      // resends fuelDetails but not extraLegs still has to count the stored ones.
      const effectiveExtras = incomingExtraLegs
        ?? (await Settlement.findOne({ bookingId }).select("extraLegs").lean())?.extraLegs
        ?? [];
      const { totalDistance, totalLiters } = computeLegTotals(legs, effectiveExtras);
      updateData.fuelDetails = {
        legs,
        fuelRate: fuelDetails.fuelRate,
        totalDistance,
        totalLiters,
      };
    }

    if (isApproval) {
      updateData.status = "Approved";
    }

    const settlement = await Settlement.findOneAndUpdate(
       { bookingId },
       { $set: updateData },
       { new: true, upsert: isApproval }
     );

    if (!settlement) {
      res.status(404).json({ message: "No settlement to update for this booking" });
      return;
    }

    // NOTE: wallet deduction moved to the eToll sheet upload (tollController) —
    // toll amounts come only from uploaded sheets now, settlements never deduct.

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
    next(error);
  }
};

export const getSettlementByBookingId = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { bookingId } = req.params;
    const settlement = await Settlement.findOne({ bookingId });
    if (!settlement) {
      res.status(404).json({ message: "Settlement not found" });
      return;
    }
    res.status(200).json(settlement);
  } catch (error: any) {
    next(error);
  }
};

export const getAllSettlements = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const settlements = await Settlement.find().populate("bookingId");
    res.status(200).json(settlements);
  } catch (error: any) {
    next(error);
  }
};
