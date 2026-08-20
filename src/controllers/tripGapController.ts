import { Request, Response, NextFunction } from "express";
import TripGap from "../models/TripGap.js";

// Two query shapes: gaps adjacent to one booking (accountant detail screen), or
// every unattributed gap (accountant list badges — one request, not one per row).
export const getGapsForBooking = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { bookingId, status } = req.query;

    if (!bookingId && status !== "unattributed") {
      res.status(400).json({ message: "bookingId is required" });
      return;
    }

    const filter: any = bookingId
      ? { $or: [{ prevBookingId: bookingId }, { nextBookingId: bookingId }] }
      : { status: "unattributed" };

    const gaps = await TripGap.find(filter)
      .populate("prevBookingId", "tripId")
      .populate("nextBookingId", "tripId")
      .populate("claimedByBookingId", "tripId")
      .lean();

    res.status(200).json(gaps);
  } catch (error: any) { next(error); }
};

export const claimGap = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { bookingId, side, km, fromLabel, toLabel, claimedBy } = req.body;

    if (!bookingId || !side) {
      res.status(400).json({ message: "bookingId and side are required" });
      return;
    }

    const gap = await TripGap.findById(id);
    if (!gap) { res.status(404).json({ message: "Gap not found" }); return; }

    const isAdjacent =
      String(gap.prevBookingId) === String(bookingId) ||
      String(gap.nextBookingId) === String(bookingId);
    if (!isAdjacent) {
      res.status(400).json({ message: "This trip is not adjacent to that empty leg" });
      return;
    }

    // Atomic. The guard on status is the single-attribution lock: two accountants
    // in two tabs cannot both win — the loser gets null back, not a second claim.
    const claimed = await TripGap.findOneAndUpdate(
      { _id: id, status: "unattributed" },
      {
        $set: {
          status: "claimed",
          claimedByBookingId: bookingId,
          claimedSide: side,
          claimedKm: Number(km) || 0,
          claimedAt: new Date(),
          claimedBy: claimedBy || "",
          // Endpoints and distance belong to the gap, not to the claim: the other
          // trip's screen reads them straight back rather than asking again.
          ...(Number(km) > 0 ? { km: Number(km) } : {}),
          ...(String(fromLabel || "").trim()
            ? { fromLabel: String(fromLabel).trim(), originConfirmed: true }
            : {}),
          ...(String(toLabel || "").trim() ? { toLabel: String(toLabel).trim() } : {}),
        },
      },
      { new: true }
    );

    if (!claimed) {
      const current = await TripGap.findById(id).populate("claimedByBookingId", "tripId").lean();
      res.status(409).json({
        message: "This empty leg has already been claimed by another trip",
        gap: current,
      });
      return;
    }

    res.status(200).json(claimed);
  } catch (error: any) { next(error); }
};

// "Move here" is a release followed by a claim. Releasing is guarded on the
// current claimant so a stale tab cannot release someone else's claim.
export const releaseGap = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { bookingId } = req.body;
    if (!bookingId) { res.status(400).json({ message: "bookingId is required" }); return; }

    const released = await TripGap.findOneAndUpdate(
      { _id: id, status: "claimed", claimedByBookingId: bookingId },
      {
        $set: { status: "unattributed" },
        $unset: { claimedByBookingId: "", claimedSide: "", claimedKm: "", claimedAt: "", claimedBy: "" },
      },
      { new: true }
    );

    if (!released) {
      res.status(409).json({ message: "This empty leg is not currently claimed by that trip" });
      return;
    }

    res.status(200).json(released);
  } catch (error: any) { next(error); }
};
