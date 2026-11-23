import { config } from "../config";
import {
  planFoodSearch,
  planFoodSearchResponse,
  validateFoodSearchPlannerResponse,
  FoodSearchPlannerResponse,
} from "../services/foodSearchPlannerService";

function ollamaResponse(response: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue({ response }),
  } as unknown as Response;
}

const genericPlan: FoodSearchPlannerResponse = {
  searchIntent: "specific_dish",
  foodTypes: ["noodles"],
  searchTerms: [
    { group: "matching", term: "spicy chicken noodles" },
    { group: "similar", term: "spicy vegetable noodles" },
  ],
  expectedIngredients: ["chicken"],
  excludedIngredients: [],
  searchDescription: "Spicy chicken noodles and suitable alternatives.",
};

describe("food search planner response validation", () => {
  test("accepts and normalizes the generic planner response", () => {
    expect(
      validateFoodSearchPlannerResponse({
        ...genericPlan,
        foodTypes: [" Noodles ", "noodles"],
        searchTerms: [
          { group: "matching", term: " Spicy   chicken noodles " },
          { group: "matching", term: "spicy chicken noodles" },
          { group: "similar", term: "spicy vegetable noodles" },
        ],
      })
    ).toEqual({
      ...genericPlan,
      searchTerms: [
        { group: "matching", term: "Spicy chicken noodles" },
        { group: "similar", term: "spicy vegetable noodles" },
      ],
      foodTypes: ["Noodles"],
    });
  });

  test.each(["broad_food_search", "specific_dish"] as const)(
    "accepts searchIntent %s",
    (searchIntent) => {
      expect(
        validateFoodSearchPlannerResponse({ ...genericPlan, searchIntent })
          .searchIntent
      ).toBe(searchIntent);
    }
  );

  test("rejects malformed planner fields and grouped terms", () => {
    expect(() => validateFoodSearchPlannerResponse(null)).toThrow(
      "Ollama returned an invalid food search planner object"
    );
    expect(() =>
      validateFoodSearchPlannerResponse({ ...genericPlan, searchIntent: "other" })
    ).toThrow("Ollama returned an invalid searchIntent");
    expect(() =>
      validateFoodSearchPlannerResponse({ ...genericPlan, unexpected: true })
    ).toThrow("Ollama returned unsupported food search planner fields");
    expect(() =>
      validateFoodSearchPlannerResponse({
        ...genericPlan,
        searchTerms: [{ group: "alternative", term: "noodles" }],
      })
    ).toThrow("Ollama returned an invalid search term group");
    expect(() =>
      validateFoodSearchPlannerResponse({
        ...genericPlan,
        searchTerms: [{ group: "matching", term: 12 }],
      })
    ).toThrow("Ollama returned a non-text search term");
  });

  test("enforces array and string limits", () => {
    expect(() =>
      validateFoodSearchPlannerResponse({
        ...genericPlan,
        foodTypes: Array.from({ length: 11 }, (_, index) => `type ${index}`),
      })
    ).toThrow("Ollama returned too many values in foodTypes");
    expect(() =>
      validateFoodSearchPlannerResponse({
        ...genericPlan,
        searchTerms: Array.from({ length: 11 }, (_, index) => ({
          group: "matching",
          term: `dish ${index}`,
        })),
      })
    ).toThrow("Ollama returned too many matching search terms");
    expect(() =>
      validateFoodSearchPlannerResponse({
        ...genericPlan,
        expectedIngredients: Array.from({ length: 21 }, (_, index) => `item ${index}`),
      })
    ).toThrow("Ollama returned too many values in expectedIngredients");
    expect(() =>
      validateFoodSearchPlannerResponse({
        ...genericPlan,
        excludedIngredients: ["x".repeat(81)],
      })
    ).toThrow("Ollama returned an overly long value in excludedIngredients");
    expect(() =>
      validateFoodSearchPlannerResponse({
        ...genericPlan,
        searchTerms: [{ group: "matching", term: "x".repeat(161) }],
      })
    ).toThrow("Ollama returned an overly long search term");
    expect(() =>
      validateFoodSearchPlannerResponse({
        ...genericPlan,
        searchDescription: "x".repeat(501),
      })
    ).toThrow("Ollama returned an overly long searchDescription");
  });
});

describe("planFoodSearchResponse", () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test("sends a short query-only prompt and parses the new response structure", async () => {
    fetchSpy.mockResolvedValueOnce(
      ollamaResponse(JSON.stringify(genericPlan))
    );

    await expect(
      planFoodSearchResponse("  spicy chicken noodles  ")
    ).resolves.toEqual(genericPlan);

    const [url, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(url).toBe(`${config.ollamaUrl}/api/generate`);
    expect(body.model).toBe(config.ollamaModel);
    expect(body.format).toBe("json");
    expect(body.stream).toBe(false);
    expect(body.prompt).toContain('Customer query: "spicy chicken noodles"');
    expect(body.prompt).toContain('"searchIntent":"broad_food_search or specific_dish"');
    expect(body.prompt).toContain('"group":"matching or similar"');
    expect(body.prompt).toContain(
      "Do not copy empty arrays from a template"
    );
    expect(body.prompt).toContain(
      "include the original dish as the first matching search term"
    );
    expect(body.prompt).toContain(
      "expectedIngredients: an array of specific ingredient names that commonly help identify or rank the requested food"
    );
    expect(body.prompt).toContain(
      "excludedIngredients: an array of ingredients the customer explicitly excludes"
    );
    expect(body.prompt).toContain(
      "searchDescription: a short summary of the customer's intent"
    );
    expect(body.prompt).not.toContain("Catalogue ingredient vocabulary");
    expect(body.prompt).not.toContain("Chicken\",\"Prawns");
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  test("rejects malformed JSON and invalid outer Ollama responses", async () => {
    fetchSpy.mockResolvedValueOnce(ollamaResponse("not json"));
    await expect(planFoodSearchResponse("noodles")).rejects.toThrow(
      "Ollama returned malformed JSON for the food search plan"
    );

    fetchSpy.mockResolvedValueOnce(ollamaResponse(null));
    await expect(planFoodSearchResponse("noodles")).rejects.toThrow(
      "Ollama returned an empty food search plan"
    );

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue([]),
    } as unknown as Response);
    await expect(planFoodSearchResponse("noodles")).rejects.toThrow(
      "Ollama returned an invalid food search response object"
    );
  });

  test("validates and trims the query before calling Ollama", async () => {
    await expect(planFoodSearchResponse("   ")).rejects.toThrow(
      "Food search query must not be empty"
    );
    await expect(planFoodSearchResponse("x".repeat(501))).rejects.toThrow(
      "Food search query must not exceed 500 characters"
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("projects the structured plan for the existing calibration script", async () => {
    fetchSpy.mockResolvedValueOnce(ollamaResponse(JSON.stringify(genericPlan)));

    await expect(planFoodSearch("spicy chicken noodles")).resolves.toEqual({
      searchMode: "specific_dish",
      includeIngredients: [],
      excludeIngredients: [],
      matchingRequestedDishes: ["spicy chicken noodles"],
      suggestedSimilarDishes: ["spicy vegetable noodles"],
    });
  });

  test("preserves broad food types and exclusions in the calibration projection", async () => {
    fetchSpy.mockResolvedValueOnce(
      ollamaResponse(
        JSON.stringify({
          ...genericPlan,
          searchIntent: "broad_food_search",
          foodTypes: ["seafood"],
          excludedIngredients: ["shellfish"],
        })
      )
    );
    await expect(planFoodSearch("seafood without shellfish")).resolves.toMatchObject({
      searchMode: "broad_ingredient",
      includeIngredients: ["seafood"],
      excludeIngredients: ["shellfish"],
    });
  });

  test("returns Ollama status and timeout errors", async () => {
    fetchSpy.mockResolvedValueOnce(ollamaResponse("", 503));
    await expect(planFoodSearchResponse("noodles")).rejects.toThrow(
      "Ollama food search planner returned status 503"
    );

    const timeoutError = new Error("timeout");
    timeoutError.name = "TimeoutError";
    fetchSpy.mockRejectedValueOnce(timeoutError);
    await expect(planFoodSearchResponse("noodles")).rejects.toThrow(
      "Ollama food search planning timed out"
    );
  });
});
