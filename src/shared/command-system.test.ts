import { test, expect, describe } from "bun:test";
import {
  registry,
  createCommandMessage,
  createCommandResult,
  createCommandError,
  createEventMessage,
  CommandMessageSchema,
  CommandResultSchema,
  CommandErrorSchema,
  EventMessageSchema,
  WebSocketMessageSchema,
} from "./command-system";
import { z } from "zod";

describe("Command System", () => {
  describe("Registry", () => {
    const TestCommand = registry.command(
      "test_command",
      z.object({ input: z.string() }),
      z.object({ output: z.number() }),
    );

    const TestEvent = registry.event("test_event", z.object({ data: z.boolean() }));

    test("should retrieve registered command", () => {
      const cmd = registry.getCommand("test_command");
      expect(cmd).toBe(TestCommand);
    });

    test("should retrieve registered event", () => {
      const evt = registry.getEvent("test_event");
      expect(evt).toBe(TestEvent);
    });

    test("should validate command request", () => {
      const payload = { input: "hello" };
      const result = registry.validateCommandRequest("test_command", payload);
      expect(result).toEqual(payload);
    });

    test("should throw on invalid command request", () => {
      const payload = { input: 123 };
      expect(() => registry.validateCommandRequest("test_command", payload)).toThrow();
    });

    test("should validate command response", () => {
      const payload = { output: 42 };
      const result = registry.validateCommandResponse("test_command", payload);
      expect(result).toEqual(payload);
    });

    test("should validate event", () => {
      const payload = { data: true };
      const result = registry.validateEvent("test_event", payload);
      expect(result).toEqual(payload);
    });

    test("should throw for unknown command", () => {
      expect(() => registry.validateCommandRequest("unknown", {})).toThrow(/Unknown command/);
    });
  });

  describe("Helper Functions", () => {
    test("createCommandMessage should create a valid message", () => {
      const payload = { input: "test" };
      const msg = createCommandMessage("test_cmd", payload, "123-uuid");

      expect(msg.kind).toBe("command");
      expect(msg.command).toBe("test_cmd");
      expect(msg.payload).toEqual(payload);
      expect(msg.correlationId).toBe("123-uuid");
      expect(msg.timestamp).toBeDefined();
    });

    test("createCommandResult should create a valid result", () => {
      const payload = { output: 100 };
      const res = createCommandResult("test_cmd", "123-uuid", payload);

      expect(res.kind).toBe("result");
      expect(res.command).toBe("test_cmd");
      expect(res.payload).toEqual(payload);
      expect(res.correlationId).toBe("123-uuid");
      expect(res.timestamp).toBeDefined();
    });

    test("createCommandError should create a valid error", () => {
      const err = createCommandError("test_cmd", "123-uuid", "ERR_CODE", "Something went wrong", {
        detail: "info",
      });

      expect(err.kind).toBe("error");
      expect(err.command).toBe("test_cmd");
      expect(err.correlationId).toBe("123-uuid");
      expect(err.error.code).toBe("ERR_CODE");
      expect(err.error.message).toBe("Something went wrong");
      expect(err.error.details).toEqual({ detail: "info" });
    });

    test("createEventMessage should create a valid event", () => {
      const payload = { data: true };
      const evt = createEventMessage("test_evt", payload);

      expect(evt.kind).toBe("event");
      expect(evt.event).toBe("test_evt");
      expect(evt.payload).toEqual(payload);
    });
  });

  describe("Zod Schemas", () => {
    test("WebSocketMessageSchema should validate various message kinds", () => {
      const cmd = createCommandMessage("cmd", {}, crypto.randomUUID());
      expect(WebSocketMessageSchema.parse(cmd)).toEqual(cmd);

      const res = createCommandResult("cmd", crypto.randomUUID(), {});
      expect(WebSocketMessageSchema.parse(res)).toEqual(res);

      const err = createCommandError("cmd", crypto.randomUUID(), "CODE", "MSG");
      expect(WebSocketMessageSchema.parse(err)).toEqual(err);

      const evt = createEventMessage("evt", {});
      expect(WebSocketMessageSchema.parse(evt)).toEqual(evt);
    });
  });
});
