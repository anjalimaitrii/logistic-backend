import { Request, Response, NextFunction } from "express";
import Invoice from "../models/Invoice.js";
import Cash from "../models/Cash.js";

// GET /api/invoices — completed with-tax trips (inv-001…)
export const getInvoices = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const invoices = await Invoice.find()
      .populate("bookingId")
      .populate("clientId", "name email contact")
      .sort({ createdAt: -1 });
    res.json(invoices);
  } catch (error) { next(error); }
};

// GET /api/cash — completed without-tax trips (cash-001…)
export const getCash = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cash = await Cash.find()
      .populate("bookingId")
      .populate("clientId", "name email contact")
      .sort({ createdAt: -1 });
    res.json(cash);
  } catch (error) { next(error); }
};
