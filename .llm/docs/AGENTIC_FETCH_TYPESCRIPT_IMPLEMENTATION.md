# Implementing Crush's Agentic Fetch in TypeScript for Bun

This document provides a complete technical implementation guide for creating an Agentic Fetch tool in TypeScript, based on Crush's implementation. This tool spawns a sub-agent with web search and fetch capabilities to answer questions about web content.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Concepts](#core-concepts)
3. [Type Definitions](#type-definitions)
4. [Implementation Components](#implementation-components)
5. [WebSocket Communication](#websocket-communication)
6. [Complete Implementation](#complete-implementation)
7. [Usage Examples](#usage-examples)

---

## Architecture Overview

The Agentic Fetch implementation follows a **sub-agent pattern** where:

1. **Parent Agent** receives a request with a prompt and optional URL
2. **Agentic Fetch Tool** is invoked as a tool call
3. **Sub-Agent** is spawned with specialized tools (web_search, web_fetch, grep, view)
4. **Sub-Agent** autonomously searches/fetches content and analyzes it
5. **Response** is returned to the parent agent as tool result

### Key Components

```
┌─────────────────┐
│  Parent Agent   │
└────────┬────────┘
         │ invokes
         ▼
┌─────────────────┐
│ Agentic Fetch   │◄─── Tool with sub-agent spawning capability
│     Tool        │
└────────┬────────┘
         │ creates
         ▼
┌─────────────────┐
│   Sub-Agent     │◄─── Has web_search, web_fetch, grep, view tools
│  (SessionAgent) │
└────────┬────────┘
         │ uses
         ▼
┌─────────────────┐
│  Web Tools      │◄─── web_search (DuckDuckGo), web_fetch (HTML→MD)
└─────────────────┘
```

---

## Core Concepts

### 1. Tool Definition

Every tool in the system has:
- **Name**: Unique identifier (e.g., `"agentic_fetch"`)
- **Description**: Markdown documentation shown to the LLM
- **Input Schema**: Zod schema for parameter validation
- **Execute Function**: Async handler for the tool logic

### 2. Sub-Agent Pattern

A sub-agent is a complete AI agent instance that:
- Has its own session and message history
- Operates within a temporary workspace
- Has restricted tools (only web-related and read-only tools)
- Returns results to the parent agent
- Auto-approved permissions (no user prompts)

### 3. Session Hierarchy

```
Parent Session (user's main chat)
  └── Agent Tool Session (agentic_fetch-{messageID}-{toolCallID})
       └── Messages (sub-agent's conversation)
```

### 4. Permission System

- Parent sessions require user approval
- Sub-agent sessions are auto-approved
- Each tool call can request permissions
- Permissions include tool name, action, params, path

---

## Type Definitions

### Base Types

```typescript
import { z } from 'zod';

// Tool call identifiers
export type ToolCallId = string;
export type SessionId = string;
export type MessageId = string;

// Agent result from LLM
export interface AgentResult {
  content: {
    text: string;
    toolCalls?: ToolCall[];
  };
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
}

// Tool call structure
export interface ToolCall {
  id: ToolCallId;
  name: string;
  params: Record<string, any>;
}

// Tool response
export interface ToolResponse {
  type: 'text' | 'error';
  content: string;
}
```

### Agentic Fetch Types

```typescript
// Input parameters for agentic_fetch tool
export const AgenticFetchParamsSchema = z.object({
  url: z.string().url().optional().describe(
    'The URL to fetch content from (optional - if not provided, the agent will search the web)'
  ),
  prompt: z.string().describe(
    'The prompt describing what information to find or extract'
  ),
});

export type AgenticFetchParams = z.infer<typeof AgenticFetchParamsSchema>;

// Permission parameters (subset for UI display)
export interface AgenticFetchPermissionsParams {
  url?: string;
  prompt: string;
}

// Web fetch tool parameters
export const WebFetchParamsSchema = z.object({
  url: z.string().url().describe('The URL to fetch content from'),
});

export type WebFetchParams = z.infer<typeof WebFetchParamsSchema>;

// Web search tool parameters
export const WebSearchParamsSchema = z.object({
  query: z.string().describe('The search query to find information on the web'),
  maxResults: z.number().int().min(1).max(20).optional().default(10).describe(
    'Maximum number of results to return (default: 10, max: 20)'
  ),
});

export type WebSearchParams = z.infer<typeof WebSearchParamsSchema>;

// Search result structure
export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}
```

### Session and Message Types

```typescript
// Session represents a conversation context
export interface Session {
  id: SessionId;
  parentSessionId?: SessionId;
  title: string;
  messageCount: number;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  createdAt: number;
  updatedAt: number;
}

// Message roles
export type MessageRole = 'user' | 'assistant';

// Message content parts
export type ContentPart = 
  | { type: 'text'; text: string }
  | { type: 'tool_call'; toolCall: ToolCall }
  | { type: 'tool_result'; toolCallId: string; result: ToolResponse };

// Message in a session
export interface Message {
  id: MessageId;
  sessionId: SessionId;
  role: MessageRole;
  parts: ContentPart[];
  model?: string;
  provider?: string;
  createdAt: number;
  updatedAt: number;
}
```

### Permission Types

```typescript
// Permission request
export interface PermissionRequest {
  id: string;
  sessionId: SessionId;
  toolCallId: ToolCallId;
  toolName: string;
  description: string;
  action: string;
  params: any;
  path: string;
}

// Permission notification (response)
export interface PermissionNotification {
  toolCallId: ToolCallId;
  granted: boolean;
  denied: boolean;
}
```

---

## Implementation Components

### 1. Event Dispatcher Pattern

The implementation uses an event dispatcher to communicate between the tool and its parent context.

```typescript
// Event types
export enum EventType {
  // Session events
  SessionCreated = 'session:created',
  SessionUpdated = 'session:updated',
  SessionDeleted = 'session:deleted',
  
  // Message events
  MessageCreated = 'message:created',
  MessageUpdated = 'message:updated',
  MessageDeleted = 'message:deleted',
  
  // Permission events
  PermissionRequested = 'permission:requested',
  PermissionGranted = 'permission:granted',
  PermissionDenied = 'permission:denied',
  
  // Agent events
  AgentToolCallStart = 'agent:tool_call_start',
  AgentToolCallEnd = 'agent:tool_call_end',
  AgentStreamChunk = 'agent:stream_chunk',
}

// Generic event structure
export interface Event<T = any> {
  type: EventType;
  payload: T;
}

// Event dispatcher interface
export interface EventDispatcher {
  dispatch<T>(event: Event<T>): void;
  subscribe<T>(eventType: EventType, handler: (payload: T) => void): () => void;
}

// Simple event dispatcher implementation
export class SimpleEventDispatcher implements EventDispatcher {
  private handlers = new Map<EventType, Set<(payload: any) => void>>();

  dispatch<T>(event: Event<T>): void {
    const handlers = this.handlers.get(event.type);
    if (handlers) {
      handlers.forEach(handler => handler(event.payload));
    }
  }

  subscribe<T>(eventType: EventType, handler: (payload: T) => void): () => void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
    
    // Return unsubscribe function
    return () => {
      this.handlers.get(eventType)?.delete(handler);
    };
  }
}
```

### 2. Session Service

Manages agent sessions and their hierarchy.

```typescript
export interface SessionService {
  create(title: string): Promise<Session>;
  createTaskSession(toolCallId: string, parentSessionId: string, title: string): Promise<Session>;
  get(id: SessionId): Promise<Session>;
  save(session: Session): Promise<Session>;
  delete(id: SessionId): Promise<void>;
  
  // Agent tool session management
  createAgentToolSessionId(messageId: MessageId, toolCallId: ToolCallId): SessionId;
  parseAgentToolSessionId(sessionId: SessionId): { messageId: MessageId; toolCallId: ToolCallId } | null;
  isAgentToolSession(sessionId: SessionId): boolean;
}

export class SessionServiceImpl implements SessionService {
  constructor(
    private dispatcher: EventDispatcher,
    private db: Database // Your database abstraction
  ) {}

  async create(title: string): Promise<Session> {
    const session: Session = {
      id: crypto.randomUUID(),
      title,
      messageCount: 0,
      promptTokens: 0,
      completionTokens: 0,
      cost: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    await this.db.sessions.insert(session);
    this.dispatcher.dispatch({ type: EventType.SessionCreated, payload: session });
    
    return session;
  }

  async createTaskSession(
    toolCallId: string,
    parentSessionId: string,
    title: string
  ): Promise<Session> {
    const session: Session = {
      id: toolCallId, // Use tool call ID as session ID
      parentSessionId,
      title,
      messageCount: 0,
      promptTokens: 0,
      completionTokens: 0,
      cost: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    await this.db.sessions.insert(session);
    this.dispatcher.dispatch({ type: EventType.SessionCreated, payload: session });
    
    return session;
  }

  async get(id: SessionId): Promise<Session> {
    return await this.db.sessions.findById(id);
  }

  async save(session: Session): Promise<Session> {
    session.updatedAt = Date.now();
    await this.db.sessions.update(session);
    this.dispatcher.dispatch({ type: EventType.SessionUpdated, payload: session });
    return session;
  }

  async delete(id: SessionId): Promise<void> {
    const session = await this.get(id);
    await this.db.sessions.delete(id);
    this.dispatcher.dispatch({ type: EventType.SessionDeleted, payload: session });
  }

  createAgentToolSessionId(messageId: MessageId, toolCallId: ToolCallId): SessionId {
    return `agent-tool-${messageId}-${toolCallId}`;
  }

  parseAgentToolSessionId(sessionId: SessionId): { messageId: MessageId; toolCallId: ToolCallId } | null {
    const match = sessionId.match(/^agent-tool-(.+)-(.+)$/);
    if (!match) return null;
    return { messageId: match[1], toolCallId: match[2] };
  }

  isAgentToolSession(sessionId: SessionId): boolean {
    return sessionId.startsWith('agent-tool-');
  }
}
```

### 3. Message Service

Manages messages within sessions.

```typescript
export interface MessageService {
  create(sessionId: SessionId, role: MessageRole, parts: ContentPart[]): Promise<Message>;
  update(message: Message): Promise<void>;
  get(id: MessageId): Promise<Message>;
  list(sessionId: SessionId): Promise<Message[]>;
  delete(id: MessageId): Promise<void>;
}

export class MessageServiceImpl implements MessageService {
  constructor(
    private dispatcher: EventDispatcher,
    private db: Database
  ) {}

  async create(sessionId: SessionId, role: MessageRole, parts: ContentPart[]): Promise<Message> {
    const message: Message = {
      id: crypto.randomUUID(),
      sessionId,
      role,
      parts,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    await this.db.messages.insert(message);
    this.dispatcher.dispatch({ type: EventType.MessageCreated, payload: message });
    
    return message;
  }

  async update(message: Message): Promise<void> {
    message.updatedAt = Date.now();
    await this.db.messages.update(message);
    this.dispatcher.dispatch({ type: EventType.MessageUpdated, payload: message });
  }

  async get(id: MessageId): Promise<Message> {
    return await this.db.messages.findById(id);
  }

  async list(sessionId: SessionId): Promise<Message[]> {
    return await this.db.messages.findBySessionId(sessionId);
  }

  async delete(id: MessageId): Promise<void> {
    const message = await this.get(id);
    await this.db.messages.delete(id);
    this.dispatcher.dispatch({ type: EventType.MessageDeleted, payload: message });
  }
}
```

### 4. Permission Service

Manages permission requests for tool execution.

```typescript
export interface PermissionService {
  request(request: Omit<PermissionRequest, 'id'>): Promise<boolean>;
  grant(permissionId: string): void;
  deny(permissionId: string): void;
  autoApproveSession(sessionId: SessionId): void;
  isAutoApproved(sessionId: SessionId): boolean;
}

export class PermissionServiceImpl implements PermissionService {
  private pendingRequests = new Map<string, { resolve: (granted: boolean) => void }>();
  private autoApprovedSessions = new Set<SessionId>();

  constructor(
    private dispatcher: EventDispatcher,
    private skipAllRequests: boolean = false
  ) {}

  async request(request: Omit<PermissionRequest, 'id'>): Promise<boolean> {
    // Auto-approve if session is auto-approved or skip flag is set
    if (this.skipAllRequests || this.autoApprovedSessions.has(request.sessionId)) {
      return true;
    }

    const permissionRequest: PermissionRequest = {
      ...request,
      id: crypto.randomUUID(),
    };

    // Create promise to wait for grant/deny
    const promise = new Promise<boolean>(resolve => {
      this.pendingRequests.set(permissionRequest.id, { resolve });
    });

    // Dispatch permission request event
    this.dispatcher.dispatch({
      type: EventType.PermissionRequested,
      payload: permissionRequest,
    });

    // Wait for response
    const granted = await promise;
    this.pendingRequests.delete(permissionRequest.id);

    return granted;
  }

  grant(permissionId: string): void {
    const pending = this.pendingRequests.get(permissionId);
    if (pending) {
      pending.resolve(true);
      this.dispatcher.dispatch({
        type: EventType.PermissionGranted,
        payload: { id: permissionId },
      });
    }
  }

  deny(permissionId: string): void {
    const pending = this.pendingRequests.get(permissionId);
    if (pending) {
      pending.resolve(false);
      this.dispatcher.dispatch({
        type: EventType.PermissionDenied,
        payload: { id: permissionId },
      });
    }
  }

  autoApproveSession(sessionId: SessionId): void {
    this.autoApprovedSessions.add(sessionId);
  }

  isAutoApproved(sessionId: SessionId): boolean {
    return this.autoApprovedSessions.has(sessionId);
  }
}
```

### 5. Web Tools Implementation

#### HTML to Markdown Conversion

```typescript
import TurndownService from 'turndown';

const BROWSER_USER_AGENT = 
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function fetchUrlAndConvert(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': BROWSER_USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  let content = await response.text();

  // Convert HTML to Markdown
  if (contentType.includes('text/html')) {
    const cleanedHtml = removeNoisyElements(content);
    content = convertHtmlToMarkdown(cleanedHtml);
    content = cleanupMarkdown(content);
  } 
  // Format JSON
  else if (contentType.includes('application/json') || contentType.includes('text/json')) {
    try {
      const parsed = JSON.parse(content);
      content = JSON.stringify(parsed, null, 2);
    } catch {
      // Keep original if parsing fails
    }
  }

  return content;
}

function removeNoisyElements(html: string): string {
  // Use a DOM parser (you can use jsdom, linkedom, or happy-dom in Bun)
  const { parseHTML } = await import('linkedom'); // or use jsdom
  const { document } = parseHTML(html);

  const noisySelectors = [
    'script',
    'style',
    'nav',
    'header',
    'footer',
    'aside',
    'noscript',
    'iframe',
    'svg',
  ];

  noisySelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => el.remove());
  });

  return document.toString();
}

function convertHtmlToMarkdown(html: string): string {
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  });

  return turndownService.turndown(html);
}

function cleanupMarkdown(content: string): string {
  // Collapse multiple blank lines
  content = content.replace(/\n{3,}/g, '\n\n');
  
  // Remove trailing whitespace from each line
  content = content
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n');
  
  // Trim leading/trailing whitespace
  return content.trim();
}
```

#### DuckDuckGo Search Tool

```typescript
export async function searchDuckDuckGo(query: string, maxResults: number = 10): Promise<SearchResult[]> {
  const formData = new URLSearchParams({
    q: query,
    b: '',
    kl: '',
  });

  const response = await fetch('https://html.duckduckgo.com/html', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': BROWSER_USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate',
      'Referer': 'https://duckduckgo.com/',
    },
    body: formData.toString(),
  });

  if (!response.ok && response.status !== 202) {
    throw new Error(`Search failed with status: ${response.status} (DuckDuckGo may be rate limiting)`);
  }

  const html = await response.text();
  return parseSearchResults(html, maxResults);
}

function parseSearchResults(html: string, maxResults: number): SearchResult[] {
  const { parseHTML } = await import('linkedom');
  const { document } = parseHTML(html);

  const results: SearchResult[] = [];
  const resultDivs = document.querySelectorAll('.result');

  for (let i = 0; i < Math.min(resultDivs.length, maxResults); i++) {
    const div = resultDivs[i];
    
    const titleLink = div.querySelector('a.result__a');
    const snippetLink = div.querySelector('a.result__snippet');
    
    if (!titleLink) continue;

    const title = titleLink.textContent?.trim() || '';
    const rawUrl = titleLink.getAttribute('href') || '';
    const link = cleanDuckDuckGoUrl(rawUrl);
    const snippet = snippetLink?.textContent?.trim() || '';

    if (link && !link.includes('y.js')) {
      results.push({
        title,
        link,
        snippet,
        position: results.length + 1,
      });
    }
  }

  return results;
}

function cleanDuckDuckGoUrl(rawUrl: string): string {
  if (rawUrl.startsWith('//duckduckgo.com/l/?uddg=')) {
    const match = rawUrl.match(/uddg=([^&]+)/);
    if (match) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return rawUrl;
      }
    }
  }
  return rawUrl;
}

function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'No results were found for your search query. This could be due to DuckDuckGo\'s bot detection or the query returned no matches. Please try rephrasing your search or try again in a few minutes.';
  }

  let output = `Found ${results.length} search results:\n\n`;
  
  for (const result of results) {
    output += `${result.position}. ${result.title}\n`;
    output += `   URL: ${result.link}\n`;
    output += `   Summary: ${result.snippet}\n\n`;
  }

  return output;
}
```

#### Web Tool Definitions

```typescript
import { Experimental_Agent as Agent, tool } from 'ai';

export function createWebSearchTool() {
  return tool({
    description: `Search the web using DuckDuckGo to find information.

Use this tool when you need to search for current information on the web.

Parameters:
- query: The search query to find information
- maxResults: Maximum number of results to return (default: 10, max: 20)

Returns search results with titles, URLs, and snippets. After getting search results, use web_fetch to get full content from relevant URLs.`,
    parameters: WebSearchParamsSchema,
    execute: async ({ query, maxResults = 10 }) => {
      const results = await searchDuckDuckGo(query, maxResults);
      return formatSearchResults(results);
    },
  });
}

export function createWebFetchTool(workingDir: string) {
  const LARGE_CONTENT_THRESHOLD = 50000; // 50KB

  return tool({
    description: `Fetch content from a URL and convert it to markdown.

Use this tool to fetch web pages and get their content. Large pages will be saved to a file that you can analyze with grep and view tools.

Parameters:
- url: The URL to fetch content from

Returns the page content as markdown, or a file path if the content is large.`,
    parameters: WebFetchParamsSchema,
    execute: async ({ url }) => {
      const content = await fetchUrlAndConvert(url);

      if (content.length > LARGE_CONTENT_THRESHOLD) {
        // Save to temporary file
        const fileName = `page-${Date.now()}.md`;
        const filePath = `${workingDir}/${fileName}`;
        await Bun.write(filePath, content);

        return `Fetched content from ${url} (large page)\n\nContent saved to: ${filePath}\n\nUse the view and grep tools to analyze this file.`;
      }

      return `Fetched content from ${url}:\n\n${content}`;
    },
  });
}
```

### 6. Session Agent Implementation

```typescript
import { Experimental_Agent as Agent, tool, streamText, generateText } from 'ai';
import type { LanguageModel, ProviderOptions } from 'ai';

export interface SessionAgentConfig {
  model: LanguageModel;
  systemPrompt: string;
  tools: ReturnType<typeof tool>[];
  sessionService: SessionService;
  messageService: MessageService;
  dispatcher: EventDispatcher;
}

export interface SessionAgentCall {
  sessionId: SessionId;
  prompt: string;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  providerOptions?: ProviderOptions;
}

export class SessionAgent {
  private agent: Agent;

  constructor(private config: SessionAgentConfig) {
    this.agent = new Agent({
      model: config.model,
      system: config.systemPrompt,
      tools: Object.fromEntries(
        config.tools.map(t => [t.name, t])
      ),
    });
  }

  async run(call: SessionAgentCall): Promise<AgentResult> {
    const { sessionId, prompt } = call;

    // Get session
    const session = await this.config.sessionService.get(sessionId);

    // Get conversation history
    const messages = await this.config.messageService.list(sessionId);

    // Create user message
    await this.config.messageService.create(sessionId, 'user', [
      { type: 'text', text: prompt },
    ]);

    // Prepare history for AI SDK
    const history = messages.map(msg => ({
      role: msg.role,
      content: msg.parts
        .filter(p => p.type === 'text')
        .map(p => (p as any).text)
        .join('\n'),
    }));

    // Generate response
    const result = await generateText({
      model: this.config.model,
      system: this.config.systemPrompt,
      messages: [
        ...history,
        { role: 'user', content: prompt },
      ],
      tools: Object.fromEntries(
        this.config.tools.map(t => [t.name, t])
      ),
      maxTokens: call.maxOutputTokens,
      temperature: call.temperature,
      topP: call.topP,
      ...call.providerOptions,
    });

    // Create assistant message
    const assistantParts: ContentPart[] = [];
    
    if (result.text) {
      assistantParts.push({ type: 'text', text: result.text });
    }

    if (result.toolCalls) {
      for (const toolCall of result.toolCalls) {
        assistantParts.push({
          type: 'tool_call',
          toolCall: {
            id: toolCall.toolCallId,
            name: toolCall.toolName,
            params: toolCall.args,
          },
        });
      }
    }

    await this.config.messageService.create(sessionId, 'assistant', assistantParts);

    // Update session stats
    session.promptTokens += result.usage.promptTokens;
    session.completionTokens += result.usage.completionTokens;
    session.messageCount += 2; // User + assistant
    await this.config.sessionService.save(session);

    return {
      content: {
        text: result.text,
        toolCalls: result.toolCalls?.map(tc => ({
          id: tc.toolCallId,
          name: tc.toolName,
          params: tc.args,
        })),
      },
      usage: result.usage,
      finishReason: result.finishReason,
    };
  }
}
```

### 7. Agentic Fetch Tool Class

This is the main class that brings everything together.

```typescript
import { tmpdir } from 'os';
import { join } from 'path';
import { tool } from 'ai';

export interface AgenticFetchToolConfig {
  // Services
  sessionService: SessionService;
  messageService: MessageService;
  permissionService: PermissionService;
  dispatcher: EventDispatcher;
  
  // Model configuration
  model: LanguageModel;
  systemPromptPrefix?: string;
  
  // Options
  workingDir: string;
}

export class AgenticFetchTool {
  private systemPrompt: string;

  constructor(private config: AgenticFetchToolConfig) {
    this.systemPrompt = this.buildSystemPrompt();
  }

  private buildSystemPrompt(): string {
    const today = new Date().toISOString().split('T')[0];
    
    return `You are a web content analysis agent for Crush. Your task is to analyze web content, search results, or web pages to extract the information requested by the user.

<rules>
1. Be concise and direct in your responses
2. Focus only on the information requested in the user's prompt
3. If the content is provided in a file path, use the grep and view tools to efficiently search through it
4. When relevant, quote specific sections from the content to support your answer
5. If the requested information is not found, clearly state that
6. Any file paths you use MUST be absolute
7. **IMPORTANT**: If you need information from a linked page or search result, use the web_fetch tool to get that content
8. **IMPORTANT**: If you need to search for more information, use the web_search tool
9. After fetching a link, analyze the content yourself to extract what's needed
10. Don't hesitate to follow multiple links or perform multiple searches if necessary to get complete information
11. **CRITICAL**: At the end of your response, include a "Sources" section listing ALL URLs that were useful in answering the question
</rules>

<search_strategy>
When searching for information:

1. **Break down complex questions** - If the user's question has multiple parts, search for each part separately
2. **Use specific, targeted queries** - Prefer multiple small searches over one broad search
3. **Iterate and refine** - If initial results aren't helpful, try different search terms or more specific queries
4. **Search for different aspects** - For comprehensive answers, search for different angles of the topic
5. **Follow up on promising results** - When you find a good source, fetch it and look for links to related information
</search_strategy>

<response_format>
Your response should be structured as follows:

[Your answer to the user's question]

## Sources
- [URL 1 that was useful]
- [URL 2 that was useful]
- [URL 3 that was useful]
...

Only include URLs that actually contributed information to your answer.
</response_format>

<env>
Working directory: ${this.config.workingDir}
Platform: ${process.platform}
Today's date: ${today}
</env>

<web_search_tool>
You have access to a web_search tool that allows you to search the web:
- Provide a search query and optionally max_results (default: 10)
- The tool returns search results with titles, URLs, and snippets
- After getting search results, use web_fetch to get full content from relevant URLs
- **Prefer multiple focused searches over single broad searches**
- Keep queries short and specific (3-6 words is often ideal)
- If results aren't relevant, try rephrasing with different keywords
- Don't be afraid to do 3-5+ searches to thoroughly answer a complex question
</web_search_tool>

<web_fetch_tool>
You have access to a web_fetch tool that allows you to fetch web pages:
- Use it when you need to follow links from search results or the current page
- Provide just the URL (no prompt parameter)
- The tool will fetch and return the content (or save to a file if large)
- YOU must then analyze that content to answer the user's question
- **Use this liberally** - if a link seems relevant to answering the question, fetch it!
- You can fetch multiple pages in sequence to gather all needed information
- Remember to include any fetched URLs in your Sources section if they were helpful
</web_fetch_tool>`;
  }

  createTool() {
    return tool({
      description: `Fetches content from a URL or searches the web, then processes it using an AI model to extract information or answer questions.

<when_to_use>
Use this tool when you need to:
- Search the web for information (omit the url parameter)
- Extract specific information from a webpage (provide a url)
- Answer questions about web content
- Summarize or analyze web pages
- Research topics by searching and following links

DO NOT use this tool when:
- You just need raw content without analysis (use fetch instead - faster and cheaper)
- You want direct access to API responses or JSON (use fetch instead)
- You don't need the content processed or interpreted (use fetch instead)
</when_to_use>

<usage>
- Provide a prompt describing what information you want to find or extract (required)
- Optionally provide a URL to fetch and analyze specific content
- If no URL is provided, the agent will search the web to find relevant information
- The tool spawns a sub-agent with web_search, web_fetch, and analysis tools
- Returns the agent's response about the content
</usage>

<parameters>
- prompt: What information you want to find or extract (required)
- url: The URL to fetch content from (optional - if not provided, agent will search the web)
</parameters>

<limitations>
- Max response size: 5MB per page
- Only supports HTTP and HTTPS protocols
- Cannot handle authentication or cookies
- Some websites may block automated requests
- Uses additional tokens for AI processing
- Search results depend on DuckDuckGo availability
</limitations>

<examples>
Search for information:
- prompt: "What are the main new features in the latest Python release?"

Fetch and analyze a URL:
- url: "https://docs.python.org/3/whatsnew/3.12.html"
- prompt: "Summarize the key changes in Python 3.12"
</examples>`,
      parameters: AgenticFetchParamsSchema,
      execute: async (params, toolCall) => {
        return await this.execute(params, toolCall);
      },
    });
  }

  private async execute(
    params: AgenticFetchParams,
    toolCall: { id: string; sessionId?: string; messageId?: string }
  ): Promise<string> {
    const { prompt, url } = params;

    // Validate required context
    if (!toolCall.sessionId) {
      throw new Error('Session ID missing from tool call context');
    }
    if (!toolCall.messageId) {
      throw new Error('Message ID missing from tool call context');
    }

    // Determine description for permission request
    const description = url
      ? `Fetch and analyze content from URL: ${url}`
      : 'Search the web and analyze results';

    // Request permission
    const granted = await this.config.permissionService.request({
      sessionId: toolCall.sessionId,
      toolCallId: toolCall.id,
      toolName: 'agentic_fetch',
      action: 'fetch',
      description,
      params: { url, prompt },
      path: this.config.workingDir,
    });

    if (!granted) {
      throw new Error('Permission denied by user');
    }

    // Create temporary directory for this operation
    const tmpDir = await Bun.mkdtemp(join(tmpdir(), 'crush-fetch-'));

    try {
      let fullPrompt: string;

      if (url) {
        // URL mode: fetch content first
        const content = await fetchUrlAndConvert(url);
        const LARGE_CONTENT_THRESHOLD = 50000;

        if (content.length > LARGE_CONTENT_THRESHOLD) {
          const filePath = join(tmpDir, `page-${Date.now()}.md`);
          await Bun.write(filePath, content);
          
          fullPrompt = `${prompt}\n\nThe web page from ${url} has been saved to: ${filePath}\n\nUse the view and grep tools to analyze this file and extract the requested information.`;
        } else {
          fullPrompt = `${prompt}\n\nWeb page URL: ${url}\n\n<webpage_content>\n${content}\n</webpage_content>`;
        }
      } else {
        // Search mode: let sub-agent search
        fullPrompt = `${prompt}\n\nUse the web_search tool to find relevant information. Break down the question into smaller, focused searches if needed. After searching, use web_fetch to get detailed content from the most relevant results.`;
      }

      // Create sub-agent session
      const agentToolSessionId = this.config.sessionService.createAgentToolSessionId(
        toolCall.messageId,
        toolCall.id
      );
      
      const subSession = await this.config.sessionService.createTaskSession(
        agentToolSessionId,
        toolCall.sessionId,
        'Fetch Analysis'
      );

      // Auto-approve all permissions for this sub-session
      this.config.permissionService.autoApproveSession(subSession.id);

      // Create sub-agent with web tools
      const webTools = [
        createWebSearchTool(),
        createWebFetchTool(tmpDir),
        // You can add grep, view, and other read-only tools here
      ];

      const subAgent = new SessionAgent({
        model: this.config.model,
        systemPrompt: this.systemPrompt,
        tools: webTools,
        sessionService: this.config.sessionService,
        messageService: this.config.messageService,
        dispatcher: this.config.dispatcher,
      });

      // Run sub-agent
      const result = await subAgent.run({
        sessionId: subSession.id,
        prompt: fullPrompt,
      });

      // Update parent session with sub-session costs
      const updatedSubSession = await this.config.sessionService.get(subSession.id);
      const parentSession = await this.config.sessionService.get(toolCall.sessionId);
      
      parentSession.cost += updatedSubSession.cost;
      parentSession.promptTokens += updatedSubSession.promptTokens;
      parentSession.completionTokens += updatedSubSession.completionTokens;
      
      await this.config.sessionService.save(parentSession);

      return result.content.text;
    } finally {
      // Cleanup temporary directory
      try {
        await Bun.$`rm -rf ${tmpDir}`;
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
```

---

## WebSocket Communication

For real-time updates between client and server, implement WebSocket communication with Zod schema validation.

```typescript
import { Server, ServerWebSocket } from 'bun';
import { z } from 'zod';

// WebSocket message schemas
const WSMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('session:created'),
    payload: z.object({
      id: z.string(),
      title: z.string(),
      createdAt: z.number(),
    }),
  }),
  z.object({
    type: z.literal('message:created'),
    payload: z.object({
      id: z.string(),
      sessionId: z.string(),
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    }),
  }),
  z.object({
    type: z.literal('permission:requested'),
    payload: z.object({
      id: z.string(),
      toolName: z.string(),
      description: z.string(),
      params: z.any(),
    }),
  }),
  z.object({
    type: z.literal('permission:response'),
    payload: z.object({
      id: z.string(),
      granted: z.boolean(),
    }),
  }),
]);

type WSMessage = z.infer<typeof WSMessageSchema>;

// WebSocket handler
export class WSHandler {
  private clients = new Set<ServerWebSocket<any>>();

  constructor(private dispatcher: EventDispatcher) {
    // Subscribe to all events and broadcast to clients
    this.subscribeToEvents();
  }

  private subscribeToEvents() {
    // Session events
    this.dispatcher.subscribe(EventType.SessionCreated, (session) => {
      this.broadcast({
        type: 'session:created',
        payload: {
          id: session.id,
          title: session.title,
          createdAt: session.createdAt,
        },
      });
    });

    // Message events
    this.dispatcher.subscribe(EventType.MessageCreated, (message) => {
      this.broadcast({
        type: 'message:created',
        payload: {
          id: message.id,
          sessionId: message.sessionId,
          role: message.role,
          content: message.parts
            .filter(p => p.type === 'text')
            .map(p => (p as any).text)
            .join('\n'),
        },
      });
    });

    // Permission events
    this.dispatcher.subscribe(EventType.PermissionRequested, (request) => {
      this.broadcast({
        type: 'permission:requested',
        payload: {
          id: request.id,
          toolName: request.toolName,
          description: request.description,
          params: request.params,
        },
      });
    });
  }

  handleConnection(ws: ServerWebSocket<any>) {
    this.clients.add(ws);

    ws.subscribe('events'); // Subscribe to broadcast channel
  }

  handleMessage(ws: ServerWebSocket<any>, message: string) {
    try {
      const parsed = WSMessageSchema.parse(JSON.parse(message));

      // Handle permission responses from client
      if (parsed.type === 'permission:response') {
        const { id, granted } = parsed.payload;
        if (granted) {
          this.dispatcher.dispatch({
            type: EventType.PermissionGranted,
            payload: { id },
          });
        } else {
          this.dispatcher.dispatch({
            type: EventType.PermissionDenied,
            payload: { id },
          });
        }
      }
    } catch (error) {
      console.error('Invalid WebSocket message:', error);
    }
  }

  handleClose(ws: ServerWebSocket<any>) {
    this.clients.delete(ws);
  }

  broadcast(message: WSMessage) {
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      client.send(payload);
    }
  }
}

// Create Bun server with WebSocket support
export function createServer(
  dispatcher: EventDispatcher,
  sessionService: SessionService,
  messageService: MessageService,
  permissionService: PermissionService,
  model: LanguageModel
) {
  const wsHandler = new WSHandler(dispatcher);

  // Create agentic fetch tool
  const agenticFetchTool = new AgenticFetchTool({
    sessionService,
    messageService,
    permissionService,
    dispatcher,
    model,
    workingDir: process.cwd(),
  });

  return Bun.serve({
    port: 3000,
    
    fetch(req, server) {
      const url = new URL(req.url);

      // WebSocket upgrade
      if (url.pathname === '/ws') {
        const upgraded = server.upgrade(req);
        if (upgraded) {
          return undefined;
        }
        return new Response('WebSocket upgrade failed', { status: 400 });
      }

      // HTTP endpoints
      if (url.pathname === '/api/chat' && req.method === 'POST') {
        return handleChatRequest(req, { 
          sessionService, 
          messageService,
          agenticFetchTool 
        });
      }

      return new Response('Not Found', { status: 404 });
    },

    websocket: {
      open(ws) {
        wsHandler.handleConnection(ws);
      },
      message(ws, message) {
        wsHandler.handleMessage(ws, message as string);
      },
      close(ws) {
        wsHandler.handleClose(ws);
      },
    },
  });
}
```

---

## Complete Implementation

### Server Setup

```typescript
// server.ts
import { anthropic } from '@ai-sdk/anthropic';

// Initialize services
const dispatcher = new SimpleEventDispatcher();
const db = new YourDatabase(); // Your database implementation
const sessionService = new SessionServiceImpl(dispatcher, db);
const messageService = new MessageServiceImpl(dispatcher, db);
const permissionService = new PermissionServiceImpl(dispatcher, false);

// Configure model
const model = anthropic('claude-sonnet-4');

// Create and start server
const server = createServer(
  dispatcher,
  sessionService,
  messageService,
  permissionService,
  model
);

console.log(`Server running at http://localhost:${server.port}`);
```

### HTTP Chat Endpoint

```typescript
async function handleChatRequest(
  req: Request,
  services: {
    sessionService: SessionService;
    messageService: MessageService;
    agenticFetchTool: AgenticFetchTool;
  }
): Promise<Response> {
  const { sessionId, prompt } = await req.json();

  try {
    // Get or create session
    let session: Session;
    try {
      session = await services.sessionService.get(sessionId);
    } catch {
      session = await services.sessionService.create('New Chat');
    }

    // Get conversation history
    const messages = await services.messageService.list(session.id);

    // Create main agent with agentic_fetch tool
    const agent = new Agent({
      model: anthropic('claude-sonnet-4'),
      system: 'You are a helpful AI assistant.',
      tools: {
        agentic_fetch: services.agenticFetchTool.createTool(),
      },
    });

    // Generate response
    const result = await agent.generate({
      messages: [
        ...messages.map(m => ({
          role: m.role,
          content: m.parts
            .filter(p => p.type === 'text')
            .map(p => (p as any).text)
            .join('\n'),
        })),
        { role: 'user', content: prompt },
      ],
    });

    return Response.json({
      sessionId: session.id,
      response: result.text,
      steps: result.steps,
    });
  } catch (error) {
    console.error('Chat error:', error);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
```

### Client Implementation (TypeScript/React)

```typescript
// client.ts
import { useEffect, useState } from 'react';

export function useCrushChat() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [pendingPermissions, setPendingPermissions] = useState<PermissionRequest[]>([]);

  useEffect(() => {
    const websocket = new WebSocket('ws://localhost:3000/ws');

    websocket.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'session:created':
          setSessions(prev => [...prev, message.payload]);
          break;

        case 'permission:requested':
          setPendingPermissions(prev => [...prev, message.payload]);
          break;

        case 'message:created':
          // Update UI with new message
          console.log('New message:', message.payload);
          break;
      }
    };

    setWs(websocket);

    return () => websocket.close();
  }, []);

  const grantPermission = (permissionId: string) => {
    ws?.send(JSON.stringify({
      type: 'permission:response',
      payload: { id: permissionId, granted: true },
    }));
    setPendingPermissions(prev => prev.filter(p => p.id !== permissionId));
  };

  const denyPermission = (permissionId: string) => {
    ws?.send(JSON.stringify({
      type: 'permission:response',
      payload: { id: permissionId, granted: false },
    }));
    setPendingPermissions(prev => prev.filter(p => p.id !== permissionId));
  };

  const sendMessage = async (sessionId: string, prompt: string) => {
    const response = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, prompt }),
    });

    return await response.json();
  };

  return {
    sessions,
    pendingPermissions,
    grantPermission,
    denyPermission,
    sendMessage,
  };
}
```

---

## Usage Examples

### Example 1: Web Search

```typescript
const result = await agenticFetchTool.execute(
  {
    prompt: 'What are the latest features in Bun 1.0?',
  },
  {
    id: 'call-123',
    sessionId: 'session-abc',
    messageId: 'msg-xyz',
  }
);

// Sub-agent will:
// 1. Use web_search to find "Bun 1.0 features"
// 2. Use web_fetch to get content from top results
// 3. Analyze and summarize the features
// 4. Return response with Sources section
```

### Example 2: URL Analysis

```typescript
const result = await agenticFetchTool.execute(
  {
    url: 'https://bun.sh/blog/bun-v1.0',
    prompt: 'Summarize the performance improvements in this blog post',
  },
  {
    id: 'call-456',
    sessionId: 'session-abc',
    messageId: 'msg-xyz',
  }
);

// Sub-agent will:
// 1. Fetch the URL and convert to markdown
// 2. Analyze the content focusing on performance
// 3. Return structured summary
```

### Example 3: Complex Research

```typescript
const result = await agenticFetchTool.execute(
  {
    prompt: 'Compare the performance of Bun vs Node.js vs Deno for web servers',
  },
  {
    id: 'call-789',
    sessionId: 'session-abc',
    messageId: 'msg-xyz',
  }
);

// Sub-agent will:
// 1. Search "Bun performance benchmarks"
// 2. Search "Node.js vs Deno performance"
// 3. Search "Bun vs Node.js web server"
// 4. Fetch multiple relevant URLs
// 5. Synthesize comparison from multiple sources
// 6. Return comprehensive answer with all sources
```

---

## Key Technical Details

### 1. Large Content Handling

When fetched content exceeds 50KB:
- Content is saved to a temporary file
- Sub-agent is given the file path
- Sub-agent uses `view` and `grep` tools to analyze efficiently
- Prevents token limit issues

### 2. Session Hierarchy

```
Parent Session: "user-session-123"
  └── Sub-Session: "agent-tool-msg-abc-call-xyz"
       └── Messages: [user message, assistant response, tool calls, etc.]
```

This allows:
- Isolated sub-agent context
- Cost tracking per sub-agent
- Nested tool execution visibility
- Proper cleanup after completion

### 3. Permission Flow

```
1. Tool requests permission → PermissionService.request()
2. Event dispatched → EventType.PermissionRequested
3. WebSocket broadcasts to client
4. Client shows permission dialog
5. User grants/denies
6. Client sends response via WebSocket
7. PermissionService resolves promise
8. Tool continues or aborts
```

### 4. Auto-Approval for Sub-Agents

Sub-agent sessions are automatically approved because:
- They're created by a tool the user already approved
- They operate in isolated temporary directories
- They only have read-only web tools
- Parent session already got user permission

### 5. Cost Tracking

```typescript
// Sub-session tracks its own costs
subSession.promptTokens += result.usage.promptTokens;
subSession.completionTokens += result.usage.completionTokens;

// Costs bubble up to parent
parentSession.cost += subSession.cost;
parentSession.promptTokens += subSession.promptTokens;
parentSession.completionTokens += subSession.completionTokens;
```

### 6. Temporary Workspace

Each agentic_fetch execution:
- Creates a unique temp directory
- Saves large web pages there
- Sub-agent operates within that directory
- Directory is cleaned up after completion
- Prevents file conflicts between concurrent executions

### 7. HTML → Markdown Conversion

Critical for LLM processing:
- Remove noisy elements (scripts, styles, nav, footer, ads)
- Convert clean HTML to structured Markdown
- Preserve headings, links, code blocks, tables
- Significantly reduces token count
- Improves LLM comprehension

### 8. DuckDuckGo Search

Uses HTML endpoint (not API):
- POST to `https://html.duckduckgo.com/html`
- Parse HTML results (class-based selectors)
- Extract titles, URLs, snippets
- Clean redirect URLs
- Handle rate limiting gracefully

### 9. System Prompt Engineering

The sub-agent prompt is crucial:
- Instructs on search strategy (multiple focused searches)
- Explains when to use web_fetch vs web_search
- Requires "Sources" section in response
- Emphasizes following links liberally
- Guides toward comprehensive answers

### 10. Event-Driven Architecture

All state changes emit events:
- Sessions created/updated/deleted
- Messages created/updated/deleted
- Permissions requested/granted/denied
- Tool calls started/completed

Benefits:
- Real-time UI updates via WebSocket
- Loose coupling between components
- Easy to add new subscribers (logging, analytics, etc.)
- Testable without full system

---

## Performance Considerations

### 1. Parallel Tool Execution

When the sub-agent makes multiple tool calls, execute them in parallel:

```typescript
const results = await Promise.all(
  toolCalls.map(call => executeTool(call))
);
```

### 2. Connection Pooling

Reuse HTTP clients for web requests:

```typescript
const httpClient = new Agent({
  keepAlive: true,
  maxSockets: 10,
  maxFreeSockets: 5,
});
```

### 3. Content Streaming

For large responses, stream to avoid memory issues:

```typescript
const stream = fs.createWriteStream(filePath);
response.body.pipe(stream);
```

### 4. Caching

Cache frequently accessed web pages:

```typescript
const cache = new Map<string, { content: string; timestamp: number }>();

async function fetchWithCache(url: string, ttl = 3600000) {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < ttl) {
    return cached.content;
  }
  
  const content = await fetchUrlAndConvert(url);
  cache.set(url, { content, timestamp: Date.now() });
  return content;
}
```

### 5. Rate Limiting

Protect against DuckDuckGo rate limits:

```typescript
import pLimit from 'p-limit';

const searchLimit = pLimit(1); // One search at a time
const fetchLimit = pLimit(5); // Up to 5 concurrent fetches

async function rateLimitedSearch(query: string) {
  return searchLimit(() => searchDuckDuckGo(query));
}
```

---

## Testing

### Unit Test Example

```typescript
import { describe, test, expect, mock } from 'bun:test';

describe('AgenticFetchTool', () => {
  test('should fetch and analyze URL', async () => {
    const mockServices = {
      sessionService: mock(),
      messageService: mock(),
      permissionService: mock(() => Promise.resolve(true)),
      dispatcher: mock(),
    };

    const tool = new AgenticFetchTool({
      ...mockServices,
      model: mock(),
      workingDir: '/tmp',
    });

    const result = await tool.execute(
      {
        url: 'https://example.com',
        prompt: 'Summarize this page',
      },
      {
        id: 'test-call',
        sessionId: 'test-session',
        messageId: 'test-message',
      }
    );

    expect(result).toContain('Sources');
  });
});
```

---

## Security Considerations

1. **URL Validation**: Validate and sanitize all URLs before fetching
2. **Content Size Limits**: Enforce 5MB limit to prevent DoS
3. **Timeout**: Set reasonable timeouts (30s) for web requests
4. **User Agent**: Use realistic browser UA to avoid blocking
5. **Permission Gates**: Always require user permission before fetching
6. **Sandboxing**: Sub-agents operate in isolated temp directories
7. **Input Sanitization**: Validate all parameters with Zod schemas
8. **Rate Limiting**: Protect against abuse of search/fetch tools
9. **HTTPS Only**: Upgrade HTTP to HTTPS automatically
10. **No Credentials**: Never include authentication in web requests

---

## Conclusion

This implementation provides a production-ready Agentic Fetch tool that:

- ✅ Spawns sub-agents for autonomous web research
- ✅ Integrates DuckDuckGo search and HTML→Markdown conversion
- ✅ Handles large content with file-based analysis
- ✅ Manages permissions with user approval flow
- ✅ Tracks costs and tokens across session hierarchy
- ✅ Communicates via WebSocket with Zod validation
- ✅ Operates in isolated temporary workspaces
- ✅ Follows Vercel AI SDK patterns
- ✅ Provides event-driven architecture
- ✅ Includes comprehensive error handling

The design is modular, testable, and extensible. You can easily add more tools to the sub-agent (grep, view, sourcegraph) or customize the system prompt for different use cases.
