import express from "express";
import { getCompanyLedger, getClientLedger, addCompanyPayment, addClientPayment, deletePayment } from "../controllers/ledgerController.js";

const router = express.Router();

router.get("/company/:companyId",                getCompanyLedger);
router.post("/company/:companyId/payment",       addCompanyPayment);
router.get("/client/:clientId",                  getClientLedger);
router.post("/client/:clientId/payment",         addClientPayment);
router.delete("/payment/:paymentId",             deletePayment);

export default router;
