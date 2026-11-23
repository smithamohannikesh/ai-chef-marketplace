import { config } from "../config";

const MAX_QUERY_LENGTH = 500;
const MAX_CONCEPT_LENGTH = 160;
const MAX_FOOD_TYPES = 10;
const MAX_FOOD_TYPE_LENGTH = 80;
const MAX_SEARCH_TERMS_PER_GROUP = 10;
const MAX_TOTAL_SEARCH_TERMS = MAX_SEARCH_TERMS_PER_GROUP * 2;
const MAX_PLANNER_INGREDIENTS = 20;
const MAX_PLANNER_INGREDIENT_LENGTH = 80;
const MAX_SEARCH_DESCRIPTION_LENGTH = 500;
const PLANNER_TIMEOUT_MS = 120000;

function logPlannerDebug(label: string, details: unknown): void {
  if (process.env.NODE_ENV === "development") {
    console.debug(`[FoodSearch][Stage 1 – Planner] ${label}`, details);
  }
}

export type SearchIntent = "broad_food_search" | "specific_dish";
export type SearchTermGroup = "matching" | "similar";

export interface SearchTerm {
  group: SearchTermGroup;
  term: string;
}

/** Structured search interpretation returned by the Ollama planner. */
export interface FoodSearchPlannerResponse {
  searchIntent: SearchIntent;
  foodTypes: string[];
  searchTerms: SearchTerm[];
  expectedIngredients: string[];
  excludedIngredients: string[];
  searchDescription: string;
}

/** Legacy shape retained for the isolated calibration script. */
export interface FoodSearchPlan {
  searchMode?: "specific_dish" | "broad_ingredient";
  includeIngredients?: string[];
  excludeIngredients?: string[];
  matchingRequestedDishes: string[];
  suggestedSimilarDishes: string[];
}

interface OllamaGenerateResponse {
  response?: unknown;
}

function cleanPlannerStringArray(
  value: unknown,
  fieldName: string,
  maxItems: number,
  maxLength: number
): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Ollama returned an invalid ${fieldName} list`);
  }
  if (value.length > maxItems) {
    throw new Error(`Ollama returned too many values in ${fieldName}`);
  }

  const cleaned: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string") {
      throw new Error(`Ollama returned a non-text value in ${fieldName}`);
    }

    const text = item.trim().replace(/\s+/g, " ");
    if (!text) {
      throw new Error(`Ollama returned an empty value in ${fieldName}`);
    }
    if (text.length > maxLength) {
      throw new Error(`Ollama returned an overly long value in ${fieldName}`);
    }

    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(text);
  }

  return cleaned;
}

/**
 * Validates Ollama's proposed generic planner response before the search
 * service maps it to database criteria.
 */
export function validateFoodSearchPlannerResponse(
  value: unknown
): FoodSearchPlannerResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Ollama returned an invalid food search planner object");
  }

  const record = value as Record<string, unknown>;
  const allowedFields = new Set([
    "searchIntent",
    "foodTypes",
    "searchTerms",
    "expectedIngredients",
    "excludedIngredients",
    "searchDescription",
  ]);
  const unsupportedFields = Object.keys(record).filter(
    (field) => !allowedFields.has(field)
  );
  if (unsupportedFields.length > 0) {
    throw new Error("Ollama returned unsupported food search planner fields");
  }

  if (
    record.searchIntent !== "broad_food_search" &&
    record.searchIntent !== "specific_dish"
  ) {
    throw new Error("Ollama returned an invalid searchIntent");
  }

  if (typeof record.searchDescription !== "string") {
    throw new Error("Ollama returned an invalid searchDescription");
  }
  const searchDescription = record.searchDescription.trim();
  if (searchDescription.length > MAX_SEARCH_DESCRIPTION_LENGTH) {
    throw new Error("Ollama returned an overly long searchDescription");
  }

  if (!Array.isArray(record.searchTerms)) {
    throw new Error("Ollama returned an invalid searchTerms list");
  }
  if (record.searchTerms.length > MAX_TOTAL_SEARCH_TERMS) {
    throw new Error("Ollama returned too many values in searchTerms");
  }

  const searchTerms: SearchTerm[] = [];
  const seenTermsByGroup: Record<SearchTermGroup, Set<string>> = {
    matching: new Set<string>(),
    similar: new Set<string>(),
  };
  const groupCounts: Record<SearchTermGroup, number> = {
    matching: 0,
    similar: 0,
  };

  for (const item of record.searchTerms) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new Error("Ollama returned an invalid search term");
    }

    const termRecord = item as Record<string, unknown>;
    if (
      Object.keys(termRecord).some(
        (field) => field !== "group" && field !== "term"
      ) ||
      (termRecord.group !== "matching" &&
 termRecord.group !== "similar" &&
 termRecord.group !== "original")
    ) {
      throw new Error("Ollama returned an invalid search term group");
    }
    if (typeof termRecord.term !== "string") {
      throw new Error("Ollama returned a non-text search term");
    }

    const term = termRecord.term.trim().replace(/\s+/g, " ");
    if (!term) throw new Error("Ollama returned an empty search term");
    if (term.length > MAX_CONCEPT_LENGTH) {
      throw new Error("Ollama returned an overly long search term");
    }

    const group: SearchTermGroup =
  termRecord.group === "original" ? "matching" : termRecord.group as SearchTermGroup;
    const key = term.toLowerCase();
    if (seenTermsByGroup[group].has(key)) continue;
    groupCounts[group] += 1;
    if (groupCounts[group] > MAX_SEARCH_TERMS_PER_GROUP) {
      throw new Error(`Ollama returned too many ${group} search terms`);
    }
    seenTermsByGroup[group].add(key);
    searchTerms.push({ group, term });
  }

  return {
    searchIntent: record.searchIntent,
    foodTypes: cleanPlannerStringArray(
      record.foodTypes,
      "foodTypes",
      MAX_FOOD_TYPES,
      MAX_FOOD_TYPE_LENGTH
    ),
    searchTerms,
    expectedIngredients: cleanPlannerStringArray(
      record.expectedIngredients,
      "expectedIngredients",
      MAX_PLANNER_INGREDIENTS,
      MAX_PLANNER_INGREDIENT_LENGTH
    ),
    excludedIngredients: cleanPlannerStringArray(
      record.excludedIngredients,
      "excludedIngredients",
      MAX_PLANNER_INGREDIENTS,
      MAX_PLANNER_INGREDIENT_LENGTH
    ),
    searchDescription,
  };
}

export async function planFoodSearchResponse(
  query: string
): Promise<FoodSearchPlannerResponse> {
  if (typeof query !== "string") {
    throw new Error("Food search query must be text");
  }

  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    throw new Error("Food search query must not be empty");
  }

  if (trimmedQuery.length > MAX_QUERY_LENGTH) {
    throw new Error(
      `Food search query must not exceed ${MAX_QUERY_LENGTH} characters`
    );
  }

  logPlannerDebug("Original customer query", trimmedQuery);

  const expectedResponseFormat = "json";
  const prompt = `
You are an assistant that interprets food-search requests. Return one valid JSON object only. Do not include Markdown or text outside the JSON.

Customer query: ${JSON.stringify(trimmedQuery)}


Interpret this query and fill the fields with relevant values. Do not copy empty arrays from a template. For a specific dish, include the original dish as the first matching search term, then close matching terms, followed by suitable similar dishes.

Use exactly these fields:

- searchIntent: "broad_food_search" or "specific_dish"
- foodTypes: an array of relevant food groups or dish types
- searchTerms: an array of objects, each with group ("matching" or "similar") and term
- expectedIngredients: an array of specific ingredient names that commonly help identify or rank the requested food(maximum array sizeis 10 and minimum array size is 1)
- excludedIngredients: an array of ingredients the customer explicitly excludes
- searchDescription: a short summary of the customer's intent

Required JSON shape: {"searchIntent":"broad_food_search or specific_dish","foodTypes":[],"searchTerms":[{"group":"matching or similar","term":"..."}],"expectedIngredients":[],"excludedIngredients":[],"searchDescription":"..."}`;


  let response: Response;

  try {
    logPlannerDebug(
      "Complete planner prompt sent to Ollama",
      prompt
    );
    logPlannerDebug("Expected Ollama response format", expectedResponseFormat);

    response = await fetch(
      `${config.ollamaUrl.replace(/\/$/, "")}/api/generate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: config.ollamaModel,
          prompt,
          format: expectedResponseFormat,
          stream: false,
          options: {
            temperature: 0,
          },
        }),
        signal: AbortSignal.timeout(PLANNER_TIMEOUT_MS),
      }
    );
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("Ollama food search planning timed out");
    }

    throw new Error("Could not connect to the Ollama food search planner");
  }

  if (!response.ok) {
    throw new Error(
      `Ollama food search planner returned status ${response.status}`
    );
  }

  let data: unknown;

  try {
    data = await response.json();
  } catch {
    throw new Error("Ollama returned an invalid food search response");
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("Ollama returned an invalid food search response object");
  }

  const rawPlannerResponse = (data as OllamaGenerateResponse).response;
  logPlannerDebug("Raw response received from Ollama", rawPlannerResponse);

  if (typeof rawPlannerResponse !== "string" || !rawPlannerResponse.trim()) {
    throw new Error("Ollama returned an empty food search plan");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawPlannerResponse);
  } catch {
    throw new Error("Ollama returned malformed JSON for the food search plan");
  }

  logPlannerDebug("Parsed planner JSON", parsed);
  return validateFoodSearchPlannerResponse(parsed);
}

/** Compatibility projection for the existing calibration script. */
export async function planFoodSearch(query: string): Promise<FoodSearchPlan> {
  const plan = await planFoodSearchResponse(query);
  return {
    searchMode: plan.searchIntent === "broad_food_search" ? "broad_ingredient" : "specific_dish",
    includeIngredients:
      plan.searchIntent === "broad_food_search" ? plan.foodTypes : [],
    excludeIngredients: plan.excludedIngredients,
    matchingRequestedDishes: plan.searchTerms
      .filter(({ group }) => group === "matching")
      .map(({ term }) => term),
    suggestedSimilarDishes: plan.searchTerms
      .filter(({ group }) => group === "similar")
      .map(({ term }) => term),
  };
}
