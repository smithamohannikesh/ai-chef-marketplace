import { describe, expect, jest, test } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";
import CartScreen from "../src/app/cart";
import { clearCart, decreaseQuantity, increaseQuantity, removeFromCart } from "../src/store/cartSlice";
const mockCartItems: any[] = [];
const mockDispatch = jest.fn();
const mockCreateOrder = jest.fn(() => Promise.resolve({ id: 101 }));
jest.mock("react-redux", () => ({
  useDispatch: () => mockDispatch,
  useSelector: (selector: any) =>
    selector({
      cart: {
        items: mockCartItems,
      },
    }),
}));
jest.mock("../src/store/cartSlice", () => ({
  clearCart: jest.fn(),
  decreaseQuantity: jest.fn(),
  increaseQuantity: jest.fn(),
  removeFromCart: jest.fn(),
}));

jest.mock("@/services/orderApi", () => ({
  createOrder: (...args: any[]) => mockCreateOrder(...args),
}));
describe("Cart Screen", () => {
  beforeEach(() => {
  mockCartItems.length = 0;
  jest.clearAllMocks();
});
  test("should display empty cart message", async () => {
    const rendered = await render(<CartScreen />);

    expect(rendered.getByText("Your cart is empty")).toBeTruthy();
  });
  test("should calculate and display total price", async () => {
  mockCartItems.push(
    {
      id: "food1",
      name: "Chicken Biryani",
      description: "Delicious chicken biryani",
      price: 25,
      image: "food1",
      quantity: 2,
    },
    {
      id: "food2",
      name: "Chicken Curry",
      description: "Spicy chicken curry",
      price: 30,
      image: "food2",
      quantity: 1,
    }
  );

  const rendered = await render(<CartScreen />);

  expect(rendered.getByText("Total: AED 80")).toBeTruthy();

  mockCartItems.length = 0;
});
test("should increase quantity when plus button is pressed",async () => {
  mockCartItems.push({
    id: "food1",
    name: "Chicken Biryani",
    description: "Delicious chicken biryani",
    price: 25,
    image: "food1",
    quantity: 2,
  });

  const rendered = await  render(<CartScreen />);

  fireEvent.press(rendered.getByText("+"));

  expect(increaseQuantity).toHaveBeenCalledWith("food1");

  mockCartItems.length = 0;
});
test("should decrease quantity when minus button is pressed", async () => {
  mockCartItems.push({
    id: "food1",
    name: "Chicken Biryani",
    description: "Delicious chicken biryani",
    price: 25,
    image: "food1",
    quantity: 2,
  });

  const rendered = await render(<CartScreen />);


  fireEvent.press(rendered.getByText("−"));
  expect(decreaseQuantity).toHaveBeenCalledWith("food1");

  mockCartItems.length = 0;
});
test("should remove item when trash button is pressed", async () => {
  mockCartItems.push({
    id: "food1",
    name: "Chicken Biryani",
    description: "Delicious chicken biryani",
    price: 25,
    image: "food1",
    quantity: 2,
  });

  const rendered = await render(<CartScreen />);

  fireEvent.press(rendered.getByText("🗑️"));

  expect(removeFromCart).toHaveBeenCalledWith("food1");

  mockCartItems.length = 0;
});
test("should create an order when checkout is pressed", async () => {
  mockCartItems.push({
    id: "food1",
    name: "Chicken Biryani",
    description: "Delicious chicken biryani",
    price: 25,
    image: "food1",
    quantity: 2,
  });

  const rendered = await render(<CartScreen />);

  fireEvent.press(rendered.getByText("Proceed to Checkout"));
expect(mockCreateOrder).toHaveBeenCalledWith("Smitha", 50);
expect(
  await rendered.findByText("Order #101 created successfully!")
).toBeTruthy();
expect(clearCart).toHaveBeenCalled();
  mockCartItems.length = 0;
});

test("should display an error when checkout fails", async () => {
jest.clearAllMocks();
  mockCartItems.push({
    id: "food1",
    name: "Chicken Biryani",
    description: "Delicious chicken biryani",
    price: 25,
    image: "food1",
    quantity: 2,
  });

  mockCreateOrder.mockRejectedValueOnce(
    new Error("Network error")
  );

  const rendered = await render(<CartScreen />);

  fireEvent.press(rendered.getByText("Proceed to Checkout"));

  expect(await rendered.findByText("Network error")).toBeTruthy();

  expect(clearCart).not.toHaveBeenCalled();

  mockCartItems.length = 0;
});

test("should show loading state while checkout is pending", async () => {
  mockCartItems.push({
    id: "food1",
    name: "Chicken Biryani",
    description: "Delicious chicken biryani",
    price: 25,
    image: "food1",
    quantity: 2,
  });

  let resolveOrder!: (value: { id: number }) => void;

  mockCreateOrder.mockImplementationOnce(
    () =>
      new Promise<{ id: number }>((resolve) => {
        resolveOrder = resolve;
      })
  );

  const rendered = await render(<CartScreen />);

  fireEvent.press(rendered.getByText("Proceed to Checkout"));

expect(await rendered.findByText("Placing Order...")).toBeTruthy();

  resolveOrder({ id: 102 });

  expect(
    await rendered.findByText("Order #102 created successfully!")
  ).toBeTruthy();

  mockCartItems.length = 0;
});

test("should prevent duplicate orders while checkout is pending", async () => {
  mockCartItems.push({
    id: "food1",
    name: "Chicken Biryani",
    description: "Delicious chicken biryani",
    price: 25,
    image: "food1",
    quantity: 2,
  });

  let resolveOrder!: (value: { id: number }) => void;

  mockCreateOrder.mockImplementationOnce(
    () =>
      new Promise<{ id: number }>((resolve) => {
        resolveOrder = resolve;
      })
  );

  const rendered = await render(<CartScreen />);

  fireEvent.press(rendered.getByText("Proceed to Checkout"));

  // Wait until checkout enters its loading state.
  expect(
    await rendered.findByText("Placing Order...")
  ).toBeTruthy();

  // The button should now be disabled.
  expect(
    rendered.getByText("Placing Order...").parent?.props
      .accessibilityState?.disabled
  ).toBe(true);

  // Only one API request should have been made.
  expect(mockCreateOrder).toHaveBeenCalledTimes(1);

  resolveOrder({ id: 103 });

  expect(
    await rendered.findByText("Order #103 created successfully!")
  ).toBeTruthy();

  mockCartItems.length = 0;
});

});