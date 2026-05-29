import { Request, Response, NextFunction } from "express";
import TruckInspection from "../models/TruckInspection.js";

export const createInspection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
    next(error);
  }
};

export const getAllInspections = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const inspections = await TruckInspection.find()
      .populate("driverId", "name phone")
      .populate("truckId", "truckId health")
      .sort({ inspectedAt: -1 });
    res.status(200).json(inspections);
  } catch (error: any) {
    next(error);
  }
};

export const getInspectionsByTruck = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { truckId } = req.params;
    const inspections = await TruckInspection.find({ truckId })
      .populate("driverId", "name phone")
      .sort({ inspectedAt: -1 });
    res.status(200).json(inspections);
  } catch (error: any) {
    next(error);
  }
};

export const getInspectionsByDriver = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { driverId } = req.params;
    const inspections = await TruckInspection.find({ driverId })
      .populate("truckId", "truckId health")
      .sort({ inspectedAt: -1 });
    res.status(200).json(inspections);
  } catch (error: any) {
    next(error);
  }
};
