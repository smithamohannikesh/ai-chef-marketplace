import { io } from "socket.io-client";
export const chefSocket=io("http://localhost:3000",{
    autoConnect:false,
    transports:["websocket"]
})