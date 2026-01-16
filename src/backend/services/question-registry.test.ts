import { describe, test, expect, mock, beforeEach } from "bun:test";
import { QuestionRegistry } from "./question-registry";

describe("QuestionRegistry", () => {
  let registry: QuestionRegistry;

  beforeEach(() => {
    registry = new QuestionRegistry();
  });

  test("ask should queue questions and process them sequentially", async () => {
    const emit = mock((evt, payload) => {});

    // Start first question (it returns a promise that resolves when answered)
    const askPromise1 = registry.ask({
      conversationId: "conv1",
      question: { type: "permission", title: "Q1", message: "M1" },
      emit,
    });

    // Start second question (should queue)
    const askPromise2 = registry.ask({
      conversationId: "conv1",
      question: { type: "permission", title: "Q2", message: "M2" },
      emit,
    });

    // Wait a tick for async execution
    await new Promise((r) => setTimeout(r, 0));

    // Only first question should be emitted
    expect(emit).toHaveBeenCalledTimes(1);
    const payload1 = emit.mock.calls[0]?.[1];
    if (!payload1) throw new Error("Expected payload");
    expect(payload1.title).toBe("Q1");
    expect(payload1.questionId).toBeDefined();

    // Answer Q1
    registry.answer({
      questionId: payload1.questionId,
      selectedOptionId: "ok",
      conversationId: payload1.conversationId,
    });

    const result1 = await askPromise1;
    expect(result1.answer.selectedOptionId).toBe("ok");

    // Now Q2 should be emitted
    expect(emit).toHaveBeenCalledTimes(2);
    const payload2 = emit.mock.calls[1]?.[1];
    if (!payload2) throw new Error("Expected payload");
    expect(payload2.title).toBe("Q2");

    // Answer Q2
    registry.answer({
      questionId: payload2.questionId,
      selectedOptionId: "ok2",
      conversationId: payload2.conversationId,
    });
    const result2 = await askPromise2;
    expect(result2.answer.selectedOptionId).toBe("ok2");
  });

  test("cancelConversation should reject all pending questions", async () => {
    const emit = mock(() => {});
    const askPromise = registry.ask({
      conversationId: "conv1",
      question: { type: "permission", title: "Q1", message: "M1" },
      emit,
    });

    await new Promise((r) => setTimeout(r, 0));
    registry.cancelConversation("conv1");

    await expect(askPromise).rejects.toThrow("Conversation closed");
  });
});
