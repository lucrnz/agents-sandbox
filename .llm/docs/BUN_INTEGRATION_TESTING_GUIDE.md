# Bun Integration Testing Guide

A comprehensive guide to integration testing in Bun full-stack TypeScript applications—covering WebSocket testing, database integration with Drizzle ORM, mocking strategies, CI/CD configuration, and advanced patterns.

## Table of Contents

- [Overview](#overview)
- [Key Recommendations](#key-recommendations)
- [Test Environment Setup](#test-environment-setup)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Server Testing](#server-testing)
- [WebSocket Testing](#websocket-testing)
- [Database Testing with Drizzle ORM](#database-testing-with-drizzle-orm)
- [Mocking Strategies](#mocking-strategies)
- [Testing Async Generators and Streaming](#testing-async-generators-and-streaming)
- [Test Isolation and Concurrency](#test-isolation-and-concurrency)
- [Fixtures and Test Data](#fixtures-and-test-data)
- [CI/CD Integration](#cicd-integration)
- [Common Patterns and Recipes](#common-patterns-and-recipes)
- [Troubleshooting](#troubleshooting)
- [Performance Tips](#performance-tips)
- [References](#references)

---

## Overview

Integration testing verifies that multiple components work together correctly. In a Bun full-stack setup with `Bun.serve`, WebSocket-based command systems, React frontend serving, and Drizzle ORM with `bun:sqlite`, integration tests should validate:

- **Client-server command exchange** via WebSocket
- **Persistence and retrieval** of data (conversations, messages)
- **Broadcast/subscribe behavior** for real-time features
- **Error handling and validation** across layers
- **AI response streaming** through async generators

### Why Bun's Test Runner for Integration Tests?

| Feature | Bun Test Runner | Jest | Vitest |
|---------|-----------------|------|--------|
| Startup time | ~10ms | ~500ms+ | ~200ms |
| TypeScript support | Native | Requires config | Native |
| ES modules | Native | Requires experimental flags | Native |
| WebSocket client | Built-in global | Requires polyfill | Requires polyfill |
| SQLite integration | Native `bun:sqlite` | External package | External package |
| Jest API compatibility | ✅ High | N/A | ✅ High |

---

## Key Recommendations

1. **Use `bun:sqlite` in-memory databases** (`:memory:`) for fast, isolated database tests
2. **Start test servers on port 0** to get random available ports
3. **Clean up resources** in `afterAll` or `afterEach` hooks to prevent leaks
4. **Use `spyOn` for method mocking** and always restore mocks in cleanup
5. **Avoid parallel database tests** unless using separate in-memory instances
6. **Mock external services** (AI APIs, external HTTP) to ensure deterministic tests
7. **Use preload scripts** for global test configuration

---

## Test Environment Setup

### Directory Structure

```
project-root/
├── src/
│   ├── backend/
│   │   ├── command-handlers.test.ts     # Integration tests alongside source
│   │   └── db/
│   │       └── queries.test.ts
│   ├── frontend/
│   │   └── components/
│   │       └── button.test.tsx
│   └── shared/
│       └── command-system.test.ts
├── test/                                 # Optional dedicated test directory
│   ├── integration/
│   │   ├── websocket-commands.test.ts
│   │   ├── database-flow.test.ts
│   │   └── full-conversation.test.ts
│   ├── fixtures/
│   │   └── test-data.ts
│   └── utils/
│       ├── test-server.ts
│       └── test-db.ts
├── bunfig.toml
└── package.json
```

### Package.json Scripts

```json
{
  "scripts": {
    "test": "bun test",
    "test:unit": "bun test src/",
    "test:integration": "bun test test/integration/",
    "test:watch": "bun test --watch",
    "test:coverage": "bun test --coverage",
    "test:ci": "bun test --bail --timeout 30000"
  }
}
```

---

## Configuration

### bunfig.toml

```toml
[test]
# Preload scripts run before each test file
preload = ["./test/setup.ts"]

# Test file patterns (default shown)
# root = "./"

# Coverage configuration
coverage = false
coverageDir = "coverage"
coverageReporters = ["text", "lcov"]

# Timeout in milliseconds
timeout = 5000

# Bail on first failure in CI
# bail = true
```

### Preload Script (test/setup.ts)

```typescript
// test/setup.ts - Runs before all tests
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Register happy-dom for React component testing
GlobalRegistrator.register();

// Set test environment variables
process.env.NODE_ENV = "test";
process.env.DB_FILE_NAME = ":memory:";

// Optionally suppress console output during tests
// console.log = () => {};

// Global test timeout (alternative to bunfig.toml)
// import { setDefaultTimeout } from "bun:test";
// setDefaultTimeout(10000);
```

### Environment Variables for Testing

Create `.env.test` for test-specific configuration:

```bash
NODE_ENV=test
DB_FILE_NAME=:memory:
XAI_API_KEY=test-key
MISTRAL_API_KEY=test-key
DEBUG=false
```

Load in preload script:

```typescript
// test/setup.ts
import { config } from "bun";

// Bun auto-loads .env, but you can specify test env
Bun.env.NODE_ENV = "test";
```

---

## Server Testing

### Creating a Test Server

```typescript
// test/utils/test-server.ts
import { serve, type Server } from "bun";
import index from "@/frontend/index.html";

export interface TestServerOptions {
  db?: any; // Inject test database
}

export interface TestServerInstance {
  server: Server;
  port: number;
  url: string;
  wsUrl: string;
  stop: () => void;
}

export async function createTestServer(
  options?: TestServerOptions
): Promise<TestServerInstance> {
  const server = serve<{ conversationId?: string }>({
    port: 0, // Random available port
    
    routes: {
      "/chat-ws": {
        GET(req, server) {
          const upgraded = server.upgrade(req, {
            data: { conversationId: undefined },
          });
          if (!upgraded) {
            return new Response("WebSocket upgrade failed", { status: 400 });
          }
          return undefined;
        },
      },
      "/*": index,
    },
    
    websocket: {
      open(ws) {
        ws.subscribe("chat");
        ws.send(JSON.stringify({ type: "system", message: "Connected" }));
      },
      message(ws, message) {
        // Handle messages or inject test behavior
        const data = JSON.parse(message.toString());
        // Process with injected test DB if provided
      },
      close(ws) {
        ws.unsubscribe("chat");
      },
    },
    
    development: false, // Disable HMR in tests
  });

  const port = server.port;
  
  return {
    server,
    port,
    url: `http://localhost:${port}`,
    wsUrl: `ws://localhost:${port}/chat-ws`,
    stop: () => server.stop(true), // Force close all connections
  };
}
```

### Using the Test Server

```typescript
import { beforeAll, afterAll, test, expect } from "bun:test";
import { createTestServer, type TestServerInstance } from "../utils/test-server";

describe("Server Integration", () => {
  let testServer: TestServerInstance;

  beforeAll(async () => {
    testServer = await createTestServer();
  });

  afterAll(() => {
    testServer.stop();
  });

  test("server responds to HTTP requests", async () => {
    const response = await fetch(testServer.url);
    expect(response.status).toBe(200);
  });

  test("server accepts WebSocket connections", async () => {
    const ws = new WebSocket(testServer.wsUrl);
    
    const connected = await new Promise<boolean>((resolve) => {
      ws.onopen = () => resolve(true);
      ws.onerror = () => resolve(false);
    });
    
    expect(connected).toBe(true);
    ws.close();
  });
});
```

---

## WebSocket Testing

### Basic Connection Testing

```typescript
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { createTestServer, type TestServerInstance } from "../utils/test-server";

describe("WebSocket", () => {
  let testServer: TestServerInstance;

  beforeAll(async () => {
    testServer = await createTestServer();
  });

  afterAll(() => {
    testServer.stop();
  });

  test("receives welcome message on connection", async () => {
    const ws = new WebSocket(testServer.wsUrl);

    const message = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout")), 5000);
      
      ws.addEventListener("message", (event) => {
        clearTimeout(timeout);
        resolve(JSON.parse(event.data as string));
      });
      
      ws.addEventListener("error", (event) => {
        clearTimeout(timeout);
        reject(event);
      });
    });

    expect(message.type).toBe("system");
    expect(message.message).toBe("Connected");
    
    ws.close();
  });
});
```

### WebSocket Helper Utilities

```typescript
// test/utils/websocket-helpers.ts

export function waitForOpen(ws: WebSocket, timeout = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    
    const timer = setTimeout(
      () => reject(new Error("WebSocket open timeout")),
      timeout
    );
    
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
    
    ws.addEventListener("error", (e) => {
      clearTimeout(timer);
      reject(e);
    }, { once: true });
  });
}

export function waitForMessage<T = any>(
  ws: WebSocket,
  filter?: (data: T) => boolean,
  timeout = 5000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("WebSocket message timeout")),
      timeout
    );
    
    const handler = (event: MessageEvent) => {
      const data = JSON.parse(event.data as string) as T;
      
      if (!filter || filter(data)) {
        ws.removeEventListener("message", handler);
        clearTimeout(timer);
        resolve(data);
      }
    };
    
    ws.addEventListener("message", handler);
  });
}

export function collectMessages<T = any>(
  ws: WebSocket,
  count: number,
  timeout = 5000
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const messages: T[] = [];
    const timer = setTimeout(
      () => reject(new Error(`Only received ${messages.length}/${count} messages`)),
      timeout
    );
    
    const handler = (event: MessageEvent) => {
      messages.push(JSON.parse(event.data as string));
      
      if (messages.length === count) {
        ws.removeEventListener("message", handler);
        clearTimeout(timer);
        resolve(messages);
      }
    };
    
    ws.addEventListener("message", handler);
  });
}
```

### Testing WebSocket Command/Response Flow

```typescript
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { waitForOpen, waitForMessage } from "../utils/websocket-helpers";

describe("WebSocket Commands", () => {
  let testServer: TestServerInstance;

  beforeAll(async () => {
    testServer = await createTestServer();
  });

  afterAll(() => {
    testServer.stop();
  });

  test("send_message command returns response", async () => {
    const ws = new WebSocket(testServer.wsUrl);
    await waitForOpen(ws);
    
    // Skip the initial welcome message
    await waitForMessage(ws, (msg) => msg.type === "system");
    
    // Send a command
    const commandId = crypto.randomUUID();
    ws.send(JSON.stringify({
      id: commandId,
      command: "send_message",
      payload: {
        content: "Hello, world!",
        conversationId: "test-conv-id",
      },
    }));
    
    // Wait for the response with matching ID
    const response = await waitForMessage(ws, (msg) => msg.id === commandId);
    
    expect(response.success).toBe(true);
    expect(response.data.conversationId).toBe("test-conv-id");
    
    ws.close();
  });

  test("multiple clients receive broadcasts", async () => {
    const client1 = new WebSocket(testServer.wsUrl);
    const client2 = new WebSocket(testServer.wsUrl);
    
    await Promise.all([
      waitForOpen(client1),
      waitForOpen(client2),
    ]);
    
    // Skip welcome messages
    await Promise.all([
      waitForMessage(client1, (m) => m.type === "system"),
      waitForMessage(client2, (m) => m.type === "system"),
    ]);
    
    // Client 1 sends a message
    client1.send(JSON.stringify({
      type: "chat",
      user: "client1",
      content: "Hello everyone!",
    }));
    
    // Client 2 should receive the broadcast
    const broadcast = await waitForMessage(client2, (m) => m.type === "message");
    
    expect(broadcast.user).toBe("client1");
    expect(broadcast.content).toBe("Hello everyone!");
    
    client1.close();
    client2.close();
  });
});
```

---

## Database Testing with Drizzle ORM

### In-Memory Database Setup

```typescript
// test/utils/test-db.ts
import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "@/backend/db/schema";

export interface TestDatabase {
  db: BunSQLiteDatabase<typeof schema>;
  sqlite: Database;
  close: () => void;
  reset: () => void;
}

export function createTestDb(): TestDatabase {
  const sqlite = new Database(":memory:");
  
  // Enable foreign keys and WAL mode for better performance
  sqlite.exec("PRAGMA foreign_keys = ON;");
  sqlite.exec("PRAGMA journal_mode = WAL;");
  
  const db = drizzle(sqlite, { schema });
  
  // Run migrations or create schema directly
  // Option 1: Use migrations
  // migrate(db, { migrationsFolder: "./drizzle" });
  
  // Option 2: Create schema directly for faster tests
  createSchema(sqlite);
  
  return {
    db,
    sqlite,
    close: () => sqlite.close(),
    reset: () => {
      sqlite.exec("DELETE FROM messages");
      sqlite.exec("DELETE FROM conversations");
    },
  };
}

function createSchema(sqlite: Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation 
    ON messages(conversation_id)
  `);
}
```

### Module Mocking for Database

```typescript
import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as queries from "@/backend/db/queries";

// Create in-memory test database
const sqlite = new Database(":memory:");
const testDb = drizzle(sqlite);

// Mock the db module to use test database
mock.module("@/backend/db/db", () => ({
  db: testDb,
}));

describe("Database Queries", () => {
  beforeEach(() => {
    // Setup schema fresh for each test
    sqlite.run("DROP TABLE IF EXISTS messages");
    sqlite.run("DROP TABLE IF EXISTS conversations");
    sqlite.run(`
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    sqlite.run(`
      CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
  });

  test("should create and retrieve a conversation", async () => {
    const conv = await queries.createConversation("Test Title");
    
    expect(conv.id).toBeDefined();
    expect(conv.title).toBe("Test Title");
    
    const found = await queries.getConversation(conv.id);
    expect(found).toEqual(conv);
  });

  test("cascade delete removes messages", async () => {
    const conv = await queries.createConversation("Chat");
    await queries.addMessage(conv.id, "user", "Hello");
    await queries.addMessage(conv.id, "assistant", "Hi!");
    
    await queries.deleteConversation(conv.id);
    
    const messages = await queries.getMessages(conv.id);
    expect(messages).toHaveLength(0);
  });
});
```

---

## Mocking Strategies

### Using `spyOn` for Method Mocking

```typescript
import { test, expect, describe, beforeEach, afterEach, spyOn, mock, type Mock } from "bun:test";
import * as db from "@/backend/db";
import { commandHandlers } from "@/backend/command-handlers";
import type { ServerWebSocket } from "bun";

describe("Command Handlers", () => {
  let ws: ServerWebSocket<{ conversationId?: string }>;
  let spies: Mock<any>[] = [];

  beforeEach(() => {
    // Create mock WebSocket
    ws = {
      send: mock((_data: string | Uint8Array) => {}),
      data: {},
    } as unknown as ServerWebSocket<{ conversationId?: string }>;

    // Setup spies on db functions
    spies.push(
      spyOn(db, "getOrCreateConversation").mockImplementation(async () => ({
        id: "conv-id",
        title: "Test Chat",
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    );

    spies.push(
      spyOn(db, "addMessage").mockImplementation(async (conversationId, role, content) => ({
        id: 1,
        conversationId,
        role,
        content,
        createdAt: new Date(),
      })),
    );
  });

  afterEach(() => {
    // Always restore spies to prevent test pollution
    for (const spy of spies) {
      spy.mockRestore();
    }
    spies = [];
  });

  test("handles send_message command", async () => {
    const result = await commandHandlers.execute(
      "send_message",
      { content: "Hello", conversationId: "conv-id" },
      { ws }
    );

    expect(result.conversationId).toBe("conv-id");
    expect(db.addMessage).toHaveBeenCalledWith("conv-id", "user", "Hello");
  });
});
```

### Module-Level Mocking

```typescript
import { mock } from "bun:test";

// Mock an entire module
mock.module("@/backend/agent/chat-agent", () => ({
  ChatAgent: class MockChatAgent {
    async *generateResponse(content: string) {
      yield "Mock ";
      yield "response";
    }
  },
}));

// Mock external APIs
mock.module("@ai-sdk/xai", () => ({
  xai: () => ({
    chat: async () => ({ text: "Mocked AI response" }),
  }),
}));
```

### Mocking Prototype Methods

```typescript
import { spyOn, mock, type Mock } from "bun:test";
import { ChatAgent } from "@/backend/agent/chat-agent";

// Mock a prototype method (useful for classes)
const generateResponseSpy = spyOn(
  ChatAgent.prototype,
  "generateResponse"
).mockImplementation(async function* (_content: string) {
  yield "Hello ";
  yield "world!";
});

// Verify calls
expect(generateResponseSpy).toHaveBeenCalledWith("user input");

// Access mock calls
const calls = generateResponseSpy.mock.calls;
expect(calls[0][0]).toBe("user input");
```

### Mocking `fetch`

```typescript
import { mock, spyOn } from "bun:test";

// Option 1: spyOn global fetch
const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(async (url) => {
  if (url.toString().includes("/api/search")) {
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  throw new Error(`Unmocked URL: ${url}`);
});

// Option 2: Use bun-bagel for more sophisticated fetch mocking
// import { mock as mockFetch } from "bun-bagel";
// mockFetch("https://api.example.com/*", { data: { results: [] } });
```

---

## Testing Async Generators and Streaming

### Mocking Async Generator Functions

```typescript
import { test, expect, describe, beforeEach, afterEach, spyOn, type Mock } from "bun:test";
import { ChatOrchestrator } from "@/backend/services/chat-orchestrator";
import { ChatAgent } from "@/backend/agent/chat-agent";
import type { ServerWebSocket } from "bun";

describe("AI Response Streaming", () => {
  let ws: ServerWebSocket<{ conversationId?: string }>;
  let spies: Mock<any>[] = [];

  beforeEach(() => {
    ws = {
      send: mock((_data: string | Uint8Array) => {}),
      data: { conversationId: "conv-id" },
    } as unknown as ServerWebSocket<{ conversationId?: string }>;

    // Mock the async generator method
    spies.push(
      spyOn(ChatAgent.prototype, "generateResponse").mockImplementation(
        async function* (_content: string) {
          yield "Hello ";
          yield "world";
          yield "!";
        }
      ),
    );
  });

  afterEach(() => {
    for (const spy of spies) {
      spy.mockRestore();
    }
    spies = [];
  });

  test("streams AI response chunks to client", async () => {
    const orchestrator = new ChatOrchestrator({ ws, conversationId: "conv-id" });
    
    // Process might be async, wait for completion
    await orchestrator.processUserMessage("Hello agent");
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify chunks were sent
    const sendMock = ws.send as Mock<typeof ws.send>;
    const sentEvents = sendMock.mock.calls
      .map((c) => JSON.parse(c[0] as string))
      .filter((e) => e.event === "ai_response_chunk");

    expect(sentEvents.length).toBeGreaterThanOrEqual(3);
    expect(sentEvents.map((e) => e.payload.delta)).toContain("Hello ");
  });
});
```

### Testing Streaming Consumption

```typescript
// Helper to consume an async generator
async function consumeGenerator<T>(generator: AsyncGenerator<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const value of generator) {
    results.push(value);
  }
  return results;
}

test("async generator yields expected chunks", async () => {
  const agent = new ChatAgent({ conversationId: "test" });
  
  // Mock external dependencies
  // ...
  
  const chunks = await consumeGenerator(agent.generateResponse("Hello"));
  
  expect(chunks).toEqual(["Hello ", "world", "!"]);
});
```

---

## Test Isolation and Concurrency

### Understanding Bun Test Execution

- **Within a file**: Tests run **sequentially** by default
- **Across files**: Files may run in **parallel**
- **Use `test.serial()`** to force sequential execution when needed

### Ensuring Test Isolation

```typescript
import { test, expect, describe, beforeEach, afterEach } from "bun:test";

describe("Isolated Database Tests", () => {
  let testDb: TestDatabase;

  // Create fresh database for each test
  beforeEach(() => {
    testDb = createTestDb();
  });

  // Clean up after each test
  afterEach(() => {
    testDb.close();
  });

  test("test 1 - isolated state", async () => {
    await insertTestData(testDb.db);
    const count = await getCount(testDb.db);
    expect(count).toBe(1);
  });

  test("test 2 - also isolated", async () => {
    // Database is fresh, no data from test 1
    const count = await getCount(testDb.db);
    expect(count).toBe(0);
  });
});
```

### Avoiding Port Conflicts

```typescript
// Always use port 0 for random available port
const server = serve({
  port: 0, // Bun assigns random available port
  // ...
});

// Access assigned port
console.log(`Server running on port ${server.port}`);
```

### Serial Tests for Shared Resources

```typescript
import { test } from "bun:test";

// Force sequential execution
test.serial("first test with shared state", async () => {
  // ...
});

test.serial("second test depends on first", async () => {
  // ...
});
```

---

## Fixtures and Test Data

### Creating Test Data Factories

```typescript
// test/fixtures/factories.ts

export function createConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: crypto.randomUUID(),
    title: "Test Conversation",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMessage(
  conversationId: string,
  overrides: Partial<Message> = {}
): Message {
  return {
    id: Math.floor(Math.random() * 10000),
    conversationId,
    role: "user",
    content: "Test message",
    createdAt: new Date(),
    ...overrides,
  };
}

// Specialized factories for common scenarios
export function createConversationWithMessages(
  messageCount = 3
): { conversation: Conversation; messages: Message[] } {
  const conversation = createConversation();
  const messages = Array.from({ length: messageCount }, (_, i) =>
    createMessage(conversation.id, {
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i + 1}`,
    })
  );
  return { conversation, messages };
}
```

### Database Seeding

```typescript
// test/fixtures/seed.ts
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "@/backend/db/schema";

export async function seedConversations(
  db: BunSQLiteDatabase<typeof schema>,
  count = 5
): Promise<void> {
  for (let i = 0; i < count; i++) {
    const convId = crypto.randomUUID();
    
    await db.insert(schema.conversationsTable).values({
      id: convId,
      title: `Conversation ${i + 1}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    await db.insert(schema.messagesTable).values([
      {
        conversationId: convId,
        role: "user",
        content: `User message in conversation ${i + 1}`,
        createdAt: new Date(),
      },
      {
        conversationId: convId,
        role: "assistant",
        content: `Assistant response in conversation ${i + 1}`,
        createdAt: new Date(),
      },
    ]);
  }
}
```

### Using Fixtures in Tests

```typescript
import { test, expect, describe, beforeEach } from "bun:test";
import { createTestDb, type TestDatabase } from "../utils/test-db";
import { seedConversations } from "../fixtures/seed";
import { createConversation, createMessage } from "../fixtures/factories";

describe("Conversation Queries", () => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = createTestDb();
    await seedConversations(testDb.db, 3);
  });

  test("retrieves seeded conversations", async () => {
    const conversations = await getAllConversations(testDb.db);
    expect(conversations).toHaveLength(3);
  });

  test("uses factory for specific test case", async () => {
    const conv = createConversation({ title: "Special Title" });
    await insertConversation(testDb.db, conv);
    
    const found = await getConversation(testDb.db, conv.id);
    expect(found?.title).toBe("Special Title");
  });
});
```

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      
      - name: Install dependencies
        run: bun install --frozen-lockfile
      
      - name: Run type check
        run: bun run typecheck
      
      - name: Run tests
        run: bun test --bail --timeout 30000
        env:
          NODE_ENV: test
          XAI_API_KEY: ${{ secrets.XAI_API_KEY }}
      
      - name: Upload coverage
        if: success()
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info
```

### Pre-commit Hooks (lefthook)

```yaml
# lefthook.yml
pre-commit:
  parallel: true
  commands:
    typecheck:
      run: bun run typecheck
    
    test:
      run: bun test --bail
      
    format:
      run: bun run format --check
```

### Test Environment Checks

```typescript
// test/setup.ts
if (process.env.CI) {
  // CI-specific configuration
  console.log("Running in CI environment");
  
  // Increase timeouts for slower CI runners
  // setDefaultTimeout(60000);
}

// Ensure required environment variables
const requiredEnvVars = ["NODE_ENV"];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.warn(`Warning: ${envVar} not set`);
  }
}
```

---

## Common Patterns and Recipes

### Testing Error Handling

```typescript
test("handles invalid JSON gracefully", async () => {
  const ws = new WebSocket(testServer.wsUrl);
  await waitForOpen(ws);
  
  // Send invalid JSON
  ws.send("not valid json");
  
  const errorResponse = await waitForMessage(ws, (m) => m.type === "error");
  
  expect(errorResponse.type).toBe("error");
  expect(errorResponse.message).toContain("Invalid");
  
  ws.close();
});

test("returns error for unknown command", async () => {
  const ws = new WebSocket(testServer.wsUrl);
  await waitForOpen(ws);
  
  ws.send(JSON.stringify({
    id: "test-id",
    command: "unknown_command",
    payload: {},
  }));
  
  const response = await waitForMessage(ws, (m) => m.id === "test-id");
  
  expect(response.success).toBe(false);
  expect(response.error).toBeDefined();
  
  ws.close();
});
```

### Testing Timeouts and Delays

```typescript
import { setSystemTime } from "bun:test";

test("handles timeout correctly", async () => {
  // Set a fake system time
  const fakeNow = new Date("2024-01-01T12:00:00Z");
  setSystemTime(fakeNow);
  
  // Run test logic that depends on Date.now() or new Date()
  
  // Reset to real time
  setSystemTime();
});

test("waits for delayed response", async () => {
  const ws = new WebSocket(testServer.wsUrl);
  await waitForOpen(ws);
  
  // Send command that triggers delayed background work
  ws.send(JSON.stringify({
    command: "long_running_task",
    payload: {},
  }));
  
  // Wait with sufficient timeout
  const response = await waitForMessage(
    ws,
    (m) => m.type === "task_complete",
    10000 // 10 second timeout
  );
  
  expect(response.status).toBe("completed");
  
  ws.close();
}, 15000); // Test timeout
```

### Testing Background Tasks

```typescript
test("background title generation completes", async () => {
  const orchestrator = new ChatOrchestrator({ ws, conversationId: "conv-id" });
  
  // Trigger processing that spawns background task
  await orchestrator.processUserMessage("Hello");
  
  // Wait for background task to complete
  // Option 1: Simple delay
  await new Promise((resolve) => setTimeout(resolve, 100));
  
  // Option 2: Poll for completion
  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    const conversation = await db.getConversation("conv-id");
    if (conversation?.title !== "New chat") {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  
  // Verify background task effect
  const updated = await db.getConversation("conv-id");
  expect(updated?.title).not.toBe("New chat");
});
```

### Full Integration Test Example

```typescript
describe("Full Conversation Flow", () => {
  let testServer: TestServerInstance;
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = createTestDb();
    testServer = await createTestServer({ db: testDb.db });
  });

  afterAll(() => {
    testServer.stop();
    testDb.close();
  });

  beforeEach(() => {
    testDb.reset();
  });

  test("complete conversation lifecycle", async () => {
    const ws = new WebSocket(testServer.wsUrl);
    await waitForOpen(ws);
    await waitForMessage(ws, (m) => m.type === "system"); // Skip welcome
    
    // 1. Create conversation
    const createId = crypto.randomUUID();
    ws.send(JSON.stringify({
      id: createId,
      command: "load_conversation",
      payload: {},
    }));
    
    const createResponse = await waitForMessage(ws, (m) => m.id === createId);
    expect(createResponse.success).toBe(true);
    const conversationId = createResponse.data.conversationId;
    
    // 2. Send message
    const sendId = crypto.randomUUID();
    ws.send(JSON.stringify({
      id: sendId,
      command: "send_message",
      payload: { conversationId, content: "Hello!" },
    }));
    
    const sendResponse = await waitForMessage(ws, (m) => m.id === sendId);
    expect(sendResponse.success).toBe(true);
    
    // 3. Wait for AI response chunks
    const chunks = await collectMessages(ws, 3, 5000);
    const chunkEvents = chunks.filter((c) => c.event === "ai_response_chunk");
    expect(chunkEvents.length).toBeGreaterThan(0);
    
    // 4. Verify persistence
    const saved = await testDb.db.query.messagesTable.findMany({
      where: (m, { eq }) => eq(m.conversationId, conversationId),
    });
    expect(saved.length).toBe(2); // user + assistant
    expect(saved[0].role).toBe("user");
    expect(saved[1].role).toBe("assistant");
    
    ws.close();
  });
});
```

---

## Troubleshooting

### Common Issues

#### Tests Hang on WebSocket Connection

```typescript
// Always add timeouts to WebSocket operations
const timeout = (ms: number) => new Promise((_, reject) =>
  setTimeout(() => reject(new Error("Timeout")), ms)
);

await Promise.race([
  waitForMessage(ws),
  timeout(5000),
]);
```

#### Database Lock Errors

```typescript
// Use separate in-memory databases per test file
// Don't share database instances across parallel test files

// In each test file:
const sqlite = new Database(":memory:"); // Fresh instance per file
```

#### Mocks Not Being Restored

```typescript
// Always use afterEach to restore mocks
afterEach(() => {
  for (const spy of spies) {
    spy.mockRestore();
  }
  spies = [];
});
```

#### Port Already in Use

```typescript
// Always use port 0 for tests
const server = serve({ port: 0, ... });
```

### Debugging Tips

```typescript
// Enable verbose logging in tests
if (process.env.DEBUG_TESTS) {
  process.env.DEBUG = "true";
}

// Log all WebSocket messages for debugging
ws.addEventListener("message", (event) => {
  console.log("[WS]", JSON.parse(event.data as string));
});

// Use test.only() to run single test
test.only("debug this test", async () => {
  // ...
});

// Skip flaky tests temporarily
test.skip("flaky test", async () => {
  // ...
});
```

---

## Performance Tips

1. **Use in-memory databases** - `:memory:` is significantly faster than file-based SQLite
2. **Minimize setup in beforeEach** - Move expensive setup to beforeAll when test isolation allows
3. **Run tests in parallel** - Let Bun parallelize across files for faster CI runs
4. **Mock external APIs** - Avoid network calls in tests
5. **Use focused tests** - `bun test --test-name-pattern "specific pattern"` during development
6. **Profile slow tests** - Use `bun test --timeout 1000` to find slow tests

### Performance Configuration

```toml
# bunfig.toml
[test]
# Limit concurrent test files if hitting resource limits
# smol = true

# Disable coverage for faster runs during development
coverage = false
```

---

## References

### Official Documentation

- [Bun Test Runner](https://bun.com/docs/test)
- [Bun WebSockets](https://bun.com/docs/runtime/http/websockets)
- [Bun SQLite](https://bun.com/docs/api/sqlite)
- [Bun Mocking](https://bun.com/docs/test/mocking)
- [Drizzle ORM with Bun SQLite](https://orm.drizzle.team/docs/connect-bun-sqlite)

### Additional Resources

- [Bun HTTP Server](https://bun.com/docs/runtime/http/server)
- [Bun SpyOn](https://bun.com/docs/test/spies)
- [Bun Module Mocking](https://bun.com/docs/test/mocking#module-mocking)

### Community Examples

- [Bun GitHub Discussions on Test Concurrency](https://github.com/oven-sh/bun/discussions/4831)
- [Testing Next.js with Bun](https://antler.digital/blog/how-to-test-your-nextjs-14-applications-with-bun)
