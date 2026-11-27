import { authenticatedFetch } from "../src/services/api";
import { sendAiChefV2Message } from "../src/services/aiChefV2Api";

jest.mock("../src/services/api", () => ({
  authenticatedFetch: jest.fn(),
}));

const mockAuthenticatedFetch = authenticatedFetch as jest.Mock;

const responseBody = {
  answer: "Here is a marketplace option.",
  foodRecords: [
    {
      id: 4,
      chef_id: "chef-4",
      chef_name: "Chef Four",
      name: "Chicken Biryani",
      description: "Basmati rice with chicken.",
      price: "35.00",
      image_key: "food1",
      ingredients: ["chicken", "rice"],
      is_available: true,
    },
  ],
  searchStatus: "complete",
  responseSource: "ollama",
};

describe("AI Chef V2 API client", () => {
  beforeEach(() => {
    mockAuthenticatedFetch.mockReset();
  });

  test("posts the message to the authenticated V2 endpoint and validates its response", async () => {
    mockAuthenticatedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => responseBody,
    });

    await expect(sendAiChefV2Message("Find chicken biryani")).resolves.toEqual(
      responseBody
    );
    expect(mockAuthenticatedFetch).toHaveBeenCalledWith("/ai-chef-v2/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Find chicken biryani" }),
    });
  });

  test("accepts a structured fallback response returned with an HTTP error status", async () => {
    mockAuthenticatedFetch.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({
        ...responseBody,
        answer: "Some searches failed, so these are partial results.",
        searchStatus: "partial",
        responseSource: "fallback",
      }),
    });

    await expect(sendAiChefV2Message("Find food")).resolves.toMatchObject({
      searchStatus: "partial",
      responseSource: "fallback",
      foodRecords: responseBody.foodRecords,
    });
  });

  test("reports an API error if the response has no V2 chat payload", async () => {
    mockAuthenticatedFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ message: "Service unavailable" }),
    });

    await expect(sendAiChefV2Message("Find food")).rejects.toThrow(
      "Service unavailable"
    );
  });

  test("preserves the expired-session signal for the screen to handle", async () => {
    mockAuthenticatedFetch.mockRejectedValue(new Error("SESSION_EXPIRED"));

    await expect(sendAiChefV2Message("Find food")).rejects.toThrow(
      "SESSION_EXPIRED"
    );
  });
});
