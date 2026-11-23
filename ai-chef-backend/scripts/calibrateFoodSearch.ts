import { pool } from "../db";
import { generateFoodEmbedding } from "../services/foodEmbeddingService";
import { planFoodSearch } from "../services/foodSearchPlannerService";

const TEST_QUERIES = [
  "Spicy chicken noodles",
  "Creamy chicken curry",
  "Kerala seafood curry",
  "Creamy vegetarian pasta",
  "Chocolate dessert",
  "Fresh vegetable salad",
];

const RESULTS_PER_CONCEPT = 20;
const RESULTS_PER_GROUP = 5;

interface FoodMatch {
  id: number | string;
  name: string;
  chef_name: string;
  cosine_distance: number | string;
}

interface RankedFoodMatch {
  food: FoodMatch;
  generatedConcept: string;
  conceptOrder: number;
}

async function runCalibration() {
  try {
    for (const customerQuery of TEST_QUERIES) {
      console.log(`\nCustomer query: ${customerQuery}`);
      const plan = await planFoodSearch(customerQuery);
      const groups = [
        {
          label: "matching",
          concepts: plan.matchingRequestedDishes,
        },
        {
          label: "similar",
          concepts: plan.suggestedSimilarDishes,
        },
      ];

      for (const group of groups) {
        const candidates: RankedFoodMatch[] = [];

        for (const [conceptOrder, concept] of group.concepts.entries()) {
          const embedding = await generateFoodEmbedding(concept, "", []);
          const result = await pool.query<FoodMatch>(
            `SELECT
               foods.id,
               foods.name,
               chefs.name AS chef_name,
               foods.embedding <=> $1::vector AS cosine_distance
             FROM public.foods AS foods
             JOIN public.chefs AS chefs ON chefs.id = foods.chef_id
             WHERE foods.is_available = TRUE
               AND foods.embedding IS NOT NULL
             ORDER BY foods.embedding <=> $1::vector ASC, foods.id ASC
             LIMIT $2`,
            [JSON.stringify(embedding), RESULTS_PER_CONCEPT]
          );

          for (const food of result.rows) {
            candidates.push({
              food,
              generatedConcept: concept,
              conceptOrder,
            });
          }
        }

        candidates.sort(
          (left, right) =>
            left.conceptOrder - right.conceptOrder ||
            Number(left.food.cosine_distance) - Number(right.food.cosine_distance) ||
            String(left.food.id).localeCompare(String(right.food.id), undefined, {
              numeric: true,
            })
        );

        const seenFoodIds = new Set<string>();
        const topMatches: RankedFoodMatch[] = [];
        for (const candidate of candidates) {
          const foodId = String(candidate.food.id);
          if (seenFoodIds.has(foodId)) continue;

          seenFoodIds.add(foodId);
          topMatches.push(candidate);
          if (topMatches.length === RESULTS_PER_GROUP) break;
        }

        if (topMatches.length === 0) {
          console.log({
            customerQuery,
            conceptGroup: group.label,
            message: "No available foods with embeddings were found.",
          });
          continue;
        }

        for (const match of topMatches) {
          console.log({
            customerQuery,
            conceptGroup: group.label,
            generatedConcept: match.generatedConcept,
            foodId: match.food.id,
            foodName: match.food.name,
            chefName: match.food.chef_name,
            cosineDistance: Number(match.food.cosine_distance).toFixed(4),
          });
        }
      }
    }
  } catch (error) {
    console.error(
      "Food search calibration failed:",
      error instanceof Error ? error.message : error
    );
    process.exitCode = 1;
  } finally {
    try {
      await pool.end();
    } catch (error) {
      console.error(
        "Could not close the PostgreSQL pool:",
        error instanceof Error ? error.message : error
      );
      process.exitCode = 1;
    }
  }
}

void runCalibration();
