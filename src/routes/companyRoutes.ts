import express from "express";
import { createCompany, getCompanies, addClientsToCompany } from "../controllers/companyController.js";

const router = express.Router();

router.post("/", createCompany);
router.get("/", getCompanies);
router.post("/:id/clients", addClientsToCompany);

export default router;
