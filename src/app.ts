import express from "express";
import cors from "cors";
import { registerRoutes } from "./routes/index.js";
import { errorLogger } from "./middleware/errorLogger.js";

const app = express();

app.use(cors());
app.use(express.json());

registerRoutes(app);

// Must be after routes — catches all unhandled errors
app.use(errorLogger);

export default app;