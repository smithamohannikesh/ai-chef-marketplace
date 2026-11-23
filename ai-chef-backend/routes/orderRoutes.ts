import { Router } from "express";
import { pool } from "../db";
import { authenticateToken, AuthRequest } from "./middleware/authMiddlewate";

const router = Router();

router.get("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ message: "Authenticated user not found" });
    }

    const result = await pool.query(
      "SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching orders:", error);
    return res.status(500).json({ message: "Failed to fetch orders" });
  }
});

router.post("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { customer_name, total_amount } = req.body;
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({
        message: "Authenticated user not found",
      });
    }

    if (
      typeof customer_name !== "string" ||
      customer_name.trim() === "" ||
      total_amount === undefined ||
      total_amount === null ||
      typeof total_amount !== "number" ||
      !Number.isFinite(total_amount) ||
      total_amount < 0
    ) {
      return res.status(400).json({
        message: "Valid customer_name and total_amount are required",
      });
    }

    const result = await pool.query(
      `INSERT INTO orders (user_id, customer_name, total_amount)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, customer_name.trim(), total_amount]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating order:", error);
    return res.status(500).json({ message: "Failed to create order" });
  }
});

router.get("/:id", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const orderId = Number(req.params.id);
    const userId = req.userId;

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ message: "Invalid order ID" });
    }
    if (!userId) {
      return res.status(401).json({ message: "Authenticated user not found" });
    }

    const result = await pool.query(
      "SELECT * FROM orders WHERE id = $1 AND user_id = $2",
      [orderId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Order not found" });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching order:", error);
    return res.status(500).json({ message: "Failed to fetch order" });
  }
});

router.patch("/:id/status", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const orderId = Number(req.params.id);
    const userId = req.userId;

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ message: "Invalid order ID" });
    }
    if (!userId) {
      return res.status(401).json({ message: "Authenticated user not found" });
    }
    if (req.body?.status !== "cancelled") {
      return res.status(400).json({
        message: "Customers may only cancel orders",
      });
    }

    // The status predicate makes cancellation atomic with respect to other updates.
    const result = await pool.query(
      `UPDATE orders
       SET status = $1
       WHERE id = $2 AND user_id = $3 AND status = $4
       RETURNING *`,
      ["cancelled", orderId, userId, "pending"]
    );

    if (result.rows.length > 0) {
      return res.status(200).json(result.rows[0]);
    }

    // Only query status for an order owned by this user; hide other users' orders.
    const existingOrder = await pool.query(
      "SELECT status FROM orders WHERE id = $1 AND user_id = $2",
      [orderId, userId]
    );

    if (existingOrder.rows.length === 0) {
      return res.status(404).json({ message: "Order not found" });
    }

    return res.status(409).json({
      message: "Only pending orders can be cancelled",
    });
  } catch (error) {
    console.error("Error cancelling order:", error);
    return res.status(500).json({ message: "Failed to cancel order" });
  }
});

export default router;
