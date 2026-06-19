import express from "express";
import { createClient, getClients, loginClient, loginAdmin, updateClientPassword, forgotPassword, verifyOTP, resetPassword } from "../controllers/clientController.js";

const router = express.Router();

router.post("/", createClient);
router.post("/login", loginClient);
router.post("/admin-login", loginAdmin);
router.patch("/:id/password", updateClientPassword);
router.get("/", getClients);
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyOTP);
router.post("/reset-password", resetPassword);

export default router;
