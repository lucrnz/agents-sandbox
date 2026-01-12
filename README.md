# Super Chat

An expanded AI chat experience inspired by ChatGPT and Grok.

## Quickstart

1. **Setup env** (for AI):

```sh
cp .env.example .env
```

Setup API keys respectively. For [xAI provider](https://console.x.ai/) and for [Mistral Provider](https://console.mistral.ai/)

2. **Install**:

```sh
bun install
```

3. **Dev server**:

```sh
bun dev
```

Visit http://localhost:3000

## Scripts

| Command | Purpose |
|---------|---------|
| `bun dev` | Development |
| `bun start` | Production |
| `bun build` | Build |
| `bun typecheck` | Type check |

## Tech

- Bun (runtime/server)
- React 19 + Tailwind 4 + Wouter
- Drizzle ORM (SQLite)
- xAI/Grok for the main agent brain + Mistral for small tasks
- Go FFI for HTML processing

## Features

- AI chat with streaming responses
- Deep research with web search capabilities
- Conversation persistence
