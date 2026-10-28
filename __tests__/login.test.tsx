
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Alert } from "react-native";
import LoginScreen from "../src/app/login";
import { loginUser } from "../src/services/authApi";
jest.mock("expo-router", () => ({
    router: {
        replace: jest.fn(),
        push: jest.fn(),
    },
}));

jest.mock("expo-secure-store", () => ({
    setItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock("../src/services/authApi", () => ({
    loginUser: jest.fn(),
}));

describe("Login Screen", () => {
    test("should display the login screen fields", async () => {
        const rendered = await render(<LoginScreen />);

        expect(rendered.getByText("Welcome Back")).toBeTruthy();
        expect(rendered.getByPlaceholderText("Email")).toBeTruthy();
        expect(rendered.getByPlaceholderText("Password")).toBeTruthy();
        expect(rendered.getByText("Login")).toBeTruthy();
        expect(
            rendered.getByText("Don't have an account? Register")
        ).toBeTruthy();
    });

    test("should show validation alert when fields are empty", async () => {
        const alertSpy = jest.spyOn(Alert, "alert");

        const rendered = await render(<LoginScreen />);

        fireEvent.press(rendered.getByText("Login"));

        expect(alertSpy).toHaveBeenCalledWith(
            "Required",
            "Please enter email and password."
        );

        const { loginUser } = require("../src/services/authApi");
        expect(loginUser).not.toHaveBeenCalled();

        alertSpy.mockRestore();
    });

    test("should save tokens and show success alert after login", async () => {
        const alertSpy = jest.spyOn(Alert, "alert");

        (loginUser as jest.Mock).mockResolvedValueOnce({
            token: "test-access-token",
            refreshToken: "test-refresh-token",
            user: {
                id: 1,
                name: "Smitha",
                email: "smitha@example.com",
            },
        });

        const rendered = await render(<LoginScreen />);

        await act(async () => {
            fireEvent.changeText(
                rendered.getByPlaceholderText("Email"),
                "smitha@example.com"
            );

            fireEvent.changeText(
                rendered.getByPlaceholderText("Password"),
                "test-password"
            );
        });
        expect(rendered.getByPlaceholderText("Email").props.value)
            .toBe("smitha@example.com");

        expect(rendered.getByPlaceholderText("Password").props.value)
            .toBe("test-password");
        await act(async () => {
            fireEvent.press(rendered.getByText("Login"));
        });

        // Wait until the login API is called.
        await waitFor(() => {
            expect(loginUser).toHaveBeenCalledWith(
                "smitha@example.com",
                "test-password"
            );
        });



        expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
            "accessToken",
            "test-access-token"
        );

        expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
            "refreshToken",
            "test-refresh-token"
        );

        expect(alertSpy).toHaveBeenCalledWith(
            "Success",
            "Welcome, Smitha!",
            expect.any(Array)
        );

        alertSpy.mockRestore();
    });

test("should show error alert and not save tokens when login fails", async () => {
  jest.clearAllMocks();

  const alertSpy = jest.spyOn(Alert, "alert");

  (loginUser as jest.Mock).mockRejectedValueOnce(
    new Error("Invalid credentials")
  );

  const rendered =  await render(<LoginScreen />);

  await act(async () => {
    fireEvent.changeText(
      rendered.getByPlaceholderText("Email"),
      "smitha@example.com"
    );

    fireEvent.changeText(
      rendered.getByPlaceholderText("Password"),
      "wrong-password"
    );
  });

  await act(async () => {
    fireEvent.press(rendered.getByText("Login"));
  });

  await waitFor(() => {
    expect(alertSpy).toHaveBeenCalledWith(
      "Login failed",
      "Invalid credentials"
    );
  });

  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();

  alertSpy.mockRestore();
});

test("should navigate to Register when the register link is pressed", async () => {
  const screen = await render(<LoginScreen />);

  await act(async () => {
    fireEvent.press(
      screen.getByText("Don't have an account? Register")
    );
  });

  expect(router.push).toHaveBeenCalledWith("/register");
});

});
