import express from "express";
import { createBooking, getBookings, getBookingById, updateBookingStatus, updateBooking, changeDropoffAddress, saveTripStats, cancelBooking } from "../controllers/bookingController.js";
import { requireRole } from "../middleware/auth.js";

const router = express.Router();

// requireAuth is already applied to /api/bookings in routes/index.ts.
// Client-accessible (scoped inside the controllers):
router.post("/", createBooking);            // client books under own account
router.get("/", getBookings);               // client sees only their company's bookings
router.get("/:id", getBookingById);
router.delete("/:id", cancelBooking);       // cancel = hard delete (client: own + not started)

// Admin-only operations:
router.patch("/:id/status", requireRole("admin"), updateBookingStatus);  // trip progression
router.patch("/:id/trip-stats", requireRole("admin"), saveTripStats);
router.patch("/:id/address", requireRole("admin"), changeDropoffAddress);
router.patch("/:id", requireRole("admin"), updateBooking);

export default router;
