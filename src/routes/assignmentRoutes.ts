import express from "express";
import {
  createAssignment,
  getAssignments,
  getAssignmentByBookingId,
  updateAssignment,
  getAssignmentsByTruck,
  getAssignmentsByDriver
} from "../controllers/assignmentController.js";

const router = express.Router();

router.post("/", createAssignment);
router.get("/", getAssignments);
router.get("/booking/:bookingId", getAssignmentByBookingId);
router.patch("/booking/:bookingId", updateAssignment);
router.get("/truck/:truckId", getAssignmentsByTruck);
router.get("/driver/:driverId", getAssignmentsByDriver);

export default router;
