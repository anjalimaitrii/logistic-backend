import { Server, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import Chat from "./models/Chat.js";
import Notification from "./models/Notification.js";

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
        // roomId format: clientId__tripId — split to identify recipient + trip
        const [clientId, tripId] = roomId.split("__");
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
        // Save notification for client when admin replies, then broadcast
        if (sender === "admin") {
          let clientNotifId: string | undefined;
          try {
            const notif = await Notification.create({
              icon: "💬",
              title: `New Message — ${senderName}`,
              body: message,
              link: tripId || "", // store tripId so client can open the right trip's chat
              unread: true,
              recipientId: clientId,
            });
            clientNotifId = String(notif._id);
          } catch (dbErr) {
            console.error("[Socket] client notification DB save failed:", dbErr);
          }
          io.emit("client_notification", { roomId, clientId, tripId, message, senderName, notifId: clientNotifId });
        }

        // Broadcast to all admin tabs; save DB record once so frontend doesn't duplicate.
        if (sender === "client") {
          let notifId: string | undefined;
          try {
            const notif = await Notification.create({
              icon: "💬",
              title: `New Message — ${senderName}`,
              body: message,
              link: `/admin/requests?openChat=${roomId}`,
              unread: true,
            });
            notifId = String(notif._id);
          } catch (dbErr) {
            console.error("[Socket] chat notification DB save failed:", dbErr);
          }
          io.emit("chat_notification", { ...msgPayload, notifId });
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
