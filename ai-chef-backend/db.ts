import "dotenv/config";
import { Pool } from "pg";

export const pool =new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database:process.env.DB_NAME ,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
})

// pool.query("SELECT NOW()")
//   .then((result) => {
//     console.log("PostgreSQL connected successfully:", result.rows[0]);
//   })
//   .catch((error) => {
//     console.error("PostgreSQL connection failed:", error.message);
//   });
