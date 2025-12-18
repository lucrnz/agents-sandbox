import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

const sqlite = new Database(process.env.DB_FILE_NAME || "sqlite.db");
export const db = drizzle(sqlite, { schema });

// Initialize database with schema
export async function initializeDatabase() {
  // You can add initial database setup here if needed
  console.log("Database initialized with Bun SQLite + Drizzle");
}
