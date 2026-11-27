/** Food and chef fields returned by the AI Chef V2 food repository. */
export interface FoodSearchRecord {
  id: number | string;
  chef_id: string;
  chef_name: string;
  name: string;
  description: string;
  price: string | number;
  image_key: string;
  ingredients: string[];
  is_available: boolean;
}
