
import { useState } from "react";
import {
    ActivityIndicator,
    Button,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { getRecipeSuggestions } from "../../services/aiApi";

export default function AIChefScreen() {
  const [ingredients, setIngredients] = useState("");
  const [suggestions, setSuggestions] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
const [token, setToken] = useState("");
  async function handleGetSuggestions() {
    if (!ingredients.trim()) {
      setError("Please enter your ingredients.");
      return;
    }

    setLoading(true);
    setError("");
    setSuggestions("");

    try {
        if (!token.trim()) {
  setError("Please enter your login token.");
  return;
}

const result = await getRecipeSuggestions(ingredients, token.trim());
    //  const result = await getRecipeSuggestions(ingredients);
      setSuggestions(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to get recipe suggestions."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>



      <Text style={styles.title}>AI Chef Assistant</Text>
      <Text style={styles.description}>
        Enter your ingredients and discover dish ideas.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="e.g. chicken, coconut milk, onion"
        value={ingredients}
        onChangeText={setIngredients}
        multiline
      />
<TextInput
  style={styles.input}
  placeholder="Paste your JWT login token"
  value={token}
  onChangeText={setToken}
  autoCapitalize="none"
  autoCorrect={false}
  multiline
  secureTextEntry={false}
/>
      <Button
        title={loading ? "Getting suggestions..." : "Suggest Recipes"}
        onPress={handleGetSuggestions}
        disabled={loading}
      />

      {loading && <ActivityIndicator style={styles.loader} />}

      {!!error && <Text style={styles.error}>{error}</Text>}

      {!!suggestions && (
        <View style={styles.result}>
          <Text style={styles.resultTitle}>Recipe Suggestions</Text>
          <Text style={styles.resultText}>{suggestions}</Text>
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
  result: {
    marginTop: 24,
    padding: 16,
    backgroundColor: "#f2f2f2",
    borderRadius: 10,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  resultText: {
    fontSize: 16,
    lineHeight: 24,
  },
});
