
import { act, fireEvent, render } from "@testing-library/react-native";
import { router } from "expo-router";
import { Alert } from "react-native";
import RegisterScreen from "../src/app/register";
import { registerUser } from "../src/services/authApi";
jest.mock("expo-router", () => ({
  router: {
    replace: jest.fn(),
    push: jest.fn(),
  },
}));

jest.mock("../src/services/authApi", () => ({
  registerUser: jest.fn(),
}));

describe("Register Screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should display registration fields", async () => {
    const screen = await render(<RegisterScreen />);

    expect(screen.getByText("Create Account")).toBeTruthy();
    expect(screen.getByPlaceholderText("Full name")).toBeTruthy();
    expect(screen.getByPlaceholderText("Email address")).toBeTruthy();
    expect(
      screen.getByPlaceholderText("Password (minimum 8 characters)")
    ).toBeTruthy();
    expect(screen.getByText("Register")).toBeTruthy();
  });

  test("should show validation alert when fields are empty", async () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    const screen = await render(<RegisterScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText("Register"));
    });

    expect(alertSpy).toHaveBeenCalledWith(
      "Required",
      "Please fill in all fields."
    );
    expect(registerUser).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

test("should show validation alert for invalid email", async () => {
  const alertSpy = jest.spyOn(Alert, "alert");
  const screen = await render(<RegisterScreen />);

  await act(async () => {
    fireEvent.changeText(
      screen.getByPlaceholderText("Full name"),
      "Smitha"
    );
    fireEvent.changeText(
      screen.getByPlaceholderText("Email address"),
      "invalid-email"
    );
    fireEvent.changeText(
      screen.getByPlaceholderText("Password (minimum 8 characters)"),
      "password123"
    );
  });

  await act(async () => {
    fireEvent.press(screen.getByText("Register"));
  });

  expect(alertSpy).toHaveBeenCalledWith(
    "Invalid email",
    "Please enter a valid email address."
  );

  expect(registerUser).not.toHaveBeenCalled();

  alertSpy.mockRestore();
});

test("should show validation alert for a short password", async () => {
  const alertSpy = jest.spyOn(Alert, "alert");
  const screen = await render(<RegisterScreen />);

  await act(async () => {
    fireEvent.changeText(
      screen.getByPlaceholderText("Full name"),
      "Smitha"
    );
    fireEvent.changeText(
      screen.getByPlaceholderText("Email address"),
      "smitha@example.com"
    );
    fireEvent.changeText(
      screen.getByPlaceholderText("Password (minimum 8 characters)"),
      "abc123"
    );
  });

  await act(async () => {
    fireEvent.press(screen.getByText("Register"));
  });

  expect(alertSpy).toHaveBeenCalledWith(
    "Invalid password",
    "Password must be at least 8 characters."
  );

  expect(registerUser).not.toHaveBeenCalled();

  alertSpy.mockRestore();
});

test("should register successfully with valid details", async () => {
  const alertSpy = jest.spyOn(Alert, "alert");

  (registerUser as jest.Mock).mockResolvedValueOnce({
    message: "Registration successful!",
  });

  const screen = await render(<RegisterScreen />);

  await act(async () => {
    fireEvent.changeText(
      screen.getByPlaceholderText("Full name"),
      "Smitha"
    );
    fireEvent.changeText(
      screen.getByPlaceholderText("Email address"),
      "smitha@example.com"
    );
    fireEvent.changeText(
      screen.getByPlaceholderText("Password (minimum 8 characters)"),
      "password123"
    );
  });

  await act(async () => {
    fireEvent.press(screen.getByText("Register"));
  });

  expect(registerUser).toHaveBeenCalledWith(
    "Smitha",
    "smitha@example.com",
    "password123"
  );

  expect(alertSpy).toHaveBeenCalledWith(
    "Success",
    "Registration successful!",
    expect.any(Array)
  );
const alertButtons = alertSpy.mock.calls[0][2];

expect(alertButtons).toBeDefined();

const continueButton = alertButtons?.find(
  (button) => button.text === "Continue to Login"
);

expect(continueButton).toBeDefined();

await act(async () => {
  continueButton?.onPress?.();
});

expect(router.replace).toHaveBeenCalledWith("/login");
  alertSpy.mockRestore();
});

test("should show error alert when registration fails", async () => {
  jest.clearAllMocks();

  const alertSpy = jest.spyOn(Alert, "alert");

  (registerUser as jest.Mock).mockRejectedValueOnce(
    new Error("Email already registered")
  );

  const screen = await render(<RegisterScreen />);

  await act(async () => {
    fireEvent.changeText(
      screen.getByPlaceholderText("Full name"),
      "Smitha"
    );
    fireEvent.changeText(
      screen.getByPlaceholderText("Email address"),
      "smitha@example.com"
    );
    fireEvent.changeText(
      screen.getByPlaceholderText("Password (minimum 8 characters)"),
      "password123"
    );
  });

  await act(async () => {
    fireEvent.press(screen.getByText("Register"));
  });

  expect(registerUser).toHaveBeenCalledWith(
    "Smitha",
    "smitha@example.com",
    "password123"
  );

  expect(alertSpy).toHaveBeenCalledWith(
    "Registration failed",
    "Email already registered"
  );

  alertSpy.mockRestore();
});

test("should navigate to Login when the login link is pressed", async () => {
  const screen = await render(<RegisterScreen />);

  await act(async () => {
    fireEvent.press(
      screen.getByText("Already have an account? Log in")
    );
  });

  expect(router.replace).toHaveBeenCalledWith("/login");
});

});
