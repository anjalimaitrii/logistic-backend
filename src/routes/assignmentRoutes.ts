import express from "express";
import {
  createAssignment,
  getAssignments,
  getAssignmentByBookingId,
  updateAssignment,
  getAssignmentsByTruck,
  getAssignmentsByDriver,
  promoteNextTrip,
  markTruckInspected,
  getPendingInspections,
  getReturningDrivers
} from "../controllers/assignmentController.js";

const router = express.Router();

router.post("/", createAssignment);
router.get("/", getAssignments);
router.get("/returning-drivers", getReturningDrivers);
router.get("/booking/:bookingId", getAssignmentByBookingId);
router.patch("/booking/:bookingId", updateAssignment);
router.get("/truck/:truckId", getAssignmentsByTruck);
router.get("/driver/:driverId", getAssignmentsByDriver);
router.post("/driver/:driverId/promote-next", promoteNextTrip);
router.get("/truck/:truckNumber/pending-inspections", getPendingInspections);
router.patch("/driver/:driverId/mark-inspected", markTruckInspected);

export default router;
