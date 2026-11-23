import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { pool } from "./db";
import { verifyAccessToken } from "./routes/middleware/authMiddlewate";

let io: Server;

const DEFAULT_SOCKET_CORS_ORIGINS = [
  "http://localhost:8081",
  "http://127.0.0.1:8081",
];

function getSocketCorsOrigins(): string[] {
  const configuredOrigins = process.env.SOCKET_CORS_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configuredOrigins?.length
    ? configuredOrigins
    : DEFAULT_SOCKET_CORS_ORIGINS;
}

export function initializeSocket(server: HttpServer) {
  io = new Server(server, {
    cors: {
      origin: getSocketCorsOrigins(),
    },
  });

  io.use((socket, next) => {
    try {
      socket.data.userId = verifyAccessToken(socket.handshake.auth?.token);
      return next();
    } catch {
      return next(new Error("Unauthorized"));
    }
  });

  return io;
}

export async function broadcastChefUpdate() {
  if (!io) return;

  const result = await pool.query("SELECT * FROM chefs");
  io.emit("chefUpdate", result.rows);
}
