import { useState, useEffect, useRef, useCallback } from "react";
import {
  WebSocketMessageSchema,
  registry,
  createCommandMessage,
  type CommandDef,
  type EventDef,
  type WebSocketMessage,
  type CommandResult,
  type CommandError,
  type EventMessage,
} from "@/shared/command-system";

// ============================================================================
// Types
// ============================================================================

type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting" | "failed";

type EventHandler<T = unknown> = (payload: T) => void;

interface PendingCommand {
  command: string;
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

interface UseWebSocketOptions {
  url: string;
  maxRetries?: number;
  autoReconnect?: boolean;
  requestTimeout?: number;
}

interface UseWebSocketReturn {
  connectionState: ConnectionState;
  send: <TReq, TRes>(command: CommandDef<TReq, TRes>, payload: TReq) => Promise<TRes>;
  on: <T>(event: EventDef<T>, handler: EventHandler<T>) => () => void;
  reconnect: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

const calculateBackoff = (retryCount: number): number => {
  const baseDelay = 1000;
  const maxDelay = 30000;
  const exponentialDelay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
  const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);
  return Math.floor(exponentialDelay + jitter);
};

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const { url, maxRetries = 10, autoReconnect = true, requestTimeout = 30000 } = options;

  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [retryCount, setRetryCount] = useState(0);

  const ws = useRef<WebSocket | null>(null);
  const pendingCommands = useRef(new Map<string, PendingCommand>());
  const eventHandlers = useRef(new Map<string, Set<EventHandler>>());
  const reconnectTimeoutRef = useRef<Timer | null>(null);
  const isConnectingRef = useRef(false);
  const isMountedRef = useRef(true);

  // ============================================================================
  // Event Subscription
  // ============================================================================

  const on = useCallback(<T>(event: EventDef<T>, handler: EventHandler<T>): (() => void) => {
    if (!eventHandlers.current.has(event.name)) {
      eventHandlers.current.set(event.name, new Set());
    }
    eventHandlers.current.get(event.name)!.add(handler as EventHandler);

    return () => {
      eventHandlers.current.get(event.name)?.delete(handler as EventHandler);
    };
  }, []);

  // ============================================================================
  // Command Timeout Cleanup
  // ============================================================================

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      pendingCommands.current.forEach((cmd, correlationId) => {
        if (now - cmd.timestamp > requestTimeout) {
          cmd.reject(new Error(`Command ${cmd.command} timed out`));
          pendingCommands.current.delete(correlationId);
        }
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [requestTimeout]);

  // ============================================================================
  // Message Handler
  // ============================================================================

  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const rawData = JSON.parse(event.data);
      const message = WebSocketMessageSchema.parse(rawData) as WebSocketMessage;

      switch (message.kind) {
        case "result": {
          const result = message as CommandResult;
          const pending = pendingCommands.current.get(result.correlationId);
          if (pending) {
            try {
              const validated = registry.validateCommandResponse(result.command, result.payload);
              pending.resolve(validated);
            } catch (error) {
              pending.reject(error instanceof Error ? error : new Error("Validation failed"));
            } finally {
              pendingCommands.current.delete(result.correlationId);
            }
          }
          break;
        }

        case "error": {
          const error = message as CommandError;
          const pending = pendingCommands.current.get(error.correlationId);
          if (pending) {
            pending.reject(new Error(error.error.message));
            pendingCommands.current.delete(error.correlationId);
          }
          break;
        }

        case "event": {
          const evt = message as EventMessage;
          const handlers = eventHandlers.current.get(evt.event);
          if (handlers) {
            try {
              const validated = registry.validateEvent(evt.event, evt.payload);
              handlers.forEach((handler) => handler(validated));
            } catch (error) {
              console.error(`Event validation failed for ${evt.event}:`, error);
            }
          }
          break;
        }
      }
    } catch (error) {
      console.error("Failed to process WebSocket message:", error);
    }
  }, []);

  // ============================================================================
  // Connection Management
  // ============================================================================

  const connect = useCallback(() => {
    if (isConnectingRef.current || retryCount >= maxRetries) return;

    isConnectingRef.current = true;
    setConnectionState(retryCount === 0 ? "connecting" : "reconnecting");

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    try {
      if (ws.current?.readyState !== WebSocket.CLOSED) {
        ws.current?.close();
      }

      const socket = new WebSocket(url);

      socket.onopen = () => {
        isConnectingRef.current = false;
        setRetryCount(0);
        setConnectionState("connected");
      };

      socket.onmessage = handleMessage;

      socket.onerror = () => {
        isConnectingRef.current = false;
      };

      socket.onclose = () => {
        isConnectingRef.current = false;

        if (!isMountedRef.current) {
          setConnectionState("disconnected");
          return;
        }

        if (autoReconnect && retryCount < maxRetries) {
          const delay = calculateBackoff(retryCount);
          setRetryCount((prev) => prev + 1);
          setConnectionState("reconnecting");

          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) connect();
          }, delay);
        } else {
          setConnectionState("failed");
        }
      };

      ws.current = socket;
    } catch (error) {
      isConnectingRef.current = false;
      setConnectionState("failed");
    }
  }, [url, retryCount, maxRetries, autoReconnect, handleMessage]);

  // ============================================================================
  // Send Command
  // ============================================================================

  const send = useCallback(
    <TReq, TRes>(command: CommandDef<TReq, TRes>, payload: TReq): Promise<TRes> => {
      return new Promise((resolve, reject) => {
        if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
          reject(new Error("WebSocket not connected"));
          return;
        }

        try {
          const validated = command.requestSchema.parse(payload);
          const correlationId = crypto.randomUUID();
          const message = createCommandMessage(command.name, validated, correlationId);

          pendingCommands.current.set(correlationId, {
            command: command.name,
            resolve: resolve as (payload: unknown) => void,
            reject,
            timestamp: Date.now(),
          });

          ws.current.send(JSON.stringify(message));
        } catch (error) {
          reject(error instanceof Error ? error : new Error("Failed to send command"));
        }
      });
    },
    [],
  );

  // ============================================================================
  // Manual Reconnect
  // ============================================================================

  const reconnect = useCallback(() => {
    setRetryCount(0);
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    isConnectingRef.current = false;
    connect();
  }, [connect]);

  // ============================================================================
  // Lifecycle
  // ============================================================================

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [url]);

  return {
    connectionState,
    send,
    on,
    reconnect,
  };
}
