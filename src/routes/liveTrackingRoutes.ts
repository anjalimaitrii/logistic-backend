import express from "express";
import { getLiveVehicles } from "../controllers/liveTrackingController.js";

const router = express.Router();

router.get("/", getLiveVehicles);

export default router;
