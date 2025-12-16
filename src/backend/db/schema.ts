import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';


export const conversationsTable = sqliteTable('conversations', {
  id: text('id').primaryKey(), // UUID for conversation ID
  title: text('title').notNull(),
  createdAt: int('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: int('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const messagesTable = sqliteTable('messages', {
  id: int('id').primaryKey({ autoIncrement: true }),
  conversationId: text('conversation_id').notNull().references(() => conversationsTable.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' or 'assistant'
  content: text('content').notNull(),
  createdAt: int('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
