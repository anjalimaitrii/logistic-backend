import { Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";

const LOG_DIR = path.resolve("logs");
const LOG_FILE = path.join(LOG_DIR, "error.log");

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function formatEntry(req: Request, err: any): string {
  const timestamp = new Date().toISOString();
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  const stack = err.stack || "";

  return (
    `[${timestamp}] ${status} ${req.method} ${req.originalUrl}\n` +
    `Message : ${message}\n` +
    `Stack   : ${stack}\n` +
    `${"─".repeat(80)}\n`
  );
}

export function errorLogger(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const entry = formatEntry(req, err);

  // Console
  console.error(entry);

  // File
  fs.appendFile(LOG_FILE, entry, (fsErr) => {
    if (fsErr) console.error("Failed to write error log:", fsErr.message);
  });

  const status = err.status || err.statusCode || 500;
  if (!res.headersSent) {
    res.status(status).json({
      message: err.message || "Internal Server Error",
    });
  }
}
