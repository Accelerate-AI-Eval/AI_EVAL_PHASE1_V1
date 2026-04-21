// backend/src/database/db.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
// Create the postgresql client
const DATABASE_USER = process.env.DATABASE_USER ?? "postgres";
const DATABASE_PASSWORD = process.env.DATABASE_PASSWORD ?? "Postgresql123";
const DATABASE_HOST = process.env.DATABASE_HOST ?? "localhost";
const DATABASE_PORT = process.env.DATABASE_PORT ?? "5432";
const DATABASE_NAME = process.env.DATABASE_NAME ?? "ai_eval_db";
const DATABASE_URI = `postgresql://${DATABASE_USER}:${DATABASE_PASSWORD}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}`;
const pool = new Pool({
    // Connection String
    connectionString: DATABASE_URI,
    // user: process.env.DATABASE_USER,
    // password: process.env.DATABASE_PASSWORD,
    // host: process.env.DATABASE_HOST,
    // port: Number(process.env.DATABASE_PORT),
    // database: process.env.DATABASE_NAME,
});
// Create Drizzle ORM instance
export const db = drizzle({ client: pool });
export { pool };
// Optional: function to check connection
export async function initDB() {
    try {
        await db.execute(`SELECT 1 AS connected`);
        console.log("Database connected successfully");
    }
    catch (err) {
        console.error("Database connection failed:", err);
        throw err; // stop server if DB fails
    }
}
