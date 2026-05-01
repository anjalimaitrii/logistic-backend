import express from "express";
import { createClient, getClients, loginClient, updateClientPassword } from "../controllers/clientController.js";

const router = express.Router();

router.post("/", createClient);
router.post("/login", loginClient);
router.patch("/:id/password", updateClientPassword);
router.get("/", getClients);

export default router;
