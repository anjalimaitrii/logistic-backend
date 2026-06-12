import express from "express";
import {
  createTruck,
  getTrucks,
  getTruckById,
  updateTruck,
  deleteTruck,
  addTruckCollection,
  removeTruckCollection,
  renewTruckCollection,
} from "../controllers/truckController.js";

const router = express.Router();

router.post("/", createTruck);
router.get("/", getTrucks);
router.get("/:id", getTruckById);
router.patch("/:id", updateTruck);
router.delete("/:id", deleteTruck);
router.post("/:id/collections", addTruckCollection);
router.patch("/:id/collections/:colId/renew", renewTruckCollection);
router.delete("/:id/collections/:colId", removeTruckCollection);

export default router;
