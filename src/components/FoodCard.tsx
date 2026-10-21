
import { Image, Pressable, StyleSheet, Text } from "react-native";

type FoodCardProps = {
  name: string;
  image: any;
  description: string;
  onPress: () => void;
};

export default function FoodCard({
  name,
  image,
  description,
  onPress
}: FoodCardProps) {
  return (
   <Pressable style={styles.card} onPress={onPress}>
      <Image source={image} style={styles.image} />

      <Text style={styles.name}>{name}</Text>

      <Text style={styles.description}>{description}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 180,
    marginRight: 15,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 10,
  },

  image: {
    width: "100%",
    height: 120,
    borderRadius: 12,
  },

  name: {
    fontSize: 17,
    fontWeight: "600",
    marginTop: 8,
  },

  description: {
    fontSize: 13,
    color: "#777",
    marginTop: 4,
  },
});