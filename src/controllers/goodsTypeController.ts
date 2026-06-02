import { Request, Response } from "express";
import GoodsType from "../models/GoodsType.js";

export const getAll = async (_req: Request, res: Response) => {
  try {
    const types = await GoodsType.find().sort({ name: 1 });
    res.json(types);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch goods types" });
  }
};

export const create = async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });
    const existing = await GoodsType.findOne({ name: name.trim() });
    if (existing) return res.status(409).json({ error: "Already exists" });
    const type = await GoodsType.create({ name: name.trim() });
    res.status(201).json(type);
  } catch (err) {
    res.status(500).json({ error: "Failed to create goods type" });
  }
};

export const remove = async (req: Request, res: Response) => {
  try {
    await GoodsType.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete goods type" });
  }
};
