import { Server, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import Chat from "./models/Chat.js";

let io: Server;

export const initSocket = (httpServer: HttpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket: Socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);

    socket.on("join_room", ({ roomId }: { roomId: string }) => {
      socket.join(roomId);
      console.log(`[Socket] ${socket.id} joined room: ${roomId}`);
    });

    socket.on("send_message", async (payload: {
      roomId: string;
      message: string;
      sender: "admin" | "client";
      senderName: string;
    }) => {
      try {
        const { roomId, message, sender, senderName } = payload;
        const chat = await Chat.create({ roomId, message, sender, senderName });
        const msgPayload = {
          _id: chat._id,
          roomId,
          message,
          sender,
          senderName,
          timestamp: chat.timestamp,
        };
        // Broadcast to room members (open chat panels)
        io.to(roomId).emit("receive_message", msgPayload);
        // Global notification event — fires for ALL connected sockets
        // so admins get bell notification even if chat panel is closed
        if (sender === "client") {
          io.emit("chat_notification", msgPayload);
        }
      } catch (err) {
        console.error("[Socket] send_message error:", err);
      }
    });

    socket.on("load_history", async ({ roomId }: { roomId: string }) => {
      try {
        const history = await Chat.find({ roomId }).sort({ timestamp: 1 }).limit(100);
        socket.emit("history", history);
      } catch (err) {
        console.error("[Socket] load_history error:", err);
      }
    });

    socket.on("disconnect", () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIo = (): Server => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};
