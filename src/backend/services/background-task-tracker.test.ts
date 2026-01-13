import { test, expect, describe, mock, beforeEach, type Mock } from "bun:test";
import { BackgroundTaskTracker } from "./background-task-tracker";
import type { ServerWebSocket } from "bun";

interface MockWebSocketData {
  conversationId?: string;
}

interface MockWebSocket {
  send: Mock<(data: string) => void>;
  data: MockWebSocketData;
}

describe("BackgroundTaskTracker", () => {
  let tracker: BackgroundTaskTracker;
  let mockWs: MockWebSocket;

  beforeEach(() => {
    tracker = new BackgroundTaskTracker();
    mockWs = {
      send: mock(() => {}),
      data: { conversationId: "test-conv-id" },
    };
  });

  test("should track a successful task", async () => {
    const promise = Promise.resolve("success");
    const result = await tracker.track(
      "ai_response",
      "test-conv-id",
      promise,
      mockWs as unknown as ServerWebSocket<MockWebSocketData>,
    );

    expect(result).toBe("success");
    expect(tracker.getPendingTasks()).toHaveLength(0);
  });

  test("should track a failing task and notify via WebSocket", async () => {
    const error = new Error("Something went wrong");
    const promise = Promise.reject(error);

    await expect(
      tracker.track(
        "ai_response",
        "test-conv-id",
        promise,
        mockWs as unknown as ServerWebSocket<MockWebSocketData>,
      ),
    ).rejects.toThrow("Something went wrong");

    expect(mockWs.send).toHaveBeenCalled();
    const sentData = JSON.parse(mockWs.send.mock.calls[0]![0]!) as {
      kind: string;
      event: string;
      payload: { conversationId: string };
    };
    expect(sentData.kind).toBe("event");
    expect(sentData.event).toBe("background_task_error");
    expect(sentData.payload.conversationId).toBe("test-conv-id");
  });

  test("getPendingTasks should return only pending tasks", async () => {
    let resolveTask: ((value: string) => void) | undefined;
    const promise = new Promise<string>((resolve) => {
      resolveTask = resolve;
    });

    const trackPromise = tracker.track(
      "ai_response",
      "test-conv-id",
      promise,
      mockWs as unknown as ServerWebSocket<MockWebSocketData>,
    );

    expect(tracker.getPendingTasks()).toHaveLength(1);
    expect(tracker.getPendingTasks()[0]!.type).toBe("ai_response");

    resolveTask!("done");
    await trackPromise;

    expect(tracker.getPendingTasks()).toHaveLength(0);
  });

  test("should cleanup tasks after timeout", async () => {
    const originalSetTimeout = globalThis.setTimeout;
    let timeoutCallback: (() => void) | undefined;
    globalThis.setTimeout = mock((cb: () => void) => {
      timeoutCallback = cb;
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout;

    const promise = Promise.resolve("done");
    await tracker.track(
      "ai_response",
      "test-conv-id",
      promise,
      mockWs as unknown as ServerWebSocket<MockWebSocketData>,
    );

    // Task is completed but still in internal map for a minute
    // @ts-expect-error - accessing private field for testing
    expect(tracker.tasks.size).toBe(1);

    // Trigger cleanup
    timeoutCallback!();
    // @ts-expect-error - accessing private field for testing
    expect(tracker.tasks.size).toBe(0);

    globalThis.setTimeout = originalSetTimeout;
  });
});
