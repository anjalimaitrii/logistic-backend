import express from "express";
import { createBooking, getBookings, getBookingById, updateBookingStatus } from "../controllers/bookingController.js";

const router = express.Router();

router.post("/", createBooking);
router.get("/", getBookings);
router.get("/:id", getBookingById);
router.patch("/:id/status", updateBookingStatus);

export default router;
