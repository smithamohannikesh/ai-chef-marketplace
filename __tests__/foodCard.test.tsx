import { render } from "@testing-library/react-native";
import FoodCard from "../src/components/FoodCard";

describe("FoodCard", () => {
  test("keeps the existing card content when optional details are omitted", async () => {
    const screen = await render(
      <FoodCard
        name="Chicken noodles"
        image={1}
        description="Noodles with chicken"
        onPress={jest.fn()}
      />
    );

    expect(screen.getByText("Chicken noodles")).toBeTruthy();
    expect(screen.getByText("Noodles with chicken")).toBeTruthy();
    expect(screen.queryByText(/Chef:/)).toBeNull();
    expect(screen.queryByText(/AED/)).toBeNull();
    expect(screen.queryByText(/Ingredients:/)).toBeNull();
  });

  test("renders optional chef, price and ingredient details", async () => {
    const screen = await render(
      <FoodCard
        name="Chicken noodles"
        image={1}
        description="Noodles with chicken"
        onPress={jest.fn()}
        chefName="Chef Smita"
        price="35.00"
        ingredients={["chicken", "noodles", "garlic"]}
      />
    );

    expect(screen.getByText("Chef: Chef Smita")).toBeTruthy();
    expect(screen.getByText("AED 35.00")).toBeTruthy();
    expect(
      screen.getByText("Ingredients: chicken, noodles, garlic")
    ).toBeTruthy();
  });

  test("displays a numeric zero price when supplied", async () => {
    const screen = await render(
      <FoodCard
        name="Free sample"
        image={1}
        description="Sample description"
        onPress={jest.fn()}
        price={0}
      />
    );

    expect(screen.getByText("AED 0")).toBeTruthy();
  });
});
