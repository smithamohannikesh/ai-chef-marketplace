import { Stack } from "expo-router";
import { Provider } from "react-redux";
import { store } from "../store/store";
export default function RootLayout() {
  return (
      <Provider store={store}>
    <Stack>
      <Stack.Screen
        name="(tabs)"
        options={{ headerShown: false , title: "",}}
      />

      <Stack.Screen
        name="chef-details"
        options={{ title: "Chef Details" , headerBackButtonDisplayMode: "minimal",}}
      />
      <Stack.Screen
        name="food-details"
        options={{ title: "Food Details" , headerBackButtonDisplayMode: "minimal",}}
      />
      <Stack.Screen
        name="cart"
        options={{ title: "Cart" , headerBackButtonDisplayMode: "minimal",}}
      />
    </Stack>
    </Provider>
  );
}