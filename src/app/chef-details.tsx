import { useLocalSearchParams } from "expo-router";
import { StyleSheet } from "react-native";
import ChefdetailCard from "../components/ChefdetailsCard";
export default function ChefDetailsScreen() {
  const { name, image,specialty,  details } = useLocalSearchParams<
  { name: string;
    image: string;
    specialty: string;
    details: string }
  >();
  const chefImages = {
  chef1: require("../../assets/images/chef1.jpg"),
  chef2: require("../../assets/images/chef2.jpg"),
  chef3: require("../../assets/images/chef3.jpg"),
};
const selectedImage =
  chefImages[image as keyof typeof chefImages];
  return (
    <ChefdetailCard
      name={name}
      image={selectedImage}
      speciality={specialty}
      details={details}
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