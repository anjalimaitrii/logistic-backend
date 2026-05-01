import express from "express";
import {
  createAssignment,
  getAssignments,
  getAssignmentByBookingId,
  updateAssignment
} from "../controllers/assignmentController.js";

const router = express.Router();

router.post("/", createAssignment);
router.get("/", getAssignments);
router.get("/booking/:bookingId", getAssignmentByBookingId);
router.patch("/booking/:bookingId", updateAssignment);

export default router;
