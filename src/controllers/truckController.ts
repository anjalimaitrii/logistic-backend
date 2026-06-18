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

    // Detect newly-added compliance documents so we can log each upload
    const activityEntries: any[] = [];
    if (Array.isArray(updateData.complianceDocs)) {
      const existing = await Truck.findById(id).select("complianceDocs").lean();
      const oldKeys = new Set(
        (existing?.complianceDocs || []).map((d: any) => `${d.type}|${d.dueDate}|${d.file || ""}`)
      );
      for (const d of updateData.complianceDocs) {
        const key = `${d.type}|${d.dueDate}|${d.file || ""}`;
        if (!oldKeys.has(key) && d.type) {
          activityEntries.push({ title: "Document Uploaded", description: d.type, time: new Date() });
        }
      }
    }

    const update: any = { ...updateData };
    if (activityEntries.length) update.$push = { activityLog: { $each: activityEntries } };

    const updatedTruck = await Truck.findByIdAndUpdate(id, update, { new: true });

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
    const qty = Number(quantity) || 1;
    const truck = await Truck.findByIdAndUpdate(
      req.params.id,
      {
        $push: {
          collections: { name, description: description || "", quantity: qty },
          activityLog: { title: "Collection Added", description: `${name} · qty ${qty}`, time: new Date() },
        },
      },
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

    // Log the renewal (name looked up from the renewed collection)
    const renewed = (truck.collections || []).find((c: any) => String(c._id) === String(req.params.colId));
    await Truck.findByIdAndUpdate(req.params.id, {
      $push: { activityLog: { title: "Collection Renewed", description: renewed?.name || "Collection", time: new Date() } },
    });

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
