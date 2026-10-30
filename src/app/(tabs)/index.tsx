import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import { ActivityIndicator, Button, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSelector } from "react-redux";
import ChefCard from "../../components/ChefCard";
import FoodCard from "../../components/FoodCard";
import { fetchChefsFromApi } from "../../services/chefApi";
import { listenToChefs } from "../../services/chefservice";
import { chefSocket } from "../../services/chefSocket";
import { Chef } from "../../services/chefTypes";
export default function HomeScreen() {
  const [chefs, setChefs] = useState<Chef[]>([]);
  const [apiChefs, setApichefs] = useState<Chef[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiLoading, setApiLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const cartItems = useSelector(
    (state: any) => state.cart.items
  );
  const cartCount = cartItems.reduce(
    (total: number, item: any) =>
      total + item.quantity,
    0
  );
  const chefImages: Record<string, any> = {
    chef1: require("../../../assets/images/chef1.jpg"),
    chef2: require("../../../assets/images/chef2.jpg"),
    chef3: require("../../../assets/images/chef3.jpg"),
  };
  const testNodeApi = async () => {
    setApiLoading(true);
    setApiError(null);
    try {
      console.log("Home screen loaded: checking saved session");
      const data = await fetchChefsFromApi();
      setApichefs(data);
      console.log("NODE API CHEFS:", data);
    } catch (error) {
      console.error("NODE API ERROR:", error);
      if (error instanceof Error && error.message === "SESSION_EXPIRED") {
        router.replace("/login");
        return;
      }

      setApiError(
        error instanceof Error
          ? error.message
          : "Failed to fetch chefs from Node.js API"
      );
    } finally {
      setApiLoading(false);
    }
  };
  useEffect(() => {
    testNodeApi();
  }, []);
  //web socket for realtime
  useEffect(() => {
    chefSocket.connect();
    chefSocket.on("chefUpdate", (data) => {
      console.log("realtime chef update:", data);
      setApichefs(data);
    });
    chefSocket.on("connect", () => {
      console.log("Connected to Socket.IO server", chefSocket.id);
    });
    chefSocket.on("connect_error", (error) => {
      console.error("Socket.IO connection error:", error.message);
    });
    return () => {
      chefSocket.off("connect");
      chefSocket.off("chefUpdate");
      chefSocket.off("connect_error");
      chefSocket.disconnect();
    };

  }, []);


  //Loads chefs when Home opens.
  //Updates the list automatically when Firebase data changes.
  //Stops listening when you leave the screen, helping prevent unnecessary subscriptions.


  useEffect(() => {
    setLoading(true);

    const unsubscribe = listenToChefs(
      (data) => {
        console.log("FIRBASE CHEF RECEIVED", data);
        setChefs(data);
        setLoading(false);
      },
      // (error) => {
      //   console.error("Failed to listen to chefs:", error);
      //   setLoading(false);
      // }
      (error) => {
        console.error("Failed to listen to chefs:", error);
        console.error("Firebase error code:", error.code);
        console.error("Firebase error message:", error.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);
  // useEffect(() => {

  //   async function loadChefs() {
  //     try {
  //       const data = await getChefs();
  //       setChefs(data);
  //     } catch (error) {
  //       console.error("Failed to fetch chefs:", error);
  //     } finally {
  //       setLoading(false);
  //     }
  //   }

  //   loadChefs();
  // }, []);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Button
          title="Test Node API"
          onPress={testNodeApi}
        />
        <View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.greeting}>Hello, Smita 👋</Text>
            <Pressable
              onPress={() => router.push("/cart")}
              style={styles.cartButton}
            >
              <Text style={styles.cartText}>
                🛒 Cart ({cartCount})
              </Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                await SecureStore.deleteItemAsync("accessToken");
                await SecureStore.deleteItemAsync("refreshToken");
                router.replace("/login");
              }}
              style={styles.cartButton}
            >
              <Text style={styles.cartText}>Logout</Text>
            </Pressable>
          </View>
          <Text style={styles.title}>What are you craving today?</Text>
        </View>

      </View>
      <TextInput
        style={styles.search}
        placeholder="Search food or recipes..."
        placeholderTextColor="#777"
      />
      <Text style={styles.sectionTitle}>
        Chefs from Node.js API
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {/* {apiLoading ? (
  <ActivityIndicator size="large" color="#FF6B35" />
) : apiError ? (
  <Text>{apiError}</Text>
):apiChefs.length === 0?(
  <Text>No chefs available from API.</Text>
):(
   {apiChefs.map((chef) => (

          <ChefCard

            key={chef.id}

            name={chef.name}

            specialty={chef.specialty}

            image={

              chefImages[chef.image] ??

              require("../../../assets/images/chef1.jpg")

            }

            onPress={() => { }}

          />

        ))}
)}  */}


        {apiLoading ? (
          <ActivityIndicator size="large" color="#FF6B35" />
        ) : apiError ? (
          <View>
            <Text>{apiError}</Text>
            <Button
              title="Retry"
              onPress={testNodeApi}
            />
          </View>
        ) : apiChefs.length === 0 ? (
          <Text>No chefs available.</Text>
        ) : (
          apiChefs.map((chef) => (
            <ChefCard
              key={chef.id}
              name={chef.name}
              specialty={chef.specialty}
              image={
                chefImages[chef.image] ??
                require("../../../assets/images/chef1.jpg")
              }

              onPress={() => {
                router.push({
                  pathname: "/chef-details",
                  params: {
                    id: chef.id,
                  },
                });
              }}

            />
          ))
        )}




      </ScrollView>
      <Text style={styles.sectionTitle}>Popular Chefs</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} >


        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF6B35" />

          </View>
        ) : chefs.length === 0 ? (
          <Text>No chefs available.</Text>
        ) : (
          chefs.map((chef) => (

            <ChefCard
              key={chef.id}
              name={chef.name}
              specialty={chef.specialty}
              //image={chefImages[chef.image]}
              image={chefImages[chef.image] ?? require("../../../assets/images/chef1.jpg")}
              onPress={() => {

              }}
            />
          ))
        )}

      </ScrollView>
      <View>
        <Text style={styles.sectionTitle}>Recommended for You</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <FoodCard
            name="Chicken noodles"
            description="Rich Italian flavors "
            image={require("../../../assets/images/food1.jpg")}
            onPress={() => {
              router.push({

                pathname: "/food-details",

                params: {

                  name: "Chicken noodles ",
                  description: "Rich Italian flavors",
                  image: "food1",
                  price: "20",

                },

              })
            }}
          />

          <FoodCard
            name="crispy fried croquettes "
            description="Healthy and delicious"
            image={require("../../../assets/images/food2.jpg")}
            onPress={() => {

              router.push({

                pathname: "/food-details",

                params: {

                  name: "crispy fried croquettes ",
                  description: "Healthy and delicious",
                  image: "food2",
                  price: "25",

                },

              })
            }}
          />

          <FoodCard
            name="waffle ice cream sandwich"
            description="flavorful"
            image={require("../../../assets/images/food3.jpg")}
            onPress={() => {

              router.push({

                pathname: "/food-details",

                params: {

                  name: "waffle ice cream sandwich ",
                  description: "flavorful",
                  image: "food3",
                  price: "35",

                },

              })
            }}
          />
        </ScrollView>
      </View>
      {/* <Text style={styles.sectionTitle}>Recommended for You</Text>
      <View style={styles.foodCard}>
        <Text style={styles.foodEmoji}>🍛</Text>
        <View>
          <Text style={styles.foodName}>Kerala Chicken Curry</Text>
          <Text style={styles.foodDetails}>Homestyle • ⭐ 4.8</Text>
        </View>
      </View>
      <View style={styles.foodCard}>
        <Text style={styles.foodEmoji}>🥗</Text>
        <View>
          <Text style={styles.foodName}>Healthy Chicken Bowl</Text>
          <Text style={styles.foodDetails}>High Protein • ⭐ 4.7</Text>
        </View>
      </View> */}
      <View style={styles.aiBox}>
        <Text style={styles.aiTitle}>🤖 AI Food Assistant</Text>
        <Text style={styles.aiText}>
          Not sure what to eat? Ask our AI assistant for personalized food
          recommendations.
        </Text>
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  header: {
    marginTop: 30,
    marginBottom: 20,
  },
  greeting: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#222',
  },
  search: {
    height: 50,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    marginTop: 10,
  },
  chefCard: {
    width: 130,
    padding: 15,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 15,
    marginRight: 12,
    alignItems: 'center',
  },
  chefEmoji: {
    fontSize: 45,
    marginBottom: 8,
  },
  chefName: {
    fontSize: 15,
    fontWeight: '600',
  },
  rating: {
    marginTop: 5,
    color: '#666',
  },
  foodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 15,
    marginBottom: 12,
  },
  foodEmoji: {
    fontSize: 45,
    marginRight: 15,
  },
  foodName: {
    fontSize: 16,
    fontWeight: '600',
  },
  foodDetails: {
    marginTop: 5,
    color: '#777',
  },
  aiBox: {
    marginTop: 15,
    marginBottom: 30,
    padding: 18,
    borderRadius: 15,
    backgroundColor: '#f2f2f2',
  },
  aiTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  aiText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#555',
  },
  cartButton: {
    alignSelf: "flex-end",
    backgroundColor: "#f0f0f0",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 15,
  },

  cartText: {
    fontSize: 16,
    fontWeight: "600",
  },
  loadingContainer: {
    padding: 20,
    alignItems: "center",
    gap: 8,
  },
});