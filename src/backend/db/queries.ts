import { db } from "./db";
import {
  conversationProjectsTable,
  conversationsTable,
  messagesTable,
  projectFilesTable,
  projectsTable,
} from "./schema";
import { and, desc, eq, like, or } from "drizzle-orm";
import { randomUUID } from "crypto";
import { Buffer } from "buffer";

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

  const created = result[0];
  if (!created) throw new Error("Failed to create conversation");
  return created;
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

  const created = result[0];
  if (!created) throw new Error("Failed to create message");
  return created;
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

// ============================================================================
// Project operations
// ============================================================================

export const DEFAULT_PROJECT_ID = "default-project";
export const DEFAULT_PROJECT_NAME = "Default project";

export async function getProject(projectId: string) {
  const rows = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  return rows[0] || null;
}

export async function listProjects() {
  return await db.select().from(projectsTable).orderBy(desc(projectsTable.updatedAt));
}

export async function createProject(input: { name: string; description?: string }) {
  const projectId = randomUUID();
  const result = await db
    .insert(projectsTable)
    .values({
      id: projectId,
      name: input.name,
      description: input.description,
    })
    .returning();

  const created = result[0];
  if (!created) throw new Error("Failed to create project");
  return created;
}

export async function deleteProject(projectId: string) {
  await db.delete(projectsTable).where(eq(projectsTable.id, projectId));
}

export async function ensureDefaultProject() {
  const existing = await getProject(DEFAULT_PROJECT_ID);
  if (existing) return existing;

  const created = await db
    .insert(projectsTable)
    .values({
      id: DEFAULT_PROJECT_ID,
      name: DEFAULT_PROJECT_NAME,
      description: "Catch-all project for files created without selecting a project.",
    })
    .returning();

  const project = created[0];
  if (!project) throw new Error("Failed to create default project");
  return project;
}

export async function listProjectFiles(projectId: string) {
  return await db
    .select()
    .from(projectFilesTable)
    .where(eq(projectFilesTable.projectId, projectId))
    .orderBy(desc(projectFilesTable.updatedAt));
}

export async function getProjectFile(projectId: string, path: string) {
  const rows = await db
    .select()
    .from(projectFilesTable)
    .where(and(eq(projectFilesTable.projectId, projectId), eq(projectFilesTable.path, path)));
  return rows[0] || null;
}

export async function upsertProjectFile(input: {
  projectId: string;
  path: string;
  content: Buffer;
  mimeType?: string;
}) {
  const existing = await getProjectFile(input.projectId, input.path);
  const size = input.content.byteLength;

  if (existing) {
    const updated = await db
      .update(projectFilesTable)
      .set({
        content: input.content,
        size,
        mimeType: input.mimeType,
        updatedAt: new Date(),
      })
      .where(eq(projectFilesTable.id, existing.id))
      .returning();
    const row = updated[0];
    if (!row) throw new Error("Failed to update project file");
    return row;
  }

  const inserted = await db
    .insert(projectFilesTable)
    .values({
      projectId: input.projectId,
      path: input.path,
      content: input.content,
      size,
      mimeType: input.mimeType,
    })
    .returning();

  // Touch project updatedAt
  await db
    .update(projectsTable)
    .set({ updatedAt: new Date() })
    .where(eq(projectsTable.id, input.projectId));

  const row = inserted[0];
  if (!row) throw new Error("Failed to create project file");
  return row;
}

export async function deleteProjectFile(projectId: string, path: string) {
  await db
    .delete(projectFilesTable)
    .where(and(eq(projectFilesTable.projectId, projectId), eq(projectFilesTable.path, path)));
  await db
    .update(projectsTable)
    .set({ updatedAt: new Date() })
    .where(eq(projectsTable.id, projectId));
}

export async function deleteProjectPathPrefix(projectId: string, prefix: string) {
  const rows = await db
    .delete(projectFilesTable)
    .where(
      and(
        eq(projectFilesTable.projectId, projectId),
        or(eq(projectFilesTable.path, prefix), like(projectFilesTable.path, `${prefix}/%`)),
      ),
    )
    .returning({ id: projectFilesTable.id });

  await db
    .update(projectsTable)
    .set({ updatedAt: new Date() })
    .where(eq(projectsTable.id, projectId));

  return rows.length;
}

export async function getConversationProject(conversationId: string) {
  const rows = await db
    .select()
    .from(conversationProjectsTable)
    .where(eq(conversationProjectsTable.conversationId, conversationId));
  return rows[0] || null;
}

export async function setConversationProject(input: {
  conversationId: string;
  projectId: string;
  permissionMode?: "ask" | "yolo";
}) {
  const mode = input.permissionMode ?? "ask";

  const inserted = await db
    .insert(conversationProjectsTable)
    .values({
      conversationId: input.conversationId,
      projectId: input.projectId,
      permissionMode: mode,
    })
    .onConflictDoUpdate({
      target: conversationProjectsTable.conversationId,
      set: {
        projectId: input.projectId,
        permissionMode: mode,
        updatedAt: new Date(),
      },
    })
    .returning();

  const row = inserted[0];
  if (!row) throw new Error("Failed to set conversation project");
  return row;
}

export async function setConversationPermissionMode(input: {
  conversationId: string;
  permissionMode: "ask" | "yolo";
}) {
  const updated = await db
    .update(conversationProjectsTable)
    .set({ permissionMode: input.permissionMode, updatedAt: new Date() })
    .where(eq(conversationProjectsTable.conversationId, input.conversationId))
    .returning();
  return updated[0] || null;
}
