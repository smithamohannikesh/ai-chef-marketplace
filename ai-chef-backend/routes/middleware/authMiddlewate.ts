
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  userId?: number;
}

export function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Authentication token is required",
    });
  }

  const token = authHeader.split(" ")[1];
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    console.error("JWT_SECRET is not configured");
    return res.status(500).json({
      message: "Authentication is not configured",
    });
  }

  try {
    const decoded = jwt.verify(token, secret);

    if (
      typeof decoded === "string" ||
      typeof decoded.userId !== "number"
    ) {
      return res.status(401).json({
        message: "Invalid authentication token",
      });
    }

    req.userId = decoded.userId;
    return next();
  } catch {
    return res.status(401).json({
      message: "Invalid or expired authentication token",
    });
  }
}
