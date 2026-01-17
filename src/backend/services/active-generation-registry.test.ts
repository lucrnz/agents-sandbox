import { describe, expect, test, beforeEach } from "bun:test";
import { ActiveGenerationRegistry } from "./active-generation-registry";

describe("ActiveGenerationRegistry", () => {
  beforeEach(() => {
    ActiveGenerationRegistry.abort("conv-a");
    ActiveGenerationRegistry.abort("conv-b");
  });

  test("register stores state and abort returns partial content", () => {
    const controller = new AbortController();
    ActiveGenerationRegistry.register("conv-a", controller);
    ActiveGenerationRegistry.setMessageId("conv-a", 12);
    ActiveGenerationRegistry.updatePartialContent("conv-a", "partial");

    expect(ActiveGenerationRegistry.isActive("conv-a")).toBe(true);
    expect(ActiveGenerationRegistry.getSignal("conv-a")).toBe(controller.signal);

    const result = ActiveGenerationRegistry.abort("conv-a");
    expect(result.aborted).toBe(true);
    expect(result.messageId).toBe(12);
    expect(result.partialContent).toBe("partial");
    expect(ActiveGenerationRegistry.isActive("conv-a")).toBe(false);
  });

  test("register aborts existing generation", () => {
    const firstController = new AbortController();
    ActiveGenerationRegistry.register("conv-a", firstController);

    const secondController = new AbortController();
    ActiveGenerationRegistry.register("conv-a", secondController);

    expect(firstController.signal.aborted).toBe(true);
    expect(ActiveGenerationRegistry.getSignal("conv-a")).toBe(secondController.signal);
  });

  test("complete removes active generation", () => {
    const controller = new AbortController();
    ActiveGenerationRegistry.register("conv-b", controller);

    ActiveGenerationRegistry.complete("conv-b");

    expect(ActiveGenerationRegistry.isActive("conv-b")).toBe(false);
  });
});
