
import bcrypt from "bcrypt";
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

describe("Registration API", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("should reject an email that is already registered", async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: 1 }],
            rowCount: 1,
        } as any);

        const response = await request(app)
            .post("/auth/register")
            .send({
                name: "Test User",
                email: "existing@example.com",
                password: "Password123",
            });

        expect(response.status).toBe(409);
        expect(response.body.message).toBe("Email is already registered");
    });
    test("should reject an invalid email", async () => {
        const response = await request(app)
            .post("/auth/register")
            .send({
                name: "Test User",
                email: "invalid-email",
                password: "Password123",
            });

        expect(response.status).toBe(400);
        expect(response.body.message).toBe(
            "Please enter a valid email address"
        );

        expect(mockQuery).not.toHaveBeenCalled();
    });

    test("should reject a password shorter than 8 characters", async () => {
        const response = await request(app)
            .post("/auth/register")
            .send({
                name: "Test User",
                email: "newuser@example.com",
                password: "short",
            });

        expect(response.status).toBe(400);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test("should register a new user successfully", async () => {
        mockQuery
            .mockResolvedValueOnce({
                rows: [],
                rowCount: 0,
            } as any)
            .mockResolvedValueOnce({
                rows: [
                    {
                        id: 2,
                        name: "Test User",
                        email: "newuser@example.com",
                        created_at: new Date(),
                    },
                ],
                rowCount: 1,
            } as any);

        const response = await request(app)
            .post("/auth/register")
            .send({
                name: "Test User",
                email: "newuser@example.com",
                password: "Password123",
            });

        expect(response.status).toBe(201);
        expect(response.body.message).toBe("User registered successfully");
        expect(response.body.user.email).toBe("newuser@example.com");
        expect(response.body.user).not.toHaveProperty("password_hash");
    });

test("should reject an incorrect password", async () => {
  mockQuery.mockResolvedValueOnce({
    rows: [
      {
        id: 1,
        name: "Test User",
        email: "existing@example.com",
        password_hash: "$2b$12$fakeHashForTesting",
      },
    ],
    rowCount: 1,
  } as any);

  const response = await request(app)
    .post("/auth/login")
    .send({
      email: "existing@example.com",
      password: "WrongPassword123",
    });

  expect(response.status).toBe(401);
  expect(response.body.message).toBe("Invalid email or password");
});

test("should reject login when email and password are missing", async () => {
  const response = await request(app)
    .post("/auth/login")
    .send({});

  expect(response.status).toBe(400);
  expect(response.body.message).toBe("Email and Password required");
  expect(mockQuery).not.toHaveBeenCalled();
});

test("should reject login when the user does not exist", async () => {
  mockQuery.mockResolvedValueOnce({
    rows: [],
    rowCount: 0,
  } as any);

  const response = await request(app)
    .post("/auth/login")
    .send({
      email: "unknown@example.com",
      password: "Password123",
    });

  expect(response.status).toBe(401);
  expect(response.body.message).toBe("Invalid email or password");
  expect(response.body.token).toBeUndefined();
});

test("should log in successfully and return tokens", async () => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-secret-for-unit-tests";

  const compareSpy = jest
    .spyOn(bcrypt, "compare")
    .mockImplementation(async () => true);

  mockQuery.mockResolvedValueOnce({
    rows: [
      {
        id: 1,
        name: "Test User",
        email: "existing@example.com",
        password_hash: "mocked-password-hash",
      },
    ],
    rowCount: 1,
  } as any);

  try {
    const response = await request(app)
      .post("/auth/login")
      .send({
        email: "existing@example.com",
        password: "Password123",
      });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Login successful");
    expect(response.body.token).toBeDefined();
    expect(response.body.refreshToken).toBeDefined();
    expect(response.body.user.email).toBe("existing@example.com");
    expect(response.body.user).not.toHaveProperty("password_hash");
  } finally {
    compareSpy.mockRestore();

    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  }
});


test("should reject login when JWT_SECRET is missing", async () => {
  const originalSecret = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;

  mockQuery.mockResolvedValueOnce({
    rows: [
      {
        id: 1,
        name: "Test User",
        email: "existing@example.com",
        password_hash: "mocked-password-hash",
      },
    ],
    rowCount: 1,
  } as any);

  const compareSpy = jest
    .spyOn(bcrypt, "compare")
    .mockImplementation(async () => true);

  try {
    const response = await request(app)
      .post("/auth/login")
      .send({
        email: "existing@example.com",
        password: "Password123",
      });

    expect(response.status).toBe(500);
    expect(response.body.message).toBe(
      "Authentication is not configuered"
    );
  } finally {
    compareSpy.mockRestore();

    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  }
});

test("should reject a refresh request without a refresh token", async () => {
  const response = await request(app)
    .post("/auth/refresh")
    .send({});

  expect(response.status).toBe(401);
  expect(response.body.message).toBe("Refresh token is required");
});
test("should reject an invalid refresh token", async () => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-secret-for-unit-tests";

  try {
    const response = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: "not-a-valid-token" });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe(
      "Invalid or expired refresh token"
    );
  } finally {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  }
});
test("should issue a new access token for a valid refresh token", async () => {
  const originalSecret = process.env.JWT_SECRET;
  const secret = "test-secret-for-unit-tests";

  process.env.JWT_SECRET = secret;

  try {
    const refreshToken = jwt.sign(
      { userId: 1, type: "refresh" },
      secret,
      { expiresIn: "7d" }
    );

    const response = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe(
      "Access token refreshed successfully"
    );
    expect(response.body.token).toBeDefined();

    const decoded = jwt.verify(response.body.token, secret);

    expect(decoded).toMatchObject({ userId: 1 });
    expect(decoded).not.toHaveProperty("type", "refresh");
  } finally {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  }
});
test("should reject a token that is not a refresh token", async () => {
  const originalSecret = process.env.JWT_SECRET;
  const secret = "test-secret-for-unit-tests";

  process.env.JWT_SECRET = secret;

  try {
    const accessToken = jwt.sign(
      { userId: 1, type: "access" },
      secret,
      { expiresIn: "1h" }
    );

    const response = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: accessToken });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid refresh token");
  } finally {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  }
});
test("should return 500 when JWT_SECRET is missing", async () => {
  const originalSecret = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;

  try {
    const response = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: "any-token" });

    expect(response.status).toBe(500);
    expect(response.body.message).toBe(
      "Authentication is not configured"
    );
  } finally {
    if (originalSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalSecret;
    }
  }
});
});
