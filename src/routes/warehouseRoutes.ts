import { Router } from "express";
import { getWarehouse, saveWarehouse } from "../controllers/warehouseController.js";

const router = Router();
router.get("/",  getWarehouse);
router.post("/", saveWarehouse);

export default router;
