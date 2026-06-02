import { Router } from "express";
import multer from "multer";
import { uploadFiles } from "../controllers/uploadController.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10 MB limit

router.post("/", upload.array("files", 10), uploadFiles);

export default router;
