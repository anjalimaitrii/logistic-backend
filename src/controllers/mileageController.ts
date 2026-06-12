import { Request, Response } from "express";
import Mileage from "../models/Mileage.js";

export const getMileage = async (_req: Request, res: Response): Promise<void> => {
  try {
    const doc = await Mileage.findOne();
    res.json(doc || { loadedMileage: 0, unloadedMileage: 0 });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const saveMileage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { loadedMileage, unloadedMileage } = req.body;
    const doc = await Mileage.findOneAndUpdate(
      {},
      { loadedMileage, unloadedMileage },
      { new: true, upsert: true, runValidators: true }
    );
    res.json(doc);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
};
