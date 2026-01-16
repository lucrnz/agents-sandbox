import { test, expect, beforeEach, afterEach } from "bun:test";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

const loadLoggerModule = async () => import(`@/backend/logger?cache=${crypto.randomUUID()}`);

test("createLogger adds scope to child logger", async () => {
  const { createLogger } = await loadLoggerModule();
  const logger = createLogger("backend:test");

  expect(logger.bindings()).toMatchObject({ scope: "backend:test" });
});

test("logger respects LOG_LEVEL override", async () => {
  process.env.LOG_LEVEL = "warn";
  const { logger } = await loadLoggerModule();

  expect(logger.level).toBe("warn");
});
