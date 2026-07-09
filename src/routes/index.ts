import { Application } from "express";
import companyRoutes from "./companyRoutes.js";
import clientRoutes from "./clientRoutes.js";
import bookingRoutes from "./bookingRoutes.js";
import truckRoutes from "./truckRoutes.js";
import driverRoutes from "./driverRoutes.js";
import assignmentRoutes from "./assignmentRoutes.js";
import settlementRoutes from "./settlementRoutes.js";
import truckInspectionRoutes from "./truckInspectionRoutes.js";
import liveTrackingRoutes from "./liveTrackingRoutes.js";
import travelSummaryRoutes from "./travelSummaryRoutes.js";
import tollRoutes from "./tollRoutes.js";
import goodsTypeRoutes from "./goodsTypeRoutes.js";
import uploadRoutes from "./uploadRoutes.js";
import chatRoutes from "./chatRoutes.js";
import routeRoutes from "./routeRoutes.js";
import notificationRoutes from "./notificationRoutes.js";
import mileageRoutes from "./mileageRoutes.js";
import ledgerRoutes from "./ledgerRoutes.js";
import invoiceRoutes from "./invoiceRoutes.js";
import cashRoutes from "./cashRoutes.js";
import driverAppRoutes from "./driverAppRoutes.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export function registerRoutes(app: Application): void {
  // Shorthand guards
  const admin = [requireAuth, requireRole("admin")]; // must be logged in AND an admin
  const loggedIn = [requireAuth];                    // any logged-in user (admin or client)

  // ── Public (no login needed) ──────────────────────────────────────────────
  // clientRoutes guards its own admin-only endpoints inside; login/password are public.
  app.use("/api/clients", clientRoutes);
  // GPS data is fetched by the Next.js server-side proxy (no user token), so keep open.
  app.use("/api/livetrack", liveTrackingRoutes);
  app.use("/api/travel-summary", travelSummaryRoutes);
  app.use("/api/driver-app", driverAppRoutes);

  // ── Any logged-in user (admin or client) ──────────────────────────────────
  app.use("/api/bookings", loggedIn, bookingRoutes);
  app.use("/api/goods-types", loggedIn, goodsTypeRoutes);
  app.use("/api/routes", loggedIn, routeRoutes);
  app.use("/api/notifications", loggedIn, notificationRoutes);
  app.use("/api/chat", loggedIn, chatRoutes);
  app.use("/api/upload", loggedIn, uploadRoutes);

  // ── Admin only ────────────────────────────────────────────────────────────
  app.use("/api/companies", admin, companyRoutes);
  app.use("/api/trucks", admin, truckRoutes);
  app.use("/api/drivers", admin, driverRoutes);
  app.use("/api/assignments", admin, assignmentRoutes);
  app.use("/api/settlements", admin, settlementRoutes);
  app.use("/api/truck-inspections", admin, truckInspectionRoutes);
  app.use("/api/toll", admin, tollRoutes);
  app.use("/api/mileage", admin, mileageRoutes);
  app.use("/api/ledger", admin, ledgerRoutes);
  app.use("/api/invoices", admin, invoiceRoutes);
  app.use("/api/cash", admin, cashRoutes);
}
