import { useState, useEffect, useRef, useCallback } from "react";
import {
  validateAnyMessage,
  createUserMessage,
  type AnyMessage,
  type UserMessage,
} from "@/shared/websocket-schemas";

// Connection state machine
export type ConnectionState =
  | "disconnected" // Initial state, not yet connected
  | "connecting" // Attempting initial connection
  | "connected" // Successfully connected
  | "reconnecting" // Attempting to reconnect after disconnect
  | "failed"; // Max retries exceeded

// Hook options interface
export interface UseWebSocketOptions {
  onOpen?: (event: Event) => void;
  onMessage?: (message: AnyMessage) => void; // Only typed messages now
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
  onConnectionStateChange?: (
    state: ConnectionState,
    prevState: ConnectionState
  ) => void;
  maxRetries?: number;
  autoReconnect?: boolean;
}

// Hook return interface
export interface UseWebSocketReturn {
  ws: React.RefObject<WebSocket | null>;
  connectionState: ConnectionState;
  sendMessage: (message: UserMessage) => boolean; // Primary send function
  sendUserMessage: (content: string) => boolean; // Convenience function
  reconnect: () => void;
  retryCount: number;
  maxRetries: number;
}

// Calculate exponential backoff with jitter
const calculateBackoff = (retryCount: number): number => {
  const baseDelay = 1000; // 1 second
  const maxDelay = 30000; // 30 seconds max
  const exponentialDelay = Math.min(
    baseDelay * Math.pow(2, retryCount),
    maxDelay
  );
  // Add ±20% jitter to prevent thundering herd
  const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);
  return Math.floor(exponentialDelay + jitter);
};

export function useWebSocket(
  url: string,
  options: UseWebSocketOptions = {}
): UseWebSocketReturn {
  // State
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const [retryCount, setRetryCount] = useState(0);

  // Refs for cleanup and race prevention
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<Timer | null>(null);
  const isConnectingRef = useRef(false);
  const isMountedRef = useRef(true);
  const manuallyDisconnectedRef = useRef(false);
  const previousStateRef = useRef<ConnectionState>("disconnected");

  // Constants
  const maxRetries = options.maxRetries ?? 10;
  const autoReconnect = options.autoReconnect ?? true;

  // Helper to clear reconnect timeout
  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // Helper to update connection state
  const updateConnectionState = useCallback(
    (newState: ConnectionState) => {
      if (!isMountedRef.current) return;

      const prevState = previousStateRef.current;
      setConnectionState(newState);
      previousStateRef.current = newState;

      // Call state change callback
      if (options.onConnectionStateChange && prevState !== newState) {
        options.onConnectionStateChange(newState, prevState);
      }
    },
    [options.onConnectionStateChange]
  );

  // Main connection function
  const connectWebSocket = useCallback(() => {
    // Prevent race conditions
    if (isConnectingRef.current) {
      console.log("Connection already in progress, skipping");
      return;
    }

    // Prevent exceeding max retries
    if (retryCount >= maxRetries) {
      console.log(`Max retries (${maxRetries}) exceeded`);
      updateConnectionState("failed");
      return;
    }

    // Clear any pending reconnection
    clearReconnectTimeout();

    // Set connecting flag and state
    isConnectingRef.current = true;
    updateConnectionState(retryCount === 0 ? "connecting" : "reconnecting");

    console.log(
      `WebSocket connection attempt ${retryCount + 1}/${maxRetries}...`
    );

    try {
      // Close existing connection if any
      if (ws.current && ws.current.readyState !== WebSocket.CLOSED) {
        ws.current.close();
      }

      // Create new WebSocket
      const socket = new WebSocket(url);

      // Setup event handlers
      socket.onopen = (event) => {
        console.log("WebSocket connection established");
        isConnectingRef.current = false;
        setRetryCount(0); // Reset retry count on successful connection
        updateConnectionState("connected");

        if (options.onOpen) {
          options.onOpen(event);
        }
      };

      socket.onmessage = (event) => {
        if (options.onMessage) {
          try {
            const rawData = JSON.parse(event.data);
            const validatedMessage = validateAnyMessage(rawData);
            options.onMessage(validatedMessage);
          } catch (error) {
            console.error("Failed to validate incoming WebSocket message:", {
              data: event.data,
              error,
            });
          }
        }
      };

      socket.onerror = (event) => {
        console.error("WebSocket error occurred");
        isConnectingRef.current = false;

        if (options.onError) {
          options.onError(event);
        }
      };

      socket.onclose = (event) => {
        console.log(
          `WebSocket connection closed: ${event.code} - ${event.reason}`
        );
        isConnectingRef.current = false;

        // Don't reconnect if manually disconnected or component unmounted
        if (manuallyDisconnectedRef.current || !isMountedRef.current) {
          updateConnectionState("disconnected");
          if (options.onClose) {
            options.onClose(event);
          }
          return;
        }

        // Attempt reconnection if auto-reconnect is enabled
        if (autoReconnect && retryCount < maxRetries) {
          const delay = calculateBackoff(retryCount);
          console.log(`Reconnecting in ${delay}ms...`);

          setRetryCount((prev) => prev + 1);
          updateConnectionState("reconnecting");

          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              connectWebSocket();
            }
          }, delay);
        } else {
          updateConnectionState("failed");
        }

        if (options.onClose) {
          options.onClose(event);
        }
      };

      ws.current = socket;
    } catch (error) {
      console.error("Error creating WebSocket:", error);
      isConnectingRef.current = false;
      updateConnectionState("failed");
    }
  }, [
    url,
    retryCount,
    maxRetries,
    autoReconnect,
    options.onOpen,
    options.onMessage,
    options.onError,
    options.onClose,
    updateConnectionState,
    clearReconnectTimeout,
  ]);

  // Send typed message function (primary send method)
  const sendMessage = useCallback((message: UserMessage): boolean => {
    console.log("[useWebSocket] sendMessage called with:", message);
    
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      console.warn("Cannot send message: WebSocket is not connected");
      return false;
    }

    try {
      const messageString = JSON.stringify(message);
      console.log("[useWebSocket] Sending message:", messageString);
      ws.current.send(messageString);
      console.log("[useWebSocket] Message sent successfully");
      return true;
    } catch (error) {
      console.error("Error sending WebSocket message:", error);
      return false;
    }
  }, []);

  // Convenience function to send user messages
  const sendUserMessage = useCallback((content: string): boolean => {
    const userMessage = createUserMessage(content);
    return sendMessage(userMessage);
  }, [sendMessage]);

  // Manual reconnect function (resets retry count)
  const reconnect = useCallback(() => {
    console.log("Manual reconnection triggered");
    manuallyDisconnectedRef.current = false;
    setRetryCount(0);
    clearReconnectTimeout();
    isConnectingRef.current = false;
    connectWebSocket();
  }, [connectWebSocket, clearReconnectTimeout]);

  // Initial connection and cleanup
  useEffect(() => {
    isMountedRef.current = true;
    manuallyDisconnectedRef.current = false;

    // Start initial connection
    connectWebSocket();

    // Cleanup function - don't close WebSocket to prevent hot reload issues
    return () => {
      console.log(
        "useWebSocket cleanup: unmounting (keeping WebSocket alive for hot reload)"
      );
      isMountedRef.current = false;
      manuallyDisconnectedRef.current = true;

      // Clear pending timeouts
      clearReconnectTimeout();

      // Don't close WebSocket - let it persist across hot reloads
      // The WebSocket will be cleaned up when the page unloads
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]); // Only reconnect if URL changes

  return {
    ws,
    connectionState,
    sendMessage,
    sendUserMessage,
    reconnect,
    retryCount,
    maxRetries,
  };
}
