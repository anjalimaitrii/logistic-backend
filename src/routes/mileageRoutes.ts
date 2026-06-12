import { Router } from "express";
import { getMileage, saveMileage } from "../controllers/mileageController.js";

const router = Router();
router.get("/",  getMileage);
router.post("/", saveMileage);

export default router;
