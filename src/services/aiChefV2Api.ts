import { authenticatedFetch } from "./api";

export interface AiChefV2FoodRecord {
  id: number | string;
  chef_id: string;
  chef_name: string;
  name: string;
  description: string;
  price: number | string;
  image_key: string;
  ingredients: string[];
  is_available: boolean;
}

export type AiChefV2SearchStatus = "complete" | "partial" | "unavailable";
export type AiChefV2ResponseSource = "ollama" | "fallback";

export interface AiChefV2ChatResponse {
  answer: string;
  foodRecords: AiChefV2FoodRecord[];
  searchStatus: AiChefV2SearchStatus;
  responseSource: AiChefV2ResponseSource;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFoodRecord(value: unknown): value is AiChefV2FoodRecord {
  return (
    isRecord(value) &&
    (typeof value.id === "string" || typeof value.id === "number") &&
    typeof value.chef_id === "string" &&
    typeof value.chef_name === "string" &&
    typeof value.name === "string" &&
    typeof value.description === "string" &&
    (typeof value.price === "string" ||
      (typeof value.price === "number" && Number.isFinite(value.price))) &&
    typeof value.image_key === "string" &&
    Array.isArray(value.ingredients) &&
    value.ingredients.every((ingredient) => typeof ingredient === "string") &&
    typeof value.is_available === "boolean"
  );
}

function isAiChefV2ChatResponse(value: unknown): value is AiChefV2ChatResponse {
  return (
    isRecord(value) &&
    typeof value.answer === "string" &&
    Array.isArray(value.foodRecords) &&
    value.foodRecords.every(isFoodRecord) &&
    (value.searchStatus === "complete" ||
      value.searchStatus === "partial" ||
      value.searchStatus === "unavailable") &&
    (value.responseSource === "ollama" || value.responseSource === "fallback")
  );
}

export async function sendAiChefV2Message(
  message: string
): Promise<AiChefV2ChatResponse> {
  let response: Response;
  try {
    response = await authenticatedFetch("/ai-chef-v2/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "SESSION_EXPIRED") {
      throw error;
    }
    throw new Error("Unable to reach AI Chef V2. Please try again.");
  }

  const payload: unknown = await response.json().catch(() => null);
  if (isAiChefV2ChatResponse(payload)) {
    // The backend can return verified partial records with an HTTP 502 fallback.
    return payload;
  }

  if (!response.ok) {
    const messageFromServer =
      isRecord(payload) && typeof payload.message === "string"
        ? payload.message
        : `AI Chef V2 request failed (HTTP ${response.status})`;
    throw new Error(messageFromServer);
  }

  throw new Error("AI Chef V2 returned an invalid response.");
}
