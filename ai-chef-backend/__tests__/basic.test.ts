
import request from "supertest";
import app from "../app";

describe("Health API", () => {
  test("GET /health should return 200 and a success message", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.message).toBe(
      "AI Chef Marketplace backend is running"
    );
  });
  test("POST /auth/register should reject missing fields", async () => {
  const response = await request(app)
    .post("/auth/register")
    .send({});

  expect(response.status).toBe(400);
});
});
