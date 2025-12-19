import { db } from "./db";
import { conversationsTable, messagesTable } from "./schema";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

// Conversation operations
export async function createConversation(title?: string) {
  const conversationId = randomUUID();
  const conversationTitle = title || `New chat ${new Date().toLocaleString()}`;

  const result = await db
    .insert(conversationsTable)
    .values({
      id: conversationId,
      title: conversationTitle,
    })
    .returning();

  return result[0];
}

export async function getConversation(conversationId: string) {
  const conversation = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId));

  return conversation[0] || null;
}

export async function getAllConversations() {
  return await db.select().from(conversationsTable).orderBy(desc(conversationsTable.updatedAt));
}

export async function getConversationsWithMessages() {
  return await db
    .select({
      id: conversationsTable.id,
      title: conversationsTable.title,
      createdAt: conversationsTable.createdAt,
      updatedAt: conversationsTable.updatedAt,
    })
    .from(conversationsTable)
    .innerJoin(messagesTable, eq(conversationsTable.id, messagesTable.conversationId))
    .groupBy(conversationsTable.id)
    .orderBy(desc(conversationsTable.updatedAt));
}

export async function updateConversation(conversationId: string, data: { title?: string }) {
  const result = await db
    .update(conversationsTable)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(conversationsTable.id, conversationId))
    .returning();

  return result[0];
}

export async function deleteConversation(conversationId: string) {
  await db.delete(conversationsTable).where(eq(conversationsTable.id, conversationId));
}

// Message operations
export async function addMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
) {
  const result = await db
    .insert(messagesTable)
    .values({
      conversationId,
      role,
      content,
    })
    .returning();

  // Update conversation's updatedAt
  await db
    .update(conversationsTable)
    .set({ updatedAt: new Date() })
    .where(eq(conversationsTable.id, conversationId));

  return result[0];
}

export async function getMessages(conversationId: string) {
  return await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(messagesTable.createdAt);
}

export async function updateMessage(messageId: number, content: string) {
  const result = await db
    .update(messagesTable)
    .set({ content })
    .where(eq(messagesTable.id, messageId))
    .returning();

  return result[0];
}

export async function getConversationWithMessages(conversationId: string) {
  const conversation = await getConversation(conversationId);
  if (!conversation) return null;

  const messages = await getMessages(conversationId);

  return {
    ...conversation,
    messages,
  };
}

// Helper function to get or create conversation
export async function getOrCreateConversation(conversationId?: string) {
  if (conversationId) {
    const conversation = await getConversation(conversationId);
    if (conversation) return conversation;
  }

  // Create new conversation if none exists or ID not found
  return await createConversation();
}
