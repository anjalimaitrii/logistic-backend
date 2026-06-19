import { Request, Response, NextFunction } from "express";
import Booking from "../models/Booking.js";
import Payment from "../models/Payment.js";
import Client from "../models/Client.js";

// GET /api/ledger/company/:companyId
export const getCompanyLedger = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { companyId } = req.params;

    // All clients under this company (field is `company`, not `companyId`)
    const clients = await Client.find({ company: companyId }).select("_id name");
    const clientIds = clients.map((c: any) => c._id);

    // All bookings for those clients
    const bookings = await Booking.find({ clientId: { $in: clientIds } })
      .select("tripId clientId finalAmount advancePaid status tripStatus pickupLocations dropoffLocations createdAt")
      .sort({ createdAt: -1 });

    // All payments recorded against this company
    const payments = await Payment.find({ companyId }).sort({ paidAt: -1 });

    const totalBilled   = bookings.reduce((s: number, b: any) => s + (b.finalAmount || 0), 0);
    // advancePaid already folds in every later payment via FIFO allocation,
    // so its sum is the TOTAL money received (original advance + later payments).
    const advancePaidSum = bookings.reduce((s: number, b: any) => s + (b.advancePaid || 0), 0);
    const totalPayments  = payments.reduce((s: number, p: any) => s + (p.amount || 0), 0);
    const totalPaid      = advancePaidSum;                                  // total cash received
    const totalAdvance   = Math.max(0, advancePaidSum - totalPayments);     // original advance (display only)
    const outstanding    = Math.max(0, totalBilled - totalPaid);

    res.json({ bookings, payments, clients, totalBilled, totalPaid, totalAdvance, totalPayments, outstanding });
  } catch (error) { next(error); }
};

// GET /api/ledger/client/:clientId  (individual client)
export const getClientLedger = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { clientId } = req.params;

    const bookings = await Booking.find({ clientId })
      .select("tripId clientId finalAmount advancePaid status tripStatus pickupLocations dropoffLocations createdAt")
      .sort({ createdAt: -1 });

    const payments = await Payment.find({ clientId }).sort({ paidAt: -1 });

    const totalBilled   = bookings.reduce((s: number, b: any) => s + (b.finalAmount || 0), 0);
    // advancePaid already folds in every later payment via FIFO allocation,
    // so its sum is the TOTAL money received (original advance + later payments).
    const advancePaidSum = bookings.reduce((s: number, b: any) => s + (b.advancePaid || 0), 0);
    const totalPayments  = payments.reduce((s: number, p: any) => s + (p.amount || 0), 0);
    const totalPaid      = advancePaidSum;                                  // total cash received
    const totalAdvance   = Math.max(0, advancePaidSum - totalPayments);     // original advance (display only)
    const outstanding    = Math.max(0, totalBilled - totalPaid);

    res.json({ bookings, payments, totalBilled, totalPaid, totalAdvance, totalPayments, outstanding });
  } catch (error) { next(error); }
};

// FIFO allocation — bookings must already be sorted oldest-first by caller.
// Returns the per-booking distribution so the payment can be reversed on delete.
async function allocateFIFO(bookings: any[], amount: number): Promise<Array<{ bookingId: any; amount: number }>> {
  let remaining = amount;
  const allocations: Array<{ bookingId: any; amount: number }> = [];
  const unpaid = bookings.filter((b: any) => (b.finalAmount || 0) > (b.advancePaid || 0));

  for (const booking of unpaid) {
    if (remaining <= 0) break;
    const due = (booking.finalAmount || 0) - (booking.advancePaid || 0);
    const applied = Math.min(remaining, due);
    if (remaining >= due) {
      // Fully settled — mark paid, remembering the status we're overwriting
      await Booking.findByIdAndUpdate(booking._id, {
        advancePaid: booking.finalAmount,
        status: "paid",
        ...(booking.status !== "paid" ? { statusBeforePaid: booking.status } : {}),
      });
    } else {
      await Booking.findByIdAndUpdate(booking._id, { advancePaid: (booking.advancePaid || 0) + remaining });
    }
    allocations.push({ bookingId: booking._id, amount: applied });
    remaining -= applied;
  }
  return allocations;
}

// Reverse a payment's allocation: subtract each allocated amount back off the
// booking and, if it drops below the billed total, un-mark it as "paid".
async function reverseAllocations(allocations: Array<{ bookingId: any; amount: number }>): Promise<void> {
  for (const alloc of allocations) {
    const b: any = await Booking.findById(alloc.bookingId).select("finalAmount advancePaid status statusBeforePaid");
    if (!b) continue;
    const newAdvance = Math.max(0, (b.advancePaid || 0) - (alloc.amount || 0));
    const update: any = { advancePaid: newAdvance };
    if (b.status === "paid" && newAdvance < (b.finalAmount || 0)) {
      update.status = b.statusBeforePaid || "finalized";
      update.statusBeforePaid = null;
    }
    await Booking.findByIdAndUpdate(b._id, update);
  }
}

// Legacy fallback for payments saved before allocations were tracked: unwind the
// amount newest-booking-first (mirror of FIFO) across the payer's bookings.
async function reverseFIFOByAmount(bookingFilter: any, amount: number): Promise<void> {
  let remaining = amount;
  const bookings: any[] = await Booking.find(bookingFilter)
    .select("_id finalAmount advancePaid status statusBeforePaid createdAt")
    .sort({ createdAt: -1 });
  for (const b of bookings) {
    if (remaining <= 0) break;
    const paid = b.advancePaid || 0;
    if (paid <= 0) continue;
    const take = Math.min(paid, remaining);
    const newAdvance = paid - take;
    const update: any = { advancePaid: newAdvance };
    if (b.status === "paid" && newAdvance < (b.finalAmount || 0)) {
      update.status = b.statusBeforePaid || "finalized";
      update.statusBeforePaid = null;
    }
    await Booking.findByIdAndUpdate(b._id, update);
    remaining -= take;
  }
}

// POST /api/ledger/company/:companyId/payment
export const addCompanyPayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = String(req.params.companyId);
    const { amount, note, paidAt } = req.body;
    if (!amount || Number(amount) <= 0) { res.status(400).json({ message: "Valid amount required" }); return; }

    // Save payment record
    const payment = await Payment.create({ companyId, amount: Number(amount), note: note || "", paidAt: paidAt ? new Date(paidAt) : new Date() });

    // FIFO allocation across company's bookings
    const clients = await Client.find({ company: companyId }).select("_id");
    const clientIds = clients.map((c: any) => c._id);
    // sort: 1 = ascending = oldest first (FIFO)
    const bookings = await Booking.find({ clientId: { $in: clientIds } })
      .select("_id finalAmount advancePaid status createdAt")
      .sort({ createdAt: 1 });
    const allocations = await allocateFIFO(bookings, Number(amount));
    payment.allocations = allocations as any;
    await payment.save();

    res.status(201).json(payment);
  } catch (error) { next(error); }
};

// POST /api/ledger/client/:clientId/payment
export const addClientPayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const clientId = String(req.params.clientId);
    const { amount, note, paidAt } = req.body;
    if (!amount || Number(amount) <= 0) { res.status(400).json({ message: "Valid amount required" }); return; }

    const payment = await Payment.create({ clientId, amount: Number(amount), note: note || "", paidAt: paidAt ? new Date(paidAt) : new Date() });

    // sort: 1 = ascending = oldest first (FIFO)
    const bookings = await Booking.find({ clientId })
      .select("_id finalAmount advancePaid status createdAt")
      .sort({ createdAt: 1 });
    const allocations = await allocateFIFO(bookings, Number(amount));
    payment.allocations = allocations as any;
    await payment.save();

    res.status(201).json(payment);
  } catch (error) { next(error); }
};

// DELETE /api/ledger/payment/:paymentId
// Irreversible — requires the admin password (verified server-side, not in the client).
export const deletePayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { password } = req.body || {};
    if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
      res.status(403).json({ message: "Invalid admin password" });
      return;
    }

    const payment: any = await Payment.findById(req.params.paymentId);
    if (!payment) {
      res.status(404).json({ message: "Payment not found" });
      return;
    }

    // Undo this payment's effect on the trips before removing it, so the billed
    // amount comes back off the trips and any "paid" trip reverts to outstanding.
    if (Array.isArray(payment.allocations) && payment.allocations.length > 0) {
      await reverseAllocations(payment.allocations);
    } else {
      // Legacy payment without tracked allocations — best-effort unwind by amount
      const filter = payment.companyId
        ? { clientId: { $in: (await Client.find({ company: payment.companyId }).select("_id")).map((c: any) => c._id) } }
        : { clientId: payment.clientId };
      await reverseFIFOByAmount(filter, payment.amount || 0);
    }

    await Payment.findByIdAndDelete(req.params.paymentId);
    res.json({ message: "Payment deleted" });
  } catch (error) { next(error); }
};
