import { Request, Response } from "express";
import Truck from "../models/Truck.js";

export const createTruck = async (req: Request, res: Response): Promise<void> => {
  try {
    const truckData = req.body;
    const newTruck = new Truck(truckData);
    const savedTruck = await newTruck.save();

    res.status(201).json({
      message: "Truck added successfully",
      truck: savedTruck,
    });
  } catch (error: any) {
    res.status(500).json({
      message: "Error adding truck",
      error: error.message,
    });
  }
};

export const getTrucks = async (req: Request, res: Response): Promise<void> => {
  try {
    const trucks = await Truck.find().sort({ createdAt: -1 });
    res.status(200).json(trucks);
  } catch (error: any) {
    res.status(500).json({
      message: "Error fetching trucks",
      error: error.message,
    });
  }
};

export const getTruckById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const truck = await Truck.findById(id);

    if (!truck) {
      res.status(404).json({ message: "Truck not found" });
      return;
    }

    res.status(200).json(truck);
  } catch (error: any) {
    res.status(500).json({
      message: "Error fetching truck details",
      error: error.message,
    });
  }
};

export const updateTruck = async (req: Request, res: Response): Promise<void> => {
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
    res.status(500).json({
      message: "Error updating truck",
      error: error.message,
    });
  }
};

export const deleteTruck = async (req: Request, res: Response): Promise<void> => {
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
    res.status(500).json({
      message: "Error deleting truck",
      error: error.message,
    });
  }
};
