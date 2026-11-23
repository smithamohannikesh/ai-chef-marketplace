import jwt from "jsonwebtoken";
import request from "supertest";
import app from "../app";
import { pool } from "../db";
import { generateFoodEmbedding } from "../services/foodEmbeddingService";
import {
  createFoodSearchService,
  FoodSearchServiceError,
} from "../services/foodSearchService";

jest.mock("../db", () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock("../services/foodEmbeddingService", () => ({
  generateFoodEmbedding: jest.fn(),
}));

jest.mock("../services/foodSearchService", () => {
  const actual = jest.requireActual("../services/foodSearchService");
  return {
    ...actual,
    createFoodSearchService: jest.fn(() => ({
      startSearch: jest.fn(),
      getPage: jest.fn(),
    })),
  };
});

const mockQuery = pool.query as jest.Mock;
const mockGenerateFoodEmbedding = generateFoodEmbedding as jest.Mock;
const mockFoodSearchService = (createFoodSearchService as jest.Mock).mock
  .results[0].value;
const mockStartSearch = mockFoodSearchService.startSearch as jest.Mock;
const mockGetPage = mockFoodSearchService.getPage as jest.Mock;

function authHeader() {
  const token = jwt.sign(
    { userId: 1 },
    process.env.JWT_SECRET!,
    { expiresIn: "1h" }
  );

  return { Authorization: `Bearer ${token}` };
}

describe("GET /foods", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns available foods with their chef names", async () => {
    const foods = [
      {
        id: 1,
        chef_id: "chef2",
        chef_name: "Chef smiupdated",
        name: "Chicken noodles",
        description: "Rich Italian flavors",
        price: "20.00",
        image_key: "food1",
        is_available: true,
      },
    ];
    mockQuery.mockResolvedValueOnce({ rows: foods });

    const response = await request(app).get("/foods").set(authHeader());

    expect(response.status).toBe(200);
    expect(response.body).toEqual(foods);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("JOIN public.chefs AS chefs ON chefs.id = foods.chef_id"),
      [true]
    );
    expect(mockQuery.mock.calls[0][0]).toContain("WHERE foods.is_available = $1");
  });

  test("returns 500 when the database query fails", async () => {
    const databaseError = new Error("database unavailable");
    mockQuery.mockRejectedValueOnce(databaseError);
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await request(app).get("/foods").set(authHeader());

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ message: "Internal server error" });
      expect(consoleError).toHaveBeenCalledWith(
        "Error fetching foods:",
        databaseError
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  test("requires authentication", async () => {
    const response = await request(app).get("/foods");

    expect(response.status).toBe(401);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("POST /foods", () => {
  const validFoodBody = {
    chef_id: " chef2 ",
    name: " Chicken noodles ",
    description: " Freshly prepared noodles ",
    price: 35,
    image_key: " food-test-unique ",
    ingredients: [" chicken ", " noodles "],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each([
    ["missing", undefined],
    ["empty", []],
    ["whitespace-only", ["chicken", "   "]],
    ["non-string", ["chicken", 42]],
    ["null entry", ["chicken", null]],
  ])("rejects %s ingredients", async (_caseName, ingredients) => {
    const body = { ...validFoodBody } as Record<string, unknown>;
    if (ingredients === undefined) {
      delete body.ingredients;
    } else {
      body.ingredients = ingredients;
    }

    const response = await request(app)
      .post("/foods")
      .set(authHeader())
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("non-empty array");
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockGenerateFoodEmbedding).not.toHaveBeenCalled();
  });

  test.each(["chef_id", "name", "description", "price", "image_key"])(
    "continues to require %s",
    async (field) => {
      const body = { ...validFoodBody, [field]: undefined };

      const response = await request(app)
        .post("/foods")
        .set(authHeader())
        .send(body);

      expect(response.status).toBe(400);
      expect(mockQuery).not.toHaveBeenCalled();
      expect(mockGenerateFoodEmbedding).not.toHaveBeenCalled();
    }
  );

  test("trims ingredient names before embedding and insertion", async () => {
    const insertedFood = {
      id: 31,
      chef_id: "chef2",
      chef_name: "Chef Example",
      name: "Chicken noodles",
      description: "Freshly prepared noodles",
      price: "35.00",
      image_key: "food-test-unique",
      ingredients: ["chicken", "noodles"],
      is_available: true,
    };
    const embedding = Array(768).fill(0.25);
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "chef2" }] })
      .mockResolvedValueOnce({ rows: [insertedFood] });
    mockGenerateFoodEmbedding.mockResolvedValueOnce(embedding);

    const response = await request(app)
      .post("/foods")
      .set(authHeader())
      .send(validFoodBody);

    expect(response.status).toBe(201);
    expect(response.body).toEqual(insertedFood);
    expect(mockGenerateFoodEmbedding).toHaveBeenCalledWith(
      "Chicken noodles",
      "Freshly prepared noodles",
      ["chicken", "noodles"]
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("INSERT INTO public.foods"),
      [
        "chef2",
        "Chicken noodles",
        "Freshly prepared noodles",
        35,
        "food-test-unique",
        ["chicken", "noodles"],
        JSON.stringify(embedding),
      ]
    );
  });
});

describe("POST /foods/search", () => {
  const searchResult = {
    searchId: "opaque-search-id",
    matchingRequestedDishes: {
      page: 1,
      pageSize: 10,
      hasMore: false,
      results: [],
    },
    suggestedSimilarDishes: {
      page: 1,
      pageSize: 10,
      hasMore: false,
      results: [],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockStartSearch.mockResolvedValue(searchResult);
    mockGetPage.mockResolvedValue(searchResult);
  });

  test("starts a search and returns the service response structure", async () => {
    const response = await request(app)
      .post("/foods/search")
      .set(authHeader())
      .send({
        query: "  spicy chicken noodles  ",
        matchingPage: 1,
        similarPage: 1,
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(searchResult);
    expect(mockStartSearch).toHaveBeenCalledWith(1, "spicy chicken noodles", {
      matchingPage: 1,
      similarPage: 1,
    });
    expect(mockGetPage).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockGenerateFoodEmbedding).not.toHaveBeenCalled();
  });

  test("requests later pages through getPage without starting a new search", async () => {
    const response = await request(app)
      .post("/foods/search")
      .set(authHeader())
      .send({
        searchId: "opaque-search-id",
        matchingPage: 2,
        similarPage: 1,
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(searchResult);
    expect(mockGetPage).toHaveBeenCalledWith(1, "opaque-search-id", {
      matchingPage: 2,
      similarPage: 1,
    });
    expect(mockStartSearch).not.toHaveBeenCalled();
  });

  test("defaults omitted page numbers to one", async () => {
    const response = await request(app)
      .post("/foods/search")
      .set(authHeader())
      .send({ query: "chicken noodles" });

    expect(response.status).toBe(200);
    expect(mockStartSearch).toHaveBeenCalledWith(1, "chicken noodles", {
      matchingPage: 1,
      similarPage: 1,
    });
  });

  test("rejects requests missing both query and searchId", async () => {
    const response = await request(app)
      .post("/foods/search")
      .set(authHeader())
      .send({ matchingPage: 1 });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_INPUT");
    expect(mockStartSearch).not.toHaveBeenCalled();
    expect(mockGetPage).not.toHaveBeenCalled();
  });

  test("rejects query and searchId supplied together", async () => {
    const response = await request(app)
      .post("/foods/search")
      .set(authHeader())
      .send({ query: "chicken noodles", searchId: "opaque-search-id" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_INPUT");
    expect(mockStartSearch).not.toHaveBeenCalled();
    expect(mockGetPage).not.toHaveBeenCalled();
  });

  test("rejects invalid query and searchId values", async () => {
    const invalidBodies = [
      { query: "   " },
      { query: 42 },
      { query: "x".repeat(501) },
      { searchId: "" },
      { searchId: "   " },
      { searchId: " padded " },
    ];

    for (const body of invalidBodies) {
      const response = await request(app)
        .post("/foods/search")
        .set(authHeader())
        .send(body);
      expect(response.status).toBe(400);
    }

    expect(mockStartSearch).not.toHaveBeenCalled();
    expect(mockGetPage).not.toHaveBeenCalled();
  });

  test.each([0, -1, 1.5, "2", null, Number.MAX_SAFE_INTEGER])(
    "rejects invalid page value %p",
    async (page) => {
      const response = await request(app)
        .post("/foods/search")
        .set(authHeader())
        .send({ query: "chicken noodles", matchingPage: page });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("INVALID_PAGE");
      expect(mockStartSearch).not.toHaveBeenCalled();
    }
  );

  test("requires authentication before calling the search service", async () => {
    const response = await request(app)
      .post("/foods/search")
      .send({ query: "chicken noodles" });

    expect(response.status).toBe(401);
    expect(mockStartSearch).not.toHaveBeenCalled();
    expect(mockGetPage).not.toHaveBeenCalled();
  });

  test("passes the authenticated user ID to both service operations", async () => {
    await request(app)
      .post("/foods/search")
      .set(authHeader())
      .send({ query: "chicken noodles" });
    await request(app)
      .post("/foods/search")
      .set(authHeader())
      .send({ searchId: "opaque-search-id" });

    expect(mockStartSearch).toHaveBeenCalledWith(
      1,
      "chicken noodles",
      expect.any(Object)
    );
    expect(mockGetPage).toHaveBeenCalledWith(
      1,
      "opaque-search-id",
      expect.any(Object)
    );
  });

  test("maps an expired or wrong-user search ID to 404", async () => {
    mockGetPage.mockRejectedValueOnce(
      new FoodSearchServiceError(
        "Food search was not found",
        404,
        "SEARCH_NOT_FOUND"
      )
    );

    const response = await request(app)
      .post("/foods/search")
      .set(authHeader())
      .send({ searchId: "unknown-search-id" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      message: "Food search was not found",
      code: "SEARCH_NOT_FOUND",
    });
  });

  test.each([
    [400, "INVALID_QUERY"],
    [502, "PLANNER_ERROR"],
    [502, "EMBEDDING_ERROR"],
    [500, "DATABASE_ERROR"],
    [503, "SEARCH_NOT_CALIBRATED"],
    [503, "SEARCH_CACHE_ENTRY_TOO_LARGE"],
    [504, "EMBEDDING_TIMEOUT"],
  ])("maps service error %s %s to its HTTP response", async (statusCode, code) => {
    mockStartSearch.mockRejectedValueOnce(
      new FoodSearchServiceError(
        `safe ${code} message`,
        statusCode as number,
        code as string
      )
    );

    const response = await request(app)
      .post("/foods/search")
      .set(authHeader())
      .send({ query: "chicken noodles" });

    expect(response.status).toBe(statusCode);
    expect(response.body).toEqual({ message: `safe ${code} message`, code });
  });
});
