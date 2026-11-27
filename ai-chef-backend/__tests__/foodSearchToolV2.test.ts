import {
  FoodRepositoryError,
  searchFoodsByName,
} from "../aiChefV2/repositories/foodRepository";
import {
  executeSearchFoodsTool,
  searchFoodsTool,
} from "../aiChefV2/tools/foodSearchTool";

jest.mock("../aiChefV2/repositories/foodRepository", () => ({
  FoodRepositoryError: class FoodRepositoryError extends Error {},
  searchFoodsByName: jest.fn(),
}));

const mockSearchFoodsByName = searchFoodsByName as jest.Mock;
let infoSpy: jest.SpyInstance;

describe("AI Chef V2 searchFoods tool", () => {
  beforeEach(() => {
    mockSearchFoodsByName.mockReset();
    infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  test("defines the searchFoods schema with required and bounded arguments", () => {
    expect(searchFoodsTool.function.name).toBe("searchFoods");
    expect(searchFoodsTool.function.parameters.required).toEqual(["foodName"]);
    expect(searchFoodsTool.function.parameters.properties.foodName).toMatchObject({
      type: "string",
      minLength: 1,
    });
    expect(searchFoodsTool.function.parameters.properties).not.toHaveProperty("limit");
  });

  test("uses the default limit and returns a structured result", async () => {
    const foods = [{ id: 1, name: "Chicken Biryani" }];
    mockSearchFoodsByName.mockResolvedValue(foods);

    const result = await executeSearchFoodsTool({ foodName: " chicken biryani " });

    expect(mockSearchFoodsByName).toHaveBeenCalledWith("chicken biryani", 10);
    expect(result).toEqual({
      toolName: "searchFoods",
      success: true,
      content: JSON.stringify({ foods }),
      structuredData: foods,
    });
    expect(readLogs()).toContainEqual(expect.objectContaining({
      component: "ai-chef-v2",
      event: "tool_arguments_validation",
      tool: "searchFoods",
      success: true,
      requestId: expect.any(String),
      timestamp: expect.any(String),
    }));
    expect(readLogs()).toContainEqual(expect.objectContaining({
      event: "food_search_tool_completed",
      success: true,
      durationMs: expect.any(Number),
      resultCount: foods.length,
    }));
    expect(serializedLogs()).not.toContain("chicken biryani");
    expect(serializedLogs()).not.toContain(JSON.stringify(foods));
  });

  test("passes a valid optional limit", async () => {
    mockSearchFoodsByName.mockResolvedValue([]);

    await executeSearchFoodsTool({ foodName: "biryani", limit: 3 });

    expect(mockSearchFoodsByName).toHaveBeenCalledWith("biryani", 3);
  });

  test.each([
    null,
    [],
    {},
    { foodName: "   " },
    { foodName: 42 },
    { foodName: "biryani", limit: 0 },
    { foodName: "biryani", limit: null },
    { foodName: "biryani", limit: "5" },
    { foodName: "biryani", limit: 11 },
    { foodName: "biryani", limit: 1.5 },
    { foodName: "biryani", extra: true },
  ])("rejects invalid tool input %j without searching", async (input) => {
    const result = await executeSearchFoodsTool(input);

    expect(result).toMatchObject({
      toolName: "searchFoods",
      success: false,
      error: expect.any(String),
    });
    expect(readLogs()).toContainEqual(expect.objectContaining({
      component: "ai-chef-v2",
      event: "tool_arguments_validation",
      tool: "searchFoods",
      success: false,
      validationError: expect.any(String),
    }));
    expect(mockSearchFoodsByName).not.toHaveBeenCalled();
  });

  test("does not expose repository details when a search fails", async () => {
    mockSearchFoodsByName.mockRejectedValue(
      new FoodRepositoryError("private database detail")
    );

    const result = await executeSearchFoodsTool({ foodName: "biryani" });

    expect(result.success).toBe(false);
    expect(result.content).not.toContain("private database detail");
    expect(result.error).toBe("Food search is temporarily unavailable.");
    expect(serializedLogs()).not.toContain("private database detail");
  });
});

function readLogs(): unknown[] {
  return infoSpy.mock.calls.map(([entry]) => JSON.parse(String(entry)));
}

function serializedLogs(): string {
  return infoSpy.mock.calls.map(([entry]) => String(entry)).join("\n");
}
