# Bun Drizzle Migrations Implementation Guide

This guide describes how to implement and manage database migrations in a Bun project using Drizzle ORM and the integrated `bun:sqlite` driver.

## Prerequisites

Ensure you have the following dependencies installed:

```bash
bun add drizzle-orm
bun add -D drizzle-kit
```

## 1. Drizzle Configuration

Create a `drizzle.config.ts` file in your project root to configure how Drizzle Kit should handle your schema and migrations.

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle', // Directory where migration files will be generated
  schema: './src/backend/db/schema.ts', // Path to your schema definition
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DB_FILE_NAME || 'sqlite.db',
  },
});
```

## 2. Generating Migrations

When you update your schema in `src/backend/db/schema.ts`, generate a new migration file:

```bash
bunx drizzle-kit generate --name <migration_name>
```

This will create a new `.sql` file in the `./drizzle` directory along with metadata in the `meta` folder.

## 3. Applying Migrations

### Programmatic Migration (Recommended for Production)

Use the `migrate` function provided by Drizzle to run migrations when your application starts.

```typescript
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

// Initialize the database connection
const sqlite = new Database(process.env.DB_FILE_NAME || "sqlite.db");
const db = drizzle(sqlite);

async function runMigrations() {
  console.log("Running migrations...");
  
  try {
    // This will run all migrations from the 'drizzle' folder
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("Migrations completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

await runMigrations();
```

### Fast Prototyping (Development Only)

During development, you can use the `push` command to sync your schema directly with the database without creating migration files. **Warning: This may cause data loss if columns are removed.**

```bash
bunx drizzle-kit push
```

## 4. Database Setup with Bun Integration

In your `src/backend/db/index.ts` or equivalent, you should initialize the Drizzle instance using the `bun-sqlite` package.

```typescript
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

const sqlite = new Database(process.env.DB_FILE_NAME || "sqlite.db");
export const db = drizzle(sqlite, { schema });
```

## 5. Summary of Commands

| Command | Description |
|---------|-------------|
| `bunx drizzle-kit generate` | Generate a new migration based on schema changes. |
| `bunx drizzle-kit push` | Push schema changes directly to the database (dev). |
| `bunx drizzle-kit studio` | Open a GUI to explore and edit your database. |
| `bunx drizzle-kit check` | Check if migration files match current schema. |

## 6. Known Limitations & Tips

- **WAL Mode**: For better performance with SQLite in Bun, enable WAL mode:
  ```typescript
  const sqlite = new Database("sqlite.db");
  sqlite.exec("PRAGMA journal_mode = WAL;");
  ```
- **Path Resolution**: When running migrations programmatically, ensure the `migrationsFolder` path is relative to the process execution root or use `path.resolve`.

