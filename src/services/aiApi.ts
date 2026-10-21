
const API_URL = "http://localhost:3000";

export async function getRecipeSuggestions(
  ingredients: string,
  token: string
): Promise<string> {
  const response = await fetch(`${API_URL}/ai/suggest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ingredients }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to get recipe suggestions");
  }

  return data.suggestions;
}
