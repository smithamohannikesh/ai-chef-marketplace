
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  userId?: number;
}

export class AuthenticationConfigurationError extends Error {
  constructor() {
    super("Authentication is not configured");
    this.name = "AuthenticationConfigurationError";
  }
}

export class InvalidAccessTokenError extends Error {
  constructor() {
    super("Invalid authentication token");
    this.name = "InvalidAccessTokenError";
  }
}

/** Verify the same access-token format used by protected HTTP routes. */
export function verifyAccessToken(token: unknown): number {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new AuthenticationConfigurationError();
  }

  if (typeof token !== "string" || !token) {
    throw new InvalidAccessTokenError();
  }

  const decoded = jwt.verify(token, secret);

  if (
    typeof decoded === "string" ||
    typeof decoded.userId !== "number" ||
    decoded.type === "refresh"
  ) {
    throw new InvalidAccessTokenError();
  }

  return decoded.userId;
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

  try {
    req.userId = verifyAccessToken(authHeader.split(" ")[1]);
    return next();
  } catch (error) {
    if (error instanceof AuthenticationConfigurationError) {
      console.error("JWT_SECRET is not configured");
      return res.status(500).json({
        message: "Authentication is not configured",
      });
    }

    if (error instanceof InvalidAccessTokenError) {
      return res.status(401).json({
        message: "Invalid authentication token",
      });
    }

    return res.status(401).json({
      message: "Invalid or expired authentication token",
    });
  }
}
