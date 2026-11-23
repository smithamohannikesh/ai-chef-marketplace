import { FoodSearchPlan, FoodSearchPlannerResponse } from "../services/foodSearchPlannerService";
import {
  createFoodSearchService,
  FoodListing,
  FoodSearchQuery
} from "../services/foodSearchService1";

function listing(
  id: number,
  overrides: Partial<FoodListing> = {}
): FoodListing {
  return {
    id,
    chef_id: `chef${id}`,
    chef_name: `Chef ${id}`,
    name: `Food ${id}`,
    description: `Description ${id}`,
    price: "20.00",
    image_key: `food${id}`,
    ingredients: ["ingredient"],
    is_available: true,
    ...overrides,
  };
}

function candidate(
  id: number,
  group_order: number,
  concept_order: number,
  cosine_distance: number,
  overrides: Partial<FoodListing> = {}
) {
  return {
    ...listing(id, overrides),
    group_order,
    concept_order,
    cosine_distance,
  };
}

const emptyPlan: FoodSearchPlan = {
  matchingRequestedDishes: [],
  suggestedSimilarDishes: [],
};

function broadPlan(includeIngredients: string[], excludeIngredients: string[]): FoodSearchPlan {
  return {
    searchMode: "broad_ingredient",
    includeIngredients,
    excludeIngredients,
    matchingRequestedDishes: [],
    suggestedSimilarDishes: [],
  };
}

function toPlannerResponse(
  plan: FoodSearchPlan | FoodSearchPlannerResponse
): FoodSearchPlannerResponse {
  if ("searchIntent" in plan) return plan;
  const isBroad = plan.searchMode === "broad_ingredient";
  const foodTypes = isBroad
    ? (plan.includeIngredients?.length
        ? plan.includeIngredients
        : plan.excludeIngredients?.length
          ? ["vegetarian"]
          : [])
    : [];
  return {
    searchIntent: isBroad ? "broad_food_search" : "specific_dish",
    foodTypes,
    searchTerms: [
      ...(plan.matchingRequestedDishes ?? []).map((term) => ({ group: "matching" as const, term })),
      ...(plan.suggestedSimilarDishes ?? []).map((term) => ({ group: "similar" as const, term })),
    ],
    expectedIngredients: [],
    excludedIngredients: plan.excludeIngredients ?? [],
    searchDescription: "test plan",
  };
}

function createHarness(options: {
  plan?: FoodSearchPlan | FoodSearchPlannerResponse;
  embed?: (concept: string, signal?: AbortSignal) => Promise<number[]>;
  queryDatabase?: jest.Mock;
  now?: () => number;
  createSearchId?: () => string;
  serviceOptions?: Partial<Parameters<typeof createFoodSearchService>[0]>;
} = {}) {
  const queryDatabase = options.queryDatabase ?? jest.fn();
  const mockPlan = jest.fn().mockResolvedValue(toPlannerResponse(options.plan ?? emptyPlan));
  const embed = options.embed ?? jest.fn().mockResolvedValue([0.1, 0.2]);
  let id = 0;
  const service = createFoodSearchService({
    queryDatabase: queryDatabase as unknown as FoodSearchQuery,
    similarityThreshold: 0.35,
    plan: mockPlan,
    embed,
    now: options.now,
    createSearchId: options.createSearchId ?? (() => `search-${++id}`),
    ...options.serviceOptions,
  });

  return { service, queryDatabase, mockPlan, embed };
}

function setDatabaseRows(queryDatabase: jest.Mock, candidateRows: unknown[], pageRows: unknown[]) {
  queryDatabase.mockImplementation((sql: string) => {
    if (sql.includes("WITH search_concepts")) {
      return Promise.resolve({ rows: candidateRows });
    }
    return Promise.resolve({ rows: pageRows });
  });
}

describe("foodSearchService", () => {
  test("preserves group and concept priority, then cosine distance and food ID", async () => {
    const plan: FoodSearchPlan = {
      matchingRequestedDishes: ["requested one", "requested two"],
      suggestedSimilarDishes: ["similar one"],
    };
    const queryDatabase = jest.fn();
    const rows = [
      candidate(20, 0, 0, 0.2),
      candidate(3, 1, 0, 0.01),
      candidate(2, 0, 0, 0.2),
      candidate(4, 0, 1, 0.01),
    ];
    setDatabaseRows(queryDatabase, rows, rows);
    const embed = jest.fn(async (concept: string) => [concept.length]);
    const { service } = createHarness({ plan, queryDatabase, embed });

    const result = await service.startSearch("user-1", "find dishes");

    expect(result.matchingRequestedDishes.results.map((food) => food.id)).toEqual([
      2, 20, 4,
    ]);
    expect(result.suggestedSimilarDishes.results.map((food) => food.id)).toEqual([
      3,
    ]);
    expect(embed.mock.calls.map(([concept]) => concept)).toEqual([
      "requested one",
      "requested two",
      "similar one",
    ]);

    const [sql, parameters] = queryDatabase.mock.calls[0];
    expect(sql).toContain(
      "ORDER BY group_order, concept_order, expected_ingredient_matches DESC, cosine_distance, id"
    );
    expect(sql).toContain("foods.is_available = TRUE");
    expect(sql).toContain("foods.embedding IS NOT NULL");
    expect(sql).toContain("foods.embedding <=> search_concepts.query_embedding");
    expect(parameters.slice(0, 9)).toEqual([
      0,
      0,
      JSON.stringify(["requested one".length]),
      0,
      1,
      JSON.stringify(["requested two".length]),
      1,
      0,
      JSON.stringify(["similar one".length]),
    ]);
    expect(parameters[12]).toBe(0.35);
  });

  test("deduplicates food IDs across concepts and gives requested matches priority", async () => {
    const plan: FoodSearchPlan = {
      matchingRequestedDishes: ["direct dish", "second direct dish"],
      suggestedSimilarDishes: ["similar dish"],
    };
    const duplicateRows = [
      candidate(7, 1, 0, 0.01),
      candidate(7, 0, 1, 0.2),
      candidate(7, 0, 0, 0.3),
    ];
    const queryDatabase = jest.fn();
    setDatabaseRows(queryDatabase, duplicateRows, [listing(7)]);
    const { service } = createHarness({ plan, queryDatabase });

    const result = await service.startSearch("user-1", "dish");

    expect(result.matchingRequestedDishes.results.map((food) => food.id)).toEqual([
      7,
    ]);
    expect(result.suggestedSimilarDishes.results).toEqual([]);
  });

  test("keeps same-named listings from different chefs as separate foods", async () => {
    const plan: FoodSearchPlan = {
      matchingRequestedDishes: ["chicken noodles"],
      suggestedSimilarDishes: [],
    };
    const rows = [
      candidate(1, 0, 0, 0.1, {
        name: "Chicken noodles",
        chef_id: "chef-a",
        chef_name: "Chef A",
      }),
      candidate(2, 0, 0, 0.2, {
        name: "Chicken noodles",
        chef_id: "chef-b",
        chef_name: "Chef B",
      }),
    ];
    const queryDatabase = jest.fn();
    setDatabaseRows(queryDatabase, rows, rows);
    const { service } = createHarness({ plan, queryDatabase });

    const result = await service.startSearch("user-1", "noodles");

    expect(result.matchingRequestedDishes.results.map((food) => food.id)).toEqual([
      1, 2,
    ]);
    expect(result.matchingRequestedDishes.results.map((food) => food.chef_id)).toEqual([
      "chef-a",
      "chef-b",
    ]);
  });

  test("handles empty concept groups without embedding or database calls", async () => {
    const queryDatabase = jest.fn();
    const { service, embed, mockPlan } = createHarness({
      plan: emptyPlan,
      queryDatabase,
    });

    const result = await service.startSearch("user-1", "unusual request");

    expect(mockPlan).toHaveBeenCalledWith("unusual request");
    expect(embed).not.toHaveBeenCalled();
    expect(queryDatabase).not.toHaveBeenCalled();
    expect(result.matchingRequestedDishes.results).toEqual([]);
    expect(result.suggestedSimilarDishes.results).toEqual([]);
  });

  test("returns non-veg ingredient matches without embeddings or a similarity threshold", async () => {
    const foods = [
      listing(1, { name: "Chicken noodles", ingredients: ["chicken", "noodles"] }),
      listing(2, { name: "Kerala Fish Curry", ingredients: ["fish", "coconut milk"] }),
    ];
    const queryDatabase = jest.fn((sql: string, _parameters: unknown[]) =>
      Promise.resolve({
        rows: sql.includes("LIMIT $5")
          ? foods.map(({ id }) => ({ id }))
          : foods,
      })
    );
    const { service, embed } = createHarness({
      plan: broadPlan(["Chicken", "Fish"], []),
      queryDatabase,
      serviceOptions: { similarityThreshold: null },
    });

    const result = await service.startSearch("user-1", "List non-veg food");

    expect(result.matchingRequestedDishes.results.map((food) => food.id)).toEqual([
      1,
      2,
    ]);
    expect(result.suggestedSimilarDishes.results).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
    const [sql, parameters] = queryDatabase.mock.calls[0];
    expect(sql).toContain("foods.is_available = TRUE");
    expect(sql).toContain("unnest(COALESCE(foods.ingredients");
    expect(sql).not.toContain("foods.embedding");
    expect(sql).not.toContain("cosine_distance");
    expect(parameters[0]).toEqual(expect.arrayContaining(["chicken", "fish"]));
    expect(parameters[2]).toEqual([]);
    expect(parameters[4]).toBe(5001);
  });

  test("excludes shellfish from broad seafood results", async () => {
    const fish = listing(15, {
      name: "Kerala Fish Curry",
      ingredients: ["fish", "coconut milk"],
    });
    const queryDatabase = jest.fn((sql: string, _parameters: unknown[]) =>
      Promise.resolve({
        rows: sql.includes("LIMIT $5")
          ? [{ id: fish.id }]
          : [fish],
      })
    );
    const { service, embed } = createHarness({
      plan: broadPlan(["Fish", "Prawns"], ["Prawns"]),
      queryDatabase,
    });

    const result = await service.startSearch("user-1", "Seafood without shellfish");

    expect(result.matchingRequestedDishes.results.map((food) => food.id)).toEqual([
      15,
    ]);
    const [sql, parameters] = queryDatabase.mock.calls[0];
    expect(sql).toContain("AND NOT EXISTS");
    expect(parameters[0]).toEqual(expect.arrayContaining(["fish", "prawns"]));
    expect(parameters[1]).toEqual(["%prawns%"]);
    expect(parameters[2]).toEqual(["prawns", "prawn"]);
    expect(parameters[4]).toBe(5001);
    expect(embed).not.toHaveBeenCalled();
  });

  test("logs broad matching criteria, matches, exclusions, and returned results in development", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    const debugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});
    const matchedFood = listing(31, {
      name: "Chicken noodles",
      ingredients: ["chicken", "noodles"],
    });
    const excludedFood = listing(32, {
      name: "Chicken prawn noodles",
      ingredients: ["chicken", "prawns", "noodles"],
    });
    const queryDatabase = jest.fn((sql: string) => {
      if (sql.includes("development-only exclusion diagnostic")) {
        return Promise.resolve({
          rows: [
            {
              id: excludedFood.id,
              name: excludedFood.name,
              ingredients: excludedFood.ingredients,
            },
          ],
        });
      }
      if (sql.includes("SELECT foods.id, foods.name, foods.ingredients")) {
        return Promise.resolve({
          rows: [
            {
              id: matchedFood.id,
              name: matchedFood.name,
              ingredients: matchedFood.ingredients,
            },
          ],
        });
      }
      return Promise.resolve({ rows: [matchedFood] });
    });
    const { service } = createHarness({
      plan: broadPlan(["Chicken"], ["Prawns"]),
      queryDatabase,
    });

    try {
      const result = await service.startSearch("user-1", "chicken without prawns");

      expect(result.matchingRequestedDishes.results).toEqual([matchedFood]);
      expect(debugSpy.mock.calls).toContainEqual([
        "[FoodSearch][Stage 2 – PostgreSQL] Criteria passed to PostgreSQL",
        {
          includeIngredients: expect.arrayContaining(["chicken", "turkey", "duck"]),
          excludeIngredients: ["prawns", "prawn"],
          expectedIngredients: [],
          foodTypes: ["Chicken"],
          matchingTerms: [],
          textPatterns: [],
          availableOnly: true,
        },
      ]);
      expect(debugSpy.mock.calls).toContainEqual([
        "[FoodSearch][Stage 2 – PostgreSQL] Food records matched by PostgreSQL",
        [
          {
            id: matchedFood.id,
            name: matchedFood.name,
            ingredients: matchedFood.ingredients,
          },
        ],
      ]);
      expect(debugSpy.mock.calls).toContainEqual([
        "[FoodSearch][Stage 2 – PostgreSQL] Food records rejected by exclusion ingredients",
        [
          {
            id: excludedFood.id,
            name: excludedFood.name,
            ingredients: excludedFood.ingredients,
          },
        ],
      ]);
      expect(debugSpy.mock.calls).toContainEqual([
        "[FoodSearch][Stage 2 – PostgreSQL] Final food-search results returned",
        {
          searchId: "search-1",
          matchingRequestedDishes: [
            {
              id: matchedFood.id,
              name: matchedFood.name,
              ingredients: matchedFood.ingredients,
            },
          ],
          suggestedSimilarDishes: [],
        },
      ]);
    } finally {
      debugSpy.mockRestore();
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  test("returns vegetarian matches using exclusions with no included ingredients", async () => {
    const vegetarianFood = listing(19, {
      name: "Creamy Mushroom Pasta",
      ingredients: ["pasta", "mushrooms", "fresh cream"],
    });
    const queryDatabase = jest.fn((sql: string, _parameters: unknown[]) =>
      Promise.resolve({
        rows: sql.includes("LIMIT $5")
          ? [{ id: vegetarianFood.id }]
          : [vegetarianFood],
      })
    );
    const { service, embed } = createHarness({
      plan: broadPlan([], ["chicken", "fish", "prawns", "ham"]),
      queryDatabase,
    });

    const result = await service.startSearch("user-1", "Vegetarian food");

    expect(result.matchingRequestedDishes.results.map((food) => food.id)).toEqual([
      19,
    ]);
    const parameters = queryDatabase.mock.calls[0][1];
    expect(parameters[0]).toEqual([]);
    expect(parameters[1]).toEqual([]);
    expect(parameters[2]).toEqual(
      expect.arrayContaining(["chicken", "fish", "prawns", "egg", "eggs"])
    );
    expect(parameters[4]).toBe(5001);
    expect(parameters[5]).toBe(true);
    expect(embed).not.toHaveBeenCalled();
  });

  test("includes broad ingredient matches when their embedding is missing", async () => {
    const legacyFood = listing(1, {
      name: "Chicken noodles",
      ingredients: ["chicken", "noodles"],
    });
    const queryDatabase = jest.fn((sql: string, _parameters: unknown[]) =>
      Promise.resolve({
        rows: sql.includes("LIMIT $5")
          ? [{ id: legacyFood.id }]
          : [legacyFood],
      })
    );
    const { service, embed } = createHarness({
      plan: broadPlan(["Chicken"], []),
      queryDatabase,
    });

    const result = await service.startSearch("user-1", "Non-veg dishes");

    expect(result.matchingRequestedDishes.results).toEqual([legacyFood]);
    expect(queryDatabase.mock.calls[0][0]).not.toContain("embedding IS NOT NULL");
    expect(queryDatabase.mock.calls[0][0]).not.toContain("cosine_distance");
    expect(embed).not.toHaveBeenCalled();
  });

  test("uses a broad non-veg food type to match animal-derived ingredients", async () => {
    const nonVegListing = listing(41, {
      name: "Egg noodles",
      ingredients: ["eggs", "noodles"],
    });
    const queryDatabase = jest.fn((sql: string, _parameters: unknown[]) =>
      Promise.resolve({ rows: sql.includes("LIMIT $5") ? [nonVegListing] : [nonVegListing] })
    );
    const { service, embed } = createHarness({
      plan: {
        searchIntent: "broad_food_search",
        foodTypes: ["non-veg"],
        searchTerms: [],
        expectedIngredients: [],
        excludedIngredients: [],
        searchDescription: "Any non-vegetarian foods",
      },
      queryDatabase,
      serviceOptions: { similarityThreshold: null },
    });

    const result = await service.startSearch("user-1", "List non-veg food");

    expect(result.matchingRequestedDishes.results).toEqual([nonVegListing]);
    expect(queryDatabase.mock.calls[0][1][0]).toEqual(
      expect.arrayContaining(["chicken", "fish", "eggs", "prawns"])
    );
    expect(embed).not.toHaveBeenCalled();
  });

  test("broad biryani searches return family variants without broad rice matches", async () => {
    const biryani = listing(42, { name: "Vegetable biriyani" });
    const queryDatabase = jest.fn().mockResolvedValue({ rows: [biryani] });
    const { service, embed } = createHarness({
      plan: {
        searchIntent: "broad_food_search",
        foodTypes: ["biryani", "rice dishes"],
        searchTerms: [{ group: "matching", term: "chicken biryani" }],
        expectedIngredients: ["rice"],
        excludedIngredients: [],
        searchDescription: "Biryani variants",
      },
      queryDatabase,
      serviceOptions: { similarityThreshold: null },
    });

    const result = await service.startSearch("user-1", "biriyani");

    expect(result.matchingRequestedDishes.results).toEqual([biryani]);
    expect(queryDatabase.mock.calls[0][1][0]).toEqual([]);
    expect(queryDatabase.mock.calls[0][1][1]).toEqual([
      "%biryani%",
      "%biriyani%",
    ]);
    expect(embed).not.toHaveBeenCalled();
  });

  test("ranks expected ingredient overlap as a hint without requiring it", async () => {
    const queryDatabase = jest.fn();
    const rows = [
      { ...candidate(51, 0, 0, 0.01), expected_ingredient_matches: 0 },
      { ...candidate(52, 0, 0, 0.2), expected_ingredient_matches: 1 },
    ];
    setDatabaseRows(queryDatabase, rows, rows);
    const { service } = createHarness({
      plan: {
        searchIntent: "specific_dish",
        foodTypes: ["noodles"],
        searchTerms: [{ group: "matching", term: "chicken noodles" }],
        expectedIngredients: ["chicken"],
        excludedIngredients: [],
        searchDescription: "Chicken noodles",
      },
      queryDatabase,
    });

    const result = await service.startSearch("user-1", "chicken noodles");

    expect(result.matchingRequestedDishes.results.map(({ id }) => id)).toEqual([
      52,
      51,
    ]);
    expect(queryDatabase.mock.calls[0][0]).toContain(
      "expected_ingredient_matches DESC, cosine_distance"
    );
  });

  test("uses the generic planner without loading or sending database vocabulary", async () => {
    const queryDatabase = jest.fn().mockResolvedValue({ rows: [] });
    const embed = jest.fn().mockResolvedValue([0.1, 0.2]);
    const service = createFoodSearchService({
      queryDatabase: queryDatabase as unknown as FoodSearchQuery,
      similarityThreshold: 0.2,
      embed,
      createSearchId: () => "vocabulary-search",
    });
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        response: JSON.stringify({
          searchIntent: "specific_dish",
          foodTypes: ["noodles"],
          searchTerms: [{ group: "matching", term: "Chicken noodles" }],
          expectedIngredients: ["chicken"],
          excludedIngredients: [],
          searchDescription: "Chicken noodles",
        }),
      }),
    } as unknown as Response);

    try {
      await service.startSearch("user-1", "Chicken noodles");

      expect(queryDatabase.mock.calls.every(([sql]) =>
        !String(sql).includes("CROSS JOIN LATERAL unnest(foods.ingredients)")
      )).toBe(true);
      const requestOptions = fetchSpy.mock.calls[0][1] as RequestInit;
      const requestBody = JSON.parse(requestOptions.body as string);
      expect(requestBody.prompt).toContain('Customer query: "Chicken noodles"');
      expect(requestBody.prompt).not.toContain("Catalogue ingredient vocabulary");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("returns empty groups when concepts have no relevant database matches", async () => {
    const queryDatabase = jest.fn();
    setDatabaseRows(queryDatabase, [], []);
    const { service } = createHarness({
      plan: {
        matchingRequestedDishes: ["unmatched direct"],
        suggestedSimilarDishes: ["unmatched similar"],
      },
      queryDatabase,
    });

    const result = await service.startSearch("user-1", "something");

    expect(result.matchingRequestedDishes.results).toEqual([]);
    expect(result.suggestedSimilarDishes.results).toEqual([]);
    expect(queryDatabase).toHaveBeenCalledTimes(1);
    expect(queryDatabase.mock.calls[0][0]).toContain(
      "cosine_distance <= $10"
    );
  });

  test("paginates each group independently using the complete candidate lists", async () => {
    const plan: FoodSearchPlan = {
      matchingRequestedDishes: ["direct"],
      suggestedSimilarDishes: ["similar"],
    };
    const candidateRows = [
      ...Array.from({ length: 12 }, (_, index) => candidate(index + 1, 0, 0, index / 100)),
      ...Array.from({ length: 11 }, (_, index) =>
        candidate(index + 101, 1, 0, index / 100)
      ),
    ];
    const queryDatabase = jest.fn();
    setDatabaseRows(queryDatabase, candidateRows, candidateRows);
    const { service } = createHarness({ plan, queryDatabase });

    const firstPage = await service.startSearch("user-1", "dishes", {
      matchingPage: 1,
      similarPage: 2,
    });
    const secondPage = await service.getPage("user-1", firstPage.searchId, {
      matchingPage: 2,
      similarPage: 1,
    });

    expect(firstPage.matchingRequestedDishes.results).toHaveLength(10);
    expect(firstPage.matchingRequestedDishes.hasMore).toBe(true);
    expect(firstPage.suggestedSimilarDishes.results.map((food) => food.id)).toEqual([
      111,
    ]);
    expect(secondPage.matchingRequestedDishes.results.map((food) => food.id)).toEqual([
      11,
      12,
    ]);
    expect(secondPage.suggestedSimilarDishes.results).toHaveLength(10);
    expect(queryDatabase.mock.calls.filter(([sql]) =>
      String(sql).includes("WITH search_concepts")
    )).toHaveLength(1);
  });

  test("rechecks availability for each page without shifting candidate page boundaries", async () => {
    const plan: FoodSearchPlan = {
      matchingRequestedDishes: ["direct"],
      suggestedSimilarDishes: [],
    };
    const candidateRows = Array.from({ length: 12 }, (_, index) =>
      candidate(index + 1, 0, 0, index / 100)
    );
    const queryDatabase = jest.fn();
    queryDatabase
      .mockResolvedValueOnce({ rows: candidateRows })
      .mockResolvedValueOnce({ rows: candidateRows.map(({ group_order, concept_order, cosine_distance, ...food }) => food) })
      .mockResolvedValueOnce({ rows: [listing(12)] });
    const { service } = createHarness({ plan, queryDatabase });

    const firstPage = await service.startSearch("user-1", "dishes");
    const secondPage = await service.getPage("user-1", firstPage.searchId, {
      matchingPage: 2,
    });

    expect(firstPage.matchingRequestedDishes.results.map((food) => food.id)).toEqual(
      Array.from({ length: 10 }, (_, index) => index + 1)
    );
    expect(secondPage.matchingRequestedDishes.results.map((food) => food.id)).toEqual([
      12,
    ]);
    expect(secondPage.matchingRequestedDishes.hasMore).toBe(false);
    expect(queryDatabase.mock.calls[1][0]).toContain("foods.is_available = TRUE");
    expect(queryDatabase.mock.calls[2][0]).toContain("foods.is_available = TRUE");
  });

  test("binds cached searches to their authenticated user", async () => {
    const queryDatabase = jest.fn();
    const rows = [candidate(1, 0, 0, 0.1)];
    setDatabaseRows(queryDatabase, rows, rows);
    const { service } = createHarness({
      plan: { matchingRequestedDishes: ["dish"], suggestedSimilarDishes: [] },
      queryDatabase,
    });
    const result = await service.startSearch("user-1", "dish");

    await expect(service.getPage("user-2", result.searchId)).rejects.toMatchObject({
      statusCode: 404,
      code: "SEARCH_NOT_FOUND",
    });
  });

  test("expires cache entries after the fixed short lifetime", async () => {
    let currentTime = 1000;
    const queryDatabase = jest.fn();
    const rows = [candidate(1, 0, 0, 0.1)];
    setDatabaseRows(queryDatabase, rows, rows);
    const { service } = createHarness({
      plan: { matchingRequestedDishes: ["dish"], suggestedSimilarDishes: [] },
      queryDatabase,
      now: () => currentTime,
      serviceOptions: { cacheTtlMs: 100 },
    });
    const result = await service.startSearch("user-1", "dish");
    currentTime = 1100;

    await expect(service.getPage("user-1", result.searchId)).rejects.toMatchObject({
      statusCode: 404,
      code: "SEARCH_NOT_FOUND",
    });
  });

  test("evicts the least-recently-used entry when the cache entry limit is reached", async () => {
    const queryDatabase = jest.fn();
    const rows = [candidate(1, 0, 0, 0.1)];
    setDatabaseRows(queryDatabase, rows, rows);
    let id = 0;
    const { service } = createHarness({
      plan: { matchingRequestedDishes: ["dish"], suggestedSimilarDishes: [] },
      queryDatabase,
      createSearchId: () => `cache-${++id}`,
      serviceOptions: { maxCacheEntries: 2 },
    });
    const first = await service.startSearch("user-1", "first");
    const second = await service.startSearch("user-1", "second");
    await service.getPage("user-1", first.searchId); // make first newer than second
    const third = await service.startSearch("user-1", "third");

    await expect(service.getPage("user-1", second.searchId)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(service.getPage("user-1", first.searchId)).resolves.toMatchObject({
      searchId: first.searchId,
    });
    await expect(service.getPage("user-1", third.searchId)).resolves.toMatchObject({
      searchId: third.searchId,
    });
  });

  test("rejects a search that exceeds the candidate count instead of truncating it", async () => {
    const rows = [candidate(1, 0, 0, 0.1), candidate(2, 0, 0, 0.2)];
    const queryDatabase = jest.fn();
    setDatabaseRows(queryDatabase, rows, rows);
    const { service } = createHarness({
      plan: { matchingRequestedDishes: ["dish"], suggestedSimilarDishes: [] },
      queryDatabase,
      serviceOptions: { maxCandidatesPerSearch: 1 },
    });

    await expect(service.startSearch("user-1", "dish")).rejects.toMatchObject({
      statusCode: 503,
      code: "SEARCH_CANDIDATE_LIMIT_EXCEEDED",
    });
  });

  test("rejects a cache entry that exceeds the memory budget", async () => {
    const queryDatabase = jest.fn();
    setDatabaseRows(queryDatabase, [], []);
    const { service } = createHarness({
      queryDatabase,
      serviceOptions: { maxCacheBytes: 1 },
    });

    await expect(service.startSearch("user-1", "empty search")).rejects.toMatchObject({
      statusCode: 503,
      code: "SEARCH_CACHE_ENTRY_TOO_LARGE",
    });
  });

  test("evicts cached searches to stay within the total memory budget", async () => {
    const now = 1000;
    const maxCacheBytes = Buffer.byteLength(
      JSON.stringify({
        searchId: "memory-1",
        userId: "user-1",
        matchingIds: [],
        similarIds: [],
        createdAt: now,
        expiresAt: now + 60000,
      }),
      "utf8"
    );
    let id = 0;
    const { service } = createHarness({
      plan: emptyPlan,
      now: () => now,
      createSearchId: () => `memory-${++id}`,
      serviceOptions: { cacheTtlMs: 60000, maxCacheBytes },
    });
    const first = await service.startSearch("user-1", "first");
    const second = await service.startSearch("user-1", "second");

    await expect(service.getPage("user-1", first.searchId)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(service.getPage("user-1", second.searchId)).resolves.toMatchObject({
      searchId: second.searchId,
    });
  });

  test("limits concurrent concept embedding requests", async () => {
    const plan: FoodSearchPlan = {
      matchingRequestedDishes: ["one", "two", "three", "four", "five"],
      suggestedSimilarDishes: [],
    };
    let active = 0;
    let maximumActive = 0;
    const embed = jest.fn(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return [0.1];
    });
    const queryDatabase = jest.fn();
    setDatabaseRows(queryDatabase, [], []);
    const { service } = createHarness({
      plan,
      embed,
      queryDatabase,
      serviceOptions: { maxEmbeddingConcurrency: 2 },
    });

    await service.startSearch("user-1", "dishes");

    expect(embed).toHaveBeenCalledTimes(5);
    expect(maximumActive).toBe(2);
  });

  test("times out the complete embedding operation and aborts outstanding requests", async () => {
    const plan: FoodSearchPlan = {
      matchingRequestedDishes: ["one", "two", "three"],
      suggestedSimilarDishes: [],
    };
    let abortedRequests = 0;
    const embed = jest.fn(
      (_concept: string, signal?: AbortSignal) =>
        new Promise<number[]>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => {
              abortedRequests += 1;
              reject(signal.reason);
            },
            { once: true }
          );
        })
    );
    const queryDatabase = jest.fn();
    const { service } = createHarness({
      plan,
      embed,
      queryDatabase,
      serviceOptions: {
        maxEmbeddingConcurrency: 2,
        embeddingOperationTimeoutMs: 20,
      },
    });

    await expect(service.startSearch("user-1", "dishes")).rejects.toMatchObject({
      statusCode: 504,
      code: "EMBEDDING_TIMEOUT",
    });
    expect(embed).toHaveBeenCalledTimes(2);
    expect(abortedRequests).toBe(2);
    expect(queryDatabase).not.toHaveBeenCalled();
  });

  test("returns a safe error and does not query the database when embedding fails", async () => {
    const queryDatabase = jest.fn();
    const { service } = createHarness({
      plan: { matchingRequestedDishes: ["dish"], suggestedSimilarDishes: [] },
      embed: jest.fn().mockRejectedValue(new Error("Ollama secret detail")),
      queryDatabase,
    });

    await expect(service.startSearch("user-1", "dish")).rejects.toMatchObject({
      statusCode: 502,
      code: "EMBEDDING_ERROR",
    });
    expect(queryDatabase).not.toHaveBeenCalled();
  });

  test("returns a safe error when concept matching fails in PostgreSQL", async () => {
    const queryDatabase = jest.fn().mockRejectedValue(new Error("database detail"));
    const { service } = createHarness({
      plan: { matchingRequestedDishes: ["dish"], suggestedSimilarDishes: [] },
      queryDatabase,
    });

    await expect(service.startSearch("user-1", "dish")).rejects.toMatchObject({
      statusCode: 500,
      code: "DATABASE_ERROR",
      message: "Food search matching failed",
    });
  });

  test("returns a safe error when availability refresh fails", async () => {
    const queryDatabase = jest.fn()
      .mockResolvedValueOnce({ rows: [candidate(1, 0, 0, 0.1)] })
      .mockRejectedValueOnce(new Error("database detail"));
    const { service } = createHarness({
      plan: { matchingRequestedDishes: ["dish"], suggestedSimilarDishes: [] },
      queryDatabase,
    });

    await expect(service.startSearch("user-1", "dish")).rejects.toMatchObject({
      statusCode: 500,
      code: "DATABASE_ERROR",
      message: "Food search could not load current listings",
    });
  });

  test("rejects a search ID collision without overwriting its existing entry", async () => {
    const queryDatabase = jest.fn();
    const rows = [candidate(1, 0, 0, 0.1)];
    setDatabaseRows(queryDatabase, rows, rows);
    const { service } = createHarness({
      plan: { matchingRequestedDishes: ["dish"], suggestedSimilarDishes: [] },
      queryDatabase,
      createSearchId: () => "same-id",
    });
    const first = await service.startSearch("user-1", "first");

    await expect(service.startSearch("user-1", "second")).rejects.toMatchObject({
      statusCode: 503,
      code: "SEARCH_ID_COLLISION",
    });
    await expect(service.getPage("user-1", first.searchId)).resolves.toMatchObject({
      searchId: "same-id",
      matchingRequestedDishes: {
        results: [expect.objectContaining({ id: 1 })],
      },
    });
  });

  test("removes a new cache entry when the initial page lookup fails", async () => {
    const queryDatabase = jest.fn()
      .mockResolvedValueOnce({ rows: [candidate(1, 0, 0, 0.1)] })
      .mockRejectedValueOnce(new Error("availability lookup failed"));
    const { service } = createHarness({
      plan: { matchingRequestedDishes: ["dish"], suggestedSimilarDishes: [] },
      queryDatabase,
      createSearchId: () => "failed-initial-page",
    });

    await expect(service.startSearch("user-1", "dish")).rejects.toMatchObject({
      statusCode: 500,
      code: "DATABASE_ERROR",
      message: "Food search could not load current listings",
    });
    await expect(
      service.getPage("user-1", "failed-initial-page")
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "SEARCH_NOT_FOUND",
    });
  });

  test("still disables specific-dish semantic search when no calibrated threshold is supplied", async () => {
    const plan = jest.fn().mockResolvedValue({
      searchIntent: "specific_dish",
      foodTypes: [],
      searchTerms: [],
      expectedIngredients: [],
      excludedIngredients: [],
      searchDescription: "",
    });
    const queryDatabase = jest.fn();
    const service = createFoodSearchService({
      queryDatabase: queryDatabase as unknown as FoodSearchQuery,
      similarityThreshold: null,
      plan,
    });

    await expect(service.startSearch("user-1", "dish")).rejects.toMatchObject({
      statusCode: 503,
      code: "SEARCH_NOT_CALIBRATED",
    });
    expect(plan).toHaveBeenCalledTimes(1);
    expect(queryDatabase).not.toHaveBeenCalled();
  });
});
