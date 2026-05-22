import express from "express";
import { createClient, getClients, loginClient, updateClientPassword, forgotPassword, verifyOTP, resetPassword } from "../controllers/clientController.js";

const router = express.Router();

router.post("/", createClient);
router.post("/login", loginClient);
router.patch("/:id/password", updateClientPassword);
router.get("/", getClients);
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyOTP);
router.post("/reset-password", resetPassword);

export default router;
