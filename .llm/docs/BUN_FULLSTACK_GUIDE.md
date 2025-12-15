# Bun + Full-stack React + WebSocket Setup Guide

A comprehensive guide to setting up a full-stack application using Bun as the runtime, React for the frontend, and WebSocket for real-time communication - all in a single repository.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Installation & Setup](#installation--setup)
- [Configuration Files](#configuration-files)
- [Backend Setup](#backend-setup)
- [Frontend Setup](#frontend-setup)
- [WebSocket Implementation](#websocket-implementation)
- [Routing & Architecture](#routing--architecture)
- [Development Workflow](#development-workflow)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Overview

This guide demonstrates how to build a full-stack application where:

- **Bun** serves as the runtime for both backend and frontend bundling
- **React** powers the user interface with modern hooks and components
- **WebSocket** enables real-time communication between client and server
- **Single Repository** contains all code (no monorepo complexity)
- **Hot Reloading** works seamlessly during development

### Key Features

- ⚡ **Ultra-fast**: Bun's performance benefits for both server and bundling
- 🔄 **Real-time**: WebSocket communication for instant updates
- 🏗️ **Full-stack**: Backend and frontend in one codebase
- 🔥 **Hot Reload**: Instant updates during development
- 📦 **Modern**: ES modules, TypeScript, and latest React features

## Prerequisites

- **Node.js** (for initial setup, can be removed after Bun installation)
- **Bun** runtime (latest version recommended)
- Basic knowledge of:
  - JavaScript/TypeScript
  - React fundamentals
  - HTTP/WebSocket protocols
  - Terminal/command line usage

### Installing Bun

```bash
# Install Bun (choose one method):

# Method 1: Using npm (if you have Node.js)
npm install -g bun

# Method 2: Using curl (recommended for fresh installations)
curl -fsSL https://bun.sh/install | bash

# Verify installation
bun --version
```

## Project Structure

```
project-root/
├── src/
│   ├── backend/
│   │   └── index.ts          # Main server file with WebSocket handlers
│   └── frontend/
│       ├── index.html        # HTML entry point
│       ├── frontend.tsx      # React app entry point
│       ├── app.tsx           # Main app component with routing
│       ├── components/       # Reusable React components
│       │   └── ui/          # UI component library (shadcn/ui)
│       ├── pages/           # Page components
│       ├── hooks/           # Custom React hooks
│       ├── lib/             # Utility functions
│       └── globals.css      # Global styles
├── package.json              # Dependencies and scripts
├── bunfig.toml              # Bun configuration
├── tsconfig.json            # TypeScript configuration
├── build.ts                 # Build script (optional)
└── README.md               # Project documentation
```

### File Purposes

- **`src/backend/index.ts`**: Server setup with HTTP routes and WebSocket handlers
- **`src/frontend/index.html`**: HTML template that imports the React app
- **`src/frontend/frontend.tsx`**: Mounts React app to DOM
- **`src/frontend/app.tsx`**: Main React component with client-side routing

## Installation & Setup

### 1. Initialize Project

```bash
# Create project directory
mkdir my-fullstack-app
cd my-fullstack-app

# Initialize with Bun
bun init

# Or clone this template
git clone <repository-url> my-fullstack-app
cd my-fullstack-app
bun install
```

### 2. Install Dependencies

```bash
# Core dependencies
bun add react react-dom

# Routing
bun add wouter

# UI Components (shadcn/ui style)
bun add @radix-ui/react-label @radix-ui/react-select @radix-ui/react-slot
bun add class-variance-authority clsx lucide-react tailwind-merge

# Development dependencies
bun add -d @types/react @types/react-dom typescript tailwindcss
bun add bun-plugin-tailwind tw-animate-css

# Optional: AI integration (for demo)
bun add @ai-sdk/xai ai
```

### 3. Configure TypeScript Paths

Update `tsconfig.json` to include path mapping:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

## Configuration Files

### package.json

```json
{
  "name": "my-fullstack-app",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun --hot src/backend/index.ts",
    "start": "NODE_ENV=production bun src/backend/index.ts",
    "build": "bun run build.ts"
  },
  "dependencies": {
    "react": "^19",
    "react-dom": "^19",
    "wouter": "^3.8.1",
    "@radix-ui/react-label": "^2.1.7",
    "@radix-ui/react-select": "^2.2.6",
    "@radix-ui/react-slot": "^1.2.3",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.545.0",
    "tailwind-merge": "^3.3.1",
    "bun-plugin-tailwind": "^0.1.2",
    "tw-animate-css": "^1.4.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "typescript": "^5.9.3",
    "tailwindcss": "^4.1.11"
  }
}
```

### bunfig.toml

```toml
[serve.static]
plugins = ["bun-plugin-tailwind"]
env = "BUN_PUBLIC_*"
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "lib": ["ESNext", "DOM"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "allowJs": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noPropertyAccessFromIndexSignature": false
  },
  "exclude": ["dist", "node_modules"]
}
```

## Backend Setup

### Main Server File (`src/backend/index.ts`)

```typescript
import { serve, type Server } from "bun";
import index from "../frontend/index.html";

const server = serve<{ username: string }>({
  routes: {
    // WebSocket endpoint - MUST come before catch-all route
    "/chat-ws": {
      GET(req: Request, server: Server<unknown>) {
        const upgraded = server.upgrade(req, {
          data: { username: "anonymous" },
        });

        if (!upgraded) {
          return new Response("WebSocket upgrade failed", { status: 400 });
        }

        return undefined; // Don't return a Response for successful upgrades
      },
    },

    // Catch-all route serves the React app
    "/*": index,
  },

  // Development configuration
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,      // Hot module reloading
    console: true,  // Echo browser console to server
  },

  // WebSocket configuration
  websocket: {
    perMessageDeflate: true,

    // Connection opened
    open(ws) {
      console.log(`WebSocket connection opened from ${ws.remoteAddress}`);
      ws.subscribe("chat"); // Subscribe to chat room

      // Send welcome message
      ws.send(JSON.stringify({
        type: "system",
        message: "Connected to server!"
      }));
    },

    // Message received
    async message(ws, message: string | Buffer) {
      const messageString = typeof message === "string"
        ? message
        : message.toString("utf-8");

      try {
        const data = JSON.parse(messageString);

        if (data.type === "chat") {
          // Broadcast to all subscribers
          ws.publish("chat", JSON.stringify({
            type: "message",
            user: data.user,
            content: data.content,
            timestamp: new Date().toISOString()
          }));
        }
      } catch (error) {
        console.error("Invalid message format:", error);
      }
    },

    // Connection closed
    close(ws, code, reason) {
      console.log(`WebSocket closed: ${code} - ${reason}`);
      ws.unsubscribe("chat");
    },
  },
});

console.log(`🚀 Server running at ${server.url}`);
console.log(`🔌 WebSocket available at ws://${server.hostname}:${server.port}/chat-ws`);
```

### Key Backend Concepts

#### Route Order Matters
```typescript
routes: {
  "/api/*": apiHandler,    // Specific routes first
  "/chat-ws": wsHandler,   // WebSocket routes second
  "/*": index,            // Catch-all route LAST
}
```

#### WebSocket Upgrade Process
```typescript
server.upgrade(req, {
  data: { username: "anonymous" }, // Attach data to WebSocket instance
})
```

#### WebSocket Event Handlers
- **`open(ws)`**: Called when connection opens
- **`message(ws, message)`**: Called when message received
- **`close(ws, code, reason)`**: Called when connection closes

## Frontend Setup

### HTML Entry Point (`src/frontend/index.html`)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Bun + React</title>

    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">

    <!-- Import React app -->
    <script type="module" src="./frontend.tsx" async></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

### React Entry Point (`src/frontend/frontend.tsx`)

```typescript
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app.tsx";
import "./globals.css";

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
```

### Main App Component (`src/frontend/app.tsx`)

```typescript
import React from "react";
import { Router, Route, Switch } from "wouter";
import HomePage from "./pages/home/home-page";
import ChatPage from "./pages/chat/chat-page";
import NotFoundPage from "./pages/not-found/not-found-page";

export default function App() {
  return (
    <Router>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/chat" component={ChatPage} />
        <Route component={NotFoundPage} />
      </Switch>
    </Router>
  );
}
```

### Global Styles (`src/frontend/globals.css`)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 221.2 83.2% 53.3%;
  --primary-foreground: 210 40% 98%;
  /* ... more CSS variables ... */
}

body {
  font-family: 'Inter', sans-serif;
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
}
```

## WebSocket Implementation

### Custom WebSocket Hook (`src/frontend/hooks/useWebSocket.ts`)

```typescript
import { useState, useEffect, useRef, useCallback } from "react";

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

export interface UseWebSocketOptions {
  onOpen?: (event: Event) => void;
  onMessage?: (event: MessageEvent) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
  onConnectionStateChange?: (
    state: ConnectionState,
    prevState: ConnectionState
  ) => void;
  maxRetries?: number;
  autoReconnect?: boolean;
}

export interface UseWebSocketReturn {
  ws: React.RefObject<WebSocket | null>;
  connectionState: ConnectionState;
  send: (data: string | object) => boolean;
  reconnect: () => void;
  retryCount: number;
  maxRetries: number;
}

const calculateBackoff = (retryCount: number): number => {
  const baseDelay = 1000;
  const maxDelay = 30000;
  const exponentialDelay = Math.min(
    baseDelay * Math.pow(2, retryCount),
    maxDelay
  );
  const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);
  return Math.floor(exponentialDelay + jitter);
};

export function useWebSocket(
  url: string,
  options: UseWebSocketOptions = {}
): UseWebSocketReturn {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [retryCount, setRetryCount] = useState(0);

  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<Timer | null>(null);
  const isConnectingRef = useRef(false);
  const isMountedRef = useRef(true);
  const manuallyDisconnectedRef = useRef(false);
  const previousStateRef = useRef<ConnectionState>("disconnected");

  const maxRetries = options.maxRetries ?? 10;
  const autoReconnect = options.autoReconnect ?? true;

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const updateConnectionState = useCallback(
    (newState: ConnectionState) => {
      if (!isMountedRef.current) return;

      const prevState = previousStateRef.current;
      setConnectionState(newState);
      previousStateRef.current = newState;

      if (options.onConnectionStateChange && prevState !== newState) {
        options.onConnectionStateChange(newState, prevState);
      }
    },
    [options.onConnectionStateChange]
  );

  const connectWebSocket = useCallback(() => {
    if (isConnectingRef.current) {
      console.log("Connection already in progress, skipping");
      return;
    }

    if (retryCount >= maxRetries) {
      console.log(`Max retries (${maxRetries}) exceeded`);
      updateConnectionState("failed");
      return;
    }

    clearReconnectTimeout();

    isConnectingRef.current = true;
    updateConnectionState(
      retryCount === 0 ? "connecting" : "reconnecting"
    );

    console.log(`WebSocket connection attempt ${retryCount + 1}/${maxRetries}...`);

    try {
      if (ws.current && ws.current.readyState !== WebSocket.CLOSED) {
        ws.current.close();
      }

      const socket = new WebSocket(url);

      socket.onopen = (event) => {
        console.log("WebSocket connection established");
        isConnectingRef.current = false;
        setRetryCount(0);
        updateConnectionState("connected");

        if (options.onOpen) {
          options.onOpen(event);
        }
      };

      socket.onmessage = (event) => {
        if (options.onMessage) {
          options.onMessage(event);
        }
      };

      socket.onerror = (event) => {
        console.error("WebSocket error occurred");
        isConnectingRef.current = false;

        if (options.onError) {
          options.onError(event);
        }
      };

      socket.onclose = (event) => {
        console.log(`WebSocket connection closed: ${event.code} - ${event.reason}`);
        isConnectingRef.current = false;

        if (manuallyDisconnectedRef.current || !isMountedRef.current) {
          updateConnectionState("disconnected");
          if (options.onClose) {
            options.onClose(event);
          }
          return;
        }

        if (autoReconnect && retryCount < maxRetries) {
          const delay = calculateBackoff(retryCount);
          console.log(`Reconnecting in ${delay}ms...`);

          setRetryCount((prev) => prev + 1);
          updateConnectionState("reconnecting");

          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              connectWebSocket();
            }
          }, delay);
        } else {
          updateConnectionState("failed");
        }

        if (options.onClose) {
          options.onClose(event);
        }
      };

      ws.current = socket;
    } catch (error) {
      console.error("Error creating WebSocket:", error);
      isConnectingRef.current = false;
      updateConnectionState("failed");
    }
  }, [url, retryCount, maxRetries, autoReconnect, options.onOpen, options.onMessage, options.onError, options.onClose, updateConnectionState, clearReconnectTimeout]);

  const send = useCallback((data: string | object): boolean => {
    console.log("[useWebSocket] send called with:", data);
    console.log("[useWebSocket] WebSocket state:", ws.current?.readyState);

    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      console.warn("Cannot send message: WebSocket is not connected");
      return false;
    }

    try {
      const message = typeof data === "string" ? data : JSON.stringify(data);
      console.log("[useWebSocket] Sending message:", message);
      ws.current.send(message);
      console.log("[useWebSocket] Message sent successfully");
      return true;
    } catch (error) {
      console.error("Error sending WebSocket message:", error);
      return false;
    }
  }, []);

  const reconnect = useCallback(() => {
    console.log("Manual reconnection triggered");
    manuallyDisconnectedRef.current = false;
    setRetryCount(0);
    clearReconnectTimeout();
    isConnectingRef.current = false;
    connectWebSocket();
  }, [connectWebSocket, clearReconnectTimeout]);

  useEffect(() => {
    isMountedRef.current = true;
    manuallyDisconnectedRef.current = false;

    connectWebSocket();

    return () => {
      console.log("useWebSocket cleanup: unmounting (keeping WebSocket alive for hot reload)");
      isMountedRef.current = false;
      manuallyDisconnectedRef.current = true;

      clearReconnectTimeout();

      // Don't close WebSocket - let it persist across hot reloads
      // The WebSocket will be cleaned up when the page unloads
    };
  }, [url]);

  return {
    ws,
    connectionState,
    send,
    reconnect,
    retryCount,
    maxRetries,
  };
}
```

### Using the WebSocket Hook

```typescript
import { useWebSocket } from "@/hooks/useWebSocket";

function ChatComponent() {
  const { connectionState, send, reconnect } = useWebSocket(
    `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/chat-ws`,
    {
      onMessage: (event) => {
        const data = JSON.parse(event.data);
        // Handle incoming messages
      },
      onConnectionStateChange: (state, prevState) => {
        // Handle connection state changes
      },
    }
  );

  const handleSendMessage = () => {
    send({
      type: "chat",
      user: "username",
      content: "Hello world!",
    });
  };

  return (
    <div>
      <div>Status: {connectionState}</div>
      <button onClick={handleSendMessage}>Send Message</button>
      {connectionState === "failed" && (
        <button onClick={reconnect}>Reconnect</button>
      )}
    </div>
  );
}
```

## Routing & Architecture

### Bun's Routing System

Bun uses a file-system inspired routing system with these precedence rules:

1. **Exact routes**: `/users/all`
2. **Parameter routes**: `/users/:id`
3. **Wildcard routes**: `/users/*`
4. **Global catch-all**: `/*`

**Critical**: WebSocket routes must come BEFORE the catch-all route:

```typescript
routes: {
  "/api/websocket": wsHandler,  // Specific routes first
  "/api/*": apiHandler,         // Parameter routes second
  "/*": index,                  // Catch-all route LAST
}
```

### Full-stack Architecture

```
┌─────────────────┐    HTTP/WebSocket    ┌─────────────────┐
│   Browser       │◄────────────────────►│   Bun Server    │
│                 │                      │                 │
│  React App      │◄────────────────────►│  Routes         │
│  - Components   │    JSON messages     │  - WebSocket    │
│  - Hooks        │                      │  - HTTP APIs    │
│  - State        │                      │  - Static files │
└─────────────────┘                      └─────────────────┘
                                                    │
                                                    ▼
                                           ┌─────────────────┐
                                           │   External APIs  │
                                           │   - AI services  │
                                           │   - Databases    │
                                           │   - File storage │
                                           └─────────────────┘
```

### WebSocket Message Flow

1. **Client** sends JSON message via `ws.send()`
2. **Server** receives in `message(ws, message)` handler
3. **Server** processes message (validation, business logic)
4. **Server** responds via `ws.send()` or broadcasts via `ws.publish()`
5. **Client** receives in `onmessage` event handler

## Development Workflow

### Starting Development Server

```bash
# Start development server with hot reloading
bun run dev

# Server will be available at:
# - HTTP: http://localhost:3000
# - WebSocket: ws://localhost:3000/chat-ws
```

### Hot Reloading Behavior

- **Frontend**: Automatic browser refresh on file changes
- **Backend**: Server restart on backend file changes
- **WebSocket**: Connections persist across hot reloads (configured to prevent disconnection)

### Development Features

```typescript
// Enable hot reloading in development
development: process.env.NODE_ENV !== "production" && {
  hmr: true,      // Hot module reloading
  console: true,  // Echo browser console logs to server terminal
}
```

### Testing WebSocket Connection

```bash
# Test with a simple WebSocket client
echo '{"type": "test", "message": "hello"}' | websocat ws://localhost:3000/chat-ws

# Or use a WebSocket testing tool like:
# - WebSocket King (Chrome extension)
# - Postman (WebSocket support)
# - Custom Node.js script
```

## Production Deployment

### Building for Production

```typescript
// build.ts
import { build } from "bun";

await build({
  entrypoints: ["./src/backend/index.ts"],
  outdir: "./dist",
  target: "bun",
  minify: true,
});

console.log("Build completed!");
```

### Production Configuration

```typescript
const server = serve({
  // ... routes and websocket config ...

  development: false, // Disable development features

  // Production optimizations
  websocket: {
    perMessageDeflate: true,
    maxPayloadLength: 1024 * 1024, // 1MB limit
    idleTimeout: 300, // 5 minutes
  },
});
```

### Environment Variables

```bash
# Production environment
NODE_ENV=production
PORT=3000
BUN_PUBLIC_API_URL=https://api.example.com
```

### Deployment Options

#### Railway
```bash
# railway.json
{
  "build": {
    "builder": "bun"
  },
  "deploy": {
    "startCommand": "bun run start"
  }
}
```

#### Docker
```dockerfile
FROM oven/bun:latest

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install

COPY . .
RUN bun run build

EXPOSE 3000
CMD ["bun", "run", "start"]
```

#### Vercel/Netlify (Static Frontend Only)
For full-stack deployment with WebSocket, use platforms that support persistent servers:
- **Railway**
- **Render**
- **Fly.io**
- **DigitalOcean App Platform**
- **AWS EC2/Lambda**

## Troubleshooting

### WebSocket Connection Issues

#### Problem: "WebSocket upgrade failed"
```typescript
// Check: Is the route defined correctly?
routes: {
  "/ws": { GET: (req, server) => server.upgrade(req) }, // ✅ Correct
  "/*": index, // ❌ Catch-all blocks WebSocket if defined first
}

// Solution: Put WebSocket routes BEFORE catch-all
routes: {
  "/ws": { GET: (req, server) => server.upgrade(req) },
  "/*": index,
}
```

#### Problem: Messages not reaching server
```typescript
// Check: Is the WebSocket connected?
console.log("WebSocket readyState:", ws.readyState);
// 0 = CONNECTING, 1 = OPEN, 2 = CLOSING, 3 = CLOSED

// Check: Correct message format?
ws.send(JSON.stringify({ type: "message", data: "hello" }));
```

#### Problem: Hot reloading breaks WebSocket
```typescript
// Solution: Don't close WebSocket on component unmount during development
useEffect(() => {
  // ... connection logic ...

  return () => {
    // Keep WebSocket alive during hot reloads
    if (process.env.NODE_ENV === 'production') {
      ws.current?.close();
    }
  };
}, []);
```

### Common Errors

#### "Failed to start server. Is port 3000 in use?"
```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port
const server = serve({ port: 3001, /* ... */ });
```

#### "Module not found" errors
```bash
# Clear Bun's cache
bun pm cache rm

# Reinstall dependencies
rm -rf node_modules bun.lock
bun install
```

#### WebSocket connection closes immediately
```typescript
// Check: Is the server sending a response after upgrade?
server.upgrade(req, { data: {} }); // ✅ Correct - no return
return new Response("OK");         // ❌ Wrong - don't return after upgrade
```

### Development Tips

#### Debugging WebSocket Messages
```typescript
// Add logging to WebSocket handlers
websocket: {
  message(ws, message) {
    console.log("📨 Received:", typeof message, message);
    // Process message...
  },
  open(ws) {
    console.log("🔌 Connection opened");
  },
  close(ws, code, reason) {
    console.log("🔌 Connection closed:", code, reason);
  }
}
```

#### Testing with Browser DevTools
```javascript
// In browser console, test WebSocket directly
const ws = new WebSocket('ws://localhost:3000/chat-ws');
ws.onopen = () => console.log('Connected');
ws.onmessage = (e) => console.log('Received:', e.data);
ws.send(JSON.stringify({ type: 'test' }));
```

## Best Practices

### WebSocket Message Format
```typescript
// Consistent message structure
interface WebSocketMessage {
  type: string;        // Message type identifier
  payload: any;        // Message data
  timestamp?: string;  // Optional timestamp
  userId?: string;     // Optional user identifier
}

// Examples
{ type: "chat", payload: { message: "Hello!" } }
{ type: "user_join", payload: { username: "Alice" } }
{ type: "error", payload: { code: 400, message: "Invalid request" } }
```

### Connection Management
```typescript
// Implement heartbeat/ping-pong
websocket: {
  open(ws) {
    // Send periodic pings to detect broken connections
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      } else {
        clearInterval(pingInterval);
      }
    }, 30000); // 30 seconds
  }
}
```

### Error Handling
```typescript
// Handle WebSocket errors gracefully
websocket: {
  message(ws, message) {
    try {
      const data = JSON.parse(message);
      // Process message...
    } catch (error) {
      ws.send(JSON.stringify({
        type: "error",
        payload: { message: "Invalid message format" }
      }));
    }
  }
}
```

### Security Considerations
```typescript
// Validate WebSocket origins
routes: {
  "/ws": {
    GET(req) {
      const origin = req.headers.get("origin");
      if (!allowedOrigins.includes(origin)) {
        return new Response("Forbidden", { status: 403 });
      }
      return server.upgrade(req);
    }
  }
}
```

### Performance Optimization
```typescript
websocket: {
  perMessageDeflate: true,        // Compress messages
  maxPayloadLength: 1024 * 1024, // Limit message size
  backpressureLimit: 1024 * 1024, // Prevent memory issues
}
```

---

This guide provides a complete foundation for building full-stack applications with Bun, React, and WebSocket. The architecture supports real-time communication, hot reloading, and scales from development to production deployment.

For more advanced features, consider adding:
- Authentication middleware
- Message queuing (Redis/RabbitMQ)
- Database integration
- Rate limiting
- Monitoring and logging

**Happy coding! 🚀**
