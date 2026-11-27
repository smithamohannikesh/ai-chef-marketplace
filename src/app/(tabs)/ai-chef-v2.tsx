import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import type { ImageSourcePropType } from "react-native";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import FoodCard from "../../components/FoodCard";
import { Spacing } from "../../constants/theme";
import type {
  AiChefV2ChatResponse,
  AiChefV2FoodRecord,
} from "../../services/aiChefV2Api";
import {
  sendAiChefV2Message,
} from "../../services/aiChefV2Api";

const foodImages: Record<string, ImageSourcePropType> = {
  food1: require("../../../assets/images/food1.jpg"),
  food2: require("../../../assets/images/food2.jpg"),
  food3: require("../../../assets/images/food3.jpg"),
};

type ChatEntry =
  | {
      id: number;
      role: "user";
      answer: string;
    }
  | (AiChefV2ChatResponse & {
      id: number;
      role: "assistant";
    });

export default function AIChefV2Screen() {
  const safeAreaInsets = useSafeAreaInsets();
  const [message, setMessage] = useState("");
  const [chatEntries, setChatEntries] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const nextEntryId = useRef(0);
  const messageListRef = useRef<ScrollView>(null);
  const pendingScrollRef = useRef(false);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, () =>
      setKeyboardVisible(true)
    );
    const hideSubscription = Keyboard.addListener(hideEvent, () =>
      setKeyboardVisible(false)
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  function createEntryId() {
    nextEntryId.current += 1;
    return nextEntryId.current;
  }

  async function handleSendMessage() {
    const cleanMessage = message.trim();
    if (loading) return;
    if (!cleanMessage) {
      setError("Please enter a message for AI Chef.");
      return;
    }

    setError("");
    setMessage("");
    const userEntryId = createEntryId();
    pendingScrollRef.current = true;
    setChatEntries((current) => [
      ...current,
      { id: userEntryId, role: "user", answer: cleanMessage },
    ]);
    setLoading(true);

    try {
      const response = await sendAiChefV2Message(cleanMessage);
      const assistantEntryId = createEntryId();
      pendingScrollRef.current = true;
      setChatEntries((current) => [
        ...current,
        { ...response, id: assistantEntryId, role: "assistant" },
      ]);
    } catch (requestError) {
      if (
        requestError instanceof Error &&
        requestError.message === "SESSION_EXPIRED"
      ) {
        router.replace("/login");
      } else {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to reach AI Chef. Please try again."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  function renderFoodCard(food: AiChefV2FoodRecord) {
    return (
      <FoodCard
        key={String(food.id)}
        name={food.name}
        description={food.description}
        image={foodImages[food.image_key] ?? foodImages.food1}
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
    );
  }

  return (
    <SafeAreaView
      style={styles.screen}
      edges={["top", "left", "right"]}
      testID="ai-chef-safe-area"
    >
      <KeyboardAvoidingView
        style={styles.keyboardLayout}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        testID="ai-chef-keyboard-layout"
      >
        <View style={styles.header} testID="ai-chef-header">
          <Text style={styles.title}>AI Chef</Text>
          <Text style={styles.description}>
            Ask about dishes in the marketplace.
          </Text>
        </View>

        <ScrollView
          ref={messageListRef}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          contentInsetAdjustmentBehavior="never"
          onContentSizeChange={() => {
            if (pendingScrollRef.current) {
              messageListRef.current?.scrollToEnd({ animated: true });
              pendingScrollRef.current = false;
            }
          }}
          testID="ai-chef-message-list"
        >
          {chatEntries.map((entry) => (
            <View
              key={entry.id}
              style={[
                styles.message,
                entry.role === "user" ? styles.userMessage : styles.assistantMessage,
              ]}
            >
              <Text style={styles.messageLabel}>
                {entry.role === "user" ? "You" : "AI Chef"}
              </Text>
              <Text style={styles.messageText}>{entry.answer}</Text>

              {entry.role === "assistant" && (
                <>
                  {entry.searchStatus === "partial" && (
                    <Text style={styles.statusNotice}>
                      Partial results: this list may not include all matching marketplace foods.
                    </Text>
                  )}
                  {entry.searchStatus === "unavailable" && (
                    <Text style={styles.statusNotice}>
                      No marketplace food records were verified for this response.
                    </Text>
                  )}
                  {entry.searchStatus === "complete" &&
                    entry.foodRecords.length === 0 && (
                      <Text style={styles.statusNotice}>
                        No matching food records were found.
                      </Text>
                    )}

                  {entry.foodRecords.length > 0 && (
                    <ScrollView
                      horizontal
                      nestedScrollEnabled
                      directionalLockEnabled
                      style={styles.foodCards}
                      contentContainerStyle={styles.foodCardsContent}
                      showsHorizontalScrollIndicator={false}
                      testID="verified-food-cards"
                    >
                      {entry.foodRecords.map(renderFoodCard)}
                    </ScrollView>
                  )}
                </>
              )}
            </View>
          ))}

          {loading && (
            <View style={styles.loading}>
              <ActivityIndicator />
              <Text style={styles.loadingText}>AI Chef is thinking…</Text>
            </View>
          )}
          {!!error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

        <View
          style={[
            styles.composer,
            {
              paddingBottom:
                Platform.OS === "ios" && !keyboardVisible
                  ? safeAreaInsets.bottom +  Spacing.three
                  : Spacing.three,
            },
          ]}
          testID="ai-chef-composer"
        >
          <TextInput
            style={styles.input}
            value={message}
            onChangeText={setMessage}
            placeholder="Ask for a dish, such as chicken biryani"
            editable={!loading}
            multiline
            maxLength={2_000}
            accessibilityLabel="Message AI Chef"
          />
          <Pressable
            style={[styles.sendButton, loading && styles.disabledButton]}
            onPress={handleSendMessage}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            <Text style={styles.sendButtonText}>
              {loading ? "Sending…" : "Send"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#fff",
  },
  keyboardLayout: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    marginBottom: 6,
    color: "#222",
  },
  description: {
    fontSize: 15,
    marginBottom: 20,
    color: "#666",
  },
  message: {
    maxWidth: "92%",
    padding: 14,
    borderRadius: 14,
    marginBottom: 14,
  },
  userMessage: {
    alignSelf: "flex-end",
    backgroundColor: "#E9F4EC",
  },
  assistantMessage: {
    alignSelf: "flex-start",
    backgroundColor: "#F3F3F3",
    width: "92%",
  },
  messageLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#555",
    marginBottom: 5,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
    color: "#222",
  },
  statusNotice: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
    color: "#765A14",
  },
  foodCards: {
    marginTop: 12,
    width: "100%",
    flexGrow: 0,

  },
  foodCardsContent: {
    paddingRight: 2,
  },
  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  loadingText: {
    color: "#666",
    fontSize: 14,
  },
  error: {
    marginTop: 8,
    color: "#B42318",
    fontSize: 14,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#DDD",
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: "#CCC",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#222",
  },
  sendButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: "#287A4B",
  },
  disabledButton: {
    opacity: 0.6,
  },
  sendButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});
