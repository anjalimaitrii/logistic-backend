import express from "express";
import cors from "cors";
import companyRoutes from "./routes/companyRoutes.js";
import clientRoutes from "./routes/clientRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import truckRoutes from "./routes/truckRoutes.js";
import driverRoutes from "./routes/driverRoutes.js";
import assignmentRoutes from "./routes/assignmentRoutes.js";
import settlementRoutes from "./routes/settlementRoutes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/companies", companyRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/trucks", truckRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/settlements", settlementRoutes);

export default app;