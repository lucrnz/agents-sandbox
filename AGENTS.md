## Project Overview

You're building the initial draft of "AI Command Center", a meta-app designed as a controlled sandbox for training AI agents to interact with UI elements.

A simulated digital environment where agents learn multi-step reasoning, action planning, and tool use in a safe, predictable space.

## Package manager guidelines
Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

### Client-side Navigation

The application uses **Wouter** for client-side routing. Wouter is a minimalist routing library for React that provides:

- Lightweight routing solution (around 2KB)
- Hooks-based API for navigation
- Support for dynamic routes
- No server configuration needed

Basic usage:

```tsx
import { Link, Route, Switch } from "wouter";

function App() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/about" component={About} />
    </Switch>
  );
}
```

For navigation between routes, use the `Link` component:

```tsx
<Link href="/about">Go to About Page</Link>
```


### More front-end remarks

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

## Server Operations

IMPORTANT: Do not start the Bun server unless explicitly asked to do so by the user. The server should only be started when specifically requested.

To start the server when asked:

```sh
bun --hot ./index.ts
```

## Bun - More information
For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.
