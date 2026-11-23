import { Router } from "express";
import { pool } from "../db";
import { generateFoodEmbedding } from "../services/foodEmbeddingService";
import {
  createFoodSearchService,
  FoodSearchQuery,
  FoodSearchServiceError,
} from "../services/foodSearchService";
import { authenticateToken, AuthRequest } from "./middleware/authMiddlewate";

const router = Router();
const foodSearchService = createFoodSearchService({
  queryDatabase: (sql, parameters) =>
    pool.query(sql, parameters) as ReturnType<FoodSearchQuery>,
  // Initial experimental cosine-distance threshold; calibrate against real search results.
  similarityThreshold: 0.20,
});

const MAX_SEARCH_QUERY_LENGTH = 500;
const MAX_PAGE_NUMBER = Math.floor(Number.MAX_SAFE_INTEGER / 10);

function isValidPage(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= MAX_PAGE_NUMBER
  );
}

router.get("/", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         foods.id,
         foods.chef_id,
         chefs.name AS chef_name,
         foods.name,
         foods.description,
         foods.price,
         foods.image_key,
         foods.is_available
       FROM public.foods AS foods
       JOIN public.chefs AS chefs ON chefs.id = foods.chef_id
       WHERE foods.is_available = $1
       ORDER BY foods.name, foods.id`,
      [true]
    );

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching foods:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

router.post("/", authenticateToken, async (req, res) => {
  const body = req.body;

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return res.status(400).json({
      message: "Request body must be a JSON object",
    });
  }

  const allowedFields = [
    "chef_id",
    "name",
    "description",
    "price",
    "image_key",
    "ingredients",
  ];
  const unsupportedFields = Object.keys(body).filter(
    (field) => !allowedFields.includes(field)
  );

  if (unsupportedFields.length > 0) {
    return res.status(400).json({
      message: "Unsupported fields provided",
      fields: unsupportedFields,
    });
  }

  const { chef_id, name, description, price, image_key, ingredients } = body;

  if (
    typeof chef_id !== "string" ||
    !chef_id.trim() ||
    typeof name !== "string" ||
    !name.trim() ||
    typeof description !== "string" ||
    !description.trim() ||
    typeof image_key !== "string" ||
    !image_key.trim() ||
    typeof price !== "number" ||
    !Number.isFinite(price) ||
    price < 0 ||
    !Array.isArray(ingredients) ||
    ingredients.length === 0 ||
    ingredients.some(
      (ingredient: unknown) =>
        typeof ingredient !== "string" || !ingredient.trim()
    )
  ) {
    return res.status(400).json({
      message:
        "chef_id, name, description, image_key, a non-negative price, and a non-empty array of non-empty ingredient strings are required",
    });
  }

  const cleanChefId = chef_id.trim();
  const cleanName = name.trim();
  const cleanDescription = description.trim();
  const cleanImageKey = image_key.trim();
  const cleanIngredients = ingredients.map((ingredient: string) =>
    ingredient.trim()
  );

  try {
    const chefResult = await pool.query(
      "SELECT id FROM public.chefs WHERE id = $1",
      [cleanChefId]
    );

    if (chefResult.rows.length === 0) {
      return res.status(400).json({
        message: "chef_id must reference an existing chef",
      });
    }

    let embedding: number[];

    try {
      embedding = await generateFoodEmbedding(
        cleanName,
        cleanDescription,
        cleanIngredients
      );
    } catch (error) {
      console.error("Error generating food embedding:", error);
      return res.status(502).json({
        message: "The food embedding service could not process this food",
      });
    }

    const result = await pool.query(
      `WITH inserted_food AS (
         INSERT INTO public.foods (
           chef_id,
           name,
           description,
           price,
           image_key,
           ingredients,
           embedding
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7::vector)
         RETURNING
           id,
           chef_id,
           name,
           description,
           price,
           image_key,
           ingredients,
           is_available,
           created_at
       )
       SELECT
         inserted_food.id,
         inserted_food.chef_id,
         chefs.name AS chef_name,
         inserted_food.name,
         inserted_food.description,
         inserted_food.price,
         inserted_food.image_key,
         inserted_food.ingredients,
         inserted_food.is_available,
         inserted_food.created_at
       FROM inserted_food
       JOIN public.chefs AS chefs ON chefs.id = inserted_food.chef_id`,
      [
        cleanChefId,
        cleanName,
        cleanDescription,
        price,
        cleanImageKey,
        cleanIngredients,
        JSON.stringify(embedding),
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating food:", error);

    if (typeof error === "object" && error !== null && "code" in error) {
      const databaseError = error as { code: string; constraint?: string };

      if (
        databaseError.code === "23505" &&
        databaseError.constraint === "foods_image_key_key"
      ) {
        return res.status(409).json({
          message: "A food with this image_key already exists",
        });
      }

      if (databaseError.code === "23503") {
        return res.status(400).json({
          message: "chef_id must reference an existing chef",
        });
      }

      if (databaseError.code === "23514") {
        return res.status(400).json({
          message: "Food details do not satisfy database constraints",
        });
      }
    }

    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

router.post("/search", authenticateToken, async (req, res) => {
  const body = req.body;

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return res.status(400).json({
      message: "Request body must be a JSON object",
    });
  }

  const allowedFields = ["query", "searchId", "matchingPage", "similarPage"];
  const unsupportedFields = Object.keys(body).filter(
    (field) => !allowedFields.includes(field)
  );
  if (unsupportedFields.length > 0) {
    return res.status(400).json({
      message: "Unsupported fields provided",
      code: "INVALID_INPUT",
      fields: unsupportedFields,
    });
  }

  const hasQuery = Object.prototype.hasOwnProperty.call(body, "query");
  const hasSearchId = Object.prototype.hasOwnProperty.call(body, "searchId");

  if (hasQuery === hasSearchId) {
    return res.status(400).json({
      message: "Provide either a query or a searchId, but not both",
      code: "INVALID_INPUT",
    });
  }

  const matchingPage = body.matchingPage ?? 1;
  const similarPage = body.similarPage ?? 1;
  if (
    (body.matchingPage !== undefined && !isValidPage(body.matchingPage)) ||
    (body.similarPage !== undefined && !isValidPage(body.similarPage))
  ) {
    return res.status(400).json({
      message: "Page numbers must be positive integers",
      code: "INVALID_PAGE",
    });
  }

  if (hasQuery) {
    if (
      typeof body.query !== "string" ||
      !body.query.trim() ||
      body.query.trim().length > MAX_SEARCH_QUERY_LENGTH
    ) {
      return res.status(400).json({
        message: `Search query must contain 1 to ${MAX_SEARCH_QUERY_LENGTH} characters`,
        code: "INVALID_QUERY",
      });
    }
  } else if (
    typeof body.searchId !== "string" ||
    !body.searchId.trim() ||
    body.searchId !== body.searchId.trim()
  ) {
    return res.status(400).json({
      message: "searchId must be a non-empty string",
      code: "INVALID_SEARCH_ID",
    });
  }

  try {
    const userId = (req as AuthRequest).userId;
    if (typeof userId !== "number") {
      return res.status(401).json({
        message: "Authentication token is required",
        code: "UNAUTHENTICATED",
      });
    }

    const pages = { matchingPage, similarPage };
    const result = hasQuery
      ? await foodSearchService.startSearch(userId, body.query.trim(), pages)
      : await foodSearchService.getPage(userId, body.searchId, pages);

    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof FoodSearchServiceError) {
      return res.status(error.statusCode).json({
        message: error.message,
        code: error.code,
      });
    }

    console.error("Error searching foods:", error);
    return res.status(500).json({
      message: "Failed to search foods",
      code: "INTERNAL_ERROR",
    });
  }
});

export default router;
