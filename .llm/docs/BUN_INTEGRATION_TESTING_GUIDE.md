**Key Recommendations**

- Bun's built-in test runner is the optimal choice for integration testing in TypeScript projects—it offers native support, Jest-like syntax, lifecycle hooks, and excellent performance without external dependencies.
- For full-stack Bun applications (like yours with `Bun.serve`, WebSocket commands, and Drizzle ORM on `bun:sqlite`), focus integration tests on server-side interactions: WebSocket command flows, database persistence, and end-to-end message processing.
- Use in-memory SQLite (`:memory:`) for fast, isolated database tests; combine with lifecycle hooks to set up and tear down resources.
- Start a test-specific server instance on a random port in `beforeAll` and stop it in `afterAll` to enable realistic HTTP/WebSocket testing.
- Evidence from developer discussions and documentation shows Bun tests run sequentially within a file by default, but files can run in parallel—use `test.serial()` or in-memory resources to avoid race conditions in database-dependent tests.

**Overview**

Integration testing verifies that multiple components (e.g., WebSocket handlers, command processing, database queries, and broadcast logic) work together correctly. In your Bun full-stack setup—where the server handles both static React serving and real-time WebSocket communication—integration tests should validate:

- Client-server command exchange via WebSocket
- Persistence and retrieval of data (conversations/messages)
- Broadcast/subscribe behavior
- Error handling and validation

Bun's test runner excels here due to its speed, TypeScript support, and ability to run async code natively.

**Setting Up the Test Environment**

Create a dedicated integration test directory and utility helpers.

Recommended structure:

```
test/
├── integration/
│   ├── websocket-commands.test.ts
│   ├── database-flow.test.ts
│   └── full-conversation.test.ts
├── utils/
│   ├── test-server.ts     # Starts/stops server
│   └── test-db.ts         # Creates in-memory DB and runs migrations
└── setup.ts               # Optional global preload (e.g., env vars)
```

Add to `package.json`:

```json
"scripts": {
  "test:integration": "bun test test/integration",
  "test": "bun test"  // Runs all tests
}
```

**Testing the Server and WebSocket**

Start a real server instance in tests to mirror production behavior.

Example `test/utils/test-server.ts`:

```typescript
import { serve } from "bun";
import index from "@/frontend/index.html";  // Adjust import as needed
// Import your actual server config or replicate it

export async function createTestServer() {
  const server = serve({
    port: 0,  // Random available port
    routes: {
      "/chat-ws": { /* your WS upgrade logic */ },
      "/*": index,
    },
    websocket: { /* your WS handlers */ },
    // Disable dev features
    development: false,
  });

  const port = server.port;
  const url = `http://localhost:${port}`;
  const wsUrl = `ws://localhost:${port}/chat-ws`;

  return { server, port, url, wsUrl };
}
```

In a test file:

```typescript
import { beforeAll, afterAll, test, expect } from "bun:test";
import { createTestServer } from "../utils/test-server";

let server: any;
let wsUrl: string;

beforeAll(async () => {
  const testServer = await createTestServer();
  server = testServer.server;
  wsUrl = testServer.wsUrl;
});

afterAll(() => {
  server.stop(true);  // Force close connections
});

test("WebSocket connection and basic message", async () => {
  const ws = new WebSocket(wsUrl);

  await new Promise(resolve => ws.addEventListener("open", resolve));

  const received = new Promise(resolve => {
    ws.addEventListener("message", (event) => {
      resolve(JSON.parse(event.data as string));
    });
  });

  ws.send(JSON.stringify({ type: "chat", user: "test", content: "hello" }));

  const msg = await received;
  expect(msg.type).toBe("message");
  expect(msg.content).toBe("hello");

  ws.close();
});
```

**Testing Database Integration**

Use in-memory SQLite for isolation.

Example `test/utils/test-db.ts`:

```typescript
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
// Import your schema and migrations folder

export function createTestDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle({ client: sqlite });

  // Run migrations synchronously
  migrate(db, { migrationsFolder: "./drizzle" });  // Adjust path

  return { db, sqlite };
}
```

In tests, override your production DB import or inject the test DB into handlers if needed.

**Full-Flow Example**

Test a complete conversation cycle:

```typescript
test("send message persists to DB and broadcasts", async () => {
  // Setup test DB and server with injected test DB
  // Connect two WebSocket clients
  // Client1 sends message
  // Client2 receives broadcast
  // Query DB to verify persistence
});
```

---

### Comprehensive Guide to Integration Testing in Bun for Full-Stack TypeScript Applications

Bun's test runner provides a modern, high-performance foundation for testing TypeScript code without the overhead of Jest or Vitest. Its native TypeScript support, async capabilities, and lifecycle hooks make it particularly well-suited for integration testing in full-stack setups like yours—combining `Bun.serve`, WebSocket-based command systems, React frontend serving, and Drizzle ORM with `bun:sqlite`.

This guide covers best practices, setup patterns, code examples, and considerations specific to your project architecture (single-repo full-stack, WebSocket commands, SQLite persistence).

#### Why Bun's Test Runner for Integration Tests?

- **Performance**: Tests start instantly and run significantly faster than Jest-based setups.
- **TypeScript-native**: No additional configuration needed—`.ts` and `.tsx` files work out of the box.
- **Jest-compatible API**: Familiar `describe`, `test`, `expect`, `beforeAll`, etc.
- **Lifecycle hooks**: Perfect for starting servers, initializing in-memory databases, and cleanup.
- **No external dependencies**: Avoids tools like supertest (designed for Express) or jsdom.

Developer experiences confirm Bun reduces test execution time dramatically while maintaining reliability.

#### Test Types and Scope

| Test Type       | Scope                                      | Recommended Tools/Approach                  | Example in Your Project                          |
|-----------------|--------------------------------------------|--------------------------------------------|--------------------------------------------------|
| Unit            | Individual functions/components            | Bun test + mocks                           | Testing a single command handler in isolation   |
| Integration     | Multiple modules (WS + DB + broadcast)     | Bun test + real server + in-memory DB      | WebSocket command → DB insert → broadcast       |
| End-to-End (E2E)| Full app in browser                        | Playwright/Cypress (optional)              | User opens /chat, sends message, sees response  |

This document focuses on **integration testing**—the sweet spot for verifying your WebSocket command architecture and database flows.

#### Project-Specific Setup Recommendations

Place integration tests in `test/integration/` to separate them from unit tests. Use utilities in `test/utils/` for reusable setup.

**package.json scripts**:

```json
"scripts": {
  "test": "bun test",
  "test:unit": "bun test test/unit",
  "test:integration": "bun test test/integration",
  "test:watch": "bun test --watch"
}
```

**Preload (optional)**: Use `--preload ./test/setup.ts` for global configuration (e.g., environment variables).

#### Starting a Test Server

Your production server (src/backend/index.ts) uses `Bun.serve` with WebSocket upgrade and catch-all static routing. For testing, replicate this but on a random port.

Create `test/utils/test-server.ts`:

```typescript
import { serve } from "bun";
import index from "@/frontend/index.html";
// Replicate your server config exactly

export async function createTestServer(options?: { db?: any }) {
  const server = serve({
    port: 0,
    fetch(req, server) {
      // Your route logic...
    },
    websocket: {
      // Your handlers...
      // Optionally inject test DB via closure or ws.data
    },
    development: false,
  });

  return {
    server,
    port: server.port!,
    url: `http://localhost:${server.port}`,
    wsUrl: `ws://localhost:${server.port}/chat-ws`,
    stop: () => server.stop(true),
  };
}
```

Usage in tests:

```typescript
import { beforeAll, afterAll } from "bun:test";

let testServer: Awaited<ReturnType<typeof createTestServer>>;

beforeAll(async () => {
  testServer = await createTestServer();
});

afterAll(() => {
  testServer.stop();
});
```

This approach ensures tests hit the real server implementation.

#### WebSocket Testing Patterns

Bun supports the standard `WebSocket` client globally, making client simulation straightforward.

Helper for awaiting messages:

```typescript
function waitForMessage(ws: WebSocket, filter?: (data: any) => boolean) {
  return new Promise(resolve => {
    ws.addEventListener("message", function handler(event) {
      const data = JSON.parse(event.data as string);
      if (!filter || filter(data)) {
        ws.removeEventListener("message", handler);
        resolve(data);
      }
    });
  });
}
```

Full example testing a chat command:

```typescript
test("chat command broadcasts correctly", async () => {
  const ws = new WebSocket(testServer.wsUrl);

  await new Promise(resolve => ws.addEventListener("open", resolve));

  // Subscribe or wait for system message if needed
  ws.send(JSON.stringify({
    type: "chat",
    user: "integration-test",
    content: "Hello from test",
  }));

  const response = await waitForMessage(ws);
  expect(response.type).toBe("message");
  expect(response.content).toBe("Hello from test");
  expect(response.user).toBe("integration-test");

  ws.close();
});
```

For multi-client scenarios (broadcast verification):

- Open two WebSocket connections
- Have one send, the other await the broadcast

#### Database Testing with Drizzle and In-Memory SQLite

`bun:sqlite` supports `:memory:` databases—ideal for isolation.

Utility `test/utils/test-db.ts`:

```typescript
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA journal_mode = WAL;"); // Optional performance

  const db = drizzle({ client: sqlite });

  // Apply migrations
  migrate(db, { migrationsFolder: "./drizzle" }); // Adjust to your migrations path

  return { db, sqlite };
}

// Optional: truncate all tables
export async function resetDb(db: any) {
  // Query tables and TRUNCATE, or re-create DB
}
```

Integration with server: Either monkey-patch your DB singleton or modify handlers to accept injected DB (recommended for testability).

#### Handling Test Isolation and Concurrency

- Tests within a single file run sequentially by default.
- Multiple files may run in parallel, potentially causing issues with shared resources.
- Solution: Use in-memory databases (no file conflicts) and random ports.
- For ordered dependencies, mark tests with `test.serial()` or place in one file.

#### Advanced Patterns

- **Full conversation flow**: Combine WS clients with DB queries to verify persistence.
- **Error cases**: Send invalid payloads, assert error responses.
- **Mocking external services**: Use `Bun.mock()` for AI SDK calls if needed.
- **Timeout handling**: Use `test("...", async () => {}, 10_000)` for longer WS tests.

#### Performance and Maintenance Tips

- Keep integration tests focused—aim for 10–30 tests covering core flows.
- Run integration tests separately from unit tests in CI for faster feedback.
- Use `bun test --watch` during development.
- Avoid browser-based tools (Playwright) unless testing frontend rendering logic.

This approach aligns with current Bun best practices and has been validated across community examples and official documentation. It provides reliable, fast feedback for your WebSocket-driven architecture while maintaining full TypeScript type safety.

**Key Citations**

- Bun Test Runner Documentation: https://bun.com/docs/test
- Bun WebSockets Documentation: https://bun.com/docs/runtime/http/websockets
- Drizzle ORM with Bun SQLite: https://orm.drizzle.team/docs/connect-bun-sqlite
- Bun GitHub Discussion on Test Concurrency and Database Integration: https://github.com/oven-sh/bun/discussions/4831
- Example Bun Testing in Production Applications: https://antler.digital/blog/how-to-test-your-nextjs-14-applications-with-bun
- Bun Server Documentation: https://bun.com/docs/runtime/http/server
