import { randomBytes } from "node:crypto";
import { generateFoodEmbedding } from "./foodEmbeddingService";
import {
    FoodSearchPlannerResponse,
    planFoodSearchResponse,
} from "./foodSearchPlannerService";

const PAGE_SIZE = 10;
const DEFAULT_EMBEDDING_CONCURRENCY = 3;
const DEFAULT_EMBEDDING_OPERATION_TIMEOUT_MS = 180000;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_CACHE_ENTRIES = 100;
const DEFAULT_MAX_CACHE_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_CANDIDATES_PER_SEARCH = 5000;

function logFoodSearchDebug(label: string, details: unknown): void {
  if (process.env.NODE_ENV === "development") {
    console.debug(`[FoodSearch][Stage 2 – PostgreSQL] ${label}`, details);
  }
}

export interface FoodListing {
  id: number | string;
  chef_id: string;
  chef_name: string;
  name: string;
  description: string;
  price: string | number;
  image_key: string;
  ingredients: string[];
  is_available: boolean;
}

export interface FoodSearchPage {
  page: number;
  pageSize: number;
  hasMore: boolean;
  results: FoodListing[];
}

export interface FoodSearchResult {
  searchId: string;
  matchingRequestedDishes: FoodSearchPage;
  suggestedSimilarDishes: FoodSearchPage;
}

export interface FoodSearchPages {
  matchingPage?: number;
  similarPage?: number;
}

export class FoodSearchServiceError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string
  ) {
    super(message);
    this.name = "FoodSearchServiceError";
  }
}

interface CacheEntry {
  userId: string;
  matchingIds: string[];
  similarIds: string[];
  createdAt: number;
  expiresAt: number;
  bytes: number;
}

interface FoodSearchRow extends FoodListing {
  group_order: number;
  concept_order: number;
  cosine_distance: number | string;
  expected_ingredient_matches?: number | string;
}

interface FoodDatabaseRow extends FoodListing {}

interface QueryResult<Row> {
  rows: Row[];
}

export type FoodSearchQuery = (
  sql: string,
  parameters: unknown[]
) => Promise<QueryResult<FoodSearchRow | FoodDatabaseRow>>;

export interface FoodSearchServiceOptions {
  queryDatabase: FoodSearchQuery;
  similarityThreshold: number | null;
  plan?: (query: string) => Promise<FoodSearchPlannerResponse>;
  embed?: (concept: string, signal?: AbortSignal) => Promise<number[]>;
  maxEmbeddingConcurrency?: number;
  embeddingOperationTimeoutMs?: number;
  cacheTtlMs?: number;
  maxCacheEntries?: number;
  maxCacheBytes?: number;
  maxCandidatesPerSearch?: number;
  now?: () => number;
  createSearchId?: () => string;
}

function serviceError(message: string, statusCode: number, code: string) {
  return new FoodSearchServiceError(message, statusCode, code);
}

function normalizedConceptKey(concept: string): string {
  return concept.trim().replace(/\s+/g, " ").toLowerCase();
}

function validatePage(page: number | undefined): number {
  const value = page ?? 1;
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > Math.floor(Number.MAX_SAFE_INTEGER / PAGE_SIZE)
  ) {
    throw serviceError("Page must be a positive integer", 400, "INVALID_PAGE");
  }
  return value;
}

function validateServiceOptions(options: FoodSearchServiceOptions) {
  if (
    options.similarityThreshold !== null &&
    (!Number.isFinite(options.similarityThreshold) ||
      options.similarityThreshold < 0 ||
      options.similarityThreshold > 2)
  ) {
    throw new Error("Similarity threshold must be null or between 0 and 2");
  }

  const positiveOptions = [
    options.maxEmbeddingConcurrency ?? DEFAULT_EMBEDDING_CONCURRENCY,
    options.embeddingOperationTimeoutMs ?? DEFAULT_EMBEDDING_OPERATION_TIMEOUT_MS,
    options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
    options.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES,
    options.maxCacheBytes ?? DEFAULT_MAX_CACHE_BYTES,
    options.maxCandidatesPerSearch ?? DEFAULT_MAX_CANDIDATES_PER_SEARCH,
  ];
  if (positiveOptions.some((value) => !Number.isSafeInteger(value) || value < 1)) {
    throw new Error("Food search service limits must be positive integers");
  }
}

function orderedConcepts(plan: FoodSearchPlannerResponse): Array<{
  concept: string;
  groupOrder: number;
  conceptOrder: number;
}> {
  return [
    ...plan.searchTerms
      .filter(({ group }) => group === "matching")
      .map(({ term }, conceptOrder) => ({
        concept: term,
        groupOrder: 0,
        conceptOrder,
      })),
    ...plan.searchTerms
      .filter(({ group }) => group === "similar")
      .map(({ term }, conceptOrder) => ({
        concept: term,
        groupOrder: 1,
        conceptOrder,
      })),
  ];
}

async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<U>,
  signal: AbortSignal,
  onFailure: (error: unknown) => void
): Promise<U[]> {
  const results = new Array<U>(items.length);
  let nextIndex = 0;
  let failed = false;
  let failure: unknown;

  const worker = async () => {
    while (!failed) {
      const index = nextIndex++;
      if (index >= items.length) return;

      try {
        results[index] = await waitForAbort(mapper(items[index]), signal);
      } catch (error) {
        if (!failed) {
          failure = error;
          onFailure(error);
        }
        failed = true;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );

  if (failed) throw failure;
  return results;
}

function waitForAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? new Error("Embedding operation aborted"));
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason ?? new Error("Embedding operation aborted"));
    };

    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

const NON_VEGETARIAN_INGREDIENTS = [
  "chicken", "turkey", "duck", "beef", "lamb", "mutton", "pork", "ham", "bacon",
  "fish", "salmon", "tuna", "cod", "anchovy", "sardine", "prawn", "prawns",
  "shrimp", "crab", "lobster", "mussel", "oyster", "clam", "scallop", "squid",
  "octopus", "egg", "eggs", "gelatin", "lard", "chicken stock", "beef stock",
  "fish sauce", "oyster sauce", "meat stock",
];

const SEAFOOD_INGREDIENTS = [
  "fish", "salmon", "tuna", "cod", "anchovy", "sardine", "prawn", "prawns",
  "shrimp", "crab", "lobster", "mussel", "oyster", "clam", "scallop", "squid",
  "octopus",
];

const POULTRY_INGREDIENTS = ["chicken", "turkey", "duck"];

const INGREDIENT_SYNONYMS: Record<string, string[]> = {
  egg: ["egg", "eggs"],
  eggs: ["egg", "eggs"],
  shellfish: ["shellfish", "prawn", "prawns", "shrimp", "crab", "lobster", "mussel", "oyster", "clam", "scallop"],
  dairy: ["milk", "cream", "butter", "cheese", "yogurt", "yoghurt", "ghee"],
  "dairy products": ["milk", "cream", "butter", "cheese", "yogurt", "yoghurt", "ghee"],
};

function ingredientLookupKeys(value: string): string[] {
  const normalized = normalizedConceptKey(value).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const keys = new Set([normalized]);
  if (normalized === "fish") {
    keys.add("fish");
  } else if (normalized === "octopus" || normalized === "octopuses") {
    keys.add("octopus");
    keys.add("octopuses");
  } else if (normalized.endsWith("ies") && normalized.length > 3) {
    keys.add(`${normalized.slice(0, -3)}y`);
    keys.add(normalized);
    keys.add(`${normalized.slice(0, -3)}ies`);
  } else if (/[^aeiou]y$/.test(normalized)) {
    keys.add(`${normalized.slice(0, -1)}ies`);
  } else if (normalized.endsWith("s") && !normalized.endsWith("ss")) {
    keys.add(normalized.slice(0, -1));
  } else if (/(s|x|z|ch|sh)$/.test(normalized)) {
    keys.add(`${normalized}es`);
  } else if (normalized) {
    keys.add(`${normalized}s`);
  }
  return [...keys].filter(Boolean);
}

function expandIngredientTerms(terms: string[]): string[] {
  const resolved = new Set<string>();
  for (const rawTerm of terms) {
    const term = normalizedConceptKey(rawTerm);
    const synonyms = INGREDIENT_SYNONYMS[term] ?? [term];
    for (const synonym of synonyms) {
      for (const key of ingredientLookupKeys(synonym)) {
        resolved.add(key);
      }
    }
  }
  return [...resolved];
}

function normalizeFoodType(value: string): string {
  return normalizedConceptKey(value)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(dishes|items|foods|food)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ies$/, "y");
}

function escapeLike(value: string): string {
  return value.toLowerCase().replace(/[\\%_]/g, "\\$&");
}

interface BroadSearchCriteria {
  includeIngredients: string[];
  textPatterns: string[];
  excludeIngredients: string[];
  expectedIngredients: string[];
  allowAllEligibleFoods: boolean;
}

function broadSearchCriteria(
  plan: FoodSearchPlannerResponse,
  query: string
): BroadSearchCriteria {
  const types = plan.foodTypes.map(normalizeFoodType);
  const matchingTerms = plan.searchTerms
    .filter(({ group }) => group === "matching")
    .map(({ term }) => normalizedConceptKey(term));
  const biryaniFamily = /biryani|biriyani/i.test(query) ||
    [...types, ...matchingTerms].some((term) => /biryani|biriyani/i.test(term));

  const includes = new Set<string>();
  const textTerms = new Set<string>();
  let vegetarianRequested = false;

  for (const type of types) {
    const nonVegetarian = /\b(non ?veg|non vegetarian|meat|poultry)\b/.test(type);
    if (nonVegetarian) {
      NON_VEGETARIAN_INGREDIENTS.forEach((term) => includes.add(term));
      continue;
    }
    if (/\bvegetarian\b/.test(type)) {
      vegetarianRequested = true;
      continue;
    }
    if (/\b(seafood|fish)\b/.test(type)) {
      SEAFOOD_INGREDIENTS.forEach((term) => includes.add(term));
      continue;
    }
    if (/\b(poultry|chicken|turkey|duck)\b/.test(type)) {
      POULTRY_INGREDIENTS.forEach((term) => includes.add(term));
      continue;
    }
    if (biryaniFamily && /\b(rice|pilaf|pulao|curry|indian cuisine)\b/.test(type)) {
      continue;
    }
    if (/\brice\b/.test(type)) includes.add("rice");
    if (/\b(biryani|biriyani)\b/.test(type)) {
      textTerms.add("biryani");
      textTerms.add("biriyani");
    } else if (!/\b(indian|cuisine)\b/.test(type)) {
      textTerms.add(type);
    }
  }

  if (biryaniFamily) {
    textTerms.clear();
    textTerms.add("biryani");
    textTerms.add("biriyani");
    includes.clear();
  } else {
    matchingTerms
      .filter((term) => !/\b(non ?veg|non vegetarian|vegetarian|seafood)\b/.test(term))
      .forEach((term) => textTerms.add(term));
  }

  const explicitExclusions = expandIngredientTerms(plan.excludedIngredients);
  const dietaryExclusions = vegetarianRequested
    ? expandIngredientTerms(NON_VEGETARIAN_INGREDIENTS)
    : [];

  return {
    includeIngredients: expandIngredientTerms([...includes]),
    textPatterns: [...textTerms].map((term) => `%${escapeLike(term)}%`),
    excludeIngredients: [...new Set([...explicitExclusions, ...dietaryExclusions])],
    expectedIngredients: expandIngredientTerms(plan.expectedIngredients),
    allowAllEligibleFoods:
      vegetarianRequested && includes.size === 0 && textTerms.size === 0,
  };
}

function buildCandidateSql(
  concepts: Array<{
    groupOrder: number;
    conceptOrder: number;
    embedding: number[];
  }>,
  expectedIngredients: string[],
  excludeIngredients: string[],
  excludeFoodIds: string[],
  similarityThreshold: number,
  maxCandidatesPerSearch: number
): { sql: string; parameters: unknown[] } {
  const parameters: unknown[] = [];
  const values = concepts.map((concept, index) => {
    const base = index * 3;
    parameters.push(
      concept.groupOrder,
      concept.conceptOrder,
      JSON.stringify(concept.embedding)
    );
    return `($${base + 1}::integer, $${base + 2}::integer, $${base + 3}::vector)`;
  });
  parameters.push(expectedIngredients);
  const expectedIngredientsParameter = `$${parameters.length}`;
  parameters.push(excludeIngredients);
  const exclusionsParameter = `$${parameters.length}`;
  parameters.push(excludeFoodIds);
  const excludedIdsParameter = `$${parameters.length}`;
  parameters.push(similarityThreshold);
  const thresholdParameter = `$${parameters.length}`;
  parameters.push(maxCandidatesPerSearch + 1);
  const detectionLimitParameter = `$${parameters.length}`;

  return {
    sql: `WITH search_concepts(group_order, concept_order, query_embedding) AS (
         VALUES ${values.join(",\n                ")}
       ),
       concept_matches AS (
         SELECT
           search_concepts.group_order,
           search_concepts.concept_order,
           foods.id,
           foods.chef_id,
           chefs.name AS chef_name,
           foods.name,
           foods.description,
           foods.price,
           foods.image_key,
           foods.ingredients,
           foods.is_available,
           (
             SELECT COUNT(DISTINCT lower(btrim(listed.ingredient)))
             FROM unnest(COALESCE(foods.ingredients, '{}'::text[])) AS listed(ingredient)
             WHERE lower(btrim(listed.ingredient)) = ANY(${expectedIngredientsParameter}::text[])
           )::integer AS expected_ingredient_matches,
           foods.embedding <=> search_concepts.query_embedding AS cosine_distance
         FROM search_concepts
         CROSS JOIN public.foods AS foods
         JOIN public.chefs AS chefs ON chefs.id = foods.chef_id
         WHERE foods.is_available = TRUE
           AND foods.embedding IS NOT NULL
           AND foods.id::text <> ALL(${excludedIdsParameter}::text[])
           AND NOT EXISTS (
             SELECT 1
             FROM unnest(COALESCE(foods.ingredients, '{}'::text[])) AS listed(ingredient)
             WHERE lower(btrim(listed.ingredient)) = ANY(${exclusionsParameter}::text[])
           )
       ),
       relevant_matches AS (
         SELECT *
         FROM concept_matches
         WHERE cosine_distance <= ${thresholdParameter}
       ),
       prioritized_matches AS (
         SELECT
           relevant_matches.*,
           ROW_NUMBER() OVER (
             PARTITION BY id
             ORDER BY group_order, concept_order, expected_ingredient_matches DESC, cosine_distance, id
           ) AS food_priority
         FROM relevant_matches
       )
       SELECT
         id,
         chef_id,
         chef_name,
         name,
         description,
         price,
         image_key,
         ingredients,
         is_available,
         group_order,
         concept_order,
         expected_ingredient_matches,
         cosine_distance
       FROM prioritized_matches
       WHERE food_priority = 1
       ORDER BY group_order, concept_order, expected_ingredient_matches DESC, cosine_distance, id
       LIMIT ${detectionLimitParameter}`,
    parameters,
  };
}

const BROAD_FOOD_SEARCH_SQL = `
  SELECT
    foods.id,
    foods.name,
    foods.ingredients,
    (
      SELECT COUNT(DISTINCT lower(btrim(listed.ingredient)))
      FROM unnest(COALESCE(foods.ingredients, '{}'::text[])) AS listed(ingredient)
      WHERE lower(btrim(listed.ingredient)) = ANY($4::text[])
    )::integer AS expected_ingredient_matches
  FROM public.foods AS foods
  WHERE foods.is_available = TRUE
    AND (
      (
        cardinality($1::text[]) > 0
        AND EXISTS (
          SELECT 1
          FROM unnest(COALESCE(foods.ingredients, '{}'::text[])) AS listed(ingredient)
          WHERE lower(btrim(listed.ingredient)) = ANY($1::text[])
        )
      )
      OR (
        cardinality($2::text[]) > 0
        AND (
          lower(COALESCE(foods.name, '')) LIKE ANY($2::text[])
          OR lower(COALESCE(foods.description, '')) LIKE ANY($2::text[])
        )
      )
      OR $6::boolean = TRUE
    )
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(COALESCE(foods.ingredients, '{}'::text[])) AS listed(ingredient)
      WHERE lower(btrim(listed.ingredient)) = ANY($3::text[])
    )
    AND (cardinality($3::text[]) = 0 OR cardinality(foods.ingredients) > 0)
  ORDER BY expected_ingredient_matches DESC, foods.name, foods.id
  LIMIT $5`;

const INGREDIENT_SUGGESTION_SQL = `
  SELECT
    foods.id,
    (
      SELECT COUNT(DISTINCT lower(btrim(listed.ingredient)))
      FROM unnest(COALESCE(foods.ingredients, '{}'::text[])) AS listed(ingredient)
      WHERE lower(btrim(listed.ingredient)) = ANY($1::text[])
    )::integer AS expected_ingredient_matches
  FROM public.foods AS foods
  WHERE foods.is_available = TRUE
    AND cardinality($1::text[]) > 0
    AND EXISTS (
      SELECT 1
      FROM unnest(COALESCE(foods.ingredients, '{}'::text[])) AS listed(ingredient)
      WHERE lower(btrim(listed.ingredient)) = ANY($1::text[])
    )
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(COALESCE(foods.ingredients, '{}'::text[])) AS listed(ingredient)
      WHERE lower(btrim(listed.ingredient)) = ANY($2::text[])
    )
  ORDER BY expected_ingredient_matches DESC, foods.name, foods.id
  LIMIT $3`;

const BROAD_EXCLUSION_DIAGNOSTIC_SQL = `
  /* development-only exclusion diagnostic */
  SELECT foods.id, foods.name, foods.ingredients
  FROM public.foods AS foods
  WHERE foods.is_available = TRUE
    AND (
      (
        cardinality($1::text[]) > 0
        AND EXISTS (
          SELECT 1
          FROM unnest(COALESCE(foods.ingredients, '{}'::text[])) AS listed(ingredient)
          WHERE lower(btrim(listed.ingredient)) = ANY($1::text[])
        )
      )
      OR (
        cardinality($2::text[]) > 0
        AND (
          lower(COALESCE(foods.name, '')) LIKE ANY($2::text[])
          OR lower(COALESCE(foods.description, '')) LIKE ANY($2::text[])
        )
      )
      OR $5::boolean = TRUE
    )
    AND cardinality($3::text[]) > 0
    AND EXISTS (
      SELECT 1
      FROM unnest(COALESCE(foods.ingredients, '{}'::text[])) AS listed(ingredient)
      WHERE lower(btrim(listed.ingredient)) = ANY($3::text[])
    )
  ORDER BY foods.name, foods.id
  LIMIT $4`;

function compareFoodIds(left: number | string, right: number | string): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return String(left).localeCompare(String(right), undefined, { numeric: true });
}

function estimateCacheEntryBytes(
  searchId: string,
  entry: Omit<CacheEntry, "bytes">
): number {
  return Buffer.byteLength(JSON.stringify({ searchId, ...entry }), "utf8");
}

export function createFoodSearchService(options: FoodSearchServiceOptions) {
  validateServiceOptions(options);

  const embed = options.embed ?? ((concept: string, signal?: AbortSignal) =>
    generateFoodEmbedding(concept, "", [], signal)
  );
  const now = options.now ?? Date.now;
  const createSearchId = options.createSearchId ?? (() =>
    randomBytes(32).toString("base64url")
  );
  const maxEmbeddingConcurrency =
    options.maxEmbeddingConcurrency ?? DEFAULT_EMBEDDING_CONCURRENCY;
  const embeddingOperationTimeoutMs =
    options.embeddingOperationTimeoutMs ?? DEFAULT_EMBEDDING_OPERATION_TIMEOUT_MS;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const maxCacheEntries = options.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES;
  const maxCacheBytes = options.maxCacheBytes ?? DEFAULT_MAX_CACHE_BYTES;
  const maxCandidatesPerSearch =
    options.maxCandidatesPerSearch ?? DEFAULT_MAX_CANDIDATES_PER_SEARCH;
  const cache = new Map<string, CacheEntry>();
  let cacheBytes = 0;

  function deleteCacheEntry(searchId: string) {
    const entry = cache.get(searchId);
    if (!entry) return;
    cacheBytes -= entry.bytes;
    cache.delete(searchId);
  }

  function pruneExpiredEntries(currentTime: number) {
    for (const [searchId, entry] of cache) {
      if (entry.expiresAt <= currentTime) deleteCacheEntry(searchId);
    }
  }

  function saveCacheEntry(searchId: string, entry: Omit<CacheEntry, "bytes">) {
    const bytes = estimateCacheEntryBytes(searchId, entry);
    if (bytes > maxCacheBytes) {
      throw serviceError(
        "The complete food search is too large to cache",
        503,
        "SEARCH_CACHE_ENTRY_TOO_LARGE"
      );
    }

    while (
      cache.size >= maxCacheEntries ||
      cacheBytes + bytes > maxCacheBytes
    ) {
      const oldestSearchId = cache.keys().next().value as string | undefined;
      if (!oldestSearchId) break;
      deleteCacheEntry(oldestSearchId);
    }

    deleteCacheEntry(searchId);
    const fullEntry: CacheEntry = { ...entry, bytes };
    cache.set(searchId, fullEntry);
    cacheBytes += bytes;
  }

  function getCacheEntry(userId: string | number, searchId: string): CacheEntry {
    pruneExpiredEntries(now());
    const entry = cache.get(searchId);
    if (!entry || entry.userId !== String(userId)) {
      throw serviceError("Food search was not found", 404, "SEARCH_NOT_FOUND");
    }

    // Refresh LRU order, but retain the fixed expiry from creation time.
    cache.delete(searchId);
    cache.set(searchId, entry);
    return entry;
  }

  async function getAvailableFoods(ids: string[]): Promise<Map<string, FoodListing>> {
    if (ids.length === 0) return new Map();

    try {
      const result = await options.queryDatabase(
        `SELECT
           foods.id,
           foods.chef_id,
           chefs.name AS chef_name,
           foods.name,
           foods.description,
           foods.price,
           foods.image_key,
           foods.ingredients,
           foods.is_available
         FROM public.foods AS foods
         JOIN public.chefs AS chefs ON chefs.id = foods.chef_id
         WHERE foods.id::text = ANY($1::text[])
           AND foods.is_available = TRUE`,
        [ids]
      );

      return new Map(result.rows.map((row) => [String(row.id), row]));
    } catch {
      throw serviceError("Food search could not load current listings", 500, "DATABASE_ERROR");
    }
  }

  async function pageForGroup(
    orderedIds: string[],
    availableFoods: Map<string, FoodListing>,
    page: number
  ): Promise<FoodSearchPage> {
    const offset = (page - 1) * PAGE_SIZE;
    const pageIds = orderedIds.slice(offset, offset + PAGE_SIZE);
    const results = pageIds
      .map((id) => availableFoods.get(id))
      .filter((food): food is FoodListing => Boolean(food));
    const hasMore = orderedIds
      .slice(offset + PAGE_SIZE)
      .some((id) => availableFoods.has(id));

    return {
      page,
      pageSize: PAGE_SIZE,
      hasMore,
      results,
    };
  }

  async function getPage(
    userId: string | number,
    searchId: string,
    pages: FoodSearchPages = {}
  ): Promise<FoodSearchResult> {
    const matchingPage = validatePage(pages.matchingPage);
    const similarPage = validatePage(pages.similarPage);
    const entry = getCacheEntry(userId, searchId);
    const allIds = [...new Set([...entry.matchingIds, ...entry.similarIds])];
    const availableFoods = await getAvailableFoods(allIds);

    const pageResult: FoodSearchResult = {
      searchId,
      matchingRequestedDishes: await pageForGroup(
        entry.matchingIds,
        availableFoods,
        matchingPage
      ),
      suggestedSimilarDishes: await pageForGroup(
        entry.similarIds,
        availableFoods,
        similarPage
      ),
    };

    logFoodSearchDebug("Final food-search results returned", {
      searchId,
      matchingRequestedDishes: pageResult.matchingRequestedDishes.results.map(
        ({ id, name, ingredients }) => ({ id, name, ingredients })
      ),
      suggestedSimilarDishes: pageResult.suggestedSimilarDishes.results.map(
        ({ id, name, ingredients }) => ({ id, name, ingredients })
      ),
    });

    return pageResult;
  }

  async function startSearch(
    userId: string | number,
    query: string,
    pages: FoodSearchPages = {}
  ): Promise<FoodSearchResult> {
    validatePage(pages.matchingPage);
    validatePage(pages.similarPage);
    if (typeof query !== "string" || !query.trim() || query.trim().length > 500) {
      throw serviceError("Search query must contain 1 to 500 characters", 400, "INVALID_QUERY");
    }
    if ((typeof userId !== "string" && typeof userId !== "number") || !String(userId).trim()) {
      throw serviceError("Authenticated user is required", 401, "UNAUTHENTICATED");
    }

    let searchPlan: FoodSearchPlannerResponse;
    try {
      searchPlan = options.plan
        ? await options.plan(query.trim())
        : await planFoodSearchResponse(query.trim());
    } catch {
      throw serviceError("Food search planning failed", 502, "PLANNER_ERROR");
    }

    let matchingIds: string[] = [];
    let similarIds: string[] = [];
    const isBroadSearch = searchPlan.searchIntent === "broad_food_search";
    const isVegetarianSearch = searchPlan.foodTypes.some((type) => {
      const normalized = normalizeFoodType(type);
      return /\bvegetarian\b/.test(normalized) &&
        !/\bnon vegetarian\b|\bnon veg\b/.test(normalized);
    });
    const expectedIngredients = expandIngredientTerms(searchPlan.expectedIngredients);
    const excludedIngredients = expandIngredientTerms([
      ...searchPlan.excludedIngredients,
      ...(isVegetarianSearch ? NON_VEGETARIAN_INGREDIENTS : []),
    ]);

    if (isBroadSearch) {
      const criteria = broadSearchCriteria(searchPlan, query.trim());
      if (
        criteria.includeIngredients.length === 0 &&
        criteria.textPatterns.length === 0 &&
        !criteria.allowAllEligibleFoods &&
        expectedIngredients.length === 0
      ) {
        throw serviceError(
          "Food search planning did not identify a searchable food type",
          502,
          "PLANNER_ERROR"
        );
      }

      logFoodSearchDebug("Criteria passed to PostgreSQL", {
        foodTypes: searchPlan.foodTypes,
        matchingTerms: searchPlan.searchTerms
          .filter(({ group }) => group === "matching")
          .map(({ term }) => term),
        includeIngredients: criteria.includeIngredients,
        expectedIngredients: criteria.expectedIngredients,
        excludeIngredients: criteria.excludeIngredients,
        textPatterns: criteria.textPatterns,
        availableOnly: true,
      });

      try {
        const result = await options.queryDatabase(BROAD_FOOD_SEARCH_SQL, [
          criteria.includeIngredients,
          criteria.textPatterns,
          criteria.excludeIngredients,
          criteria.expectedIngredients,
          maxCandidatesPerSearch + 1,
          criteria.allowAllEligibleFoods,
        ]);
        matchingIds = [...new Set(result.rows.map((row) => String(row.id)))];
        logFoodSearchDebug(
          "Food records matched by PostgreSQL",
          result.rows.map((row) => {
            const food = row as unknown as {
              id: number | string;
              name?: string;
              ingredients?: string[];
            };
            return { id: food.id, name: food.name, ingredients: food.ingredients };
          })
        );
      } catch {
        throw serviceError("Food search matching failed", 500, "DATABASE_ERROR");
      }

      if (process.env.NODE_ENV === "development" && criteria.excludeIngredients.length > 0) {
        try {
          const excludedResult = await options.queryDatabase(
            BROAD_EXCLUSION_DIAGNOSTIC_SQL,
            [
              criteria.includeIngredients,
              criteria.textPatterns,
              criteria.excludeIngredients,
              maxCandidatesPerSearch + 1,
              criteria.allowAllEligibleFoods,
            ]
          );
          logFoodSearchDebug(
            "Food records rejected by exclusion ingredients",
            excludedResult.rows.map((row) => {
              const food = row as unknown as {
                id: number | string;
                name?: string;
                ingredients?: string[];
              };
              return { id: food.id, name: food.name, ingredients: food.ingredients };
            })
          );
        } catch {
          logFoodSearchDebug(
            "Exclusion diagnostic query failed",
            "Search results were not affected"
          );
        }
      }
    }

    const concepts = orderedConcepts(searchPlan).filter(
      (item) => !isBroadSearch || item.groupOrder === 1
    );
    if (!isBroadSearch || concepts.length > 0) {
      if (options.similarityThreshold === null) {
        if (!isBroadSearch) {
          throw serviceError(
            "Food search is unavailable until its similarity threshold is calibrated",
            503,
            "SEARCH_NOT_CALIBRATED"
          );
        }
        logFoodSearchDebug(
          "Similar food search skipped",
          "The similarity threshold is not calibrated"
        );
      }

      const uniqueConcepts = new Map<string, string>();
      for (const item of concepts) {
        const key = normalizedConceptKey(item.concept);
        if (!uniqueConcepts.has(key)) uniqueConcepts.set(key, item.concept);
      }

      let embeddings: number[][] = [];
      const embeddingController = new AbortController();
      let embeddingTimedOut = false;
      const embeddingTimeout = setTimeout(() => {
        embeddingTimedOut = true;
        embeddingController.abort(new Error("Food concept embedding operation timed out"));
      }, embeddingOperationTimeoutMs);
      try {
        if (concepts.length > 0 && options.similarityThreshold !== null) {
          const uniqueEntries = [...uniqueConcepts.entries()];
          embeddings = await mapWithConcurrency(
            uniqueEntries,
            maxEmbeddingConcurrency,
            ([, concept]) => embed(concept, embeddingController.signal),
            embeddingController.signal,
            () => {
              if (!embeddingController.signal.aborted) {
                embeddingController.abort(new Error("A food concept embedding failed"));
              }
            }
          );
        }
      } catch {
        if (embeddingTimedOut) {
          throw serviceError(
            "Food concept embedding timed out",
            504,
            "EMBEDDING_TIMEOUT"
          );
        }
        throw serviceError("Food concept embeddings could not be generated", 502, "EMBEDDING_ERROR");
      } finally {
        clearTimeout(embeddingTimeout);
      }

      if (concepts.length > 0 && options.similarityThreshold !== null) {
        const vectorByConcept = new Map<string, number[]>();
        [...uniqueConcepts.keys()].forEach((key, index) => {
          vectorByConcept.set(key, embeddings[index]);
        });

        const sqlConcepts = concepts.map((item) => ({
          groupOrder: item.groupOrder,
          conceptOrder: item.conceptOrder,
          embedding: vectorByConcept.get(normalizedConceptKey(item.concept))!,
        }));
        const candidateQuery = buildCandidateSql(
          sqlConcepts,
          expectedIngredients,
          excludedIngredients,
          isBroadSearch ? matchingIds : [],
          options.similarityThreshold,
          maxCandidatesPerSearch
        );

        let rows: FoodSearchRow[];
        try {
          const result = await options.queryDatabase(
            candidateQuery.sql,
            candidateQuery.parameters
          );
          rows = result.rows as FoodSearchRow[];
        } catch {
          throw serviceError("Food search matching failed", 500, "DATABASE_ERROR");
        }

        rows.sort((left, right) =>
          left.group_order - right.group_order ||
          left.concept_order - right.concept_order ||
          Number(right.expected_ingredient_matches ?? 0) -
            Number(left.expected_ingredient_matches ?? 0) ||
          Number(left.cosine_distance) - Number(right.cosine_distance) ||
          compareFoodIds(left.id, right.id)
        );

        const seenFoodIds = new Set<string>();
        for (const row of rows) {
          const foodId = String(row.id);
          if (seenFoodIds.has(foodId)) continue;
          seenFoodIds.add(foodId);
          (row.group_order === 0 ? matchingIds : similarIds).push(foodId);
        }
      }
    }

    // Ingredient suggestions are independent of vector matching and broad/specific intent.
    // A food is suggested when at least one expected ingredient exists in its ingredient list.
    // Do not remove foods just because they also appear in the matched list.
    if (expectedIngredients.length > 0) {
      try {
        console.log("DEBUG expectedIngredients:", expectedIngredients);
console.log("DEBUG excludedIngredients:", excludedIngredients);
        const ingredientResult = await options.queryDatabase(
          INGREDIENT_SUGGESTION_SQL,
          [
            expectedIngredients,
            excludedIngredients,
            maxCandidatesPerSearch + 1,
          ]
        );

        similarIds = [
          ...new Set(ingredientResult.rows.map((row) => String(row.id))),
        ];

        logFoodSearchDebug(
          "Food records suggested by ingredient matches",
          ingredientResult.rows.map((row) => {
            const food = row as unknown as {
              id: number | string;
              expected_ingredient_matches?: number | string;
            };
            return {
              id: food.id,
              expectedIngredientMatches: food.expected_ingredient_matches,
            };
          })
        );
      } catch {
        throw serviceError(
          "Ingredient-based food suggestions failed",
          500,
          "DATABASE_ERROR"
        );
      }
    }

    const candidateCount = matchingIds.length + similarIds.length;
    if (candidateCount > maxCandidatesPerSearch) {
      throw serviceError(
        "The complete food search exceeds the candidate limit",
        503,
        "SEARCH_CANDIDATE_LIMIT_EXCEEDED"
      );
    }

    const currentTime = now();
    pruneExpiredEntries(currentTime);
    const searchId = createSearchId();
    if (cache.has(searchId)) {
      throw serviceError("Could not create a food search", 503, "SEARCH_ID_COLLISION");
    }
    const cacheEntry = {
      userId: String(userId),
      matchingIds,
      similarIds,
      createdAt: currentTime,
      expiresAt: currentTime + cacheTtlMs,
    };

    try {
      saveCacheEntry(searchId, cacheEntry);
    } catch (error) {
      if (error instanceof FoodSearchServiceError) throw error;
      throw serviceError("Food search cache is unavailable", 503, "SEARCH_CACHE_ERROR");
    }

    try {
      return await getPage(userId, searchId, pages);
    } catch (error) {
      deleteCacheEntry(searchId);
      throw error;
    }
  }

  return { startSearch, getPage };
}
