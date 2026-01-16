import { serve, type Server, type ServerWebSocket } from "bun";
import index from "@/frontend/index.html";
import {
  WebSocketMessageSchema,
  type CommandMessage,
  createCommandResult,
  createCommandError,
} from "@/shared/command-system";
import { commandHandlers } from "./command-handlers";
import { getDockerManager, questionRegistry } from "@/backend/services/coder-runtime";
import { createLogger } from "@/backend/logger";

const logger = createLogger("backend:index");

// Start periodic cleanup of expired containers
setInterval(() => {
  getDockerManager()
    .cleanupExpired()
    .catch((error) => logger.error({ error }, "Cleanup expired containers failed"));
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
      logger.info("WebSocket connected");
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
            logger.error({ error, command: command.command, errorId }, "Command handler failed");

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
        logger.error({ error }, "WebSocket message processing error");
      }
    },

    async close(ws, code, reason) {
      logger.info({ code, reason }, "WebSocket closed");
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

logger.info({ url: server.url }, "Server running");
logger.info({ host: server.hostname, port: server.port }, "WebSocket server available");
