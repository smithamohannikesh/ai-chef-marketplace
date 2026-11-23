
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { io } from "socket.io-client";

const SOCKET_URL =
  Platform.OS === "android"
    ? "http://10.0.2.2:3000"
    : "http://localhost:3000";

export const chefSocket = io(SOCKET_URL, {
  autoConnect: false,
  transports: ["websocket"],
  auth: (callback) => {
    void SecureStore.getItemAsync("accessToken")
      .then((token) => callback({ token }))
      .catch(() => callback({}));
  },
});
