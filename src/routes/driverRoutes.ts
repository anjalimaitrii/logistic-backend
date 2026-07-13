import express from "express";
import {
  createDriver,
  getDrivers,
  getDriverById,
  updateDriver,
  deleteDriver,
  registerDriverCredentials,
} from "../controllers/driverController.js";

const router = express.Router();

router.post("/", createDriver);
router.get("/", getDrivers);
router.get("/:id", getDriverById);
router.patch("/:id", updateDriver);
router.patch("/:id/credentials", registerDriverCredentials);
router.delete("/:id", deleteDriver);

export default router;
