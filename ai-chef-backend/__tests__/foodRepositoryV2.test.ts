import { pool } from "../db";
import {
  FoodRepositoryError,
  searchFoodsByName,
} from "../aiChefV2/repositories/foodRepository";

jest.mock("../db", () => ({
  pool: {
    query: jest.fn(),
  },
}));

const mockQuery = pool.query as jest.Mock;
let infoSpy: jest.SpyInstance;

describe("AI Chef V2 food repository", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  test.each([
    {
      query: "  chicken \t\n biryani  ",
      keywords: ["chicken", "biryani"],
      matchingName: "Kerala Chicken Dum Biryani",
      rows: [{ id: 1, name: "Kerala Chicken Dum Biryani", chef_name: "A Chef" }],
    },
    {
      query: "chicken noodles",
      keywords: ["chicken", "noodles"],
      matchingName: "Chicken Hakka Noodles",
      rows: [{ id: 2, name: "Chicken Hakka Noodles", chef_name: "A Chef" }],
    },
    {
      query: "chicken noodles",
      keywords: ["chicken", "noodles"],
      matchingName: "Chicken Dumplings",
      rows: [],
    },
  ])("searches using every normalized keyword: $query", async ({
    query,
    keywords,
    matchingName,
    rows,
  }) => {
    mockQuery.mockResolvedValue({ rows });

    await expect(searchFoodsByName(query)).resolves.toBe(rows);
    expect(
      keywords.every((keyword) =>
        matchingName.toLowerCase().includes(keyword.toLowerCase())
      )
    ).toBe(rows.length > 0);

    const [sql, parameters] = mockQuery.mock.calls[0];
    expect(sql).toContain("FROM unnest($1::text[]) AS search_terms(keyword)");
    expect(sql).toContain(
      "strpos(lower(foods.name), lower(search_terms.keyword)) = 0"
    );
    expect(sql).toContain("LIMIT $2");
    expect(sql).toContain("WHERE foods.is_available = TRUE");
    expect(sql).toContain("JOIN public.chefs AS chefs ON chefs.id = foods.chef_id");
    expect(parameters).toEqual([keywords, 10]);
    expect((parameters[0] as string[]).every((keyword) => keyword.length > 0)).toBe(true);
    expect(readLogs()).toContainEqual(expect.objectContaining({
      component: "ai-chef-v2",
      event: "food_repository_search_completed",
      tool: "searchFoods",
      success: true,
      resultCount: rows.length,
      durationMs: expect.any(Number),
      requestId: expect.any(String),
      timestamp: expect.any(String),
    }));
    expect(serializedLogs()).not.toContain(matchingName);
    expect(serializedLogs()).not.toContain(query);
    expect(serializedLogs()).not.toContain(JSON.stringify(rows));
  });

  test("rejects invalid names and limits without querying the database", async () => {
    await expect(searchFoodsByName("   ")).rejects.toBeInstanceOf(TypeError);
    await expect(searchFoodsByName("dish", 11)).rejects.toBeInstanceOf(RangeError);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("wraps database errors without exposing database details in its message", async () => {
    mockQuery.mockRejectedValue(new Error("private database detail"));

    await expect(searchFoodsByName("biryani")).rejects.toMatchObject({
      name: "FoodRepositoryError",
      code: "FOOD_SEARCH_FAILED",
      message: "Food search could not be completed",
    });
  });
});

function readLogs(): unknown[] {
  return infoSpy.mock.calls.map(([entry]) => JSON.parse(String(entry)));
}

function serializedLogs(): string {
  return infoSpy.mock.calls.map(([entry]) => String(entry)).join("\n");
}
