import type { Chef } from "./chefTypes";
export async function fetchChefsFromApi():Promise<Chef[]>{
    const response =await fetch ("http://localhost:3000/chefs");
    if(!response.ok){
        throw new Error("Failed to fetch chefs from API");
    }
    return response.json();
}