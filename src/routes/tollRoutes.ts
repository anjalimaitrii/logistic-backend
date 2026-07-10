import express from "express";
import multer from "multer";
import {
  getTollAccount,
  addRecharge,
  uploadTollSheet,
  getTollEntries,
  getTollForBooking,
} from "../controllers/tollController.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get("/", getTollAccount);
router.post("/recharge", addRecharge);
router.post("/upload", upload.single("file"), uploadTollSheet);
router.get("/entries", getTollEntries);
router.get("/booking/:bookingId", getTollForBooking);

export default router;
