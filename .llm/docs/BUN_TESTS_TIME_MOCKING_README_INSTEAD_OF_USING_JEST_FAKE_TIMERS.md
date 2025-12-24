# Bun Test Runner: Time Mocking Guide

## Overview

Bun's test runner provides a simpler approach to time mocking than Jest's `useFakeTimers()`. This document explains how to mock time in Bun tests.

## Quick Reference

```typescript
import { setSystemTime } from "bun:test";

// Set mock time
setSystemTime(new Date("2024-01-01T12:00:00.000Z"));

// Reset to real time
setSystemTime();
```

## The `setSystemTime` Function

Bun provides `setSystemTime` directly from `bun:test` - no need to enable fake timers first.

### Basic Usage

```typescript
import { test, expect, setSystemTime } from "bun:test";

test("party like it's 1999", () => {
  const date = new Date("1999-01-01T00:00:00.000Z");
  setSystemTime(date); // it's now January 1, 1999

  const now = new Date();
  expect(now.getFullYear()).toBe(1999);
  expect(now.getMonth()).toBe(0);
  expect(now.getDate()).toBe(1);
});
```

### Reset to Real Time

Call `setSystemTime()` with no arguments to restore the actual system time:

```typescript
setSystemTime(); // reset to actual time
```

### Common Test Pattern

```typescript
import { test, expect, describe, beforeEach, afterEach, setSystemTime } from "bun:test";

describe("time-dependent tests", () => {
  beforeEach(() => {
    setSystemTime(new Date("2024-01-01T12:00:00.000Z"));
  });

  afterEach(() => {
    setSystemTime(); // Reset to real time
  });

  test("should return mocked timestamp", () => {
    expect(Date.now()).toBe(1704110400000);
  });

  test("should create Date with mocked time", () => {
    const now = new Date();
    expect(now.toISOString()).toBe("2024-01-01T12:00:00.000Z");
  });
});
```

## Comparison: Bun vs Jest

| Feature | Jest | Bun |
|---------|------|-----|
| Enable fake timers | `jest.useFakeTimers()` | Not needed |
| Set system time | `jest.setSystemTime(date)` | `setSystemTime(date)` |
| Restore real time | `jest.useRealTimers()` | `setSystemTime()` |
| Advance timers | `jest.advanceTimersByTime(ms)` | ❌ Not available |
| Run all timers | `jest.runAllTimers()` | ❌ Not available |
| Run pending timers | `jest.runOnlyPendingTimers()` | ❌ Not available |

## Important Limitations

### What `setSystemTime` Mocks

✅ **Mocked:**
- `Date.now()`
- `new Date()`

### What `setSystemTime` Does NOT Mock

❌ **Not Mocked:**
- `setTimeout()`
- `setInterval()`
- `setImmediate()`
- `process.hrtime()`

### Workaround for setTimeout/setInterval

If you need to test code that uses `setTimeout` or `setInterval`, you'll need to mock those functions manually:

```typescript
import { test, expect, mock, beforeEach, afterEach } from "bun:test";

describe("setTimeout-dependent tests", () => {
  let originalSetTimeout: typeof setTimeout;
  let timeoutCallbacks: Array<{ fn: Function; ms: number }> = [];

  beforeEach(() => {
    originalSetTimeout = globalThis.setTimeout;
    timeoutCallbacks = [];
    
    // Mock setTimeout to capture callbacks
    globalThis.setTimeout = mock((fn: Function, ms: number) => {
      timeoutCallbacks.push({ fn, ms });
      return timeoutCallbacks.length as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;
  });

  afterEach(() => {
    globalThis.setTimeout = originalSetTimeout;
  });

  test("should schedule cleanup after 60 seconds", () => {
    // Code under test that uses setTimeout
    scheduleCleanup();

    // Assert setTimeout was called with correct delay
    expect(timeoutCallbacks).toHaveLength(1);
    expect(timeoutCallbacks[0].ms).toBe(60000);
  });

  test("can manually trigger timeout callback", () => {
    const callback = mock(() => {});
    setTimeout(callback, 1000);

    // Manually execute the callback
    timeoutCallbacks[0].fn();

    expect(callback).toHaveBeenCalled();
  });
});
```

### Alternative: Inject Time Dependencies

A cleaner approach is to inject time-related dependencies:

```typescript
// Production code
class TaskScheduler {
  constructor(
    private setTimeout: typeof globalThis.setTimeout = globalThis.setTimeout
  ) {}

  scheduleTask(fn: () => void, delayMs: number) {
    this.setTimeout(fn, delayMs);
  }
}

// Test code
import { test, expect, mock } from "bun:test";

test("schedules task with correct delay", () => {
  const mockSetTimeout = mock((fn, ms) => 1 as any);
  const scheduler = new TaskScheduler(mockSetTimeout);

  scheduler.scheduleTask(() => {}, 5000);

  expect(mockSetTimeout).toHaveBeenCalledTimes(1);
  expect(mockSetTimeout.mock.calls[0][1]).toBe(5000);
});
```

## Real-World Example: Testing Duration Calculations

```typescript
import { test, expect, describe, beforeEach, afterEach, setSystemTime } from "bun:test";

function calculateDuration(startTime: Date): number {
  return Date.now() - startTime.getTime();
}

describe("calculateDuration", () => {
  afterEach(() => {
    setSystemTime(); // Always reset
  });

  test("should calculate correct duration", () => {
    // Set initial time
    setSystemTime(new Date("2024-01-01T12:00:00.000Z"));
    const startTime = new Date();

    // Advance time by 5 seconds
    setSystemTime(new Date("2024-01-01T12:00:05.000Z"));

    const duration = calculateDuration(startTime);
    expect(duration).toBe(5000); // 5 seconds in milliseconds
  });
});
```

## Testing Timestamps in Database Operations

```typescript
import { test, expect, describe, beforeEach, afterEach, setSystemTime } from "bun:test";

describe("database timestamps", () => {
  const fixedDate = new Date("2024-06-15T10:30:00.000Z");

  beforeEach(() => {
    setSystemTime(fixedDate);
  });

  afterEach(() => {
    setSystemTime();
  });

  test("should set createdAt to current time", async () => {
    const record = await createRecord({ name: "test" });
    
    expect(record.createdAt).toEqual(fixedDate);
  });
});
```

## References

- [Bun Docs: Set the system time](https://bun.sh/guides/test/mock-clock)
- [Bun Docs: Dates and times](https://bun.sh/docs/test/time)
- [Bun Docs: Mock functions](https://bun.sh/docs/guides/test/mock-functions)

