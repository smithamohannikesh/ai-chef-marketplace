import "dotenv/config";
import "./config";
import { createServer } from "node:http";
import { pool } from "./db";
import app from "./app";
import { broadcastChefUpdate, initializeSocket } from "./socket";

const server = createServer(app);
const io = initializeSocket(server);

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);
  broadcastChefUpdate();

  socket.on("disconnect", () => {
    console.log("A user disconnected:", socket.id);
  });
});

server.listen(3000, () => {
  console.log("Server is running on port 3000");
});

let isShuttingDown = false;

process.on("SIGINT", () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log("Shutting down server...");

  server.close(async () => {
    try {
      await pool.end();
      console.log("Database connections closed.");
      process.exit(0);
    } catch (error) {
      console.error("Error closing database connections:", error);
      process.exit(1);
    }
  });
});
