import express from "express";
import {
  createInspection,
  getAllInspections,
  getInspectionsByTruck,
  getInspectionsByDriver
} from "../controllers/truckInspectionController.js";

const router = express.Router();

router.post("/", createInspection);
router.get("/", getAllInspections);
router.get("/truck/:truckId", getInspectionsByTruck);
router.get("/driver/:driverId", getInspectionsByDriver);

export default router;
