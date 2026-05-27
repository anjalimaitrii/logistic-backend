import express from "express";
import { getTollAccount, addRecharge } from "../controllers/tollController.js";

const router = express.Router();

router.get("/", getTollAccount);
router.post("/recharge", addRecharge);

export default router;
