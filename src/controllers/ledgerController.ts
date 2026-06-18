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

// FIFO allocation — bookings must already be sorted oldest-first by caller
async function allocateFIFO(bookings: any[], amount: number): Promise<void> {
  let remaining = amount;
  const unpaid = bookings.filter((b: any) => (b.finalAmount || 0) > (b.advancePaid || 0));

  for (const booking of unpaid) {
    if (remaining <= 0) break;
    const due = (booking.finalAmount || 0) - (booking.advancePaid || 0);
    if (remaining >= due) {
      await Booking.findByIdAndUpdate(booking._id, { advancePaid: booking.finalAmount, status: "paid" });
      remaining -= due;
    } else {
      await Booking.findByIdAndUpdate(booking._id, { advancePaid: (booking.advancePaid || 0) + remaining });
      remaining = 0;
    }
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
      .select("_id finalAmount advancePaid createdAt")
      .sort({ createdAt: 1 });
    await allocateFIFO(bookings, Number(amount));

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
      .select("_id finalAmount advancePaid createdAt")
      .sort({ createdAt: 1 });
    await allocateFIFO(bookings, Number(amount));

    res.status(201).json(payment);
  } catch (error) { next(error); }
};

// DELETE /api/ledger/payment/:paymentId
export const deletePayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await Payment.findByIdAndDelete(req.params.paymentId);
    res.json({ message: "Payment deleted" });
  } catch (error) { next(error); }
};
