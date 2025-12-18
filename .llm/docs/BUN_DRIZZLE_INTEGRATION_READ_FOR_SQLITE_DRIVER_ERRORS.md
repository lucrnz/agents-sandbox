# Bun + Drizzle ORM + Drizzle Kit Integration Guide

## Table of Contents
1. [Overview](#overview)
2. [Architecture & Integration](#architecture--integration)
3. [Setup & Configuration](#setup--configuration)
4. [Database Connection Management](#database-connection-management)
5. [Schema Definition](#schema-definition)
6. [Migration Workflow](#migration-workflow)
7. [Query Patterns](#query-patterns)
8. [Performance Optimization](#performance-optimization)
9. [Testing Strategies](#testing-strategies)
10. [Production Deployment](#production-deployment)
11. [Common Pitfalls & Solutions](#common-pitfalls--solutions)
12. [Complete Example Implementation](#complete-example-implementation)

## Overview

This guide covers the complete integration of **Drizzle ORM** with **Bun's built-in SQLite driver** (`bun:sqlite`) and **Drizzle Kit** for migrations. This combination provides:

- Zero external dependencies for SQLite (uses Bun's native implementation)
- Full TypeScript type safety with auto-inferred schema types
- High-performance query execution optimized for Bun runtime
- Seamless migration management through Drizzle Kit
- Both SQL-like query builder and relational query APIs

## Architecture & Integration

### Integration Flow

```
Application Code
       ↓
   Drizzle ORM
       ↓
  drizzle-orm/bun-sqlite
       ↓
    bun:sqlite (Native)
       ↓
    SQLite Database
```

### Key Components

1. **bun:sqlite** - Bun's native SQLite database driver
2. **drizzle-orm/bun-sqlite** - Drizzle adapter for Bun SQLite
3. **drizzle-kit** - Migration and schema management tool
4. **TypeScript** - Full type safety and auto-completion

### Performance Benefits

- **Native Integration**: No JavaScript overhead for database operations
- **Built-in Optimization**: Bun's runtime optimizes SQLite operations
- **Zero Dependencies**: No external SQLite libraries needed
- **Type-Safe Queries**: Compile-time error checking

## Setup & Configuration

### Prerequisites

- Bun runtime installed
- TypeScript project configured
- Basic understanding of SQL and ORMs

### Installation

```bash
# Core dependencies
bun add drizzle-orm

# Development dependencies
bun add -D drizzle-kit @types/bun

# If not already installed
bun add typescript
```

### Project Structure

```
src/
├── lib/
│   └── db/
│       ├── index.ts          # Main database export
│       ├── adapter.ts        # Connection management
│       ├── schema.ts         # Database schema definitions
│       └── migrations/       # Migration files (auto-generated)
├── scripts/
│   ├── migrate.ts           # Migration runner
│   └── seed.ts              # Database seeding
└── routes/                   # API routes using the database
```

### Configuration Files

#### drizzle.config.ts

```typescript
import type { Config } from 'drizzle-kit';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './src/lib/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_PATH || './data/sqlite.db',
  },
  verbose: true,
  strict: true,
});
```

#### bun.lockb

Automatically generated when you install dependencies.

#### tsconfig.json

Ensure your TypeScript configuration supports path mapping:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@/db/*": ["./src/lib/db/*"]
    }
  }
}
```

## Database Connection Management

### Basic Connection

```typescript
// src/lib/db/adapter.ts
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from './schema';

// Create SQLite database connection
const sqlite = new Database('./data/sqlite.db');

// Initialize Drizzle with schema and optional logger
export const db = drizzle(sqlite, { 
  schema,
  logger: process.env.NODE_ENV === 'development',
});
```

### Advanced Connection with Optimizations

```typescript
// src/lib/db/adapter.ts
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from './schema';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

interface DatabaseInstance {
  db: ReturnType<typeof drizzle>;
  client: Database;
  close: () => void;
  healthCheck: () => Promise<boolean>;
}

function createDatabase(): DatabaseInstance {
  const dbPath = process.env.DATABASE_PATH || './data/sqlite.db';
  
  // Ensure database directory exists
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
  
  const sqlite = new Database(dbPath);
  
  // Performance optimizations for SQLite
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec('PRAGMA journal_mode = WAL');
  sqlite.exec('PRAGMA synchronous = NORMAL');
  sqlite.exec('PRAGMA cache_size = -2000'); // 2MB cache
  sqlite.exec('PRAGMA temp_store = MEMORY');
  sqlite.exec('PRAGMA mmap_size = 268435456'); // 256MB memory-mapped I/O
  
  const db = drizzle(sqlite, { 
    schema,
    logger: process.env.NODE_ENV === 'development',
  });
  
  return {
    db,
    client: sqlite,
    close: () => sqlite.close(),
    async healthCheck() {
      try {
        sqlite.query('SELECT 1').get();
        return true;
      } catch (error) {
        console.error('Database health check failed:', error);
        return false;
      }
    },
  };
}

// Singleton instance for application lifecycle
let dbInstance: DatabaseInstance | null = null;

export function getDatabase(): DatabaseInstance {
  if (!dbInstance) {
    dbInstance = createDatabase();
    
    // Cleanup on process exit
    process.on('beforeExit', () => {
      if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
      }
    });
  }
  
  return dbInstance;
}

// Export the db instance for direct use
export const db = getDatabase().db;
```

### Environment-Specific Configuration

```typescript
const getDatabaseConfig = () => {
  const env = process.env.NODE_ENV || 'development';
  
  switch (env) {
    case 'test':
      return {
        path: ':memory:',
        logger: false,
        optimizations: false, // No need for optimizations in memory DB
      };
    case 'production':
      return {
        path: process.env.DATABASE_PATH || './data/production.db',
        logger: false,
        optimizations: true,
      };
    default: // development
      return {
        path: './data/development.db',
        logger: true,
        optimizations: true,
      };
  }
};
```

## Schema Definition

### Basic Table Definition

```typescript
// src/lib/db/schema.ts
import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';
import { sql, relations } from 'drizzle-orm';

// Users table with comprehensive field types
export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
  avatar: text('avatar'),
  metadata: blob('metadata', { mode: 'json' }).$type<{
    theme: string;
    preferences: Record<string, any>;
  }>(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`strftime('%s', 'now')`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`strftime('%s', 'now')`)
    .$onUpdateFn(() => sql`strftime('%s', 'now')`),
}, (table) => ({
  // Custom indexes for performance
  emailIdx: sqliteIndex('idx_users_email').on(table.email),
  nameIdx: sqliteIndex('idx_users_name').on(table.name),
}));

// Posts table with foreign key relationships
export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content'),
  published: integer('published', { mode: 'boolean' }).default(false),
  userId: integer('user_id').references(() => users.id, { 
    onDelete: 'cascade',
    onUpdate: 'cascade'
  }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`strftime('%s', 'now')`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`strftime('%s', 'now')`)
    .$onUpdateFn(() => sql`strftime('%s', 'now')`),
}, (table) => ({
  userIdIdx: sqliteIndex('idx_posts_user_id').on(table.userId),
  publishedIdx: sqliteIndex('idx_posts_published').on(table.published),
}));

// Many-to-many relationship table
export const postTags = sqliteTable('post_tags', {
  postId: integer('post_id').references(() => posts.id, { onDelete: 'cascade' }),
  tagId: integer('tag_id').references(() => tags.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: sqlitePrimaryKey({ columns: [table.postId, table.tagId] }),
}));

// Tags table
export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey(),
  name: text('name').unique().notNull(),
  color: text('color').default('#000000'),
});
```

### Relations Definition

```typescript
// Define relationships between tables
export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, {
    fields: [posts.userId],
    references: [users.id],
  }),
  tags: many(postTags),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  posts: many(postTags),
}));

export const postTagsRelations = relations(postTags, ({ one }) => ({
  post: one(posts, {
    fields: [postTags.postId],
    references: [posts.id],
  }),
  tag: one(tags, {
    fields: [postTags.tagId],
    references: [tags.id],
  }),
}));
```

### Schema Exports

```typescript
// Export all schema definitions and relations
export * from 'drizzle-orm/sqlite-core';
export {
  users,
  posts,
  tags,
  postTags,
  usersRelations,
  postsRelations,
  tagsRelations,
  postTagsRelations,
};
```

## Migration Workflow

### Migration Generation

```bash
# Generate migration files from schema changes
bunx drizzle-kit generate

# Or with explicit paths
bunx drizzle-kit generate --schema ./src/lib/db/schema.ts --out ./src/lib/db/migrations
```

### Migration Runner Script

```typescript
// src/scripts/migrate.ts
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import path from 'path';

async function runMigrations() {
  try {
    const dbPath = process.env.DATABASE_PATH || './data/sqlite.db';
    const migrationsPath = path.join(process.cwd(), 'src/lib/db/migrations');
    
    console.log(`📊 Connecting to database: ${dbPath}`);
    const sqlite = new Database(dbPath);
    const db = drizzle(sqlite);
    
    console.log('🔄 Running migrations...');
    await migrate(db, { migrationsFolder: migrationsPath });
    
    console.log('✅ Migrations completed successfully');
    sqlite.close();
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migrations if this file is executed directly
if (import.meta.main) {
  runMigrations();
}

export { runMigrations };
```

### Database Seeding

```typescript
// src/scripts/seed.ts
import { getDatabase } from '../lib/db';
import * as schema from '../lib/db/schema';

async function seedDatabase() {
  console.log('🌱 Starting database seeding...');
  
  const { db } = getDatabase();
  
  try {
    // Seed users
    await db.insert(schema.users).values([
      {
        name: 'Admin User',
        email: 'admin@example.com',
        verified: true,
        metadata: {
          theme: 'dark',
          preferences: {
            notifications: true,
            emailUpdates: false,
          },
        },
      },
      {
        name: 'Test User',
        email: 'test@example.com',
        verified: false,
        metadata: {
          theme: 'light',
          preferences: {
            notifications: false,
            emailUpdates: true,
          },
        },
      },
    ]).onConflictDoNothing();
    
    console.log('✅ Users seeded successfully');
    
    // Seed tags
    await db.insert(schema.tags).values([
      { name: 'Technology', color: '#3b82f6' },
      { name: 'Programming', color: '#10b981' },
      { name: 'Tutorial', color: '#f59e0b' },
    ]).onConflictDoNothing();
    
    console.log('✅ Tags seeded successfully');
    
    console.log('🎉 Database seeding completed');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  }
}

// Run seeding if this file is executed directly
if (import.meta.main) {
  seedDatabase();
}

export { seedDatabase };
```

### Package.json Scripts

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "bun run src/scripts/migrate.ts",
    "db:seed": "bun run src/scripts/seed.ts",
    "db:studio": "drizzle-kit studio",
    "db:push": "drizzle-kit push --force",
    "db:reset": "rm -f ./data/sqlite.db && bun run db:migrate && bun run db:seed"
  }
}
```

## Query Patterns

### Basic CRUD Operations

```typescript
import { db } from '../lib/db';
import * as schema from '../lib/db/schema';
import { eq, and, or, like, desc, asc } from 'drizzle-orm';

// Create (Insert)
const newUser = await db.insert(schema.users)
  .values({
    name: 'John Doe',
    email: 'john@example.com',
    verified: true,
    metadata: {
      theme: 'dark',
      preferences: {
        notifications: true,
      },
    },
  })
  .returning(); // Return the inserted record

// Batch insert
const batchUsers = await db.insert(schema.users).values([
  { name: 'Alice', email: 'alice@example.com', verified: false },
  { name: 'Bob', email: 'bob@example.com', verified: true },
]).onConflictDoNothing(); // Skip on conflicts

// Read (Select)
const allUsers = await db.select().from(schema.users);
const activeUsers = await db.select()
  .from(schema.users)
  .where(eq(schema.users.verified, true));

// Select specific fields
const userNames = await db.select({
  id: schema.users.id,
  name: schema.users.name,
  email: schema.users.email,
}).from(schema.users);

// Complex where conditions
const complexQuery = await db.select()
  .from(schema.users)
  .where(
    or(
      like(schema.users.name, 'John%'),
      and(
        eq(schema.users.verified, true),
        sql`${schema.users.createdAt} > ${Date.now() - 86400000}`
      )
    )
  );

// Update
const updatedUser = await db.update(schema.users)
  .set({ 
    verified: true,
    updatedAt: new Date(),
  })
  .where(eq(schema.users.id, 1))
  .returning();

// Delete
const deletedUser = await db.delete(schema.users)
  .where(eq(schema.users.id, 1))
  .returning();
```

### Relational Queries

```typescript
// Get user with their posts
const userWithPosts = await db.query.users.findFirst({
  where: eq(schema.users.id, 1),
  with: {
    posts: {
      where: eq(schema.posts.published, true),
      orderBy: [desc(schema.posts.createdAt)],
      limit: 10,
    },
  },
});

// Get posts with author and tags
const postsWithDetails = await db.query.posts.findMany({
  with: {
    author: {
      columns: {
        id: true,
        name: true,
        email: true,
      },
    },
    tags: {
      with: {
        tag: true,
      },
    },
  },
  orderBy: [desc(schema.posts.createdAt)],
});

// Complex nested relations
const postsWithFullDetails = await db.query.posts.findMany({
  where: eq(schema.posts.published, true),
  with: {
    author: {
      with: {
        posts: {
          where: eq(schema.posts.published, true),
          columns: {
            id: true,
            title: true,
          },
        },
      },
    },
    tags: {
      with: {
        tag: true,
      },
    },
  },
  orderBy: [desc(schema.posts.createdAt)],
  limit: 20,
});
```

### Advanced Query Patterns

```typescript
import { count, avg, sum, max, min, sql } from 'drizzle-orm';

// Aggregation
const userStats = await db.select({
  totalUsers: count(schema.users.id),
  verifiedUsers: count(sql`CASE WHEN ${schema.users.verified} THEN 1 END`),
  averageCreatedAt: avg(schema.users.createdAt),
}).from(schema.users);

// Group by
const usersPostCounts = await db.select({
  userId: schema.users.id,
  userName: schema.users.name,
  postCount: count(schema.posts.id),
  lastPostDate: max(schema.posts.createdAt),
})
.from(schema.users)
.leftJoin(schema.posts, eq(schema.users.id, schema.posts.userId))
.groupBy(schema.users.id, schema.users.name)
.orderBy(desc(sql`postCount`));

// Subqueries
const usersWithRecentPosts = await db.select({
  id: schema.users.id,
  name: schema.users.name,
  email: schema.users.email,
})
.from(schema.users)
.where(
  inArray(
    schema.users.id,
    db.select({
      userId: schema.posts.userId,
    })
      .from(schema.posts)
      .where(
        and(
          eq(schema.posts.published, true),
          sql`${schema.posts.createdAt} > ${Date.now() - 7 * 24 * 60 * 60 * 1000}`
        )
      )
  )
);

// Pagination
const getUsersPage = async (page: number, limit: number = 10) => {
  const offset = (page - 1) * limit;
  
  const [data, total] = await Promise.all([
    db.select()
      .from(schema.users)
      .limit(limit)
      .offset(offset)
      .orderBy(asc(schema.users.id)),
    
    db.select({ count: count() }).from(schema.users),
  ]);
  
  return {
    data,
    pagination: {
      page,
      limit,
      total: total[0].count,
      pages: Math.ceil(total[0].count / limit),
    },
  };
};
```

### Transaction Handling

```typescript
// Simple transaction
const transferData = async (fromUserId: number, toUserId: number, postId: number) => {
  return await db.transaction(async (tx) => {
    // Update post ownership
    const updatedPost = await tx.update(schema.posts)
      .set({ userId: toUserId })
      .where(eq(schema.posts.id, postId))
      .returning();
    
    // Update user statistics (example)
    await tx.execute(sql`UPDATE users SET updated_at = ${new Date()} WHERE id IN (${fromUserId}, ${toUserId})`);
    
    return updatedPost;
  });
};

// Transaction with rollback on error
const complexOperation = async () => {
  try {
    const result = await db.transaction(async (tx) => {
      // Step 1: Create user
      const user = await tx.insert(schema.users).values({
        name: 'New User',
        email: 'new@example.com',
        verified: false,
      }).returning();
      
      // Step 2: Create post for user
      const post = await tx.insert(schema.posts).values({
        title: 'First Post',
        content: 'Hello World',
        userId: user[0].id,
        published: true,
      }).returning();
      
      // Step 3: Add tags to post
      await tx.insert(schema.postTags).values([
        { postId: post[0].id, tagId: 1 },
        { postId: post[0].id, tagId: 2 },
      ]);
      
      return { user: user[0], post: post[0] };
    });
    
    console.log('Transaction completed:', result);
    return result;
  } catch (error) {
    console.error('Transaction failed, rolled back:', error);
    throw error;
  }
};
```

## Performance Optimization

### Database Performance Settings

```typescript
// Apply comprehensive performance optimizations
const optimizeDatabase = (sqlite: Database) => {
  // WAL mode for better concurrency
  sqlite.exec('PRAGMA journal_mode = WAL');
  
  // Reduce durability for better performance (safe for most apps)
  sqlite.exec('PRAGMA synchronous = NORMAL');
  
  // Increase cache size (negative value = kilobytes)
  sqlite.exec('PRAGMA cache_size = -2000'); // 2MB
  
  // Store temporary tables in memory
  sqlite.exec('PRAGMA temp_store = MEMORY');
  
  // Enable memory-mapped I/O (256MB)
  sqlite.exec('PRAGMA mmap_size = 268435456');
  
  // Enable foreign key constraints
  sqlite.exec('PRAGMA foreign_keys = ON');
  
  // Optimize for SSD storage
  sqlite.exec('PRAGMA wal_autocheckpoint = 1000');
  
  // Pre-allocate database size (optional)
  sqlite.exec('PRAGMA page_size = 4096');
};
```

### Query Optimization Techniques

```typescript
// Prepared statements for repeated queries
const getUserById = db.query.users.findFirst({
  where: eq(schema.users.id, sql.placeholder('id')),
  with: {
    posts: {
      orderBy: [desc(schema.posts.createdAt)],
      limit: 5,
    },
  },
});

// Use the prepared statement
const user = await getUserById.execute({ id: 1 });

// Batch operations for better performance
const batchInsertUsers = async (users: Array<{name: string, email: string}>) => {
  return await db.insert(schema.users).values(users);
};

// Efficient bulk updates using CASE statements
const bulkUpdateVerifiedStatus = async (userIds: number[], verified: boolean) => {
  if (userIds.length === 0) return;
  
  const caseStatement = sql`CASE ${users.map((id, index) => 
    sql`WHEN id = ${id} THEN ${verified}`
  )} ELSE verified END`;
  
  await db.update(schema.users)
    .set({ verified: caseStatement })
    .where(inArray(schema.users.id, userIds));
};

// Optimized pagination for large datasets
const getOptimizedPostsPage = async (page: number, limit: number = 20) => {
  // Use keyset pagination for better performance on large datasets
  const offset = (page - 1) * limit;
  
  // Get records with a single query using OFFSET
  const posts = await db.select({
    id: schema.posts.id,
    title: schema.posts.title,
    published: schema.posts.published,
    createdAt: schema.posts.createdAt,
    author: {
      name: schema.users.name,
    },
  })
  .from(schema.posts)
  .leftJoin(schema.users, eq(schema.posts.userId, schema.users.id))
  .orderBy(desc(schema.posts.createdAt))
  .limit(limit)
  .offset(offset);
  
  // Get total count (consider caching this for frequent pagination)
  const totalResult = await db.select({
    count: count(schema.posts.id),
  }).from(schema.posts);
  
  return {
    data: posts,
    pagination: {
      page,
      limit,
      total: totalResult[0].count,
      pages: Math.ceil(totalResult[0].count / limit),
    },
  };
};
```

### Index Optimization

```typescript
// Create indexes strategically based on query patterns
export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => ({
  // Single column indexes
  emailIdx: sqliteIndex('idx_users_email').on(table.email),
  verifiedIdx: sqliteIndex('idx_users_verified').on(table.verified),
  
  // Composite index for common query patterns
  nameVerifiedIdx: sqliteIndex('idx_users_name_verified').on(table.name, table.verified),
  
  // Covering index for specific queries
  createdVerifiedIdx: sqliteIndex('idx_users_created_verified').on(table.createdAt, table.verified),
}));

// Create full-text search index for content
export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content'),
  userId: integer('user_id').references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => ({
  // FTS5 virtual table for full-text search
  // Note: This requires manual creation of the virtual table
  // CREATE VIRTUAL TABLE posts_fts USING fts5(title, content);
  
  userIdIdx: sqliteIndex('idx_posts_user_id').on(table.userId),
  createdAtIdx: sqliteIndex('idx_posts_created_at').on(table.createdAt),
  publishedUserIdIdx: sqliteIndex('idx_posts_published_user_id').on(table.userId, table.published),
}));
```

### Caching Strategies

```typescript
// Simple in-memory cache implementation
class QueryCache {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  
  set(key: string, data: any, ttlMs: number = 5 * 60 * 1000) { // 5 minutes default
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    });
  }
  
  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }
  
  clear() {
    this.cache.clear();
  }
}

const queryCache = new QueryCache();

// Cached query example
const getCachedUserStats = async () => {
  const cacheKey = 'user_stats';
  const cached = queryCache.get(cacheKey);
  
  if (cached) return cached;
  
  const stats = await db.select({
    totalUsers: count(schema.users.id),
    verifiedUsers: count(sql`CASE WHEN ${schema.users.verified} THEN 1 END`),
  }).from(schema.users);
  
  queryCache.set(cacheKey, stats, 10 * 60 * 1000); // 10 minutes
  return stats;
};
```

## Testing Strategies

### Test Database Setup

```typescript
// tests/setup.ts
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from '../src/lib/db/schema';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

export function createTestDatabase() {
  // Use in-memory database for tests
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });
  
  // Run migrations on test database
  migrate(db, { migrationsFolder: './src/lib/db/migrations' });
  
  return db;
}

// Test utilities
export const testUtils = {
  async createTestUser(db: ReturnType<typeof drizzle>, overrides?: Partial<typeof schema.users.$inferInsert>) {
    const userData = {
      name: 'Test User',
      email: 'test@example.com',
      verified: true,
      ...overrides,
    };
    
    const result = await db.insert(schema.users).values(userData).returning();
    return result[0];
  },
  
  async createTestPost(db: ReturnType<typeof drizzle>, userId: number, overrides?: Partial<typeof schema.posts.$inferInsert>) {
    const postData = {
      title: 'Test Post',
      content: 'This is a test post',
      userId,
      published: true,
      ...overrides,
    };
    
    const result = await db.insert(schema.posts).values(postData).returning();
    return result[0];
  },
};
```

### Test Example with Bun Test

```typescript
// tests/users.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { createTestDatabase, testUtils } from './setup';
import * as schema from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';

describe('User Operations', () => {
  let db: ReturnType<typeof createTestDatabase>;
  
  beforeEach(() => {
    db = createTestDatabase();
  });
  
  it('should create a user', async () => {
    const userData = {
      name: 'John Doe',
      email: 'john@example.com',
      verified: true,
    };
    
    const result = await db.insert(schema.users).values(userData).returning();
    
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject(userData);
    expect(result[0].id).toBeDefined();
  });
  
  it('should find a user by email', async () => {
    const testUser = await testUtils.createTestUser(db);
    
    const foundUser = await db.query.users.findFirst({
      where: eq(schema.users.email, testUser.email),
    });
    
    expect(foundUser).toBeDefined();
    expect(foundUser?.email).toBe(testUser.email);
  });
  
  it('should update a user', async () => {
    const testUser = await testUtils.createTestUser(db);
    
    const updatedUser = await db.update(schema.users)
      .set({ verified: false })
      .where(eq(schema.users.id, testUser.id))
      .returning();
    
    expect(updatedUser[0]).toBeDefined();
    expect(updatedUser[0].verified).toBe(false);
  });
  
  it('should delete a user', async () => {
    const testUser = await testUtils.createTestUser(db);
    
    const deletedUser = await db.delete(schema.users)
      .where(eq(schema.users.id, testUser.id))
      .returning();
    
    expect(deletedUser).toHaveLength(1);
    expect(deletedUser[0].id).toBe(testUser.id);
    
    const foundUser = await db.query.users.findFirst({
      where: eq(schema.users.id, testUser.id),
    });
    
    expect(foundUser).toBeNull();
  });
});
```

### Integration Test Example

```typescript
// tests/integration/user-posts.test.ts
import { describe, it, expect, beforeEach } from 'bun:test';
import { createTestDatabase, testUtils } from '../setup';
import * as schema from '../../src/lib/db/schema';
import { eq, count } from 'drizzle-orm';

describe('User-Posts Integration', () => {
  let db: ReturnType<typeof createTestDatabase>;
  
  beforeEach(() => {
    db = createTestDatabase();
  });
  
  it('should create user with posts', async () => {
    const user = await testUtils.createTestUser(db);
    
    const posts = await Promise.all([
      testUtils.createTestPost(db, user.id, { title: 'Post 1' }),
      testUtils.createTestPost(db, user.id, { title: 'Post 2' }),
      testUtils.createTestPost(db, user.id, { title: 'Post 3' }),
    ]);
    
    expect(posts).toHaveLength(3);
    
    // Verify user has posts through relational query
    const userWithPosts = await db.query.users.findFirst({
      where: eq(schema.users.id, user.id),
      with: {
        posts: true,
      },
    });
    
    expect(userWithPosts?.posts).toHaveLength(3);
  });
  
  it('should handle cascading deletes', async () => {
    const user = await testUtils.createTestUser(db);
    await testUtils.createTestPost(db, user.id);
    
    // Verify post exists
    const postCountBefore = await db.select({ count: count() }).from(schema.posts);
    expect(postCountBefore[0].count).toBe(1);
    
    // Delete user (should cascade to delete post)
    await db.delete(schema.users).where(eq(schema.users.id, user.id));
    
    // Verify post is deleted due to cascade
    const postCountAfter = await db.select({ count: count() }).from(schema.posts);
    expect(postCountAfter[0].count).toBe(0);
  });
});
```

## Production Deployment

### Production Configuration

```typescript
// src/lib/db/production-adapter.ts
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from './schema';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

export function createProductionDatabase() {
  const dbPath = process.env.DATABASE_PATH || './data/production.db';
  
  // Ensure database directory exists
  const dbDir = dirname(dbPath);
  mkdirSync(dbDir, { recursive: true });
  
  const sqlite = new Database(dbPath);
  
  // Production optimizations
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec('PRAGMA journal_mode = WAL');
  sqlite.exec('PRAGMA synchronous = NORMAL');
  sqlite.exec('PRAGMA cache_size = -6400'); // 6.4MB cache for production
  sqlite.exec('PRAGMA temp_store = MEMORY');
  sqlite.exec('PRAGMA mmap_size = 536870912'); // 512MB memory-mapped I/O
  
  // Production-specific settings
  sqlite.exec('PRAGMA wal_autocheckpoint = 10000');
  sqlite.exec('PRAGMA wal_checkpoint_mode = RESTART');
  
  const db = drizzle(sqlite, { 
    schema,
    logger: false, // Disable logging in production
  });
  
  return { db, client: sqlite };
}
```

### Environment Variables

```bash
# .env.production
DATABASE_PATH=/var/data/app/production.db
NODE_ENV=production
DB_BACKUP_ENABLED=true
DB_BACKUP_INTERVAL=3600000  # 1 hour in milliseconds
```

### Health Check Endpoint

```typescript
// src/routes/health.ts
import { getDatabase } from '../lib/db';
import { count } from 'drizzle-orm';
import * as schema from '../lib/db/schema';

export async function GET() {
  try {
    const { db, healthCheck } = getDatabase();
    
    // Check database connectivity
    const isHealthy = await healthCheck();
    if (!isHealthy) {
      return Response.json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Database connection failed',
      }, { status: 503 });
    }
    
    // Check basic query execution
    const userCount = await db.select({ count: count() }).from(schema.users);
    const postCount = await db.select({ count: count() }).from(schema.posts);
    
    return Response.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        userCount: userCount[0].count,
        postCount: postCount[0].count,
      },
    });
  } catch (error) {
    console.error('Health check failed:', error);
    
    return Response.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 503 });
  }
}
```

### Backup Script

```typescript
// src/scripts/backup.ts
import { Database } from 'bun:sqlite';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

async function backupDatabase() {
  try {
    const sourcePath = process.env.DATABASE_PATH || './data/production.db';
    const backupDir = process.env.BACKUP_DIR || './backups';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${backupDir}/backup-${timestamp}.db`;
    
    console.log(`🔄 Starting backup from ${sourcePath} to ${backupPath}`);
    
    // Open source database in read-only mode
    const sourceDb = new Database(sourcePath, { readonly: true });
    
    // Create backup database
    const backupDb = new Database(backupPath);
    
    // Perform backup using SQLite's online backup API
    const backup = sourceDb.backup('main', backupDb, 'main');
    
    let remaining = backup.remaining;
    let total = backup.pagecount;
    
    console.log(`📊 Backup progress: 0/${total} pages`);
    
    while (remaining > 0) {
      backup.step(100); // Copy 100 pages at a time
      remaining = backup.remaining;
      
      const progress = Math.round(((total - remaining) / total) * 100);
      console.log(`📊 Backup progress: ${progress}% (${total - remaining}/${total} pages)`);
    }
    
    backup.finish();
    
    sourceDb.close();
    backupDb.close();
    
    console.log(`✅ Backup completed successfully: ${backupPath}`);
    
    // Cleanup old backups (keep last 10)
    await cleanupOldBackups(backupDir, 10);
    
  } catch (error) {
    console.error('❌ Backup failed:', error);
    throw error;
  }
}

async function cleanupOldBackups(backupDir: string, keepCount: number) {
  const backups = await Array.fromAsync(new Bun.Glob('backup-*.db').scan({
    cwd: backupDir,
    absolute: false,
  }));
  
  if (backups.length <= keepCount) return;
  
  // Sort by filename (which includes timestamp)
  backups.sort();
  
  // Delete oldest backups
  for (let i = 0; i < backups.length - keepCount; i++) {
    await Bun.unlink(`${backupDir}/${backups[i]}`);
    console.log(`🗑️ Deleted old backup: ${backups[i]}`);
  }
}

// Run backup if this file is executed directly
if (import.meta.main) {
  backupDatabase();
}

export { backupDatabase };
```

## Common Pitfalls & Solutions

### Migration Issues

**Problem**: SQLite doesn't support all ALTER TABLE operations

```typescript
// ❌ This will fail in SQLite
await db.run(sql`ALTER TABLE users ADD COLUMN new_column TEXT`);

// ✅ Correct approach for SQLite
await db.run(sql`
  CREATE TABLE users_new (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    new_column TEXT,
    -- other columns...
  );
  
  INSERT INTO users_new SELECT id, name, email, NULL FROM users;
  
  DROP TABLE users;
  ALTER TABLE users_new RENAME TO users;
`);
```

### Date/Time Handling

**Problem**: Date objects not stored correctly

```typescript
// ❌ Incorrect date handling
export const posts = sqliteTable('posts', {
  createdAt: integer('created_at', { mode: 'timestamp' }), // Should be 'timestamp_ms'
});

// ✅ Correct date handling
export const posts = sqliteTable('posts', {
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`strftime('%s', 'now')`)
    .$onUpdateFn(() => sql`strftime('%s', 'now')`),
});
```

### Foreign Key Constraints

**Problem**: Foreign keys not enforced

```typescript
// Don't forget to enable foreign keys in SQLite
sqlite.exec('PRAGMA foreign_keys = ON');

// And ensure foreign key references in schema
export const posts = sqliteTable('posts', {
  userId: integer('user_id').references(() => users.id, { 
    onDelete: 'cascade',
    onUpdate: 'cascade'
  }),
});
```

### Connection Management

**Problem**: Multiple database instances causing locks

```typescript
// ❌ Creating multiple connections
const db1 = drizzle(new Database('app.db'));
const db2 = drizzle(new Database('app.db')); // Problematic

// ✅ Use singleton pattern
let dbInstance: ReturnType<typeof createDatabase> | null = null;

export function getDatabase() {
  if (!dbInstance) {
    dbInstance = createDatabase();
  }
  return dbInstance;
}
```

### JSON Field Handling

**Problem**: JSON fields not typed correctly

```typescript
// ❌ Untyped JSON field
export const users = sqliteTable('users', {
  metadata: blob('metadata', { mode: 'json' }),
});

// ✅ Properly typed JSON field
export const users = sqliteTable('users', {
  metadata: blob('metadata', { mode: 'json' }).$type<{
    theme: string;
    preferences: Record<string, boolean>;
  }>(),
});
```

### Concurrent Access Issues

**Problem**: Database locks in concurrent environments

```typescript
// ✅ Enable WAL mode for better concurrency
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA synchronous = NORMAL');

// Use transactions for atomic operations
const result = await db.transaction(async (tx) => {
  const user = await tx.insert(schema.users).values(userData).returning();
  await tx.insert(schema.posts).values({ ...postData, userId: user[0].id });
  return user;
});
```

## Complete Example Implementation

### Database Module Index

```typescript
// src/lib/db/index.ts
export { db, getDatabase } from './adapter';
export * from './schema';
export { runMigrations } from '../scripts/migrate';
export { seedDatabase } from '../scripts/seed';
```

### API Route Example

```typescript
// src/routes/api/posts.ts
import { db } from '../lib/db';
import * as schema from '../lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { Elysia } from 'elysia';

const postsRoute = new Elysia({ prefix: '/posts' })
  .get('/', async ({ query }) => {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '10');
    const offset = (page - 1) * limit;
    
    const posts = await db.query.posts.findMany({
      where: eq(schema.posts.published, true),
      with: {
        author: {
          columns: {
            id: true,
            name: true,
          },
        },
        tags: {
          with: {
            tag: true,
          },
        },
      },
      orderBy: [desc(schema.posts.createdAt)],
      limit,
      offset,
    });
    
    // Get total count for pagination
    const totalResult = await db.select({
      count: require('drizzle-orm').count(schema.posts.id),
    }).from(schema.posts).where(eq(schema.posts.published, true));
    
    return {
      data: posts,
      pagination: {
        page,
        limit,
        total: totalResult[0].count,
        pages: Math.ceil(totalResult[0].count / limit),
      },
    };
  })
  .post('/', async ({ body, set }) => {
    try {
      const { title, content, userId } = body;
      
      const result = await db.transaction(async (tx) => {
        const post = await tx.insert(schema.posts).values({
          title,
          content,
          userId,
          published: false, // Posts start as drafts
        }).returning();
        
        return post[0];
      });
      
      set.status = 201;
      return { success: true, data: result };
    } catch (error) {
      set.status = 500;
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  });

export { postsRoute };
```

### Database Health Monitoring

```typescript
// src/lib/db/monitor.ts
import { getDatabase } from './adapter';
import { count, max, min, avg } from 'drizzle-orm';
import * as schema from './schema';

interface DatabaseHealth {
  connected: boolean;
  size: number;
  tables: {
    users: number;
    posts: number;
  };
  performance: {
    lastUserCreated: Date | null;
    lastPostCreated: Date | null;
    avgPostsPerUser: number;
  };
}

export async function getDatabaseHealth(): Promise<DatabaseHealth> {
  try {
    const { db, healthCheck } = getDatabase();
    
    // Check connection
    const connected = await healthCheck();
    if (!connected) {
      throw new Error('Database connection failed');
    }
    
    // Get table counts
    const [userCount, postCount] = await Promise.all([
      db.select({ count: count() }).from(schema.users),
      db.select({ count: count() }).from(schema.posts),
    ]);
    
    // Get performance metrics
    const [lastUser, lastPost, avgPosts] = await Promise.all([
      db.select({
        createdAt: max(schema.users.createdAt),
      }).from(schema.users),
      db.select({
        createdAt: max(schema.posts.createdAt),
      }).from(schema.posts),
      db.select({
        avg: avg(schema.posts.id),
      }).from(schema.posts),
    ]);
    
    // Get database file size (approximate)
    const stats = await Bun.file('./data/production.db').stats();
    const size = stats.size;
    
    return {
      connected: true,
      size,
      tables: {
        users: userCount[0].count,
        posts: postCount[0].count,
      },
      performance: {
        lastUserCreated: lastUser[0].createdAt ? new Date(lastUser[0].createdAt) : null,
        lastPostCreated: lastPost[0].createdAt ? new Date(lastPost[0].createdAt) : null,
        avgPostsPerUser: avgPosts[0].avg || 0,
      },
    };
  } catch (error) {
    console.error('Health check failed:', error);
    
    return {
      connected: false,
      size: 0,
      tables: {
        users: 0,
        posts: 0,
      },
      performance: {
        lastUserCreated: null,
        lastPostCreated: null,
        avgPostsPerUser: 0,
      },
    };
  }
}
```

This comprehensive guide covers all aspects of integrating Drizzle ORM with Bun's native SQLite driver, from basic setup to production deployment strategies. The combination provides a powerful, type-safe database solution optimized for Bun's performance characteristics.