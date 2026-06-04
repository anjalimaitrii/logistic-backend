import { Router, Request, Response } from "express";
import Chat from "../models/Chat.js";

const router = Router();

// GET /api/chat/rooms — all rooms with their last message (for admin list)
router.get("/rooms", async (_req: Request, res: Response) => {
  try {
    const rooms = await Chat.aggregate([
      { $sort: { timestamp: -1 } },
      { $group: { _id: "$roomId", lastMessage: { $first: "$$ROOT" }, unread: { $sum: { $cond: [{ $eq: ["$sender", "client"] }, 1, 0] } } } },
      { $replaceRoot: { newRoot: { $mergeObjects: ["$lastMessage", { unread: "$unread" }] } } },
      { $sort: { timestamp: -1 } },
    ]);
    res.json(rooms);
  } catch {
    res.status(500).json({ message: "Failed to fetch rooms" });
  }
});

// GET /api/chat/:roomId — full message history for a room
router.get("/:roomId", async (req: Request, res: Response) => {
  try {
    const messages = await Chat.find({ roomId: req.params.roomId })
      .sort({ timestamp: 1 })
      .limit(100);
    res.json(messages);
  } catch {
    res.status(500).json({ message: "Failed to fetch chat history" });
  }
});

export default router;
