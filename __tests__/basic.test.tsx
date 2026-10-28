
import { describe, expect, jest, test } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import FoodDetailsScreen from "../src/app/food-details";
import { addToCart } from "../src/store/cartSlice";
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
  },
  useLocalSearchParams: jest.fn(() => ({
    name: "Chicken Biryani",
    description: "Delicious chicken biryani",
    price: "25",
    image: "food1",
  })),
}));

const mockDispatch = jest.fn();

jest.mock("react-redux", () => ({
  useDispatch: () => mockDispatch,
}));
jest.mock("../src/store/cartSlice", () => ({
  addToCart: jest.fn((payload) => ({
    type: "cart/addToCart",
    payload,
  })),
}));

describe("Food Details Screen",() => {
  test("should display food details", async () => {
const rendered = await  render(<FoodDetailsScreen />);

   expect(rendered.getByText("Chicken Biryani")).toBeTruthy();
expect(rendered.getByText("Delicious chicken biryani")).toBeTruthy();
expect(rendered.getByText("AED 25")).toBeTruthy();
expect(rendered.getByText("Add to Cart")).toBeTruthy();
  });
  test("should add food to cart and navigate to cart", async () => {
  const rendered = await render(<FoodDetailsScreen />);

  fireEvent.press(rendered.getByText("Add to Cart"));
  expect(addToCart).toHaveBeenCalledWith({
  id: "food1",
  name: "Chicken Biryani",
  description: "Delicious chicken biryani",
  price: 25,
  image: "food1",
  quantity: 1,
});
  expect(router.push).toHaveBeenCalledWith("/cart");
});
test("should use fallback image when image parameter is invalid", async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({
    name: "Chicken Biryani",
    description: "Delicious chicken biryani",
    price: "25",
    image: "invalidImage",
  });

  const rendered = await render(<FoodDetailsScreen />);

  expect(rendered.getByText("Chicken Biryani")).toBeTruthy();
  expect(rendered.getByText("Add to Cart")).toBeTruthy();
});
test("should render when food details are missing", async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({
    image: "food1",
  });

  const rendered = await render(<FoodDetailsScreen />);

  expect(rendered.getByText("Add to Cart")).toBeTruthy();
});
test("should not dispatch an action on initial render", async () => {
  mockDispatch.mockClear();

  await render(<FoodDetailsScreen />);

  expect(mockDispatch).not.toHaveBeenCalled();
});
test("should dispatch addToCart when Add to Cart is pressed", async () => {
  mockDispatch.mockClear();

  const rendered = await render(<FoodDetailsScreen />);

  fireEvent.press(rendered.getByText("Add to Cart"));

  expect(mockDispatch).toHaveBeenCalledWith(
    expect.objectContaining({
      type: expect.any(String),
    })
  );
});
});
