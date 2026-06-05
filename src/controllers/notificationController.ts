import { Request, Response } from "express";
import Notification from "../models/Notification.js";

export const getAll = async (_req: Request, res: Response): Promise<void> => {
  try {
    const notifications = await Notification.find().sort({ createdAt: -1 }).limit(50);
    res.json(notifications);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const create = async (req: Request, res: Response): Promise<void> => {
  try {
    const notif = await Notification.create(req.body);
    res.status(201).json(notif);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
};

export const markAllRead = async (_req: Request, res: Response): Promise<void> => {
  try {
    await Notification.updateMany({ unread: true }, { unread: false });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const clearAll = async (_req: Request, res: Response): Promise<void> => {
  try {
    await Notification.deleteMany({});
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};
