# AI Command Center

A sandbox for training AI agents to interact with UI elements.

## Quickstart

1. **Setup env** (for AI):

   ```bash
   cp .env.example .env
   # Add XAI_API_KEY=your_key
   ```

2. **Install**:

   ```bash
   bun install
   ```

3. **Dev server**:

   ```bash
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

[AGENTS.md] Developer guide.