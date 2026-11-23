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
const secret = () => process.env.JWT_SECRET!;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

function accessToken() {
  return jwt.sign({ userId: 21 }, secret(), { expiresIn: "1h" });
}

function refreshToken() {
  return jwt.sign({ userId: 21, type: "refresh" }, secret(), {
    expiresIn: "7d",
  });
}

describe("Chef mutation authentication", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each([
    ["create", "post", "/chefs"],
    ["replace", "put", "/chefs/chef-1"],
    ["partially update", "patch", "/chefs/chef-1"],
    ["delete", "delete", "/chefs/chef-1"],
  ] as const)("requires authentication to %s a chef", async (_name, method, path) => {
    const response = await request(app)[method](path).send({});

    expect(response.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test.each(["invalid", "refresh"])("rejects a %s token for chef changes", async (kind) => {
    const token = kind === "refresh" ? refreshToken() : "not-a-jwt";
    const response = await request(app)
      .patch("/chefs/chef-1")
      .set(bearer(token))
      .send({ name: "Updated chef" });

    expect(response.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("allows a valid access token to update a chef", async () => {
    const chef = { id: "chef-1", name: "Updated chef", specialty: "Pasta" };
    mockQuery.mockResolvedValueOnce({ rows: [chef] });

    const response = await request(app)
      .put("/chefs/chef-1")
      .set(bearer(accessToken()))
      .send({ name: "Updated chef", specialty: "Pasta" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(chef);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
