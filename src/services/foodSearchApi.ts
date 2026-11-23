import { authenticatedFetch } from "./api";

export interface FoodSearchResult {
  id: string | number;
  chef_id: string;
  chef_name: string;
  name: string;
  description: string;
  price: number | string;
  image_key: string;
  ingredients: string[];
  is_available: boolean;
}

export interface FoodSearchPage {
  page: number;
  pageSize: number;
  hasMore: boolean;
  results: FoodSearchResult[];
}

export interface FoodSearchResponse {
  searchId: string;
  matchingRequestedDishes: FoodSearchPage;
  suggestedSimilarDishes: FoodSearchPage;
}

async function postFoodSearchRequest(
  body: Record<string, string | number>
): Promise<FoodSearchResponse> {
  const response = await authenticatedFetch("/foods/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));

    throw new Error(
      data.message || `Failed to search foods (HTTP ${response.status})`
    );
  }

  return (await response.json()) as FoodSearchResponse;
}

export async function searchFoodsFromApi(
  query: string,
  matchingPage = 1,
  similarPage = 1
): Promise<FoodSearchResponse> {
  return postFoodSearchRequest({ query, matchingPage, similarPage });
}

export async function fetchFoodSearchPageFromApi(
  searchId: string,
  matchingPage = 1,
  similarPage = 1
): Promise<FoodSearchResponse> {
  return postFoodSearchRequest({ searchId, matchingPage, similarPage });
}
