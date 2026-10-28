
import cors from "cors";
import express from "express";
import helmet from "helmet";
import authRoutes from "./routes/authRoutes";
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
export default app;
