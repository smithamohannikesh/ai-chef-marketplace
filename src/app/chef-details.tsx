
import { StyleSheet } from "react-native";


import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import ChefdetailCard from "../components/ChefdetailsCard";
import { authenticatedFetch } from "../services/api";
import type { Chef } from "../services/chefTypes";

const chefImages = {
  chef1: require("../../assets/images/chef1.jpg"),
  chef2: require("../../assets/images/chef2.jpg"),
  chef3: require("../../assets/images/chef3.jpg"),
};

export default function ChefDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
console.log("deeplinking......",id)
  const [chef, setChef] = useState<Chef | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) {
      setError("Chef ID is missing");
      setLoading(false);
      return;
    }

    let active = true;

    async function loadChef() {
      try {
        setLoading(true);
        setError("");

        const response = await authenticatedFetch(
          `/chefs/${encodeURIComponent(id)}`
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(
            data.message || `Failed to load chef (HTTP ${response.status})`
          );
        }

        const data: Chef = await response.json();

        if (active) {
          setChef(data);
        }
     } catch (err) {
  if (active) {
    if (
      err instanceof Error &&
      err.message === "SESSION_EXPIRED"
    ) {
      router.replace("/login");
      return;
    }

    setError(
      err instanceof Error ? err.message : "Unable to load chef"
    );
  }
} finally {
  if (active) {
    setLoading(false);
  }
}
    }

    loadChef();

    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return <ActivityIndicator size="large" />;
  }

  if (error || !chef) {
    return <Text>{error || "Chef not found"}</Text>;
  }

  const selectedImage =
    chefImages[chef.image as keyof typeof chefImages];

  return (
    <ChefdetailCard
      name={chef.name}
      image={selectedImage}
      speciality={chef.specialty}
      details={chef.details}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#fff",
  },

  image: {
    width: "100%",
    height: 280,
    borderRadius: 20,
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
    marginTop: 20,
  },

  subtitle: {
    fontSize: 16,
    color: "#777",
    marginTop: 6,
  },

  description: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: 20,
  },
});