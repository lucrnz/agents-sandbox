# AI Command Center

A sandbox for training AI agents to interact with UI elements.

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
- xAI Grok agent w/ web tools
- Go FFI for HTML processing

## Features

- AI chat w/ tool use
- Web search/fetch
- Todo app sandbox
- Conv history
