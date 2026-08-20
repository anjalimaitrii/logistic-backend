import { Request, Response, NextFunction } from "express";
import Settlement from "../models/Settlement.js";
import Booking from "../models/Booking.js";
import TripGap from "../models/TripGap.js";
import { isApprovalWrite } from "../lib/settlementStatus.js";
import { computeLegTotals } from "../lib/legTotals.js";
import { diffFinancials, diffEmptyLegs, describeSettlementChange } from "../lib/settlementDiff.js";
import { factsFromLeg, factsToUpdate } from "../lib/gapFacts.js";

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

    // The state before this write, read once: the timeline needs it to say what a
    // figure moved FROM, and the fuel totals need its stored empty legs.
    const prior: any = await Settlement.findOne({ bookingId }).lean();

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
      const effectiveExtras = incomingExtraLegs ?? prior?.extraLegs ?? [];
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

    // Whichever screen the accountant filled in, the empty leg's endpoints and
    // distance belong to the GAP — one truck, one drive, the same figures on both
    // trips. Without this the other trip's screen asked for the numbers that had
    // just been entered next door.
    if (Array.isArray(incomingExtraLegs)) {
      for (const leg of incomingExtraLegs) {
        if (!leg?.gapId) continue;
        const facts = factsFromLeg(leg);
        if (!facts) continue;
        try {
          await TripGap.updateOne({ _id: leg.gapId }, { $set: factsToUpdate(facts) });
        } catch (err) {
          // The settlement is already saved; a stale gap is worth a log, not a 500.
          console.error("[Settlement] Could not sync empty-leg facts to the gap:", err);
        }
      }
    }

    // Journey timeline: every figure that moved, named with its old and new value.
    // A save that changed nothing writes nothing — re-approving an unchanged
    // settlement used to leave a duplicate line each time.
    const entry = describeSettlementChange(
      diffFinancials(prior?.financials, financials),
      diffEmptyLegs(prior?.extraLegs, incomingExtraLegs),
      isApproval && prior?.status !== "Approved"
    );

    if (entry) {
      await Booking.findByIdAndUpdate(bookingId, {
        $push: {
          timeline: {
            title: entry.title,
            description: entry.description,
            time: new Date(),
            status: "completed",
          },
        },
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
