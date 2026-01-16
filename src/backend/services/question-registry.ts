import type { AgentQuestion, AgentQuestionAnswer } from "@/backend/agent/coder-agent";

export type AgentQuestionEventPayload = {
  questionId: string;
  conversationId: string;
  type: "permission" | "choice" | "input";
  title: string;
  message: string;
  options?: Array<{
    id: string;
    label: string;
    inputField?: { placeholder: string };
  }>;
  timestamp: string;
};

type EmitFn = (eventName: string, payload: unknown) => void;

type PendingQuestion = {
  questionId: string;
  conversationId: string;
  question: AgentQuestion;
  createdAt: number;
  expiresAt: number;
  emit: EmitFn;
  resolve: (answer: AgentQuestionAnswer) => void;
  reject: (error: Error) => void;
};

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * In-memory registry of blocking questions.
 *
 * This is intentionally ephemeral: questions are tied to active websocket sessions.
 */
export class QuestionRegistry {
  private pendingById = new Map<string, PendingQuestion>();
  private queuesByConversation = new Map<string, PendingQuestion[]>();

  private cleanupExpired() {
    const now = Date.now();
    for (const [id, pending] of this.pendingById.entries()) {
      if (pending.expiresAt <= now) {
        this.pendingById.delete(id);
        pending.reject(new Error("Question timed out."));
      }
    }
  }

  async ask(input: {
    conversationId: string;
    question: AgentQuestion;
    emit: EmitFn;
    ttlMs?: number;
  }): Promise<{ questionId: string; answer: AgentQuestionAnswer }> {
    this.cleanupExpired();

    const questionId = crypto.randomUUID();
    const now = Date.now();
    const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;

    const promise = new Promise<AgentQuestionAnswer>((resolve, reject) => {
      const pending: PendingQuestion = {
        questionId,
        conversationId: input.conversationId,
        question: input.question,
        createdAt: now,
        expiresAt: now + ttlMs,
        emit: input.emit,
        resolve,
        reject: (err) => reject(err),
      };

      const queue = this.queuesByConversation.get(input.conversationId) ?? [];
      queue.push(pending);
      this.queuesByConversation.set(input.conversationId, queue);

      // Only emit immediately if this is the only pending question for this conversation.
      if (queue.length === 1) {
        this.pendingById.set(questionId, pending);
        this.emitQuestion(pending);
      }
    });

    const answer = await promise;
    return { questionId, answer };
  }

  answer(input: {
    questionId: string;
    selectedOptionId: string;
    inputValue?: string;
    conversationId: string;
  }) {
    this.cleanupExpired();

    const pending = this.pendingById.get(input.questionId);
    if (!pending) {
      throw new Error("No pending question found (already answered or expired).");
    }

    if (pending.conversationId !== input.conversationId) {
      throw new Error("Question does not belong to this conversation.");
    }

    this.pendingById.delete(input.questionId);

    // Remove from the queue head
    const queue = this.queuesByConversation.get(pending.conversationId) ?? [];
    const idx = queue.findIndex((q) => q.questionId === input.questionId);
    if (idx !== -1) queue.splice(idx, 1);

    // Resolve the promise
    pending.resolve({ selectedOptionId: input.selectedOptionId, inputValue: input.inputValue });

    // Emit next question if queued
    const next = queue[0];
    if (next) {
      this.pendingById.set(next.questionId, next);
      this.emitQuestion(next);
    } else {
      this.queuesByConversation.delete(pending.conversationId);
    }
  }

  cancelConversation(conversationId: string) {
    const queue = this.queuesByConversation.get(conversationId);
    if (!queue?.length) return;

    for (const pending of queue) {
      this.pendingById.delete(pending.questionId);
      pending.reject(new Error("Conversation closed."));
    }
    this.queuesByConversation.delete(conversationId);
  }

  private emitQuestion(pending: PendingQuestion) {
    const payload: AgentQuestionEventPayload = {
      questionId: pending.questionId,
      conversationId: pending.conversationId,
      type: pending.question.type,
      title: pending.question.title,
      message: pending.question.message,
      options: pending.question.options,
      timestamp: new Date().toISOString(),
    };

    pending.emit("agent_question", payload);
  }
}
