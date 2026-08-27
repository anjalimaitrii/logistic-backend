import express from "express";
import { createClient, getClients, loginClient, loginAdmin, updateClientPassword, forgotPassword, verifyOTP, resetPassword, getClientUsage, deleteClient } from "../controllers/clientController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

// Public — login & password recovery (no token yet at these points)
router.post("/login", loginClient);
router.post("/admin-login", loginAdmin);
router.patch("/:id/password", updateClientPassword);
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyOTP);
router.post("/reset-password", resetPassword);

// Any logged-in user — getClients scopes clients to their own company internally
router.get("/", requireAuth, getClients);
// Admin only — creating and removing client accounts
router.post("/", requireAuth, requireRole("admin"), createClient);
// What a delete would detach, so the confirmation can name it.
router.get("/:id/usage", requireAuth, requireRole("admin"), getClientUsage);
router.delete("/:id", requireAuth, requireRole("admin"), deleteClient);

export default router;
