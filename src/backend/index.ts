import { serve, type Server } from "bun";
import index from "../frontend/index.html";

const server = serve<{ username: string }>({
  routes: {
    // WebSocket endpoint - must come before catch-all route
    "/chat-ws": {
      GET(req: Request, server: Server<unknown>) {
        const upgraded = server.upgrade(req, {
          data: { username: "anonymous" },
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
      ws.send(
        JSON.stringify({
          type: "system",
          message: "Welcome! You are connected to the AI Chatbot server",
        })
      );

      ws.subscribe("chat");
    },

    // Called when a message is received
    async message(ws: any, message: string) {
      try {
        // Try to parse as JSON
        const data = JSON.parse(message);

        console.log("[BACKEND] Parsed data:", data);

        if (data.type === "user_message") {
          // Handle AI chatbot message
          const userMessage = data.content;

          // Send typing indicator
          ws.send(
            JSON.stringify({
              type: "system",
              message: "AI is thinking...",
            })
          );

          try {
            // Import dynamically to handle potential API key issues gracefully
            const { xai } = await import("@ai-sdk/xai");
            const { generateText } = await import("ai");

            console.log("Generating AI Response...");
            const result = await generateText({
              model: xai("grok-4-1-fast-non-reasoning"),
              prompt: userMessage,
            });

            console.log("AI Response:", result.text);

            // Send AI response
            ws.send(
              JSON.stringify({
                type: "ai_response",
                content: result.text,
                timestamp: new Date().toISOString(),
              })
            );
          } catch (aiError: unknown) {
            console.error("AI Error:", aiError);
            ws.send(
              JSON.stringify({
                type: "system",
                message:
                  "Failed to generate AI response: " +
                  (aiError instanceof Error
                    ? aiError.message
                    : "Unknown error"),
                error: true,
              })
            );
          }
        } else {
          // Handle other message types
          console.log("Received non-user_message:", data);
          ws.send(
            JSON.stringify({
              type: "system",
              message: "Message received but not processed as AI request",
            })
          );
        }
      } catch (parseError: unknown) {
        // If not JSON, treat as plain text and echo back
        console.error("Received non-JSON message:", { message, parseError });
        ws.send(
          JSON.stringify({
            type: "system",
            message:
              "We are sorry, but we are not able to process your message. Please try again later.",
          })
        );
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
