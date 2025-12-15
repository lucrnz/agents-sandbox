import { serve, type Server } from "bun";
import index from "../frontend/index.html";

const server = serve<{ username: string }>({
  routes: {
    // WebSocket endpoint - must come before catch-all route
    "/chat-ws": {
      GET(req: Request, server: Server<unknown>) {
        console.log("[BACKEND] WebSocket upgrade request received");
        console.log("[BACKEND] Request URL:", req.url);
        console.log(
          "[BACKEND] Request headers:",
          Object.fromEntries(req.headers.entries())
        );

        const upgraded = server.upgrade(req, {
          data: { username: "anonymous" },
        });

        console.log("[BACKEND] Upgrade result:", upgraded);

        if (!upgraded) {
          console.log("[BACKEND] WebSocket upgrade failed");
          return new Response("WebSocket upgrade failed", { status: 400 });
        }

        console.log("[BACKEND] WebSocket upgrade successful");
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
      console.log("\n========================================");
      console.log(`[BACKEND] WebSocket OPEN event triggered`);
      console.log(`[BACKEND] Remote address: ${ws.remoteAddress}`);
      console.log("========================================\n");

      ws.data.username = "anonymous";

      // Send welcome message as JSON
      ws.send(
        JSON.stringify({
          type: "system",
          message: "Welcome! You are connected to the AI Chatbot server",
        })
      );

      ws.subscribe("chat");

      // Test ping to verify connection
      setTimeout(() => {
        console.log("[BACKEND] Sending test ping");
        try {
          ws.send(JSON.stringify({ type: "ping", message: "test" }));
          console.log("[BACKEND] Ping sent successfully");
        } catch (error) {
          console.error("[BACKEND] Error sending ping:", error);
        }
      }, 2000);
    },

    // Called when a message is received
    async message(ws: any, message: string | Buffer) {
      console.log("\n========================================");
      console.log(`[BACKEND] MESSAGE HANDLER CALLED!`);
      console.log(`[BACKEND] Raw message type: ${typeof message}`);
      console.log(`[BACKEND] Raw message:`, message);
      console.log("========================================\n");

      // Convert message to string if it's not already
      let messageString: string;
      if (typeof message === "string") {
        messageString = message;
      } else if (message instanceof Buffer) {
        messageString = message.toString("utf8");
      } else {
        messageString = String(message);
      }
      console.log("\n========================================");
      console.log(`[BACKEND] Received WebSocket message`);
      console.log(`[BACKEND] Message type: ${typeof message}`);
      console.log(`[BACKEND] Message content:`, messageString);
      console.log("========================================\n");

      try {
        // Try to parse as JSON
        const data = JSON.parse(messageString);

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
        console.log("Received non-JSON message:", messageString);
        ws.send(
          JSON.stringify({
            type: "system",
            message: `You said: ${messageString}`,
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
