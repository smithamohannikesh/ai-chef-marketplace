import jwt from "jsonwebtoken";
import request from "supertest";
import app from "../app";

const mockFetch = jest.fn();

function authHeader() {
  const token = jwt.sign(
    { userId: 1 },
    process.env.JWT_SECRET!,
    { expiresIn: "1h" }
  );

  return { Authorization: `Bearer ${token}` };
}

function ollamaResponse(responseText: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue({ response: responseText }),
  } as unknown as Response;
}

describe("POST /ai/suggest", () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    fetchSpy = jest.spyOn(global, "fetch").mockImplementation(mockFetch);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test("requires a valid access token", async () => {
    const response = await request(app)
      .post("/ai/suggest")
      .send({ ingredients: "chicken" });

    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/Authentication token is required/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("rejects missing, blank, and oversized ingredients without calling Ollama", async () => {
    const missing = await request(app)
      .post("/ai/suggest")
      .set(authHeader())
      .send({});
    const blank = await request(app)
      .post("/ai/suggest")
      .set(authHeader())
      .send({ ingredients: "   " });
    const oversized = await request(app)
      .post("/ai/suggest")
      .set(authHeader())
      .send({ ingredients: "x".repeat(501) });

    expect(missing.status).toBe(400);
    expect(blank.status).toBe(400);
    expect(oversized.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("sends ingredients to the configured Ollama model and returns its text", async () => {
    mockFetch.mockResolvedValueOnce(
      ollamaResponse("Chicken soup — a warming dish.")
    );

    const response = await request(app)
      .post("/ai/suggest")
      .set(authHeader())
      .send({ ingredients: "  chicken, onion  " });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      suggestions: "Chicken soup — a warming dish.",
    });

    const [url, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(url).toBe(`${process.env.OLLAMA_URL}/api/generate`);
    expect(body.model).toBe(process.env.OLLAMA_MODEL);
    expect(body.prompt).toContain("chicken, onion");
    expect(body.stream).toBe(false);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal.aborted).toBe(false);
  });

  test("returns a gateway error when Ollama responds unsuccessfully", async () => {
    mockFetch.mockResolvedValueOnce(ollamaResponse("", 503));
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await request(app)
        .post("/ai/suggest")
        .set(authHeader())
        .send({ ingredients: "chicken" });

      expect(response.status).toBe(502);
      expect(response.body).toEqual({
        message: "The AI service could not generate suggestions",
      });
    } finally {
      consoleError.mockRestore();
    }
  });

  test("returns a safe gateway error when Ollama cannot be reached", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Ollama unavailable"));
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await request(app)
        .post("/ai/suggest")
        .set(authHeader())
        .send({ ingredients: "chicken" });

      expect(response.status).toBe(502);
      expect(response.body.message).toContain(
        "Could not connect to the local AI service"
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  test("limits a client to ten AI requests per fifteen minutes", async () => {
    const previousTrustProxy = app.get("trust proxy");
    app.set("trust proxy", 1);
    mockFetch.mockResolvedValue(ollamaResponse("Suggestions"));

    try {
      const responses = [];
      for (let index = 0; index < 11; index += 1) {
        responses.push(
          await request(app)
            .post("/ai/suggest")
            .set(authHeader())
            .set("X-Forwarded-For", "198.51.100.27")
            .send({ ingredients: "chicken" })
        );
      }

      expect(responses.slice(0, 10).every((response) => response.status === 200)).toBe(
        true
      );
      expect(responses[10].status).toBe(429);
      expect(responses[10].body.message).toContain("Too many AI request");
      expect(mockFetch).toHaveBeenCalledTimes(10);
    } finally {
      app.set("trust proxy", previousTrustProxy);
    }
  });
});
