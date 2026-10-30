
import * as SecureStore from "expo-secure-store";

import { Platform } from "react-native";

const API_URL =
  Platform.OS === "android"
    ? "http://10.0.2.2:3000"
    : "http://localhost:3000";

export async function authenticatedFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {

  let token = await SecureStore.getItemAsync("accessToken");
console.log("Access token exists:", Boolean(token));
  const makeRequest = (accessToken: string | null) =>
    fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        ...options.headers,
        ...(accessToken
          ? { Authorization: `Bearer ${accessToken}` }
          : {}),
      },
    });

  let response = await makeRequest(token);

  if (response.status !== 401) {
    return response;
  }

  const refreshToken = await SecureStore.getItemAsync("refreshToken");
console.log("Refresh token exists:", Boolean(refreshToken));
  if (!refreshToken) {
    await SecureStore.deleteItemAsync("accessToken");
  await SecureStore.deleteItemAsync("refreshToken");
  throw new Error("SESSION_EXPIRED");
  }

  const refreshResponse = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refreshToken }),
  });

  if (!refreshResponse.ok) {
    await SecureStore.deleteItemAsync("accessToken");
    await SecureStore.deleteItemAsync("refreshToken");
    throw new Error("SESSION_EXPIRED");
  }

  const data = await refreshResponse.json();
  token = data.token;

  await SecureStore.setItemAsync("accessToken", token!);

  response = await makeRequest(token);

  return response;
}
