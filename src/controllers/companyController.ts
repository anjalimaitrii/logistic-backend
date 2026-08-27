import { Request, Response, NextFunction } from "express";
import Company from "../models/Company.js";
import Client from "../models/Client.js";
import { totalClientRecords, describeCompanyUsage } from "../lib/clientUsage.js";

export const createCompany = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { companyName, tpinNumber, address, contact, accounting, status } = req.body;

    if (!companyName) {
      res.status(400).json({ message: "Company name is required" });
      return;
    }

    console.log("DEBUG: createCompany req.body:", req.body);
    const newCompany = new Company({
      companyName,
      tpinNumber,
      address,
      contact,
      accounting,
      status,
    });

    const savedCompany = await newCompany.save();
    console.log("DEBUG: savedCompany result:", savedCompany);

    res.status(201).json({
      message: "Company created successfully",
      company: savedCompany,
    });
  } catch (error: any) {
    next(error);
  }
};

export const getCompanies = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companies = await Company.find().populate("clients").sort({ createdAt: -1 });
    res.status(200).json(companies);
  } catch (error: any) {
    next(error);
  }
};

export const addClientsToCompany = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { clientIds } = req.body;

    if (!Array.isArray(clientIds)) {
      res.status(400).json({ message: "clientIds must be an array" });
      return;
    }

    const company = await Company.findByIdAndUpdate(
      id,
      { $addToSet: { clients: { $each: clientIds } } },
      { new: true }
    ).populate("clients");

    if (!company) {
      res.status(404).json({ message: "Company not found" });
      return;
    }

    // Bi-directional Link: Update Clients to point back to this Company
    await Client.updateMany(
      { _id: { $in: clientIds } },
      { $set: { company: id } }
    );

    res.status(200).json({
      message: "Clients added to company successfully",
      company,
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * What deleting this company would take with it.
 *
 * Two different losses, so both are counted: the client accounts that go, and
 * the trade those accounts are attached to — which stays, but stops being
 * reachable from a company that no longer exists.
 */
export const getCompanyUsage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const company = await Company.findById(id).select("_id companyName").lean();
    if (!company) {
      res.status(404).json({ message: "Company not found" });
      return;
    }

    const clientIds = (await Client.find({ company: id }).select("_id").lean()).map((c: any) => c._id);

    const [Booking, Invoice, Payment, Cash] = await Promise.all([
      import("../models/Booking.js").then(m => m.default),
      import("../models/Invoice.js").then(m => m.default),
      import("../models/Payment.js").then(m => m.default),
      import("../models/Cash.js").then(m => m.default),
    ]);

    const [bookings, invoices, payments, cash] = await Promise.all([
      Booking.countDocuments({ clientId: { $in: clientIds } }),
      Invoice.countDocuments({ clientId: { $in: clientIds } }),
      // Payments can hang off the company directly as well as off its people.
      Payment.countDocuments({ $or: [{ companyId: id }, { clientId: { $in: clientIds } }] }),
      Cash.countDocuments({ clientId: { $in: clientIds } }),
    ]);

    const usage = { clients: clientIds.length, bookings, invoices, payments, cash };
    res.status(200).json({
      companyName: (company as any).companyName,
      ...usage,
      total: clientIds.length + totalClientRecords(usage),
      summary: describeCompanyUsage(usage),
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Remove the company and the client accounts under it.
 *
 * Their trade is left alone, exactly as with a single client: bookings and
 * invoices are the record of what happened. Both names are written onto those
 * bookings first, so a past trip still says which client and which company it
 * was for once neither record exists.
 */
export const deleteCompany = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const company = await Company.findById(id);
    if (!company) {
      res.status(404).json({ message: "Company not found" });
      return;
    }

    // Imported here, not at the top: clientController imports this module's
    // Company model, and a static edge back would close the cycle.
    const { stampClientNameOnBookings } = await import("./clientController.js");

    const clients = await Client.find({ company: id }).populate("company", "companyName");
    for (const client of clients) {
      await stampClientNameOnBookings(client);
    }

    await Client.deleteMany({ company: id });
    await Company.findByIdAndDelete(id);

    res.status(200).json({
      message: `${company.companyName} removed.`,
      clientsRemoved: clients.length,
    });
  } catch (error: any) {
    next(error);
  }
};
