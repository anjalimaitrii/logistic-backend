import { Router } from "express";
import { getCash } from "../controllers/completionRecordsController.js";

const router = Router();

router.get("/", getCash);

export default router;
