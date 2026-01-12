import { blob, int, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const conversationsTable = sqliteTable("conversations", {
  id: text("id").primaryKey(), // UUID for conversation ID
  title: text("title").notNull(),
  createdAt: int("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: int("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const messagesTable = sqliteTable("messages", {
  id: int("id").primaryKey({ autoIncrement: true }),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversationsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // 'user' or 'assistant'
  content: text("content").notNull(),
  createdAt: int("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ============================================================================
// Projects (CoderAgent filesystem)
// ============================================================================

/**
 * Global projects users can create/manage.
 *
 * Project contents are stored in SQLite (see projectFilesTable).
 */
export const projectsTable = sqliteTable("projects", {
  id: text("id").primaryKey(), // UUID
  name: text("name").notNull(),
  description: text("description"),
  createdAt: int("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: int("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

/**
 * Project files stored as SQLite BLOBs.
 *
 * `path` is always a project-relative posix-ish path (no leading slash).
 */
export const projectFilesTable = sqliteTable("project_files", {
  id: int("id").primaryKey({ autoIncrement: true }),
  projectId: text("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  content: blob("content", { mode: "buffer" }).notNull(),
  mimeType: text("mime_type"),
  size: int("size").notNull(),
  createdAt: int("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: int("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

/**
 * Conversation → selected project, plus permission mode.
 *
 * One active project per conversation.
 */
export const conversationProjectsTable = sqliteTable("conversation_projects", {
  conversationId: text("conversation_id")
    .primaryKey()
    .references(() => conversationsTable.id, { onDelete: "cascade" }),
  projectId: text("project_id")
    .notNull()
    .references(() => projectsTable.id, { onDelete: "cascade" }),
  permissionMode: text("permission_mode").notNull().default("ask"), // "ask" | "yolo"
  createdAt: int("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: int("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
