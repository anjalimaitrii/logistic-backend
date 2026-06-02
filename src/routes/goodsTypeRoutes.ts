import { Router } from "express";
import { getAll, create, remove } from "../controllers/goodsTypeController.js";

const router = Router();

router.get("/", getAll);
router.post("/", create);
router.delete("/:id", remove);

export default router;
