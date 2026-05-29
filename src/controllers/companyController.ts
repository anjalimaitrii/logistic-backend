import { Request, Response, NextFunction } from "express";
import Company from "../models/Company.js";
import Client from "../models/Client.js";

export const createCompany = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { companyName, cinNumber, address, contact, accounting, status } = req.body;

    if (!companyName) {
      res.status(400).json({ message: "Company name is required" });
      return;
    }

    console.log("DEBUG: createCompany req.body:", req.body);
    const newCompany = new Company({
      companyName,
      cinNumber,
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
