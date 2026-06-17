import { Request, Response, NextFunction } from "express";
import Truck from "../models/Truck.js";

export const createTruck = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const truckData = req.body;
    const newTruck = new Truck(truckData);
    const savedTruck = await newTruck.save();

    res.status(201).json({
      message: "Truck added successfully",
      truck: savedTruck,
    });
  } catch (error: any) {
    next(error);
  }
};

export const getTrucks = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const trucks = await Truck.find().sort({ createdAt: -1 });
    res.status(200).json(trucks);
  } catch (error: any) {
    next(error);
  }
};

export const getTruckById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const truck = await Truck.findById(id);

    if (!truck) {
      res.status(404).json({ message: "Truck not found" });
      return;
    }

    res.status(200).json(truck);
  } catch (error: any) {
    next(error);
  }
};

export const updateTruck = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const updatedTruck = await Truck.findByIdAndUpdate(id, updateData, {
      new: true,
    });

    if (!updatedTruck) {
      res.status(404).json({ message: "Truck not found" });
      return;
    }

    res.status(200).json({
      message: "Truck updated successfully",
      truck: updatedTruck,
    });
  } catch (error: any) {
    next(error);
  }
};

export const deleteTruck = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const deletedTruck = await Truck.findByIdAndDelete(id);

    if (!deletedTruck) {
      res.status(404).json({ message: "Truck not found" });
      return;
    }

    res.status(200).json({
      message: "Truck deleted successfully",
    });
  } catch (error: any) {
    next(error);
  }
};

export const addTruckCollection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, description, quantity } = req.body;
    const truck = await Truck.findByIdAndUpdate(
      req.params.id,
      { $push: { collections: { name, description: description || "", quantity: Number(quantity) || 1 } } },
      { new: true }
    );
    if (!truck) { res.status(404).json({ message: "Truck not found" }); return; }
    res.json(truck);
  } catch (error: any) {
    next(error);
  }
};

export const renewTruckCollection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { quantity } = req.body;
    const updateFields: Record<string, any> = { "collections.$.renewedAt": new Date() };
    if (quantity !== undefined && quantity !== null) {
      updateFields["collections.$.quantity"] = Number(quantity) || 1;
    }
    const truck = await Truck.findOneAndUpdate(
      { _id: req.params.id, "collections._id": req.params.colId },
      { $set: updateFields },
      { new: true }
    );
    if (!truck) { res.status(404).json({ message: "Truck or collection not found" }); return; }
    res.json(truck);
  } catch (error: any) {
    next(error);
  }
};

export const removeTruckCollection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const truck = await Truck.findByIdAndUpdate(
      req.params.id,
      { $pull: { collections: { _id: req.params.colId } } },
      { new: true }
    );
    if (!truck) { res.status(404).json({ message: "Truck not found" }); return; }
    res.json(truck);
  } catch (error: any) {
    next(error);
  }
};
