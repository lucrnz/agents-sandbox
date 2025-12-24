import { test, expect, describe, mock, beforeEach, afterEach, setSystemTime } from "bun:test";
import { BackgroundTaskTracker } from "./background-task-tracker";

describe("BackgroundTaskTracker", () => {
  let tracker: BackgroundTaskTracker;
  let mockWs: any;

  beforeEach(() => {
    tracker = new BackgroundTaskTracker();
    mockWs = {
      send: mock(() => {}),
      data: { conversationId: "test-conv-id" },
    };
  });

  test("should track a successful task", async () => {
    const promise = Promise.resolve("success");
    const result = await tracker.track("ai_response", "test-conv-id", promise, mockWs);

    expect(result).toBe("success");
    expect(tracker.getPendingTasks()).toHaveLength(0);
  });

  test("should track a failing task and notify via WebSocket", async () => {
    const error = new Error("Something went wrong");
    const promise = Promise.reject(error);

    await expect(tracker.track("ai_response", "test-conv-id", promise, mockWs)).rejects.toThrow(
      "Something went wrong",
    );

    expect(mockWs.send).toHaveBeenCalled();
    const sentData = JSON.parse(mockWs.send.mock.calls[0][0]);
    expect(sentData.kind).toBe("event");
    expect(sentData.event).toBe("background_task_error");
    expect(sentData.payload.conversationId).toBe("test-conv-id");
  });

  test("getPendingTasks should return only pending tasks", async () => {
    let resolveTask: any;
    const promise = new Promise((resolve) => {
      resolveTask = resolve;
    });

    const trackPromise = tracker.track("ai_response", "test-conv-id", promise, mockWs);

    expect(tracker.getPendingTasks()).toHaveLength(1);
    expect(tracker.getPendingTasks()[0].type).toBe("ai_response");

    resolveTask("done");
    await trackPromise;

    expect(tracker.getPendingTasks()).toHaveLength(0);
  });

  test("should cleanup tasks after timeout", async () => {
    // Mock setTimeout
    const originalSetTimeout = globalThis.setTimeout;
    let timeoutCallback: any;
    globalThis.setTimeout = mock((cb: any) => {
      timeoutCallback = cb;
      return 1 as any;
    }) as any;

    const promise = Promise.resolve("done");
    await tracker.track("ai_response", "test-conv-id", promise, mockWs);

    // Task is completed but still in internal map for a minute
    // @ts-ignore - accessing private field for testing
    expect(tracker.tasks.size).toBe(1);

    // Trigger cleanup
    timeoutCallback();
    // @ts-ignore
    expect(tracker.tasks.size).toBe(0);

    globalThis.setTimeout = originalSetTimeout;
  });
});
