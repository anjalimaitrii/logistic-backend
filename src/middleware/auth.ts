import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// req.user is filled in by requireAuth after verifying the login token
export interface AuthedRequest extends Request {
  user?: { id?: string; role?: string; email?: string; company?: string };
}

// "Who are you?" — must present a valid login token (issued at login).
export const requireAuth = (req: AuthedRequest, res: Response, next: NextFunction): void => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ message: "Not authenticated. Please log in." });
    return;
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "fallback_secret") as any;
    req.user = { id: decoded.id, role: decoded.role, email: decoded.email, company: decoded.company };
    next();
  } catch {
    res.status(401).json({ message: "Session expired or invalid. Please log in again." });
    return;
  }
};

// "Are you allowed to do THIS?" — your token's role must be in the allowed list.
export const requireRole = (...roles: string[]) =>
  (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role || "")) {
      res.status(403).json({ message: "Forbidden — you don't have permission for this action." });
      return;
    }
    next();
  };
