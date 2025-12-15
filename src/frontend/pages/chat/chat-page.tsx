import { useState, useEffect, useRef } from "react";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Card } from "@/frontend/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/frontend/components/ui/select";

export default function ChatPage() {
  const [messages, setMessages] = useState<
    { sender: string; text: string; timestamp: string }[]
  >([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [selectedModel, setSelectedModel] = useState("grok-3-mini");
  const [isLoading, setIsLoading] = useState(false);

  const ws = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Connect to WebSocket server
    const connectWebSocket = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const websocketUrl = `${protocol}//${window.location.host}`;

      const socket = new WebSocket(websocketUrl);

      socket.onopen = () => {
        console.log("WebSocket connection established");
        setIsConnected(true);
        setMessages((prev) => [
          ...prev,
          {
            sender: "system",
            text: "Connected to AI Chatbot",
            timestamp: new Date().toISOString(),
          },
        ]);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "ai_response") {
            setMessages((prev) => [
              ...prev,
              {
                sender: "ai",
                text: data.content,
                timestamp: new Date().toISOString(),
              },
            ]);
            setIsLoading(false);
          } else if (data.type === "system") {
            setMessages((prev) => [
              ...prev,
              {
                sender: "system",
                text: data.message,
                timestamp: new Date().toISOString(),
              },
            ]);
          } else {
            // Handle other message types or raw text
            setMessages((prev) => [
              ...prev,
              {
                sender: "system",
                text: event.data,
                timestamp: new Date().toISOString(),
              },
            ]);
          }
        } catch (error) {
          // If not JSON, treat as plain text
          setMessages((prev) => [
            ...prev,
            {
              sender: "system",
              text: event.data,
              timestamp: new Date().toISOString(),
            },
          ]);
        }
      };

      socket.onclose = () => {
        console.log("WebSocket connection closed");
        setIsConnected(false);
        setMessages((prev) => [
          ...prev,
          {
            sender: "system",
            text: "Disconnected from AI Chatbot",
            timestamp: new Date().toISOString(),
          },
        ]);

        // Attempt to reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
      };

      socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        setMessages((prev) => [
          ...prev,
          {
            sender: "system",
            text: "WebSocket error occurred",
            timestamp: new Date().toISOString(),
          },
        ]);
      };

      ws.current = socket;

      return () => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      };
    };

    connectWebSocket();

    return () => {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.close();
      }
    };
  }, []);

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    if (
      !inputMessage.trim() ||
      !ws.current ||
      ws.current.readyState !== WebSocket.OPEN
    ) {
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

    // Send message to WebSocket server
    const messageData = {
      type: "user_message",
      content: inputMessage,
      timestamp: new Date().toISOString(),
    };

    ws.current.send(JSON.stringify(messageData));
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">AI Chat - Grok 4.1</h1>
        <div className="flex items-center">
          <span
            className={`w-2 h-2 rounded-full mr-2 ${
              isConnected ? "bg-green-500" : "bg-red-500"
            }`}
          ></span>
          <span className="text-sm text-gray-600">
            {isConnected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </header>

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
                onChange={(e) => setInputMessage(e.target.value)}
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
