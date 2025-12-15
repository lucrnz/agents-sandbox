import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Card } from "@/frontend/components/ui/card";
import { useWebSocket } from "@/frontend/hooks/useWebSocket";
import type {
  AnyMessage,
  SystemMessage,
  AIResponse,
} from "@/shared/websocket-schemas";

export default function ChatPage() {
  const [messages, setMessages] = useState<
    { sender: string; text: string; timestamp: string }[]
  >([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // WebSocket connection with typed messages only
  const {
    ws,
    connectionState,
    sendMessage: sendTypedMessage,
    sendUserMessage,
    reconnect,
    retryCount,
    maxRetries,
  } = useWebSocket(
    `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${
      window.location.host
    }/chat-ws`,
    {
      // Handle all typed messages
      onMessage: (message: AnyMessage) => {
        switch (message.type) {
          case "ai_response": {
            const aiMessage = message as AIResponse;
            setMessages((prev) => [
              ...prev,
              {
                sender: "ai",
                text: aiMessage.content,
                timestamp: aiMessage.timestamp,
              },
            ]);
            setIsLoading(false);
            break;
          }
          case "system": {
            const systemMessage = message as SystemMessage;
            setMessages((prev) => [
              ...prev,
              {
                sender: "system",
                text: systemMessage.message,
                timestamp: new Date().toISOString(),
              },
            ]);
            break;
          }
          default:
            console.warn("Received unknown message type:", message);
            break;
        }
      },
      onConnectionStateChange: (state, prevState) => {
        // Add system messages for state transitions
        if (state === "connected" && prevState !== "connected") {
          setMessages((prev) => [
            ...prev,
            {
              sender: "system",
              text: "Connected to AI Chatbot",
              timestamp: new Date().toISOString(),
            },
          ]);
        } else if (state === "failed") {
          setMessages((prev) => [
            ...prev,
            {
              sender: "system",
              text: `Connection failed after ${maxRetries} attempts. Click retry to reconnect.`,
              timestamp: new Date().toISOString(),
            },
          ]);
        }
      },
    }
  );

  // Derive connection status
  const isConnected = connectionState === "connected";

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    if (!inputMessage.trim() || connectionState !== "connected") {
      return;
    }

    const userMessage = {
      sender: "user",
      text: inputMessage,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);

    // Send message using typed function for type safety
    const success = sendUserMessage(inputMessage);
    
    if (!success) {
      console.error("Failed to send message");
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Get connection status display
  const getStatusDisplay = () => {
    switch (connectionState) {
      case "connected":
        return { color: "bg-green-500", text: "Connected" };
      case "connecting":
        return { color: "bg-yellow-500", text: "Connecting..." };
      case "reconnecting":
        return {
          color: "bg-orange-500",
          text: `Reconnecting (${retryCount}/${maxRetries})...`,
        };
      case "failed":
        return { color: "bg-red-500", text: "Connection Failed" };
      case "disconnected":
        return { color: "bg-gray-500", text: "Disconnected" };
    }
  };

  const status = getStatusDisplay();

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">AI Chat - Grok 4.1</h1>
        <div className="flex items-center">
          <span className={`w-2 h-2 rounded-full mr-2 ${status.color}`}></span>
          <span className="text-sm text-gray-600">{status.text}</span>
        </div>
      </header>

      {/* Manual reconnect UI when connection fails */}
      {connectionState === "failed" && (
        <div className="mx-4 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <p className="text-red-800">
            Connection failed after {maxRetries} attempts
          </p>
          <Button onClick={reconnect} variant="outline" size="sm">
            Retry Connection
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-hidden p-4">
        <Card className="h-full flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500">
                  Start a conversation with the AI...
                </p>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${
                    message.sender === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-xs md:max-w-md lg:max-w-lg xl:max-w-xl rounded-lg p-3 ${
                      message.sender === "user"
                        ? "bg-blue-500 text-white"
                        : message.sender === "ai"
                        ? "bg-gray-200 text-gray-800"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.text}</p>
                    <p
                      className={`text-xs mt-1 ${
                        message.sender === "user"
                          ? "text-blue-100"
                          : "text-gray-500"
                      }`}
                    >
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-200 text-gray-800 rounded-lg p-3 max-w-xs md:max-w-md">
                  <p className="whitespace-pre-wrap">Thinking...</p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t p-4 bg-white">
            <div className="flex gap-2">
              <Input
                type="text"
                value={inputMessage}
                onInput={(e) =>
                  setInputMessage((e.target as HTMLInputElement).value)
                }
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                disabled={!isConnected || isLoading}
                className="flex-1"
              />
              <Button
                onClick={sendMessage}
                disabled={!isConnected || isLoading || !inputMessage.trim()}
              >
                Send
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-2">AI Generated Response</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
