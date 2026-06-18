import { Request, Response } from "express";
import Notification from "../models/Notification.js";

export const getAll = async (req: Request, res: Response): Promise<void> => {
  try {
    const clientId = req.query.clientId as string | undefined;
    const filter = clientId
      ? { recipientId: clientId }
      : { $or: [{ recipientId: null }, { recipientId: { $exists: false } }] };
    const notifications = await Notification.find(filter).sort({ createdAt: -1 }).limit(50);
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

export const markAllRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const clientId = req.query.clientId as string | undefined;
    const filter = clientId
      ? { recipientId: clientId, unread: true }
      : { $or: [{ recipientId: null }, { recipientId: { $exists: false } }], unread: true };
    await Notification.updateMany(filter, { unread: false });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};

export const clearAll = async (req: Request, res: Response): Promise<void> => {
  try {
    const clientId = req.query.clientId as string | undefined;
    const filter = clientId
      ? { recipientId: clientId }
      : { $or: [{ recipientId: null }, { recipientId: { $exists: false } }] };
    await Notification.deleteMany(filter);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};
