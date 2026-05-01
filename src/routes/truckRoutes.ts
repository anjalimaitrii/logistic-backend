import express from "express";
import {
  createTruck,
  getTrucks,
  getTruckById,
  updateTruck,
  deleteTruck,
} from "../controllers/truckController.js";

const router = express.Router();

router.post("/", createTruck);
router.get("/", getTrucks);
router.get("/:id", getTruckById);
router.patch("/:id", updateTruck);
router.delete("/:id", deleteTruck);

export default router;
