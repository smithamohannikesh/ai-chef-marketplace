
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import HomeScreen from "../src/app/(tabs)/index";
import { fetchChefsFromApi } from "../src/services/chefApi";
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
jest.mock("../src/components/FoodCard", () => () => null);

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
