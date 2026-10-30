import { Stack } from "expo-router";
import { Provider } from "react-redux";
import { store } from "../store/store";
// export const unstable_settings = {
//   initialRouteName: "(tabs)",
// };

export default function RootLayout() {
//   useEffect(() => {
//   async function checkSavedTokens() {
//     const accessToken =
//       await SecureStore.getItemAsync("accessToken");

//     const refreshToken =
//       await SecureStore.getItemAsync("refreshToken");

//     console.log("PLATFORM2:", Platform.OS);
//     console.log("ACCESS2 TOKEN EXISTS:", Boolean(accessToken));
//     console.log("REFRESH2 TOKEN EXISTS:", Boolean(refreshToken));
//   }

//   checkSavedTokens();
// }, []);

  return (
      <Provider store={store}>
    <Stack>

      <Stack.Screen
        name="(tabs)"
        options={{ headerShown: false , title: "",}}
      />
      <Stack.Screen
          name="login"
          options={{ headerShown: false }}
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

<Stack.Screen
  name="register"
  options={{
    title: "Create Account",
    headerBackButtonDisplayMode: "minimal",
  }}
/>

    </Stack>
    </Provider>
  );
}