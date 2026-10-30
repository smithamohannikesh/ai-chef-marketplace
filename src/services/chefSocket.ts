
import { Platform } from "react-native";
import { io } from "socket.io-client";

const SOCKET_URL =
  Platform.OS === "android"
    ? "http://10.0.2.2:3000"
    : "http://localhost:3000";

export const chefSocket = io(SOCKET_URL, {
  autoConnect: false,
  transports: ["websocket"],
});
