
const API_URL = "http://localhost:3000";
import { authenticatedFetch } from "./api";
export async function getRecipeSuggestions(
  ingredients: string,
): Promise<string> {
  const response = await authenticatedFetch("/ai/suggest", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ingredients }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to get recipe suggestions");
  }

  return data.suggestions;
}
