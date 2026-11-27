import jwt from "jsonwebtoken";
import request from "supertest";
import app from "../app";
import {
  AiToolCallingServiceError,
  runAiToolCallingConversation,
} from "../aiChefV2/services/aiToolCallingService";

jest.mock("../aiChefV2/services/aiToolCallingService", () => {
  const actual = jest.requireActual("../aiChefV2/services/aiToolCallingService");
  return { ...actual, runAiToolCallingConversation: jest.fn() };
});

const mockRunConversation = runAiToolCallingConversation as jest.Mock;
let infoSpy: jest.SpyInstance;

function readAiChefLogs(): Array<Record<string, unknown>> {
  return infoSpy.mock.calls
    .map(([entry]) => JSON.parse(String(entry)) as Record<string, unknown>)
    .filter((entry) => entry.component === "ai-chef-v2");
}

function authHeader() {
  const token = jwt.sign({ userId: 1 }, process.env.JWT_SECRET!, {
    expiresIn: "1h",
  });
  return { Authorization: `Bearer ${token}` };
}

describe("POST /ai-chef-v2/chat", () => {
  beforeEach(() => {
    mockRunConversation.mockReset();
    infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  test("requires a valid access token", async () => {
    const response = await request(app)
      .post("/ai-chef-v2/chat")
      .send({ message: "Find chicken biryani" });

    expect(response.status).toBe(401);
    expect(mockRunConversation).not.toHaveBeenCalled();
  });

  test("returns the answer from the V2 service", async () => {
    const serviceResponse = {
      answer: "Here are some options.",
      foodRecords: [],
      searchStatus: "complete",
      responseSource: "ollama",
    };
    mockRunConversation.mockResolvedValue(serviceResponse);

    const response = await request(app)
      .post("/ai-chef-v2/chat")
      .set("x-request-id", "route-test-123")
      .set(authHeader())
      .send({ message: "  Find chicken biryani  " });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(serviceResponse);
    expect(mockRunConversation).toHaveBeenCalledWith("Find chicken biryani");
    expect(readAiChefLogs()).toContainEqual(expect.objectContaining({
      event: "request_received",
      requestId: "route-test-123",
      messageLength: "  Find chicken biryani  ".length,
      timestamp: expect.any(String),
    }));
    expect(readAiChefLogs()).toContainEqual(expect.objectContaining({
      event: "controller_validation_passed",
      messageLength: "Find chicken biryani".length,
    }));
    expect(readAiChefLogs()).toContainEqual(expect.objectContaining({
      event: "api_response",
      requestId: "route-test-123",
      httpStatus: 200,
      outcome: "success",
      durationMs: expect.any(Number),
    }));
    expect(readAiChefLogs().every((entry) => entry.requestId === "route-test-123")).toBe(true);
  });

  test.each([
    {},
    { message: "   " },
    { message: 123 },
    { message: "x".repeat(2_001) },
    { message: "Find food", toolName: "searchFoods" },
    { message: "Find food", sql: "SELECT * FROM foods" },
  ])("rejects unsupported or invalid request bodies %j", async (body) => {
    const response = await request(app)
      .post("/ai-chef-v2/chat")
      .set(authHeader())
      .send(body);

    expect(response.status).toBe(400);
    expect(mockRunConversation).not.toHaveBeenCalled();
  });

  test("maps service failures to safe HTTP errors", async () => {
    mockRunConversation.mockRejectedValue(
      new AiToolCallingServiceError(
        "The AI service is unavailable or timed out.",
        "OLLAMA_UNAVAILABLE",
        {
          answer: "I couldn't complete a marketplace search.",
          foodRecords: [],
          searchStatus: "unavailable",
          responseSource: "fallback",
        }
      )
    );

    const response = await request(app)
      .post("/ai-chef-v2/chat")
      .set(authHeader())
      .send({ message: "Find chicken biryani" });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      answer: "I couldn't complete a marketplace search.",
      foodRecords: [],
      searchStatus: "unavailable",
      responseSource: "fallback",
    });
  });

  test("does not expose unexpected internal errors", async () => {
    mockRunConversation.mockRejectedValue(new Error("private internal detail"));

    const response = await request(app)
      .post("/ai-chef-v2/chat")
      .set(authHeader())
      .send({ message: "Find chicken biryani" });

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain("private internal detail");
  });
});
