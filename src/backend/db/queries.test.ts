import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { conversationsTable, messagesTable } from "./schema";
import * as queries from "./queries";
import { eq } from "drizzle-orm";

// Create in-memory test database
const sqlite = new Database(":memory:");
const testDb = drizzle(sqlite);

// Mock the db module
mock.module("./db", () => ({
  db: testDb,
}));

describe("Database Queries", () => {
  beforeEach(async () => {
    // Enable foreign keys
    sqlite.run("PRAGMA foreign_keys = ON;");

    // Setup schema
    sqlite.run("DROP TABLE IF EXISTS messages");
    sqlite.run("DROP TABLE IF EXISTS conversations");
    sqlite.run(`
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    sqlite.run(`
      CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
  });

  describe("Conversations", () => {
    test("should create a conversation", async () => {
      const conv = await queries.createConversation("Test Title");
      expect(conv.id).toBeDefined();
      expect(conv.title).toBe("Test Title");

      const found = await queries.getConversation(conv.id);
      expect(found).toEqual(conv);
    });

    test("should get all conversations ordered by updatedAt", async () => {
      const c1 = await queries.createConversation("C1");
      // Wait a bit to ensure different timestamps if needed, but here we can manually update
      const c2 = await queries.createConversation("C2");

      await queries.updateConversation(c1.id, { title: "C1 Updated" });

      const all = await queries.getAllConversations();
      expect(all[0].id).toBe(c1.id); // c1 was updated last
      expect(all[1].id).toBe(c2.id);
    });

    test("should update conversation title", async () => {
      const conv = await queries.createConversation("Old Title");
      const updated = await queries.updateConversation(conv.id, { title: "New Title" });
      expect(updated.title).toBe("New Title");
    });

    test("should delete a conversation", async () => {
      const conv = await queries.createConversation("To Delete");
      await queries.deleteConversation(conv.id);
      const found = await queries.getConversation(conv.id);
      expect(found).toBeNull();
    });
  });

  describe("Messages", () => {
    test("should add and get messages", async () => {
      const conv = await queries.createConversation("Chat");
      await queries.addMessage(conv.id, "user", "Hello");
      await queries.addMessage(conv.id, "assistant", "Hi!");

      const messages = await queries.getMessages(conv.id);
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe("user");
      expect(messages[1].role).toBe("assistant");
    });

    test("should update a message", async () => {
      const conv = await queries.createConversation("Chat");
      const msg = await queries.addMessage(conv.id, "user", "Old content");
      const updated = await queries.updateMessage(msg.id, "New content");
      expect(updated.content).toBe("New content");
    });

    test("cascade delete should remove messages", async () => {
      const conv = await queries.createConversation("Chat");
      await queries.addMessage(conv.id, "user", "Hello");

      await queries.deleteConversation(conv.id);
      const messages = await queries.getMessages(conv.id);
      expect(messages).toHaveLength(0);
    });
  });

  describe("Combined Operations", () => {
    test("getConversationWithMessages should return full structure", async () => {
      const conv = await queries.createConversation("Chat");
      await queries.addMessage(conv.id, "user", "Hello");

      const full = await queries.getConversationWithMessages(conv.id);
      expect(full?.id).toBe(conv.id);
      expect(full?.messages).toHaveLength(1);
    });

    test("getOrCreateConversation should work for both paths", async () => {
      // Path 1: Create new
      const c1 = await queries.getOrCreateConversation();
      expect(c1.id).toBeDefined();

      // Path 2: Get existing
      const c2 = await queries.getOrCreateConversation(c1.id);
      expect(c2.id).toBe(c1.id);

      // Path 3: ID provided but not found -> Create new
      const c3 = await queries.getOrCreateConversation("non-existent-uuid");
      expect(c3.id).not.toBe("non-existent-uuid");
      expect(c3.id).toBeDefined();
    });
  });
});
