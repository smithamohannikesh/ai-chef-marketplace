import {
  FoodRepositoryError,
  searchFoodsByName,
} from "../repositories/foodRepository";
import {
  isAiChefV2Development,
  logAiChefV2Event,
  redactDiagnosticValue,
} from "../diagnosticLogger";
import {
  ToolArguments,
  ToolDefinition,
  ToolExecutionResult,
} from "../types/toolTypes";
import type { FoodSearchRecord } from "../types/foodTypes";

const DEFAULT_LIMIT = 10;
const MAX_FOOD_NAME_LENGTH = 200;

export const searchFoodsTool: ToolDefinition = {
  type: "function",
  function: {
    name: "searchFoods",
    description:
      "Search available marketplace foods by name. Use this before answering food searches.",
    parameters: {
      type: "object",
      properties: {
        foodName: {
          type: "string",
          description: "A non-empty food name to search for.",
          minLength: 1,
          maxLength: MAX_FOOD_NAME_LENGTH,
        },
      },
      required: ["foodName"],
    },
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateToolArguments(
  input: unknown
): { arguments: ToolArguments } | { error: string } {
  if (!isRecord(input)) {
    return { error: "Tool arguments must be an object." };
  }

  const unexpectedArguments = Object.keys(input).filter(
    (key) => key !== "foodName" && key !== "limit"
  );
  if (unexpectedArguments.length > 0) {
    return { error: "Tool arguments contain unsupported fields." };
  }

  const { foodName, limit } = input;
  if (
    typeof foodName !== "string" ||
    !foodName.trim() ||
    foodName.trim().length > MAX_FOOD_NAME_LENGTH
  ) {
    return { error: "foodName must be a non-empty string of at most 200 characters." };
  }

  if (
    limit !== undefined &&
    (!Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > 10)
  ) {
    return { error: "limit must be an integer between 1 and 10." };
  }

  return {
    arguments: {
      foodName: foodName.trim(),
      limit: limit === undefined ? DEFAULT_LIMIT : limit,
    },
  };
}

function failure(error: string): ToolExecutionResult<FoodSearchRecord[]> {
  return {
    toolName: searchFoodsTool.function.name,
    success: false,
    content: error,
    error,
  };
}

export async function executeSearchFoodsTool(
  input: unknown
): Promise<ToolExecutionResult<FoodSearchRecord[]>> {
  const validated = validateToolArguments(input);
  logAiChefV2Event("tool_arguments_validation", {
    tool: searchFoodsTool.function.name,
    success: !("error" in validated),
    ...(isAiChefV2Development()
      ? { diagnosticArguments: redactDiagnosticValue(input) }
      : {}),
    ...("error" in validated ? { validationError: validated.error } : {}),
  });
  if ("error" in validated) {
    return failure(validated.error);
  }

  const foodName = validated.arguments.foodName as string;
  const limit = validated.arguments.limit as number;
  const startedAt = Date.now();
  logAiChefV2Event("food_search_tool_started", {
    tool: searchFoodsTool.function.name,
    ...(isAiChefV2Development()
      ? { diagnosticSearchArguments: redactDiagnosticValue({ foodName, limit }) }
      : {}),
  });

  try {
    const foods = await searchFoodsByName(foodName, limit);
    logAiChefV2Event("food_search_tool_completed", {
      tool: searchFoodsTool.function.name,
      success: true,
      durationMs: Date.now() - startedAt,
      resultCount: foods.length,
    });
    return {
      toolName: searchFoodsTool.function.name,
      success: true,
      content: JSON.stringify({ foods }),
      structuredData: foods,
    };
  } catch (error) {
    if (error instanceof FoodRepositoryError) {
      logAiChefV2Event("food_search_tool_completed", {
        tool: searchFoodsTool.function.name,
        success: false,
        durationMs: Date.now() - startedAt,
        errorName: error.name,
        errorCode: error.code,
      });
      return failure("Food search is temporarily unavailable.");
    }

    logAiChefV2Event("food_search_tool_completed", {
      tool: searchFoodsTool.function.name,
      success: false,
      durationMs: Date.now() - startedAt,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorCode: "FOOD_SEARCH_FAILED",
    });
    return failure("Food search could not be completed.");
  }
}
