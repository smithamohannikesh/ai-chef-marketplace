import { authenticatedFetch } from "../src/services/api";
import { fetchFoodsFromApi } from "../src/services/foodApi";

jest.mock("../src/services/api", () => ({
  authenticatedFetch: jest.fn(),
}));

const mockedAuthenticatedFetch = jest.mocked(authenticatedFetch);

describe("fetchFoodsFromApi", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fetches and returns foods from the authenticated endpoint", async () => {
    const foods = [
      {
        id: 1,
        chef_id: "chef2",
        chef_name: "Chef Example",
        name: "Chicken noodles",
        description: "Noodles",
        price: "20.00",
        image_key: "food1",
        is_available: true,
      },
    ];
    mockedAuthenticatedFetch.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(foods),
    } as unknown as Response);

    await expect(fetchFoodsFromApi()).resolves.toEqual(foods);
    expect(mockedAuthenticatedFetch).toHaveBeenCalledWith("/foods");
  });

  it("throws the API error message when the request fails", async () => {
    mockedAuthenticatedFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: jest.fn().mockResolvedValue({ message: "Database unavailable" }),
    } as unknown as Response);

    await expect(fetchFoodsFromApi()).rejects.toThrow("Database unavailable");
  });

  it("falls back to the HTTP status when the error body has no message", async () => {
    mockedAuthenticatedFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: jest.fn().mockResolvedValue({}),
    } as unknown as Response);

    await expect(fetchFoodsFromApi()).rejects.toThrow(
      "Failed to fetch foods (HTTP 503)"
    );
  });
});
