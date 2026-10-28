import { router, useLocalSearchParams } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useDispatch } from "react-redux";
import { addToCart } from "../store/cartSlice";
export default function FoodDetailsScreen() {
  const { name, description, price,image } = useLocalSearchParams<{
    name: string;
    description: string;
    price: string;
    image:string;
  }>();
const foodImages = {
  food1: require("../../assets/images/food1.jpg"),
  food2: require("../../assets/images/food2.jpg"),
  food3: require("../../assets/images/food3.jpg"),
};
const dispatch = useDispatch();
  return (
    <View style={styles.container}>
 <Image
  source={
    foodImages[image as keyof typeof foodImages] ??
    foodImages.food1
  }
  style={styles.image}
/>
      <Text style={styles.title}>{name}</Text>

      <Text style={styles.description}>{description}</Text>

      <Text style={styles.price}>AED {price}</Text>
  <Pressable
  style={styles.button}
  onPress={() => {
  dispatch(
    addToCart({
      id: image,
      name,
      description,
      price: Number(price),
      image,
      quantity: 1,
    })
  );

  router.push("/cart");
}}
//   onPress={() => {
//   router.push({
//     pathname: "/cart",
//     params: {
//       name,
//       description,
//       price,
//       image,
//     },
//   });

//}}
>
  <Text style={styles.buttonText}>Add to Cart</Text>
</Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#fff",
  },

  title: {
    fontSize: 28,
    fontWeight: "700",
    marginTop: 20,
  },

  description: {
    fontSize: 16,
    color: "#777",
    marginTop: 12,
    lineHeight: 24,
  },
image: {
  width: "100%",
  height: 280,
  borderRadius: 20,
},
  price: {
    fontSize: 22,
    fontWeight: "700",
    marginTop: 20,
  },
  button: {
  marginTop: 30,
  backgroundColor: "#000",
  paddingVertical: 15,
  borderRadius: 12,
  alignItems: "center",
},

buttonText: {
  color: "#fff",
  fontSize: 16,
  fontWeight: "600",
},
});