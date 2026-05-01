import express from "express";
import { 
  createOrUpdateSettlement, 
  getSettlementByBookingId, 
  getAllSettlements 
} from "../controllers/settlementController.js";

const router = express.Router();

router.post("/", createOrUpdateSettlement);
router.get("/", getAllSettlements);
router.get("/booking/:bookingId", getSettlementByBookingId);

export default router;
