import type { ServerWebSocket } from "bun";
import { createEventMessage } from "../../shared/command-system";
import { BackgroundTaskErrorEvent } from "../../shared/commands";

export type TaskType = "title_generation" | "ai_response";
export type TaskState = "pending" | "completed" | "failed";

export interface TrackedTask {
  id: string;
  type: TaskType;
  conversationId: string;
  state: TaskState;
  startedAt: Date;
  completedAt?: Date;
  error?: Error;
}

export class BackgroundTaskTracker {
  private tasks = new Map<string, TrackedTask>();

  /**
   * Tracks a background promise and handles logging/notifications
   */
  async track<T>(
    type: TaskType,
    conversationId: string,
    promise: Promise<T>,
    ws: ServerWebSocket<{ conversationId?: string }>,
  ): Promise<T> {
    const taskId = crypto.randomUUID();
    const startedAt = new Date();

    const task: TrackedTask = {
      id: taskId,
      type,
      conversationId,
      state: "pending",
      startedAt,
    };

    this.tasks.set(taskId, task);

    try {
      const result = await promise;

      task.state = "completed";
      task.completedAt = new Date();

      const duration = task.completedAt.getTime() - task.startedAt.getTime();
      console.log(`[BACKGROUND_TASK] ${type} completed for ${conversationId} in ${duration}ms`);

      return result;
    } catch (error) {
      task.state = "failed";
      task.completedAt = new Date();
      task.error = error instanceof Error ? error : new Error(String(error));

      const duration = task.completedAt.getTime() - task.startedAt.getTime();

      // Detailed server-side logging
      console.error(`[BACKGROUND_TASK] ${type} failed`);
      console.error(`  ConversationId: ${conversationId}`);
      console.error(`  Duration: ${duration}ms`);
      console.error(`  Error: ${task.error.message}`);
      if (task.error.stack) {
        console.error(`  Stack: ${task.error.stack}`);
      }

      // Emit generic error to client
      const genericMessage = "A background operation failed. Please try again if needed.";
      const event = createEventMessage(BackgroundTaskErrorEvent.name, {
        conversationId,
        taskType: type,
        message: genericMessage,
        timestamp: new Date().toISOString(),
      });

      try {
        ws.send(JSON.stringify(event));
      } catch (wsError) {
        console.error("[BACKGROUND_TASK] Failed to send error event to WebSocket:", wsError);
      }

      throw error;
    } finally {
      // Keep completed/failed tasks for a short while for debugging, then cleanup
      setTimeout(() => {
        this.tasks.delete(taskId);
      }, 60000); // 1 minute cleanup
    }
  }

  /**
   * Returns all currently pending tasks
   */
  getPendingTasks(): TrackedTask[] {
    return Array.from(this.tasks.values()).filter((t) => t.state === "pending");
  }
}
