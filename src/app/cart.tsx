//import { useLocalSearchParams } from "expo-router";

import { createOrder } from "@/services/orderApi";
import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import {
  clearCart,
  decreaseQuantity,
  increaseQuantity, removeFromCart
} from "../store/cartSlice";
export default function CartScreen() {

const dispatch = useDispatch();
const [CustomerName]=useState("Smitha");
const [checkoutLoading,setcheckOutLoading]=useState(false);
const [checkoutMessage,setcheckoutMessage] =useState("");
const[orderPlaced,setOderPlaced]=useState(false)
const handleCheckout=async()=>{
  if(cartItems.length===0 || checkoutLoading){
    return;
  }
  setcheckOutLoading(true);
  setcheckoutMessage("");
  try{

    const order= await createOrder(CustomerName,totalPrice);
   setOderPlaced(true);
    setcheckoutMessage(

      `Order #${order.id} created successfully!`

    );
    dispatch( clearCart());
  }
  catch(error){
    const message = error  instanceof Error?error.message:"Unable to place Order";
    setcheckoutMessage(message);
  }
  finally{
    setcheckOutLoading(false);
  }
}


  const foodImages = {
  food1: require("../../assets/images/food1.jpg"),
  food2: require("../../assets/images/food2.jpg"),
  food3: require("../../assets/images/food3.jpg"),
};
const cartItems = useSelector((state: any) => state.cart.items);
 const totalPrice = cartItems.reduce(
  (total: number, item: any) =>
    total + item.price * item.quantity,
  0
);
return (
    <View style={styles.container}>
  {cartItems.length === 0 ? (
  <Text style={styles.emptyText}>Your cart is empty</Text>
) : (

       cartItems.map((item: any) => (
  <View key={item.id} style={styles.cartItem}>
    <Image
      source={foodImages[item.image as keyof typeof foodImages]}
      style={styles.cartImage}
    />

    <View style={styles.cartInfo}>
      <Text style={styles.foodName}>{item.name}</Text>

      <Text style={styles.description}>
        {item.description}
      </Text>

      <Text style={styles.price}>
        AED {item.price} × {item.quantity}
      </Text>

    </View>
    <View>

        <View style={styles.quantityContainer}>

    <Pressable
        style={styles.quantityButton}
        onPress={() => dispatch(decreaseQuantity(item.id))}
    >
        <Text style={styles.quantityButtonText}>−</Text>
    </Pressable>

    <Text style={styles.quantity}>
        {item.quantity}
    </Text>

    <Pressable
        style={styles.quantityButton}
        onPress={() => dispatch(increaseQuantity(item.id))}
    >
        <Text style={styles.quantityButtonText}>+</Text>
    </Pressable>


        </View>
        <Pressable
  onPress={() => dispatch(removeFromCart(item.id))}
>
  <Text style={styles.removeText}>🗑️</Text>
</Pressable>
      </View>


  </View>
))
)}
  {cartItems.length > 0 && (
  <>
    <Text style={styles.total}>
      Total: AED {totalPrice}
    </Text>
<Pressable
  style={[
    styles.checkoutButton,
    cartItems.length === 0 && styles.disabledButton,
  ]}
disabled={
  checkoutLoading ||
  orderPlaced ||
  cartItems.length === 0
}
  onPress={handleCheckout}
>
   <Text style={styles.checkoutText}>

    {checkoutLoading

      ? "Placing Order..."

      : orderPlaced

        ? "Order Placed"

        : "Proceed to Checkout"}

  </Text>


</Pressable>
{checkoutMessage !== "" && (

  <Text style={{ marginTop: 12, fontSize: 16 }}>

    {checkoutMessage}

  </Text>

)}
    {/* <Pressable style={styles.checkoutButton}>
      <Text style={styles.checkoutText}>Proceed to Checkout</Text>
    </Pressable> */}
  </>
)}
    </View>
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

  height: 220,

  borderRadius: 16,

  marginBottom: 15,

},




quantityContainer: {
  flexDirection: "row",
  alignItems: "center",
  marginTop: 20,
},

quantityButton: {
  width: 40,
  height: 40,
  borderRadius: 10,
  backgroundColor: "#eee",
  alignItems: "center",
  justifyContent: "center",
},

quantityButtonText: {
  fontSize: 24,
  fontWeight: "600",
},

quantity: {
  fontSize: 18,
  fontWeight: "600",
  marginHorizontal: 20,
},
cartItem: {
  flexDirection: "row",
  marginBottom: 20,
  padding: 10,
  backgroundColor: "#f5f5f5",
  borderRadius: 15,
},

cartImage: {
  width: 100,
  height: 100,
  borderRadius: 12,
},

cartInfo: {
  flex: 1,
  marginLeft: 12,
},

foodName: {
  fontSize: 18,
  fontWeight: "600",
},

description: {
  fontSize: 13,
  color: "#777",
  marginTop: 5,
},

price: {
  fontSize: 16,
  fontWeight: "600",
  marginTop: 10,
},
removeText: {
  fontSize: 18,
  fontWeight: "600",
  marginHorizontal: 55,
  marginTop: 20,

},
total: {
  fontSize: 22,
  fontWeight: "700",
  marginTop: 20,
  marginBottom: 20,
},
emptyText: {
  fontSize: 18,
  textAlign: "center",
  marginTop: 50,
},
checkoutButton: {
  backgroundColor: "#000",
  paddingVertical: 15,
  borderRadius: 12,
  alignItems: "center",
  marginTop: 10,
},

checkoutText: {
  color: "#fff",
  fontSize: 16,
  fontWeight: "600",
},
disabledButton: {
  backgroundColor: "#999",
},
});