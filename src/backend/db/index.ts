import { db } from "./db";
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
  getOrCreateConversation,
} from "./queries";

// Re-export db and all query functions
export {
  db,
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
  getOrCreateConversation,
};
