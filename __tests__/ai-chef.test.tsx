import { render, userEvent, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import AIChefScreen from "../src/app/(tabs)/ai-chef";
import {
  fetchFoodSearchPageFromApi,
  FoodSearchResponse,
  FoodSearchResult,
  searchFoodsFromApi,
} from "../src/services/foodSearchApi";

jest.mock("expo-router", () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
  },
}));

jest.mock("../src/services/foodSearchApi", () => ({
  searchFoodsFromApi: jest.fn(),
  fetchFoodSearchPageFromApi: jest.fn(),
}));

const mockSearchFoodsFromApi = searchFoodsFromApi as jest.Mock;
const mockFetchFoodSearchPageFromApi = fetchFoodSearchPageFromApi as jest.Mock;

function food(
  id: string,
  name: string,
  overrides: Partial<FoodSearchResult> = {}
): FoodSearchResult {
  return {
    id,
    chef_id: "chef2",
    chef_name: "Chef smiupdated",
    name,
    description: `${name} with vegetables and spices.`,
    price: "35.00",
    image_key: "food1",
    ingredients: ["chicken", "noodles", "garlic"],
    is_available: true,
    ...overrides,
  };
}

function searchResponse(
  matchingFoods: FoodSearchResult[] = [],
  similarFoods: FoodSearchResult[] = [],
  options: {
    searchId?: string;
    matchingPage?: number;
    similarPage?: number;
    matchingHasMore?: boolean;
    similarHasMore?: boolean;
  } = {}
): FoodSearchResponse {
  return {
    searchId: options.searchId ?? "search-123",
    matchingRequestedDishes: {
      page: options.matchingPage ?? 1,
      pageSize: 10,
      hasMore: options.matchingHasMore ?? false,
      results: matchingFoods,
    },
    suggestedSimilarDishes: {
      page: options.similarPage ?? 1,
      pageSize: 10,
      hasMore: options.similarHasMore ?? false,
      results: similarFoods,
    },
  };
}

async function enterQueryAndSearch(
  screen: Awaited<ReturnType<typeof render>>,
  user: ReturnType<typeof userEvent.setup>,
  query = "spicy chicken noodles"
) {
  await user.type(screen.getByPlaceholderText("e.g. spicy chicken noodles"), query);
  await user.press(screen.getByText("Search Foods"));
}

describe("AI Chef food search screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("searches a natural-language query and renders both result sections and food details", async () => {
    const matchingFood = food("4", "Chicken noodles", {
      image_key: "food4",
    });
    const similarFood = food("8", "Chicken stir-fry noodles", {
      description: "A similar noodle dish.",
      chef_name: "Chef Another",
      image_key: "food2",
      ingredients: ["chicken", "noodles", "pepper"],
    });
    mockSearchFoodsFromApi.mockResolvedValueOnce(
      searchResponse([matchingFood], [similarFood])
    );

    const screen = await render(<AIChefScreen />);
    const user = userEvent.setup();
    await enterQueryAndSearch(screen, user, "  spicy chicken noodles  ");

    expect(await screen.findByText("Matching your requested dishes")).toBeTruthy();
    expect(screen.getByText("Suggested similar dishes")).toBeTruthy();
    expect(screen.getByText("Chicken noodles")).toBeTruthy();
    expect(screen.getByText("Chicken stir-fry noodles")).toBeTruthy();
    expect(screen.getByText("Chicken noodles with vegetables and spices.")).toBeTruthy();
    expect(screen.getByText("Chef: Chef smiupdated")).toBeTruthy();
    expect(screen.getByText("Chef: Chef Another")).toBeTruthy();
    expect(screen.getAllByText("AED 35.00")).toHaveLength(2);
    expect(screen.getByText("Ingredients: chicken, noodles, pepper")).toBeTruthy();
    expect(mockSearchFoodsFromApi).toHaveBeenCalledWith(
      "spicy chicken noodles",
      1,
      1
    );

    await user.press(screen.getByText("Chicken noodles"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/food-details",
      params: {
        foodId: "4",
        name: "Chicken noodles",
        description: "Chicken noodles with vegetables and spices.",
        price: "35.00",
        image: "food4",
      },
    });
  });

  test("shows validation feedback without calling the API for a blank query", async () => {
    const screen = await render(<AIChefScreen />);
    const user = userEvent.setup();

    await user.press(screen.getByText("Search Foods"));

    expect(await screen.findByText("Please enter a food search query.")).toBeTruthy();
    expect(mockSearchFoodsFromApi).not.toHaveBeenCalled();
  });

  test("renders an empty matching group while showing similar foods", async () => {
    mockSearchFoodsFromApi.mockResolvedValueOnce(
      searchResponse([], [food("8", "Chicken soup")])
    );
    const screen = await render(<AIChefScreen />);
    const user = userEvent.setup();

    await enterQueryAndSearch(screen, user);

    expect(await screen.findByText("Matching your requested dishes")).toBeTruthy();
    expect(screen.getByText("Suggested similar dishes")).toBeTruthy();
    expect(screen.getByText("Chicken soup")).toBeTruthy();
    expect(
      screen.queryByText(
        "No matching foods found. Try describing a different dish or its ingredients."
      )
    ).toBeNull();
  });

  test("renders matching foods while the similar group is empty", async () => {
    mockSearchFoodsFromApi.mockResolvedValueOnce(
      searchResponse([food("4", "Chicken noodles")], [])
    );
    const screen = await render(<AIChefScreen />);
    const user = userEvent.setup();

    await enterQueryAndSearch(screen, user);

    expect(await screen.findByText("Matching your requested dishes")).toBeTruthy();
    expect(screen.getByText("Suggested similar dishes")).toBeTruthy();
    expect(screen.getByText("Chicken noodles")).toBeTruthy();
    expect(
      screen.queryByText(
        "No matching foods found. Try describing a different dish or its ingredients."
      )
    ).toBeNull();
  });

  test("shows the empty state when both groups contain no foods", async () => {
    mockSearchFoodsFromApi.mockResolvedValueOnce(searchResponse());
    const screen = await render(<AIChefScreen />);
    const user = userEvent.setup();

    await enterQueryAndSearch(screen, user, "unavailable dish");

    expect(
      await screen.findByText(
        "No matching foods found. Try describing a different dish or its ingredients."
      )
    ).toBeTruthy();
    expect(screen.getByText("Matching your requested dishes")).toBeTruthy();
    expect(screen.getByText("Suggested similar dishes")).toBeTruthy();
  });

  test("loads more matching foods without replacing similar foods", async () => {
    const matchingOne = food("1", "Matching food one");
    const similarOne = food("10", "Similar food one");
    mockSearchFoodsFromApi.mockResolvedValueOnce(
      searchResponse([matchingOne], [similarOne], { matchingHasMore: true })
    );
    mockFetchFoodSearchPageFromApi.mockResolvedValueOnce(
      searchResponse(
        [food("2", "Matching food two")],
        [food("11", "Ignored similar response")],
        { matchingPage: 2 }
      )
    );
    const screen = await render(<AIChefScreen />);
    const user = userEvent.setup();
    await enterQueryAndSearch(screen, user);

    await user.press(screen.getByText("Load More"));

    expect(await screen.findByText("Matching food two")).toBeTruthy();
    expect(screen.getByText("Matching food one")).toBeTruthy();
    expect(screen.getByText("Similar food one")).toBeTruthy();
    expect(screen.queryByText("Ignored similar response")).toBeNull();
    expect(mockFetchFoodSearchPageFromApi).toHaveBeenCalledWith(
      "search-123",
      2,
      1
    );
  });

  test("loads more similar foods without replacing matching foods", async () => {
    const matchingOne = food("1", "Matching food one");
    const similarOne = food("10", "Similar food one");
    mockSearchFoodsFromApi.mockResolvedValueOnce(
      searchResponse([matchingOne], [similarOne], { similarHasMore: true })
    );
    mockFetchFoodSearchPageFromApi.mockResolvedValueOnce(
      searchResponse(
        [food("2", "Ignored matching response")],
        [food("11", "Similar food two")],
        { similarPage: 2 }
      )
    );
    const screen = await render(<AIChefScreen />);
    const user = userEvent.setup();
    await enterQueryAndSearch(screen, user);

    await user.press(screen.getByText("Load More"));

    expect(await screen.findByText("Similar food two")).toBeTruthy();
    expect(screen.getByText("Similar food one")).toBeTruthy();
    expect(screen.getByText("Matching food one")).toBeTruthy();
    expect(screen.queryByText("Ignored matching response")).toBeNull();
    expect(mockFetchFoodSearchPageFromApi).toHaveBeenCalledWith(
      "search-123",
      1,
      2
    );
  });

  test("ignores repeated Load More taps while matching results are loading", async () => {
    mockSearchFoodsFromApi.mockResolvedValueOnce(
      searchResponse([food("1", "Matching food one")], [], {
        matchingHasMore: true,
      })
    );
    let resolvePage!: (response: FoodSearchResponse) => void;
    mockFetchFoodSearchPageFromApi.mockReturnValueOnce(
      new Promise<FoodSearchResponse>((resolve) => {
        resolvePage = resolve;
      })
    );
    const screen = await render(<AIChefScreen />);
    const user = userEvent.setup();
    await enterQueryAndSearch(screen, user);

    const loadMoreButton = screen.getByText("Load More");
    await user.press(loadMoreButton);
    await user.press(loadMoreButton);

    expect(mockFetchFoodSearchPageFromApi).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Loading...")).toBeTruthy();

    resolvePage(searchResponse([food("2", "Matching food two")], [], {
      matchingPage: 2,
    }));
    expect(await screen.findByText("Matching food two")).toBeTruthy();
  });

  test("shows backend errors, including an uncalibrated search, and redirects on session expiry", async () => {
    mockSearchFoodsFromApi.mockRejectedValueOnce(
      new Error("Food search is unavailable until its similarity threshold is calibrated")
    );
    const screen = await render(<AIChefScreen />);
    const user = userEvent.setup();
    await enterQueryAndSearch(screen, user, "chicken noodles");

    expect(
      await screen.findByText(
        "Food search is unavailable until its similarity threshold is calibrated"
      )
    ).toBeTruthy();

    mockSearchFoodsFromApi.mockRejectedValueOnce(new Error("SESSION_EXPIRED"));
    await user.press(screen.getByText("Search Foods"));

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/login");
    });
  });

  test("shows a loading label while the initial search is pending", async () => {
    let resolveSearch!: (response: FoodSearchResponse) => void;
    mockSearchFoodsFromApi.mockReturnValueOnce(
      new Promise<FoodSearchResponse>((resolve) => {
        resolveSearch = resolve;
      })
    );
    const screen = await render(<AIChefScreen />);
    const user = userEvent.setup();

    await user.type(
      screen.getByPlaceholderText("e.g. spicy chicken noodles"),
      "chicken noodles"
    );
    await user.press(screen.getByText("Search Foods"));

    expect(screen.getByText("Searching Foods...")).toBeTruthy();

    resolveSearch(searchResponse());
    expect(
      await screen.findByText(
        "No matching foods found. Try describing a different dish or its ingredients."
      )
    ).toBeTruthy();
  });
});
