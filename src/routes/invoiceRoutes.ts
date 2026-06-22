import { Router } from "express";
import { getInvoices } from "../controllers/completionRecordsController.js";

const router = Router();

router.get("/", getInvoices);

export default router;
