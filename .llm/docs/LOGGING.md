# Logging (Pino)

This project uses Pino for structured backend logging. The logger is centralized in `src/backend/logger.ts` and supports JSON logs in production with pretty-printed logs in development.

## Goals

- Structured, queryable logs in production
- Human-friendly formatting in local development
- Consistent scoping and metadata across backend services
- Redaction of sensitive fields by default

## Logger Usage

Import the shared logger and create a scoped child logger:

```ts
import { createLogger } from "@/backend/logger";

const logger = createLogger("backend:feature-name");

logger.info("Something happened");
logger.warn({ requestId }, "Something unexpected");
logger.error({ error }, "Something failed");
```

## Configuration

`src/backend/logger.ts` configures Pino with:

- `level`: `LOG_LEVEL` environment variable or defaults to `debug` in development and `info` in production
- `redact`: common fields like `authorization`, `password`, `token`, and header authorization values
- `transport`:
  - Development: `pino-pretty` with colorized output and timestamps
  - Production: JSON logs with no transport

## Environment Variables

- `LOG_LEVEL`: override the default log level (e.g. `debug`, `info`, `warn`, `error`)

## Best Practices

- Prefer `logger.info({ metadata }, "message")` over string interpolation
- Use `logger.error({ error }, "message")` for error stacks
- Create a scope per module (e.g. `backend:web-tools`)
- Avoid logging raw secrets; rely on redaction for safety
