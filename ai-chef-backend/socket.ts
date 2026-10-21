import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { pool } from "./db";
let io:Server;
export function initializeSocket(server:HttpServer){
    io=new Server(server,{
        cors:{
            origin:"*",
        },
    });
    return io;
}
export async function broadcastChefUpdate(){
   if(!io){return;  }
   const result=await pool.query("SELECT * FROM chefs");
   io.emit("chefUpdate",result.rows);
}
