import { fireEvent, render, userEvent, waitFor, within } from "@testing-library/react-native";
import { router } from "expo-router";
import { Platform, ScrollView, StyleSheet } from "react-native";
import AIChefV2Screen from "../src/app/(tabs)/ai-chef-v2";
import type {
  AiChefV2ChatResponse,
  AiChefV2FoodRecord,
} from "../src/services/aiChefV2Api";
import {
  sendAiChefV2Message,
} from "../src/services/aiChefV2Api";

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
  },
}));

jest.mock("../src/services/aiChefV2Api", () => ({
  sendAiChefV2Message: jest.fn(),
}));

jest.mock("../src/constants/theme", () => ({
  BottomTabInset: 50,
  Spacing: { three: 16 },
}));

jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context");
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
  };
});

const mockSendMessage = sendAiChefV2Message as jest.Mock;
let scrollToEndSpy: jest.SpyInstance;

function food(
  id: number | string,
  name: string,
  overrides: Partial<AiChefV2FoodRecord> = {}
): AiChefV2FoodRecord {
  return {
    id,
    chef_id: "chef-1",
    chef_name: "Chef One",
    name,
    description: `${name} description`,
    price: "35.00",
    image_key: "food1",
    ingredients: ["chicken", "rice"],
    is_available: true,
    ...overrides,
  };
}

function chatResponse(
  overrides: Partial<AiChefV2ChatResponse> = {}
): AiChefV2ChatResponse {
  return {
    answer: "Here are verified marketplace options.",
    foodRecords: [],
    searchStatus: "complete",
    responseSource: "ollama",
    ...overrides,
  };
}

async function submitMessage(
  screen: Awaited<ReturnType<typeof render>>,
  text = "Find chicken biryani"
) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Message AI Chef"), text);
  await user.press(screen.getByLabelText("Send message"));
  return user;
}

describe("AI Chef V2 screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    scrollToEndSpy?.mockRestore();
  });

  test("keeps safe-area header and composer outside the scrollable message list", async () => {
    const screen = await render(<AIChefV2Screen />);

    expect(screen.getByTestId("ai-chef-safe-area")).toBeTruthy();
    expect(screen.getByTestId("ai-chef-header")).toBeTruthy();
    expect(screen.getByTestId("ai-chef-message-list")).toBeTruthy();
    expect(screen.getByTestId("ai-chef-composer")).toBeTruthy();
    expect(screen.getByTestId("ai-chef-keyboard-layout")).toBeTruthy();
    const composerStyle = StyleSheet.flatten(
      screen.getByTestId("ai-chef-composer").props.style
    );
    expect(composerStyle.paddingBottom).toBe(
      Platform.OS === "ios" ? 34 + 50 + 16 : 16
    );
    expect(
      within(screen.getByTestId("ai-chef-message-list")).queryByTestId(
        "ai-chef-header"
      )
    ).toBeNull();
    expect(
      within(screen.getByTestId("ai-chef-message-list")).queryByTestId(
        "ai-chef-composer"
      )
    ).toBeNull();
  });

  test("renders the conversational answer and cards from structured food records", async () => {
    const verifiedFood = food(4, "Chicken Biryani");
    mockSendMessage.mockResolvedValueOnce(
      chatResponse({ foodRecords: [verifiedFood] })
    );

    const screen = await render(<AIChefV2Screen />);
    await submitMessage(screen);

    expect(await screen.findByText("Here are verified marketplace options.")).toBeTruthy();
    const cards = screen.getByTestId("verified-food-cards");
    expect(within(cards).getByText("Chicken Biryani")).toBeTruthy();
    expect(within(cards).getByText("AED 35.00")).toBeTruthy();
    expect(mockSendMessage).toHaveBeenCalledWith("Find chicken biryani");
  });

  test("does not create cards from food details in the conversational answer", async () => {
    mockSendMessage.mockResolvedValueOnce(
      chatResponse({
        answer: "Imaginary Steak costs AED 1 and belongs to Chef Invented.",
        foodRecords: [],
      })
    );

    const screen = await render(<AIChefV2Screen />);
    await submitMessage(screen, "Suggest a dish");

    expect(
      await screen.findByText("Imaginary Steak costs AED 1 and belongs to Chef Invented.")
    ).toBeTruthy();
    expect(screen.queryByTestId("verified-food-cards")).toBeNull();
  });

  test("renders a verified card without substituting hallucinated details from the answer", async () => {
    const verifiedFood = food(7, "Verified Chicken Dish");
    mockSendMessage.mockResolvedValueOnce(
      chatResponse({
        answer: "Imaginary Steak costs AED 1 and belongs to Chef Invented.",
        foodRecords: [verifiedFood],
      })
    );

    const screen = await render(<AIChefV2Screen />);
    await submitMessage(screen, "Find chicken");

    const cards = await screen.findByTestId("verified-food-cards");
    expect(within(cards).getByText("Verified Chicken Dish")).toBeTruthy();
    expect(within(cards).getByText("AED 35.00")).toBeTruthy();
    expect(within(cards).queryByText("Imaginary Steak")).toBeNull();
    expect(within(cards).queryByText("Chef: Chef Invented")).toBeNull();
  });

  test("handles a successful empty search", async () => {
    mockSendMessage.mockResolvedValueOnce(
      chatResponse({ answer: "No matching foods were found." })
    );

    const screen = await render(<AIChefV2Screen />);
    await submitMessage(screen, "Find a dish with no match");

    expect(await screen.findByText("No matching foods were found.")).toBeTruthy();
    expect(await screen.findByText("No matching food records were found.")).toBeTruthy();
    expect(screen.queryByTestId("verified-food-cards")).toBeNull();
  });

  test("shows partial-result notice and still renders verified records", async () => {
    mockSendMessage.mockResolvedValueOnce(
      chatResponse({
        answer: "Some searches failed.",
        foodRecords: [food(1, "Verified Partial Dish")],
        searchStatus: "partial",
        responseSource: "fallback",
      })
    );

    const screen = await render(<AIChefV2Screen />);
    await submitMessage(screen);

    expect(
      await screen.findByText(
        "Partial results: this list may not include all matching marketplace foods."
      )
    ).toBeTruthy();
    expect(within(screen.getByTestId("verified-food-cards")).getByText("Verified Partial Dish")).toBeTruthy();
  });

  test("explains that unavailable search produced no verified records", async () => {
    mockSendMessage.mockResolvedValueOnce(
      chatResponse({
        answer: "I couldn't complete the search.",
        searchStatus: "unavailable",
        responseSource: "fallback",
      })
    );

    const screen = await render(<AIChefV2Screen />);
    await submitMessage(screen);

    expect(await screen.findByText("No marketplace food records were verified for this response.")).toBeTruthy();
    expect(screen.queryByTestId("verified-food-cards")).toBeNull();
  });

  test("shows API errors and redirects after session expiration", async () => {
    mockSendMessage.mockRejectedValueOnce(new Error("AI Chef V2 is unavailable."));
    const screen = await render(<AIChefV2Screen />);
    await submitMessage(screen);
    expect(await screen.findByText("AI Chef V2 is unavailable.")).toBeTruthy();

    mockSendMessage.mockRejectedValueOnce(new Error("SESSION_EXPIRED"));
    await submitMessage(screen, "Try again");
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/login");
    });
  });

  test("shows the loading state while waiting for the API", async () => {
    let resolveRequest: ((value: AiChefV2ChatResponse) => void) | undefined;
    mockSendMessage.mockReturnValueOnce(
      new Promise<AiChefV2ChatResponse>((resolve) => {
        resolveRequest = resolve;
      })
    );

    const screen = await render(<AIChefV2Screen />);
    await submitMessage(screen);
    expect(await screen.findByText("AI Chef is thinking…")).toBeTruthy();

    resolveRequest?.(chatResponse());
    await waitFor(() => {
      expect(screen.queryByText("AI Chef is thinking…")).toBeNull();
    });
  });

  test("opens food details with values from the structured record", async () => {
    const verifiedFood = food(12, "Verified Noodles", { image_key: "food2" });
    mockSendMessage.mockResolvedValueOnce(
      chatResponse({ foodRecords: [verifiedFood] })
    );

    const screen = await render(<AIChefV2Screen />);
    const user = await submitMessage(screen);
    await user.press(await screen.findByText("Verified Noodles"));

    expect(router.push).toHaveBeenCalledWith({
      pathname: "/food-details",
      params: {
        foodId: "12",
        name: "Verified Noodles",
        description: "Verified Noodles description",
        price: "35.00",
        image: "food2",
      },
    });
  });

  test("scrolls after a new message is measured and ignores later size changes", async () => {
    scrollToEndSpy = jest
      .spyOn(ScrollView.prototype, "scrollToEnd")
      .mockImplementation(() => {});
    mockSendMessage.mockResolvedValueOnce(
      chatResponse({
        answer: "First response with food cards.",
        foodRecords: [food(21, "Verified Chicken Noodles")],
      })
    );

    const rendered = await render(<AIChefV2Screen />);
    const messageList = rendered.getByTestId("ai-chef-message-list");
    expect(scrollToEndSpy).not.toHaveBeenCalled();

    fireEvent(messageList, "contentSizeChange", 320, 500);
    expect(scrollToEndSpy).not.toHaveBeenCalled();

    await submitMessage(rendered, "Find chicken");
    expect(await rendered.findByText("First response with food cards.")).toBeTruthy();
    fireEvent(messageList, "contentSizeChange", 320, 650);
    expect(scrollToEndSpy).toHaveBeenCalledTimes(1);

    fireEvent(messageList, "contentSizeChange", 320, 1_100);
    expect(scrollToEndSpy).toHaveBeenCalledTimes(1);
    rendered.unmount();
  });
});
