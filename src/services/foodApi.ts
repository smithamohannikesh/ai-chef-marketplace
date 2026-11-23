import { authenticatedFetch } from "./api";

export interface Food {
  id: number;
  chef_id: string;
  chef_name: string;
  name: string;
  description: string;
  price: number | string;
  image_key: string;
  is_available: boolean;
}

export async function fetchFoodsFromApi(): Promise<Food[]> {
  const response = await authenticatedFetch("/foods");

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));

    throw new Error(
      data.message || `Failed to fetch foods (HTTP ${response.status})`
    );
  }

  return response.json();
}
