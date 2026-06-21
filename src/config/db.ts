import mongoose from "mongoose";

const connectDB = async (): Promise<void> => {
    const uri = process.env.MONGO_URL;
    if (!uri) {
        console.error("[DB] MONGO_URL is not set — cannot connect to MongoDB.");
        return;
    }

    // Surface connection lifecycle so failures are visible in the logs instead of
    // silently leaving queries to buffer and time out after 10s.
    mongoose.connection.on("connected",    () => console.log("[DB] MongoDB connected"));
    mongoose.connection.on("disconnected", () => console.warn("[DB] MongoDB disconnected"));
    mongoose.connection.on("error",        (e) => console.error("[DB] MongoDB error:", e?.message || e));

    const tryConnect = async (attempt = 1): Promise<void> => {
        try {
            // Fail fast (8s) on server selection instead of waiting the default 30s.
            await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
        } catch (err: any) {
            console.error(`[DB] Connection attempt ${attempt} failed:`, err?.message || err);
            const delay = Math.min(30000, attempt * 5000);
            console.log(`[DB] Retrying in ${delay / 1000}s…`);
            setTimeout(() => { void tryConnect(attempt + 1); }, delay);
        }
    };

    await tryConnect();
};

export default connectDB;
