/**
 * Registry to track active AI generation tasks by conversation ID.
 * Allows stopping in-progress generation via AbortController.
 */
class ActiveGenerationRegistryClass {
  private activeGenerations = new Map<
    string,
    {
      abortController: AbortController;
      messageId?: number;
      partialContent: string;
    }
  >();

  /**
   * Register a new active generation for a conversation
   */
  register(conversationId: string, abortController: AbortController): void {
    // Abort any existing generation for this conversation
    this.abort(conversationId);

    this.activeGenerations.set(conversationId, {
      abortController,
      partialContent: "",
    });
  }

  /**
   * Update the message ID for a generation (set after message is created)
   */
  setMessageId(conversationId: string, messageId: number): void {
    const generation = this.activeGenerations.get(conversationId);
    if (generation) {
      generation.messageId = messageId;
    }
  }

  /**
   * Update partial content as chunks come in
   */
  updatePartialContent(conversationId: string, content: string): void {
    const generation = this.activeGenerations.get(conversationId);
    if (generation) {
      generation.partialContent = content;
    }
  }

  /**
   * Abort an active generation and return its state
   */
  abort(conversationId: string): {
    aborted: boolean;
    messageId?: number;
    partialContent: string;
  } {
    const generation = this.activeGenerations.get(conversationId);
    if (generation) {
      generation.abortController.abort();
      this.activeGenerations.delete(conversationId);
      return {
        aborted: true,
        messageId: generation.messageId,
        partialContent: generation.partialContent,
      };
    }
    return { aborted: false, partialContent: "" };
  }

  /**
   * Mark a generation as complete (remove from registry)
   */
  complete(conversationId: string): void {
    this.activeGenerations.delete(conversationId);
  }

  /**
   * Check if a generation is active for a conversation
   */
  isActive(conversationId: string): boolean {
    return this.activeGenerations.has(conversationId);
  }

  /**
   * Get the AbortSignal for a conversation's generation
   */
  getSignal(conversationId: string): AbortSignal | undefined {
    return this.activeGenerations.get(conversationId)?.abortController.signal;
  }
}

// Singleton instance
export const ActiveGenerationRegistry = new ActiveGenerationRegistryClass();
