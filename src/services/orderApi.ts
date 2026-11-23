import { authenticatedFetch } from "./api";

const API_URL="http://localhost:3000";
export type CreateOrderResponse ={
    id:number;
    customer_name:string;
    total_amount:string;
    status:string;
    created_at:string;
};
export async function createOrder(
    customerName:string,
    totalAmount:number
): Promise<CreateOrderResponse>{

    const response = await authenticatedFetch("/orders",{
        method:"POST",
        headers:{
             "Content-Type": "application/json",
        },
        body : JSON.stringify({

      customer_name: customerName,

      total_amount: totalAmount,

    }),
    });
   // const response = await authenticatedFetch("/orders");
    const data= await response.json();
    console.log("ordercreted",data)
    if(!response.ok){
        throw new Error(data.message || "Failed to create order")
    }
    return data as CreateOrderResponse;
}