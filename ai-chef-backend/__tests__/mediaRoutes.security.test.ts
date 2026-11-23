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

function accessToken() {
  return jwt.sign({ userId: 31 }, process.env.JWT_SECRET!, {
    expiresIn: "1h",
  });
}

describe("Media upload authentication", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("rejects an unauthenticated upload before running upload middleware", async () => {
    const response = await request(app).post("/media/upload").send({});

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Authentication token is required");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("allows an authenticated request to reach the upload handler", async () => {
    const response = await request(app)
      .post("/media/upload")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("No image uploaded");
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
