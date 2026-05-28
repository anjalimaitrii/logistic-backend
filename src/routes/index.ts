import { Application } from "express";
import companyRoutes from "./companyRoutes.js";
import clientRoutes from "./clientRoutes.js";
import bookingRoutes from "./bookingRoutes.js";
import truckRoutes from "./truckRoutes.js";
import driverRoutes from "./driverRoutes.js";
import assignmentRoutes from "./assignmentRoutes.js";
import settlementRoutes from "./settlementRoutes.js";
import collectionRoutes from "./collectionRoutes.js";
import truckInspectionRoutes from "./truckInspectionRoutes.js";
import liveTrackingRoutes from "./liveTrackingRoutes.js";
import travelSummaryRoutes from "./travelSummaryRoutes.js";
import tollRoutes from "./tollRoutes.js";

export function registerRoutes(app: Application): void {
  app.use("/api/companies", companyRoutes);
  app.use("/api/clients", clientRoutes);
  app.use("/api/bookings", bookingRoutes);
  app.use("/api/trucks", truckRoutes);
  app.use("/api/drivers", driverRoutes);
  app.use("/api/assignments", assignmentRoutes);
  app.use("/api/settlements", settlementRoutes);
  app.use("/api/collections", collectionRoutes);
  app.use("/api/truck-inspections", truckInspectionRoutes);
  app.use("/api/livetrack", liveTrackingRoutes);
  app.use("/api/travel-summary", travelSummaryRoutes);
  app.use("/api/toll", tollRoutes);
}
