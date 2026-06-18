import { Request, Response } from "express";
import Route from "../models/Route.js";

export const getRoutes = async (_req: Request, res: Response): Promise<void> => {
  try {
    const routes = await Route.find().sort({ pickupCity: 1, dropoffCity: 1 });
    res.json(routes);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const matchRoute = async (req: Request, res: Response): Promise<void> => {
  try {
    const { pickup, dropoff } = req.query as { pickup: string; dropoff: string };
    if (!pickup || !dropoff) {
      res.status(400).json({ error: "pickup and dropoff query params are required" });
      return;
    }
    const pickupRx  = { $regex: new RegExp(`^${pickup.trim()}$`, "i") };
    const dropoffRx = { $regex: new RegExp(`^${dropoff.trim()}$`, "i") };
    // Prefer an exact-direction match (A→B); fall back to the reverse (B→A).
    // Distance, allocation, toll & levy are the same either direction.
    const route =
      (await Route.findOne({ pickupCity: pickupRx,  dropoffCity: dropoffRx })) ||
      (await Route.findOne({ pickupCity: dropoffRx, dropoffCity: pickupRx }));
    res.json(route || null);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const createRoute = async (req: Request, res: Response): Promise<void> => {
  try {
    const route = await Route.create(req.body);
    res.status(201).json(route);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
};

export const updateRoute = async (req: Request, res: Response): Promise<void> => {
  try {
    const route = await Route.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!route) { res.status(404).json({ error: "Route not found" }); return; }
    res.json(route);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
};

export const deleteRoute = async (req: Request, res: Response): Promise<void> => {
  try {
    const route = await Route.findByIdAndDelete(req.params.id);
    if (!route) { res.status(404).json({ error: "Route not found" }); return; }
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};
