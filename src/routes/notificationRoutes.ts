import { Router } from "express";
import { getAll, create, markAllRead, clearAll } from "../controllers/notificationController.js";

const router = Router();

router.get("/",          getAll);
router.post("/",         create);
router.patch("/read",    markAllRead);
router.delete("/",       clearAll);

export default router;
