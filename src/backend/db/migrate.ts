import { Database } from "bun:sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { readdirSync } from "fs";

export async function runMigrations() {
  const sqlite = new Database(process.env.DB_FILE_NAME || "sqlite.db");
  const db = drizzle(sqlite);

  try {
    // Check if migrations folder exists and has files
    const migrationsPath = "./drizzle";
    let migrationFiles: string[] = [];

    try {
      migrationFiles = readdirSync(migrationsPath)
        .filter((file: string) => file.endsWith(".sql"))
        .sort();
    } catch (error) {
      console.log("No migrations folder found, creating...");
    }

    if (migrationFiles.length === 0) {
      // If no migrations exist, create schema directly
      console.log("No migrations found, applying schema directly...");
      applySchemaDirectly(sqlite);
    } else {
      // Run migrations
      console.log(`Found ${migrationFiles.length} migration(s), running...`);
      migrate(db, { migrationsFolder: migrationsPath });
    }
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    sqlite.close();
  }
}

// Apply schema directly without migrations (for simple setup)
function applySchemaDirectly(sqlite: Database) {
  // Create conversations table
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Create messages table
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    )
  `);

  console.log("Database schema created successfully");
}

// Generate migration files manually using schema
export function generateMigration(name: string) {
  console.log(`
To generate migrations, you need to run:
  bunx drizzle-kit generate --name=${name}

However, since we're using bun:sqlite without better-sqlite3 or libsql,
you'll need to apply migrations manually or use the direct schema approach.
  `);
}
