import { Router } from "express";
import { postChat } from "../controllers/aiChefV2Controller";
import { authenticateToken } from "../../routes/middleware/authMiddlewate";

const router = Router();

router.post("/chat", authenticateToken, postChat);

export default router;
