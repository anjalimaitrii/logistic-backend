import { Request, Response } from "express";
import Warehouse from "../models/Warehouse.js";

const EMPTY = { street: "", city: "", province: "", country: "" };

export const getWarehouse = async (_req: Request, res: Response): Promise<void> => {
  try {
    const doc = await Warehouse.findOne();
    // Never return null. The accountant screen renders leg endpoints straight
    // from these fields, and a null would print "undefined" into a saved leg.
    res.json(doc || EMPTY);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const saveWarehouse = async (req: Request, res: Response): Promise<void> => {
  try {
    // Destructure explicitly. The Routes page writes the saved server document
    // straight back into state, so accepting req.body wholesale would round-trip
    // _id and __v into the next update.
    const { street, city, province, country } = req.body;
    const doc = await Warehouse.findOneAndUpdate(
      {},
      { street, city, province, country },
      { new: true, upsert: true, runValidators: true }
    );
    res.json(doc);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
};
