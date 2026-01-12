import { serve, type Server, type ServerWebSocket } from "bun";
import index from "@/frontend/index.html";
import {
  WebSocketMessageSchema,
  type CommandMessage,
  createCommandResult,
  createCommandError,
} from "@/shared/command-system";
import { commandHandlers } from "./command-handlers";
import { runMigrations } from "@/backend/db/migrate";
import { getDockerManager, questionRegistry } from "@/backend/services/coder-runtime";

// Ensure DB schema is up-to-date before serving.
await runMigrations();

// Start periodic cleanup of expired containers
setInterval(() => {
  getDockerManager().cleanupExpired().catch(console.error);
}, 60 * 1000); // Check every minute

const server = serve<{ conversationId?: string }>({
  routes: {
    "/chat-ws": {
      GET(req: Request, server: Server<{ conversationId?: string }>) {
        const url = new URL(req.url);
        const conversationId = url.searchParams.get("conversationId") || undefined;

        const upgraded = server.upgrade(req, {
          data: { conversationId },
        });

        if (!upgraded) {
          return new Response("WebSocket upgrade failed", { status: 400 });
        }
        return undefined;
      },
    },
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },

  websocket: {
    perMessageDeflate: true,

    async open(ws) {
      console.log("WebSocket connected");
      ws.subscribe("chat");
    },

    async message(ws, message: string) {
      try {
        const rawData = JSON.parse(message);
        const validated = WebSocketMessageSchema.parse(rawData);

        if (validated.kind === "command") {
          const command = validated as CommandMessage;

          try {
            const result = await commandHandlers.execute(command.command, command.payload, {
              ws,
              conversationId: ws.data.conversationId,
            });

            const response = createCommandResult(command.command, command.correlationId, result);
            ws.send(JSON.stringify(response));
          } catch (error) {
            const errorId = crypto.randomUUID();
            console.error(`[COMMAND_ERROR] ${command.command} failed (ID: ${errorId}):`, error);

            const errorResponse = createCommandError(
              command.command,
              command.correlationId,
              "COMMAND_FAILED",
              "An internal error occurred. Please try again.",
              { errorId },
            );
            ws.send(JSON.stringify(errorResponse));
          }
        }
      } catch (error) {
        console.error("WebSocket message processing error:", error);
      }
    },

    async close(ws, code, reason) {
      console.log(`WebSocket closed: ${code} - ${reason}`);
      ws.unsubscribe("chat");

      const conversationId = ws.data.conversationId;
      if (conversationId) {
        questionRegistry.cancelConversation(conversationId);
        // Best-effort container cleanup (only if container tool was used).
        try {
          await getDockerManager().destroyContainer(conversationId);
        } catch {
          // ignore
        }
      }
    },
  },
});

console.log(`🚀 Server running at ${server.url}`);
console.log(`🔌 WebSocket server available at ws://${server.hostname}:${server.port}`);
