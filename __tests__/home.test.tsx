
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import HomeScreen from "../src/app/(tabs)/index";
import { fetchChefsFromApi } from "../src/services/chefApi";
import { fetchFoodsFromApi } from "../src/services/foodApi";
jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
  },
}));

jest.mock("expo-secure-store", () => ({
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock("react-redux", () => ({
  useSelector: (selector: (state: any) => any) =>
    selector({ cart: { items: [] } }),
}));

jest.mock("../src/services/chefApi", () => ({
  fetchChefsFromApi: jest.fn(() => Promise.resolve([])),
}));

jest.mock("../src/services/foodApi", () => ({
  fetchFoodsFromApi: jest.fn(() => Promise.resolve([])),
}));

jest.mock("../src/services/chefservice", () => ({
  listenToChefs: jest.fn(() => jest.fn()),
}));

jest.mock("../src/services/chefSocket", () => ({
  chefSocket: {
    connect: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    disconnect: jest.fn(),
  },
}));

jest.mock("../src/components/ChefCard", () => {
  const React = require("react");
  const { Text } = require("react-native");

  return ({ name }: { name: string }) =>
    React.createElement(Text, null, name);
});
jest.mock("../src/components/FoodCard", () => {
  const React = require("react");
  const { Pressable, Text } = require("react-native");

  return ({ name, onPress }: { name: string; onPress: () => void }) =>
    React.createElement(
      Pressable,
      { onPress },
      React.createElement(Text, null, name)
    );
});

describe("Home Screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should delete authentication tokens and navigate to Login on logout", async () => {
    const screen = await render(<HomeScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText("Logout"));
    });

    await waitFor(() => {
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
        "accessToken"
      );

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
        "refreshToken"
      );

      expect(router.replace).toHaveBeenCalledWith("/login");
    });
  });

  test("opens the existing AI food search screen from the Home card", async () => {
    const screen = await render(<HomeScreen />);

    fireEvent.press(
      screen.getByRole("button", { name: "Open AI Food Assistant" })
    );

    expect(router.push).toHaveBeenCalledWith("/ai-food-assistant");
  });

  test("should display chefs returned by the Node.js API", async () => {
  (fetchChefsFromApi as jest.Mock).mockResolvedValue([
    {
      id: 1,
      name: "Test Chef",
    },
  ]);

  const screen = await  render(<HomeScreen />);

  expect(await screen.findByText("Test Chef")).toBeTruthy();
});
test("should display foods returned by the foods API", async () => {
  (fetchFoodsFromApi as jest.Mock).mockResolvedValue([
    {
      id: 1,
      chef_id: "chef2",
      chef_name: "Test Chef",
      name: "Chicken noodles",
      description: "Noodles with chicken",
      price: "20.00",
      image_key: "food1",
      is_available: true,
    },
  ]);

  const screen = await render(<HomeScreen />);

  expect(await screen.findByText("Chicken noodles")).toBeTruthy();
  expect(fetchFoodsFromApi).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByText("Chicken noodles"));
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/food-details",
    params: {
      foodId: "1",
      name: "Chicken noodles",
      description: "Noodles with chicken",
      image: "food1",
      price: "20.00",
    },
  });
});
test("should display an error and allow retry when foods API fails", async () => {
  (fetchFoodsFromApi as jest.Mock)
    .mockRejectedValueOnce(new Error("Foods API unavailable"))
    .mockResolvedValueOnce([]);

  const screen = await render(<HomeScreen />);

  expect(await screen.findByText("Foods API unavailable")).toBeTruthy();
  fireEvent.press(screen.getByText("Retry foods"));

  await waitFor(() => {
    expect(fetchFoodsFromApi).toHaveBeenCalledTimes(2);
    expect(screen.getByText("No foods available.")).toBeTruthy();
  });
});
test("redirects to login when the foods request reports an expired session", async () => {
  (fetchFoodsFromApi as jest.Mock).mockRejectedValue(
    new Error("SESSION_EXPIRED")
  );

  await render(<HomeScreen />);

  await waitFor(() => {
    expect(router.replace).toHaveBeenCalledWith("/login");
  });
});
test("should display an error when the Node.js API fails", async () => {
  (fetchChefsFromApi as jest.Mock).mockRejectedValue(
    new Error("Network error")
  );

  const screen =  await render(<HomeScreen />);

  expect(
    await screen.findByText("Network error")
  ).toBeTruthy();
});
});
