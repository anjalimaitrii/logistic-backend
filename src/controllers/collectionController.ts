import { Request, Response } from "express";
import Collection from "../models/Collection.js";

export const getCollections = async (req: Request, res: Response): Promise<void> => {
  try {
    const collections = await Collection.find().sort({ createdAt: -1 });
    res.status(200).json(collections);
  } catch (error: any) {
    res.status(500).json({ message: "Error fetching collection items", error: error.message });
  }
};

export const createCollection = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description } = req.body;
    const newCollection = new Collection({ name, description });
    const saved = await newCollection.save();
    res.status(201).json(saved);
  } catch (error: any) {
    res.status(500).json({ message: "Error creating collection item", error: error.message });
  }
};

export const updateCollection = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    const updated = await Collection.findByIdAndUpdate(
      id,
      { name, description },
      { new: true }
    );
    res.status(200).json(updated);
  } catch (error: any) {
    res.status(500).json({ message: "Error updating item", error: error.message });
  }
};

export const deleteCollection = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await Collection.findByIdAndDelete(id);
    res.status(200).json({ message: "Item deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: "Error deleting item", error: error.message });
  }
};
