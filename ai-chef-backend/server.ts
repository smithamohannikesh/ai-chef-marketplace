import cors from "cors";
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import { createServer } from "node:http";
import "./config";
import { pool } from "./db";
import aiRoutes from "./routes/aiRoutes";
import authRoutes from "./routes/authRoutes";
import chefRoutes from "./routes/chefRoutes";
import orderRoutes from "./routes/orderRoutes";
import { broadcastChefUpdate, initializeSocket } from "./socket";
const app = express();
app.use(helmet());
app.use(express.json({ limit: "10kb" }));
app.use(cors());
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "AI Chef Marketplace backend is running",
  });
});

app.get("/health/db", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    return res.status(200).json({
      status: "ok",
      database: "connected",
    });
  } catch (error) {
    console.error("Database health check failed:", error);

    return res.status(503).json({
      status: "error",
      database: "disconnected",
    });
  }
});

app.use("/chefs", chefRoutes);
app.use("/orders",orderRoutes);
app.use("/auth",authRoutes);
app.use("/ai",aiRoutes)
const server = createServer(app);

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.type === "entity.too.large") {
    return res.status(413).json({
      message: "Request body is too large. Maximum size is 10 KB.",
    });
  }

  return res.status(500).json({
    message: "Internal server error",
  });
});

// const io = new Server(server, {
//     cors: {
//         origin: "*"
//     }
// })
const io=initializeSocket(server);

io.on("connection", (socket) => {

    console.log("A user connected:", socket.id);
    broadcastChefUpdate();
    // socket.emit("chefUpdate",{
    //     message:"Welcome! Real-time chef updates are working!"
    // });
    socket.on("disconnect", () => {
        console.log("A user disconnected:", socket.id);
    })
});



server.listen(3000, () => {
    console.log("Server is running on port 3000");
})



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