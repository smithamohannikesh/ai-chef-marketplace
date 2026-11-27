import type { QueryResultRow } from "pg";
import { pool } from "../../db";
import { logAiChefV2Event } from "../diagnosticLogger";
import type { FoodSearchRecord } from "../types/foodTypes";

export type { FoodSearchRecord } from "../types/foodTypes";

export class FoodRepositoryError extends Error {
  readonly code = "FOOD_SEARCH_FAILED";
  readonly cause: unknown;

  constructor(cause: unknown) {
    super("Food search could not be completed");
    this.name = "FoodRepositoryError";
    this.cause = cause;
  }
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 10;
const MAX_FOOD_NAME_LENGTH = 200;

export async function searchFoodsByName(
  foodName: string,
  limit = DEFAULT_LIMIT
): Promise<FoodSearchRecord[]> {
  if (
    typeof foodName !== "string" ||
    !foodName.trim() ||
    foodName.trim().length > MAX_FOOD_NAME_LENGTH
  ) {
    throw new TypeError(
      `foodName must contain 1 to ${MAX_FOOD_NAME_LENGTH} characters`
    );
  }

  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new RangeError(`limit must be an integer between 1 and ${MAX_LIMIT}`);
  }

  const keywords = foodName
    .trim()
    .split(/\s+/)
    .filter((keyword) => keyword.length > 0);

  try {
    const startedAt = Date.now();
    const result = await pool.query<FoodSearchRecord & QueryResultRow>(
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
       WHERE foods.is_available = TRUE
         AND NOT EXISTS (
           SELECT 1
           FROM unnest($1::text[]) AS search_terms(keyword)
           WHERE strpos(lower(foods.name), lower(search_terms.keyword)) = 0
         )
       ORDER BY foods.name, foods.id
       LIMIT $2`,
      [keywords, limit]
    );

    logAiChefV2Event("food_repository_search_completed", {
      tool: "searchFoods",
      success: true,
      durationMs: Date.now() - startedAt,
      resultCount: result.rows.length,
    });
    return result.rows;
  } catch (error) {
    logAiChefV2Event("food_repository_search_failed", {
      tool: "searchFoods",
      success: false,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorCode: "FOOD_SEARCH_FAILED",
    });
    throw new FoodRepositoryError(error);
  }
}
