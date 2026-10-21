import { Router } from "express";
import { pool } from "../db";
import { authenticateToken, AuthRequest } from "./middleware/authMiddlewate";
const router=  Router();
//get all order
router.get("/",authenticateToken,async(req,res)=>{
    try{
        const result=await pool.query("SELECT  * FROM orders ORDER BY created_at DESC");
        return res.status(200).json(result.rows);

    }
     catch (error){
        console.error("Error fetching orders:",error);
        return res.status(500).json({message:"Failed to fetch orders"});
    }

});

router.post("/",authenticateToken, async (req:AuthRequest, res) => {
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
      `INSERT INTO orders (user_id,customer_name, total_amount)
       VALUES ($1, $2,$3)
       RETURNING *`,
      [userId,customer_name.trim(), total_amount]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating order:", error);

    return res.status(500).json({
      message: "Failed to create order",
    });
  }
});
//get a single order by id
router.get("/:id", async (req, res) => {
  try {
    const orderId = Number(req.params.id);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({
        message: "Invalid order ID",
      });
    }

    const result = await pool.query(
      "SELECT * FROM orders WHERE id = $1",
      [orderId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching order:", error);

    return res.status(500).json({
      message: "Failed to fetch order",
    });
  }
});
//change status of order
router.patch("/:id/status", async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const { status } = req.body;

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({
        message: "Invalid order ID",
      });
    }

    const allowedStatuses = [
      "pending",
      "confirmed",
      "preparing",
      "completed",
      "cancelled",
    ];

    if (
      typeof status !== "string" ||
      !allowedStatuses.includes(status)
    ) {
      return res.status(400).json({
        message: "Invalid order status",
        allowedStatuses,
      });
    }

    const result = await pool.query(
      `UPDATE orders
       SET status = $1
       WHERE id = $2
       RETURNING *`,
      [status, orderId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error updating order status:", error);

    return res.status(500).json({
      message: "Failed to update order status",
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const orderId = Number(req.params.id);

    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({
        message: "Invalid order ID",
      });
    }

    const result = await pool.query(
      "DELETE FROM orders WHERE id = $1 RETURNING *",
      [orderId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    return res.status(200).json({
      message: "Order deleted successfully",
      order: result.rows[0],
    });
  } catch (error) {
    console.error("Error deleting order:", error);

    return res.status(500).json({
      message: "Failed to delete order",
    });
  }
});

export default  router;