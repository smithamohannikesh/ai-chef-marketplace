import { authenticatedFetch } from "./api";
import type { Chef } from "./chefTypes";
export async function fetchChefsFromApi(): Promise<Chef[]> {
    const response = await authenticatedFetch("/chefs");
   if (!response.ok) {
    const data = await response.json().catch(() => ({}));

    throw new Error(
      data.message || `Failed to fetch chefs (HTTP ${response.status})`
    );
    }

    return response.json();
}
