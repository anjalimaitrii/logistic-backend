import { Router } from "express";
import { getTravelSummary } from "../controllers/travelSummaryController.js";

const router = Router();
router.post("/", getTravelSummary);
export default router;
