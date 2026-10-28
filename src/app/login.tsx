
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Button,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { loginUser } from "../services/authApi";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Required", "Please enter email and password.");
      return;
    }

    try {
      setLoading(true);

      const data = await loginUser(email, password);
await SecureStore.setItemAsync("accessToken", data.token);
await SecureStore.setItemAsync("refreshToken", data.refreshToken);
      console.log("Login successful:", data.user);
      console.log("Access token received:", Boolean(data.token));
      Alert.alert("Success", `Welcome, ${data.user.name}!`, [
  {
    text: "Continue",
    onPress: () => router.replace("/(tabs)"),
  },
]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Login failed";

      Alert.alert("Login failed", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome Back</Text>

      <TextInput
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        value={email}
        onChangeText={setEmail}
        style={styles.input}
      />

      <TextInput
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={styles.input}
      />

      {loading ? (
        <ActivityIndicator size="large" />
      ) : (
        <Button title="Login" onPress={handleLogin} />
      )}

<TouchableOpacity
  style={{ marginTop: 20, alignItems: "center" }}
  onPress={() => router.push("/register")}
>
  <Text style={{ color: "#287A4B", fontSize: 14 }}>
    Don't have an account? Register
  </Text>
</TouchableOpacity>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 32,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
});
