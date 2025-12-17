import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import * as schema from './schema';
import { 
  createConversation,
  getConversation,
  getAllConversations,
  getConversationsWithMessages,
  updateConversation,
  deleteConversation,
  addMessage,
  getMessages,
  updateMessage,
  getConversationWithMessages,
  getOrCreateConversation
} from './queries';

const sqlite = new Database(process.env.DB_FILE_NAME || 'sqlite.db');
export const db = drizzle(sqlite, { schema });

// Re-export all query functions
export {
  createConversation,
  getConversation,
  getAllConversations,
  getConversationsWithMessages,
  updateConversation,
  deleteConversation,
  addMessage,
  getMessages,
  updateMessage,
  getConversationWithMessages,
  getOrCreateConversation
};
