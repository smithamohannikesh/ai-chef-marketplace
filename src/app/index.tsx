
import { Redirect } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

export default function Index() {
  const [destination, setDestination] = useState<
    "/login" | "/(tabs)" | null
  >(null);

  useEffect(() => {
    async function checkLogin() {
      const token = await SecureStore.getItemAsync("accessToken");
      setDestination(token ? "/(tabs)" : "/login");
    }

    checkLogin();
  }, []);

  if (destination === null) {
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <Redirect href={destination} />;
}
