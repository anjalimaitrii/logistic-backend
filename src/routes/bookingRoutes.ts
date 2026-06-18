import express from "express";
import { createBooking, getBookings, getBookingById, updateBookingStatus, updateBooking, changeDropoffAddress, saveTripStats } from "../controllers/bookingController.js";

const router = express.Router();

router.post("/", createBooking);
router.get("/", getBookings);
router.get("/:id", getBookingById);
router.patch("/:id/status", updateBookingStatus);
router.patch("/:id/trip-stats", saveTripStats);
router.patch("/:id/address", changeDropoffAddress);
router.patch("/:id", updateBooking);

export default router;
