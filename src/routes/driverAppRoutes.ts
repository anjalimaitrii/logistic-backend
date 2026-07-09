import { Router } from "express";
import {
  loginDriver,
  getDriverMe,
  getDriverTrips,
  updateDriverTripStatus
} from "../controllers/driverAppController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Public route
router.post("/login", loginDriver);

// Authenticated routes
router.get("/me", requireAuth, getDriverMe);
router.get("/trips", requireAuth, getDriverTrips);
router.patch("/trips/:bookingId/status", requireAuth, updateDriverTripStatus);

export default router;
