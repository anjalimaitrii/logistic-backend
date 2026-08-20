import { Router } from "express";
import { getGapsForBooking, claimGap, releaseGap } from "../controllers/tripGapController.js";

const router = Router();
router.get("/", getGapsForBooking);
router.post("/:id/claim", claimGap);
router.post("/:id/release", releaseGap);

export default router;
