import { router } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Button,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import FoodCard from "../../components/FoodCard";
import type {
  FoodSearchPage,
  FoodSearchResult,
} from "../../services/foodSearchApi";
import {
  fetchFoodSearchPageFromApi,
  searchFoodsFromApi,
} from "../../services/foodSearchApi";

const foodImages: Record<string, number> = {
  food1: require("../../../assets/images/food1.jpg"),
  food2: require("../../../assets/images/food2.jpg"),
  food3: require("../../../assets/images/food3.jpg"),
};

export default function AIChefScreen() {
  const [query, setQuery] = useState("");
  const [searchId, setSearchId] = useState<string | null>(null);
  const [matchingPage, setMatchingPage] = useState<FoodSearchPage | null>(null);
  const [similarPage, setSimilarPage] = useState<FoodSearchPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [matchingLoadingMore, setMatchingLoadingMore] = useState(false);
  const [similarLoadingMore, setSimilarLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const loadingMoreRef = useRef({ matching: false, similar: false });

  function showRequestError(err: unknown) {
    if (err instanceof Error && err.message === "SESSION_EXPIRED") {
      router.replace("/login");
      return;
    }

    setError(err instanceof Error ? err.message : "Unable to search foods.");
  }

  async function handleSearchFoods() {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      setError("Please enter a food search query.");
      setSearchId(null);
      setMatchingPage(null);
      setSimilarPage(null);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setError("");
    setSearchId(null);
    setMatchingPage(null);
    setSimilarPage(null);
    setHasSearched(false);

    try {
      const response = await searchFoodsFromApi(trimmedQuery, 1, 1);
      setSearchId(response.searchId);
      setMatchingPage(response.matchingRequestedDishes);
      setSimilarPage(response.suggestedSimilarDishes);
      setHasSearched(true);
    } catch (err) {
      showRequestError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadMore(section: "matching" | "similar") {
    const currentPage = section === "matching" ? matchingPage : similarPage;
    if (
      !searchId ||
      !currentPage?.hasMore ||
      loading ||
      loadingMoreRef.current[section]
    ) {
      return;
    }

    loadingMoreRef.current[section] = true;
    if (section === "matching") {
      setMatchingLoadingMore(true);
    } else {
      setSimilarLoadingMore(true);
    }
    setError("");

    const nextMatchingPage =
      section === "matching" ? matchingPage!.page + 1 : matchingPage?.page ?? 1;
    const nextSimilarPage =
      section === "similar" ? similarPage!.page + 1 : similarPage?.page ?? 1;

    try {
      const response = await fetchFoodSearchPageFromApi(
        searchId,
        nextMatchingPage,
        nextSimilarPage
      );

      if (section === "matching") {
        setMatchingPage({
          ...response.matchingRequestedDishes,
          results: [
            ...(matchingPage?.results ?? []),
            ...response.matchingRequestedDishes.results,
          ],
        });
      } else {
        setSimilarPage({
          ...response.suggestedSimilarDishes,
          results: [
            ...(similarPage?.results ?? []),
            ...response.suggestedSimilarDishes.results,
          ],
        });
      }
    } catch (err) {
      showRequestError(err);
    } finally {
      loadingMoreRef.current[section] = false;
      if (section === "matching") {
        setMatchingLoadingMore(false);
      } else {
        setSimilarLoadingMore(false);
      }
    }
  }

  function renderFoodCards(foods: FoodSearchResult[]) {
    return (
      <FlatList
        data={foods}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(food) => String(food.id)}
        renderItem={({ item: food }) => (
          <FoodCard
            name={food.name}
            description={food.description}
            image={
              foodImages[food.image_key] ??
              require("../../../assets/images/food1.jpg")
            }
            chefName={food.chef_name}
            price={food.price}
            ingredients={food.ingredients}
            onPress={() => {
              router.push({
                pathname: "/food-details",
                params: {
                  foodId: String(food.id),
                  name: food.name,
                  description: food.description,
                  price: String(food.price),
                  image: food.image_key,
                },
              });
            }}
          />
        )}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>AI Chef Assistant</Text>
      <Text style={styles.description}>
        Describe the food you are craving and discover matching dishes.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="e.g. spicy chicken noodles"
        value={query}
        onChangeText={setQuery}
        multiline
      />
      <Button
        title={loading ? "Searching Foods..." : "Search Foods"}
        onPress={handleSearchFoods}
        disabled={loading || matchingLoadingMore || similarLoadingMore}
      />

      {loading && <ActivityIndicator style={styles.loader} />}

      {!!error && <Text style={styles.error}>{error}</Text>}

      {hasSearched &&
        matchingPage?.results.length === 0 &&
        similarPage?.results.length === 0 &&
        !error && (
        <Text style={styles.emptyMessage}>
          No matching foods found. Try describing a different dish or its ingredients.
        </Text>
      )}

      {hasSearched && matchingPage && (
        <View style={styles.results}>
          <Text style={styles.resultsTitle}>Matching your requested dishes</Text>
          {matchingPage.results.length > 0 && (
            renderFoodCards(matchingPage.results)
          )}
          {matchingPage.hasMore && (
            <Button
              title={matchingLoadingMore ? "Loading..." : "Load More"}
              onPress={() => handleLoadMore("matching")}
              disabled={loading || matchingLoadingMore}
            />
          )}
        </View>
      )}

      {hasSearched && similarPage && (
        <View style={styles.results}>
          <Text style={styles.resultsTitle}>Suggested similar dishes</Text>
          {similarPage.results.length > 0 && (
            renderFoodCards(similarPage.results)
          )}
          {similarPage.hasMore && (
            <Button
              title={similarLoadingMore ? "Loading..." : "Load More"}
              onPress={() => handleLoadMore("similar")}
              disabled={loading || similarLoadingMore}
            />
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 30,
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    marginBottom: 20,
    color: "#666",
  },
  input: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    textAlignVertical: "top",
  },
  loader: {
    marginTop: 20,
  },
  error: {
    color: "red",
    marginTop: 16,
  },
  emptyMessage: {
    marginTop: 24,
    color: "#666",
    lineHeight: 22,
  },
  results: {
    marginTop: 24,
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
});
