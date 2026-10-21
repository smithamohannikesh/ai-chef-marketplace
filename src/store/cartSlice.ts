import { createSlice, PayloadAction } from "@reduxjs/toolkit";

type CartItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  quantity: number;
};

type CartState = {
  items: CartItem[];
};

const initialState: CartState = {
  items: [],
};

const cartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {
    // addToCart: (state, action: PayloadAction<CartItem>) => {
    //   state.items.push(action.payload);
    // },
    addToCart: (state, action: PayloadAction<CartItem>) => {
  const existingItem = state.items.find(
    (item) => item.id === action.payload.id
  );

  if (existingItem) {
    existingItem.quantity += action.payload.quantity;
  } else {
    state.items.push(action.payload);
  }
},
increaseQuantity: (state, action: PayloadAction<string>) => {
  const item = state.items.find(
    (item) => item.id === action.payload
  );

  if (item) {
    item.quantity += 1;
  }
},

decreaseQuantity: (state, action: PayloadAction<string>) => {
  const item = state.items.find(
    (item) => item.id === action.payload
  );

  if (item && item.quantity > 1) {
    item.quantity -= 1;
  }
},
removeFromCart: (state, action: PayloadAction<string>) => {
  state.items = state.items.filter(
    (item) => item.id !== action.payload
  );
},
clearCart: (state) => {
  state.items = [];
},

  },
});

export const { addToCart, increaseQuantity, decreaseQuantity, removeFromCart ,clearCart} = cartSlice.actions;

export default cartSlice.reducer;