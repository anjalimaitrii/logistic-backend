import { Router } from "express";
import { getRoutes, createRoute, updateRoute, deleteRoute, matchRoute } from "../controllers/routeController.js";

const router = Router();

router.get("/match",   matchRoute);
router.get("/",        getRoutes);
router.post("/",       createRoute);
router.patch("/:id",   updateRoute);
router.delete("/:id",  deleteRoute);

export default router;
