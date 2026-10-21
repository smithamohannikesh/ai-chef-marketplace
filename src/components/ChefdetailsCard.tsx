import { Image, StyleSheet, Text, View } from "react-native";
type ChefdetailsCardProps={
    name:string,
    image:any,
    speciality:string,
    details:string,

}
export default function  ChefdetailCard({
name,
    image,
    speciality,
    details

}:ChefdetailsCardProps){
    return(
       <View style={styles.card}>
        <Image source={image} style={styles.image} />
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.speciality}>{speciality}</Text>
        <Text style={styles.details}>{details}</Text>
       </View>
    ) ;

}
const styles = StyleSheet.create({
    card: {
        width: "100%",
        padding: 20,
        backgroundColor: "#fff",
       flex: 1,

    },
    image: {
        width: "100%",
    height: 280,
    borderRadius: 20,


    },
    name: {

         fontSize: 28,
    fontWeight: "700",
    marginTop: 20,
    },
    speciality: {

         fontSize: 16,
    color: "#777",
    marginTop: 6,
    },
    details: {
         fontSize: 16,
    lineHeight: 24,
    marginTop: 20,
    }
})