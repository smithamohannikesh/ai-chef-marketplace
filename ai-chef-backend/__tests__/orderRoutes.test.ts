import jwt from "jsonwebtoken";
import request from "supertest";
import app from "../app";
import { pool } from "../db";

jest.mock("../db", () => ({
  pool: {
    query: jest.fn(),
  },
}));

const mockQuery = pool.query as jest.Mock;
const jwtSecret = () => process.env.JWT_SECRET!;

function accessToken(userId: number) {
  // Keep the existing access-token payload format: { userId }.
  return jwt.sign({ userId }, jwtSecret(), { expiresIn: "1h" });
}

function refreshToken(userId: number) {
  return jwt.sign({ userId, type: "refresh" }, jwtSecret(), {
    expiresIn: "7d",
  });
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("Order authorization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each([
    ["list", "get", "/orders"],
    ["detail", "get", "/orders/10"],
    ["create", "post", "/orders"],
    ["cancel", "patch", "/orders/10/status"],
  ] as const)("requires authentication for %s", async (_name, method, path) => {
    const response = await request(app)[method](path).send({ status: "cancelled" });

    expect(response.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("accepts the existing access-token payload", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get("/orders")
      .set(bearer(accessToken(101)));

    expect(response.status).toBe(200);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE user_id = $1"),
      [101]
    );
  });

  test("rejects a refresh token on a protected order route", async () => {
    const response = await request(app)
      .get("/orders")
      .set(bearer(refreshToken(101)));

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid authentication token");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("lists only the authenticated user's orders", async () => {
    const ownOrders = [{ id: 10, user_id: 101, status: "pending" }];
    mockQuery.mockResolvedValueOnce({ rows: ownOrders });

    const response = await request(app)
      .get("/orders")
      .set(bearer(accessToken(101)));

    expect(response.status).toBe(200);
    expect(response.body).toEqual(ownOrders);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE user_id = $1"),
      [101]
    );
  });

  test("returns an order to its owner", async () => {
    const ownOrder = { id: 10, user_id: 101, status: "pending" };
    mockQuery.mockResolvedValueOnce({ rows: [ownOrder] });

    const response = await request(app)
      .get("/orders/10")
      .set(bearer(accessToken(101)));

    expect(response.status).toBe(200);
    expect(response.body).toEqual(ownOrder);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("id = $1 AND user_id = $2"),
      [10, 101]
    );
  });

  test("hides another user's order from detail lookup", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .get("/orders/10")
      .set(bearer(accessToken(202)));

    expect(response.status).toBe(404);
    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [10, 202]);
  });

  test("creates an order using the authenticated user ID, not a client userId", async () => {
    const createdOrder = {
      id: 10,
      user_id: 101,
      customer_name: "Customer",
      total_amount: 25,
      status: "pending",
    };
    mockQuery.mockResolvedValueOnce({ rows: [createdOrder] });

    const response = await request(app)
      .post("/orders")
      .set(bearer(accessToken(101)))
      .send({
        userId: 202,
        customer_name: "Customer",
        total_amount: 25,
      });

    expect(response.status).toBe(201);
    expect(response.body.user_id).toBe(101);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO orders (user_id, customer_name, total_amount)"),
      [101, "Customer", 25]
    );
  });

  test("allows an owner to cancel a pending order atomically", async () => {
    const cancelledOrder = { id: 10, user_id: 101, status: "cancelled" };
    mockQuery.mockResolvedValueOnce({ rows: [cancelledOrder] });

    const response = await request(app)
      .patch("/orders/10/status")
      .set(bearer(accessToken(101)))
      .send({ status: "cancelled" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(cancelledOrder);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringMatching(/WHERE id = \$2 AND user_id = \$3 AND status = \$4/),
      ["cancelled", 10, 101, "pending"]
    );
  });

  test.each(["confirmed", "preparing", "completed", "cancelled"])(
    "rejects cancellation when the owner's order is %s",
    async (status) => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ status }] });

      const response = await request(app)
        .patch("/orders/10/status")
        .set(bearer(accessToken(101)))
        .send({ status: "cancelled" });

      expect(response.status).toBe(409);
      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("WHERE id = $1 AND user_id = $2"),
        [10, 101]
      );
    }
  );

  test("hides another user's order when they try to cancel it", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(app)
      .patch("/orders/10/status")
      .set(bearer(accessToken(202)))
      .send({ status: "cancelled" });

    expect(response.status).toBe(404);
    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("user_id = $3 AND status = $4"),
      ["cancelled", 10, 202, "pending"]
    );
  });

  test("rejects customer requests to set any status other than cancelled", async () => {
    const response = await request(app)
      .patch("/orders/10/status")
      .set(bearer(accessToken(101)))
      .send({ status: "completed" });

    expect(response.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("does not expose physical order deletion", async () => {
    const response = await request(app)
      .delete("/orders/10")
      .set(bearer(accessToken(101)));

    expect(response.status).toBe(404);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
