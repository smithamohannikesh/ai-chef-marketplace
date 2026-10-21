import { Image, Pressable, StyleSheet, Text } from "react-native";

type ChefCardProps = {
  name: string;
  image: any;
  specialty: string;
   onPress: () => void;
};

export default function ChefCard({
  name,
  image,
  specialty,
  onPress
}: ChefCardProps) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <Image source={image} style={styles.image} />

      <Text style={styles.name}>{name}</Text>

      <Text style={styles.specialty}>{specialty}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 150,
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

  specialty: {
    fontSize: 13,
    color: "#777",
    marginTop: 4,
  },
});