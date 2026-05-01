import { Request, Response } from "express";
import Driver from "../models/Driver.js";

export const createDriver = async (req: Request, res: Response): Promise<void> => {
  try {
    const driver = new Driver(req.body);
    await driver.save();
    res.status(201).json(driver);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const getDrivers = async (req: Request, res: Response): Promise<void> => {
  try {
    const drivers = await Driver.find().populate("assignedTruck");
    res.json(drivers);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const getDriverById = async (req: Request, res: Response): Promise<void> => {
  try {
    const driver = await Driver.findById(req.params.id).populate("assignedTruck");
    if (!driver) {
      res.status(404).json({ message: "Driver not found" });
      return;
    }
    res.json(driver);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateDriver = async (req: Request, res: Response): Promise<void> => {
  try {
    const driver = await Driver.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!driver) {
      res.status(404).json({ message: "Driver not found" });
      return;
    }
    res.json(driver);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteDriver = async (req: Request, res: Response): Promise<void> => {
  try {
    const driver = await Driver.findByIdAndDelete(req.params.id);
    if (!driver) {
      res.status(404).json({ message: "Driver not found" });
      return;
    }
    res.json({ message: "Driver deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
