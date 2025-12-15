import { serve, type Server } from "bun";
import index from "../frontend/index.html";
import { randomUUID } from "node:crypto";
import {
  validateIncomingMessage,
  createSystemMessage,
  createAIResponse,
  type IncomingMessage,
  type UserMessage,
} from "../shared/websocket-schemas";

const server = serve<{ userId: string }>({
  routes: {
    // WebSocket endpoint - must come before catch-all route
    "/chat-ws": {
      GET(req: Request, server: Server<unknown>) {
        const upgraded = server.upgrade(req, {
          data: { userId: randomUUID() },
        });

        if (!upgraded) {
          return new Response("WebSocket upgrade failed", { status: 400 });
        }
        return undefined;
      },
    },
    // Serve index.html for all other routes (fullstack bundling)
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },

  // WebSocket configuration
  websocket: {
    perMessageDeflate: true,
    // Called when a new WebSocket connection is opened
    open(ws) {
      const welcomeMessage = createSystemMessage(
        "Welcome! You are connected to the AI Chatbot server"
      );
      ws.send(JSON.stringify(welcomeMessage));

      ws.subscribe("chat");
    },

    // Called when a message is received
    async message(ws, message: string) {
      try {
        // Parse and validate incoming message with Zod
        const rawData = JSON.parse(message);
        const validatedMessage: IncomingMessage = validateIncomingMessage(rawData);

        if (validatedMessage.type === "user_message") {
          // Handle AI chatbot message
          const userMessage: UserMessage = validatedMessage;
          const userContent = userMessage.content;

          // Send typing indicator
          const thinkingMessage = createSystemMessage("AI is thinking...");
          ws.send(JSON.stringify(thinkingMessage));

          try {
            // Import dynamically to handle potential API key issues gracefully
            const { xai } = await import("@ai-sdk/xai");
            const { generateText } = await import("ai");

            console.log("Generating AI Response...");
            const result = await generateText({
              model: xai("grok-4-1-fast-non-reasoning"),
              prompt: userContent,
            });

            console.log("AI Response:", result.text);

            // Send AI response with type safety
            const aiResponse = createAIResponse(result.text);
            ws.send(JSON.stringify(aiResponse));
          } catch (aiError: unknown) {
            console.error("AI Error:", aiError);
            const errorMessage = createSystemMessage(
              "Failed to generate AI response: " +
                (aiError instanceof Error
                  ? aiError.message
                  : "Unknown error"),
              true // error flag
            );
            ws.send(JSON.stringify(errorMessage));
          }
        } else {
          // Handle other message types (future extension)
          console.log("Received unsupported message type:", validatedMessage.type);
          const unsupportedMessage = createSystemMessage(
            "Message received but not processed as AI request"
          );
          ws.send(JSON.stringify(unsupportedMessage));
        }
      } catch (parseError: unknown) {
        // Handle JSON parse errors and validation errors
        console.error("Error processing message:", { message, parseError });
        const errorMessage = createSystemMessage(
          "We are sorry, but we are not able to process your message. Please try again later."
        );
        ws.send(JSON.stringify(errorMessage));
      }
    },

    // Called when a connection is closed
    close(ws, code, reason) {
      console.log(`WebSocket connection closed: ${code} - ${reason}`);
      ws.unsubscribe("chat");
    },
  },
});

console.log(`🚀 Server running at ${server.url}`);
console.log(
  `🔌 WebSocket server available at ws://${server.hostname}:${server.port}`
);
