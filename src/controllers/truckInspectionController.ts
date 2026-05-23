import { Request, Response } from "express";
import TruckInspection from "../models/TruckInspection.js";

export const createInspection = async (req: Request, res: Response): Promise<void> => {
  try {
    const { driverId, truckId, vehicleCondition, tyreCondition, notes } = req.body;

    const inspection = new TruckInspection({
      driverId,
      truckId,
      vehicleCondition,
      tyreCondition,
      notes: notes || "",
      inspectedAt: new Date()
    });

    const saved = await inspection.save();
    res.status(201).json(saved);
  } catch (error: any) {
    res.status(500).json({ message: "Error saving inspection", error: error.message });
  }
};

export const getAllInspections = async (req: Request, res: Response): Promise<void> => {
  try {
    const inspections = await TruckInspection.find()
      .populate("driverId", "name phone")
      .populate("truckId", "truckId health")
      .sort({ inspectedAt: -1 });
    res.status(200).json(inspections);
  } catch (error: any) {
    res.status(500).json({ message: "Error fetching inspections", error: error.message });
  }
};

export const getInspectionsByTruck = async (req: Request, res: Response): Promise<void> => {
  try {
    const { truckId } = req.params;
    const inspections = await TruckInspection.find({ truckId })
      .populate("driverId", "name phone")
      .sort({ inspectedAt: -1 });
    res.status(200).json(inspections);
  } catch (error: any) {
    res.status(500).json({ message: "Error fetching truck inspections", error: error.message });
  }
};

export const getInspectionsByDriver = async (req: Request, res: Response): Promise<void> => {
  try {
    const { driverId } = req.params;
    const inspections = await TruckInspection.find({ driverId })
      .populate("truckId", "truckId health")
      .sort({ inspectedAt: -1 });
    res.status(200).json(inspections);
  } catch (error: any) {
    res.status(500).json({ message: "Error fetching driver inspections", error: error.message });
  }
};
