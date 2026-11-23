import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pool } from "./db";
import aiRoutes from "./routes/aiRoutes";
import authRoutes from "./routes/authRoutes";
import chefRoutes from "./routes/chefRoutes";
import foodRoutes from "./routes/foodRoutes";
import mediaRoutes from "./routes/mediaRoutes";
import orderRoutes from "./routes/orderRoutes";

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

app.use("/auth", authRoutes);
app.use("/ai", aiRoutes);
app.use("/foods", foodRoutes);
app.use("/media", mediaRoutes);

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
app.use("/orders", orderRoutes);

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

export default app;
