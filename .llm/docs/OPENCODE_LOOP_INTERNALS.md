# OpenCode Loop: Technical Deep Dive

This document explains the internals of the OpenCode agent loop - the core execution harness that powers an AI coding assistant. This is intended for developers building their own implementation.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Components](#core-components)
3. [The Main Loop](#the-main-loop)
4. [Message & Part System](#message--part-system)
5. [LLM Integration](#llm-integration)
6. [Tool System](#tool-system)
7. [Permission System](#permission-system)
8. [Session Management](#session-management)
9. [Compaction & Context Management](#compaction--context-management)
10. [Snapshot & Revert System](#snapshot--revert-system)
11. [Provider Abstraction](#provider-abstraction)
12. [Event Bus](#event-bus)
13. [Storage Layer](#storage-layer)
14. [Plugin System](#plugin-system)
15. [Putting It All Together](#putting-it-all-together)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Interface                            │
│                    (CLI / Desktop / Web)                        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SessionPrompt.loop()                        │
│                   (Main Agent Execution Loop)                    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SessionProcessor.process()                    │
│              (Stream Processing & Tool Execution)                │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         LLM.stream()                            │
│               (Vercel AI SDK + Model Communication)              │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Provider Layer                              │
│            (Anthropic, OpenAI, Google, etc.)                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Instance Context

The `Instance` namespace provides scoped execution context per project:

```typescript
// Instance provides:
// - directory: Current working directory
// - worktree: Git repository root
// - project: Project metadata (VCS type, ID)
// - state(): Instance-scoped state management

Instance.provide({
  directory: "/path/to/project",
  async fn() {
    // All code here has access to Instance.directory, Instance.worktree, etc.
  }
})
```

**Key Insight:** All state in OpenCode is scoped to an `Instance`. When you call `Instance.state()`, it creates state isolated to the current project directory. This enables multi-project support.

### 2. Session

A `Session` represents a conversation thread:

```typescript
interface Session {
  id: string                    // Unique identifier (descending ULID for sort order)
  slug: string                  // Human-readable short name
  projectID: string             // Links to project
  directory: string             // Working directory at creation
  parentID?: string             // For child/subtask sessions
  title: string                 // Auto-generated or manual
  permission: Ruleset           // Session-specific permission overrides
  time: {
    created: number
    updated: number
    compacting?: number
    archived?: number
  }
  summary?: {
    additions: number
    deletions: number
    files: number
  }
}
```

---

## The Main Loop

The heart of OpenCode is `SessionPrompt.loop()` in `packages/opencode/src/session/prompt.ts`.

### High-Level Flow

```typescript
export async function loop(sessionID: string) {
  const abort = start(sessionID)          // Acquire exclusive lock
  
  let step = 0
  const session = await Session.get(sessionID)
  
  while (true) {
    // 1. Exit conditions
    if (abort.aborted) break
    
    // 2. Load message history (respecting compaction boundaries)
    let msgs = await MessageV2.filterCompacted(MessageV2.stream(sessionID))
    
    // 3. Find key messages
    let lastUser: MessageV2.User
    let lastAssistant: MessageV2.Assistant
    let lastFinished: MessageV2.Assistant  // Last completed response
    let tasks: (CompactionPart | SubtaskPart)[] = []
    
    // Walk backward through messages to find these
    for (let i = msgs.length - 1; i >= 0; i--) { /* ... */ }
    
    // 4. Check if loop should exit
    if (lastAssistant?.finish && 
        !["tool-calls", "unknown"].includes(lastAssistant.finish) &&
        lastUser.id < lastAssistant.id) {
      break  // Assistant completed without pending tool calls
    }
    
    step++
    
    // 5. Handle special message types
    if (task?.type === "subtask") {
      // Execute subtask in child session
      await executeSubtask(task)
      continue
    }
    
    if (task?.type === "compaction") {
      // Perform context compaction
      await SessionCompaction.process(...)
      continue
    }
    
    // 6. Check for context overflow
    if (needsCompaction) {
      await SessionCompaction.create(...)
      continue
    }
    
    // 7. Normal processing - create processor and execute
    const processor = SessionProcessor.create({
      assistantMessage: await createAssistantMessage(),
      sessionID,
      model,
      abort,
    })
    
    const tools = await resolveTools({ agent, session, model, processor })
    const result = await processor.process({
      user: lastUser,
      agent,
      abort,
      sessionID,
      system: [...systemPrompts],
      messages: MessageV2.toModelMessage(msgs, { tools }),
      tools,
      model,
    })
    
    // 8. Handle processor result
    if (result === "stop") break
    if (result === "compact") {
      await SessionCompaction.create(...)
    }
  }
  
  // 9. Cleanup and return final message
  SessionCompaction.prune({ sessionID })
  return finalAssistantMessage
}
```

### Key Design Decisions

1. **Single-Writer Pattern**: Only one loop can run per session (controlled via `start(sessionID)` acquiring an `AbortController`)

2. **Message Walking**: Messages are loaded newest-first via `MessageV2.stream()`, then reversed for processing. The loop walks backward to find key messages efficiently.

3. **Continuation Logic**: The loop continues as long as:
   - Not aborted
   - Last assistant message has `finish === "tool-calls"` (model wants to call more tools)
   - Or there are pending subtasks/compaction

4. **Step Limiting**: Agents can have a `steps` limit. When reached, a special prompt is injected telling the model to wrap up.

---

## Message & Part System

OpenCode uses a hierarchical message structure:

```
Session
  └── Message (User or Assistant)
        └── Part (Text, Tool, Reasoning, File, etc.)
```

### Message Types

```typescript
// User Message
interface UserMessage {
  id: string
  sessionID: string
  role: "user"
  time: { created: number }
  agent: string           // Which agent to use
  model: { providerID: string, modelID: string }
  system?: string         // Optional system prompt addition
  tools?: Record<string, boolean>  // Tool overrides
  variant?: string        // Model variant selection
}

// Assistant Message
interface AssistantMessage {
  id: string
  sessionID: string
  role: "assistant"
  parentID: string        // Links to triggering user message
  time: { created: number, completed?: number }
  agent: string
  mode: string
  modelID: string
  providerID: string
  cost: number
  tokens: {
    input: number
    output: number
    reasoning: number
    cache: { read: number, write: number }
  }
  finish?: string         // "stop", "tool-calls", "length", etc.
  error?: ErrorObject
  summary?: boolean       // Is this a compaction summary?
}
```

### Part Types

Parts are the atomic units of content:

```typescript
type Part = 
  | TextPart          // LLM text output
  | ReasoningPart     // Chain-of-thought/thinking
  | ToolPart          // Tool call with state machine
  | FilePart          // Attached files/images
  | AgentPart         // Agent invocation marker
  | SubtaskPart       // Pending subtask request
  | CompactionPart    // Compaction marker
  | StepStartPart     // Marks LLM call start (includes snapshot)
  | StepFinishPart    // Marks LLM call end (includes tokens, cost)
  | PatchPart         // Files changed during step
  | RetryPart         // Retry attempt info

// Tool Part State Machine
type ToolState = 
  | { status: "pending", input: object, raw: string }
  | { status: "running", input: object, time: { start: number }, title?: string }
  | { status: "completed", input: object, output: string, time: { start, end }, metadata: object }
  | { status: "error", input: object, error: string, time: { start, end } }
```

### Converting to LLM Format

`MessageV2.toModelMessage()` converts the internal format to Vercel AI SDK's `ModelMessage[]`:

```typescript
function toModelMessage(input: WithParts[]): ModelMessage[] {
  const result: UIMessage[] = []
  
  for (const msg of input) {
    if (msg.info.role === "user") {
      const userMessage: UIMessage = {
        id: msg.info.id,
        role: "user",
        parts: [],
      }
      for (const part of msg.parts) {
        if (part.type === "text" && !part.ignored) {
          userMessage.parts.push({ type: "text", text: part.text })
        }
        if (part.type === "file" && part.mime !== "text/plain") {
          userMessage.parts.push({ type: "file", url: part.url, mediaType: part.mime })
        }
        // subtask, compaction parts get special handling...
      }
      result.push(userMessage)
    }
    
    if (msg.info.role === "assistant") {
      // Skip errored messages (unless they have content)
      if (msg.info.error && noUsefulContent) continue
      
      const assistantMessage: UIMessage = { id, role: "assistant", parts: [] }
      for (const part of msg.parts) {
        if (part.type === "text") {
          assistantMessage.parts.push({ type: "text", text: part.text })
        }
        if (part.type === "tool") {
          // Convert to tool-call/tool-result format
          if (part.state.status === "completed") {
            assistantMessage.parts.push({
              type: `tool-${part.tool}`,
              state: "output-available",
              toolCallId: part.callID,
              input: part.state.input,
              output: part.state.output,
            })
          }
          // Handle error, pending, running states...
        }
        if (part.type === "reasoning") {
          assistantMessage.parts.push({ type: "reasoning", text: part.text })
        }
      }
      result.push(assistantMessage)
    }
  }
  
  return convertToModelMessages(result, { tools })
}
```

---

## LLM Integration

The `LLM.stream()` function handles communication with models:

```typescript
async function stream(input: StreamInput): Promise<StreamOutput> {
  // 1. Build system prompt
  const system = SystemPrompt.header(model.providerID)
  system.push([
    agent.prompt ?? SystemPrompt.provider(model),
    ...input.system,
    input.user.system,
  ].join("\n"))
  
  // 2. Apply plugin transformations
  await Plugin.trigger("experimental.chat.system.transform", {}, { system })
  
  // 3. Build provider options
  const options = pipe(
    ProviderTransform.options({ model, sessionID }),
    mergeDeep(model.options),
    mergeDeep(agent.options),
    mergeDeep(variant),
  )
  
  // 4. Resolve tools (apply permission filtering)
  const tools = await resolveTools(input)
  
  // 5. Call Vercel AI SDK
  return streamText({
    model: wrapLanguageModel({
      model: language,
      middleware: [
        transformParamsMiddleware,
        extractReasoningMiddleware({ tagName: "think" }),
      ],
    }),
    messages: [...systemMessages, ...input.messages],
    tools,
    activeTools: Object.keys(tools).filter(x => x !== "invalid"),
    maxOutputTokens,
    temperature: params.temperature,
    abortSignal: input.abort,
    
    // Tool call repair for case sensitivity issues
    async experimental_repairToolCall(failed) {
      const lower = failed.toolCall.toolName.toLowerCase()
      if (lower !== failed.toolCall.toolName && tools[lower]) {
        return { ...failed.toolCall, toolName: lower }
      }
      return { ...failed.toolCall, toolName: "invalid", input: JSON.stringify({ error }) }
    },
  })
}
```

### Key Features

1. **System Prompt Layering**: Header → Agent Prompt → Custom System → User System

2. **Provider-Specific Transforms**: `ProviderTransform` handles model-specific quirks:
   - Message normalization (empty content, tool call IDs)
   - Prompt caching (Anthropic, Bedrock)
   - Unsupported modality handling
   - Schema normalization

3. **Tool Call Repair**: Handles common LLM mistakes like incorrect casing

4. **Reasoning Extraction**: Uses middleware to extract `<think>` tags into reasoning parts

---

## Tool System

### Tool Definition

Tools are defined using `Tool.define()`:

```typescript
const BashTool = Tool.define("bash", async () => ({
  description: "Execute shell commands...",
  parameters: z.object({
    command: z.string(),
    timeout: z.number().optional(),
    workdir: z.string().optional(),
    description: z.string(),
  }),
  
  async execute(params, ctx: Tool.Context) {
    // 1. Parse command for permission checking
    const tree = await parser.parse(params.command)
    
    // 2. Check external directory access
    if (directories.size > 0) {
      await ctx.ask({
        permission: "external_directory",
        patterns: Array.from(directories),
        always: Array.from(directories).map(x => path.dirname(x) + "*"),
        metadata: {},
      })
    }
    
    // 3. Check bash command permission
    await ctx.ask({
      permission: "bash",
      patterns: Array.from(patterns),
      always: Array.from(always),
      metadata: {},
    })
    
    // 4. Execute command
    const proc = spawn(params.command, { shell, cwd })
    
    // 5. Stream output to UI via metadata updates
    const append = (chunk: Buffer) => {
      output += chunk.toString()
      ctx.metadata({ metadata: { output, description } })
    }
    proc.stdout?.on("data", append)
    proc.stderr?.on("data", append)
    
    // 6. Handle abort, timeout
    ctx.abort.addEventListener("abort", () => kill())
    setTimeout(() => { timedOut = true; kill() }, timeout)
    
    await waitForExit(proc)
    
    return {
      title: params.description,
      metadata: { output, exit: proc.exitCode },
      output,
    }
  },
}))
```

### Tool Context

Every tool receives a `Tool.Context`:

```typescript
interface Context {
  sessionID: string
  messageID: string
  agent: string
  abort: AbortSignal        // For cancellation
  callID?: string           // Unique ID for this call
  
  // Update UI with progress
  metadata(input: { title?: string, metadata?: object }): void
  
  // Request permission (may throw RejectedError)
  ask(input: {
    permission: string      // Permission type
    patterns: string[]      // Specific patterns to check
    always: string[]        // Patterns for "always allow" option
    metadata: object        // Data shown in permission UI
  }): Promise<void>
}
```

### Tool Registry

Tools are collected from multiple sources:

```typescript
async function all(): Promise<Tool.Info[]> {
  const custom = await loadCustomTools()  // From config directories
  
  return [
    InvalidTool,      // Catches malformed tool calls
    QuestionTool,     // Ask user questions
    BashTool,
    ReadTool,
    GlobTool,
    GrepTool,
    EditTool,
    WriteTool,
    TaskTool,         // Spawn subtasks
    WebFetchTool,
    TodoWriteTool,
    TodoReadTool,
    WebSearchTool,
    CodeSearchTool,
    SkillTool,
    ...custom,
  ]
}
```

### Tool Execution in Processor

The `SessionProcessor` handles tool lifecycle:

```typescript
for await (const value of stream.fullStream) {
  switch (value.type) {
    case "tool-input-start":
      // Create pending tool part
      toolcalls[value.id] = await Session.updatePart({
        type: "tool",
        tool: value.toolName,
        callID: value.id,
        state: { status: "pending", input: {}, raw: "" },
      })
      break
      
    case "tool-call":
      // Transition to running
      await Session.updatePart({
        ...match,
        state: { status: "running", input: value.input, time: { start: Date.now() } },
      })
      
      // Doom loop detection (3 identical calls)
      const lastThree = parts.slice(-DOOM_LOOP_THRESHOLD)
      if (lastThree.every(p => sameToolAndInput(p, value))) {
        await PermissionNext.ask({ permission: "doom_loop", ... })
      }
      break
      
    case "tool-result":
      // Transition to completed
      await Session.updatePart({
        ...match,
        state: {
          status: "completed",
          output: value.output.output,
          metadata: value.output.metadata,
          time: { start, end: Date.now() },
        },
      })
      break
      
    case "tool-error":
      // Transition to error
      await Session.updatePart({
        ...match,
        state: {
          status: "error",
          error: value.error.toString(),
          time: { start, end: Date.now() },
        },
      })
      
      // Check if permission was rejected
      if (value.error instanceof PermissionNext.RejectedError) {
        blocked = true
      }
      break
  }
}
```

---

## Permission System

Permissions control what tools can do:

### Permission Rules

```typescript
interface Rule {
  permission: string    // e.g., "bash", "edit", "external_directory"
  pattern: string       // Glob pattern, e.g., "*.py", "rm *"
  action: "allow" | "deny" | "ask"
}

type Ruleset = Rule[]
```

### Rule Resolution

Rules are evaluated in order, last match wins:

```typescript
function evaluate(permission: string, pattern: string, ...rulesets: Ruleset[]): Rule {
  const merged = merge(...rulesets)
  const match = merged.findLast(rule => 
    Wildcard.match(permission, rule.permission) && 
    Wildcard.match(pattern, rule.pattern)
  )
  return match ?? { action: "ask", permission, pattern: "*" }
}
```

### Asking for Permission

When `action === "ask"`, the loop blocks:

```typescript
async function ask(input: Request & { ruleset: Ruleset }) {
  for (const pattern of request.patterns) {
    const rule = evaluate(request.permission, pattern, ruleset)
    
    if (rule.action === "deny") {
      throw new DeniedError(ruleset)
    }
    
    if (rule.action === "ask") {
      // Block until user responds
      return new Promise<void>((resolve, reject) => {
        pending[id] = { info: request, resolve, reject }
        Bus.publish(Event.Asked, request)
      })
    }
  }
}

async function reply(input: { requestID: string, reply: Reply }) {
  const pending = state.pending[input.requestID]
  
  if (input.reply === "reject") {
    pending.reject(new RejectedError())
    // Also reject all other pending permissions for this session
  }
  
  if (input.reply === "once") {
    pending.resolve()
  }
  
  if (input.reply === "always") {
    // Add to approved rules
    for (const pattern of pending.info.always) {
      state.approved.push({ permission, pattern, action: "allow" })
    }
    pending.resolve()
    // Auto-resolve other pending that now match
  }
}
```

### Default Permissions

Agents have default permission rulesets:

```typescript
const defaults = PermissionNext.fromConfig({
  "*": "allow",                    // Allow by default
  doom_loop: "ask",                // Ask on repeated calls
  external_directory: {
    "*": "ask",                    // Ask for outside-project access
    [Truncate.DIR]: "allow",       // Allow temp dir
  },
  question: "deny",                // Don't allow Question tool by default
  read: {
    "*": "allow",
    "*.env": "ask",                // Ask for .env files
    "*.env.*": "ask",
    "*.env.example": "allow",
  },
})
```

---

## Session Management

### Session State Machine

```
┌─────────┐  prompt()   ┌─────────┐
│  Idle   │ ──────────► │  Busy   │
└─────────┘             └─────────┘
     ▲                       │
     │                       ▼
     │              ┌────────────────┐
     │              │   Processing   │◄──┐
     │              └────────────────┘   │
     │                       │           │
     │         ┌─────────────┼───────────┤
     │         ▼             ▼           │
     │    ┌─────────┐   ┌─────────┐     │
     │    │  Error  │   │  Retry  │─────┘
     │    └─────────┘   └─────────┘
     │         │
     └─────────┴─► cancel()
```

### Status Tracking

```typescript
type SessionStatus = 
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry", attempt: number, message: string, next: number }

function set(sessionID: string, status: Info) {
  Bus.publish(Event.Status, { sessionID, status })
  state[sessionID] = status
}
```

### Retry Logic

On retryable errors (rate limits, overload):

```typescript
function delay(attempt: number, error?: APIError) {
  // Check for Retry-After headers
  if (error?.responseHeaders?.["retry-after-ms"]) {
    return parseFloat(error.responseHeaders["retry-after-ms"])
  }
  if (error?.responseHeaders?.["retry-after"]) {
    return parseFloat(error.responseHeaders["retry-after"]) * 1000
  }
  
  // Exponential backoff
  return Math.min(
    RETRY_INITIAL_DELAY * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1),
    RETRY_MAX_DELAY
  )
}
```

---

## Compaction & Context Management

When context gets too large, OpenCode compacts the conversation.

### Overflow Detection

```typescript
async function isOverflow(input: { tokens: TokenInfo, model: Model }) {
  if (config.compaction?.auto === false) return false
  
  const context = input.model.limit.context
  const count = tokens.input + tokens.cache.read + tokens.output
  const output = Math.min(model.limit.output, OUTPUT_TOKEN_MAX)
  const usable = model.limit.input || context - output
  
  return count > usable
}
```

### Compaction Process

```typescript
async function process(input: { messages, sessionID, abort, auto }) {
  // 1. Create compaction assistant message
  const msg = await Session.updateMessage({
    role: "assistant",
    agent: "compaction",
    summary: true,  // Marks this as a summary
  })
  
  // 2. Create processor with no tools
  const processor = SessionProcessor.create({ assistantMessage: msg, ... })
  
  // 3. Ask model to summarize
  const result = await processor.process({
    tools: {},  // No tools for compaction
    messages: [
      ...MessageV2.toModelMessage(input.messages),
      {
        role: "user",
        content: "Provide a detailed prompt for continuing our conversation..."
      },
    ],
  })
  
  // 4. Add synthetic "continue" message if auto-compacted
  if (result === "continue" && input.auto) {
    await Session.updateMessage({ role: "user", ... })
    await Session.updatePart({ type: "text", synthetic: true, text: "Continue..." })
  }
}
```

### Pruning Old Tool Outputs

To save context, old tool outputs are cleared:

```typescript
async function prune(input: { sessionID: string }) {
  const msgs = await Session.messages({ sessionID })
  let total = 0
  const toPrune = []
  
  // Walk backward, skip last 2 turns
  for (const msg of msgs.reverse()) {
    for (const part of msg.parts.reverse()) {
      if (part.type === "tool" && part.state.status === "completed") {
        if (PRUNE_PROTECTED_TOOLS.includes(part.tool)) continue
        
        const estimate = Token.estimate(part.state.output)
        total += estimate
        
        // Protect last 40k tokens of tool calls
        if (total > PRUNE_PROTECT) {
          toPrune.push(part)
        }
      }
    }
  }
  
  // Clear output if we found >20k tokens to prune
  if (pruned > PRUNE_MINIMUM) {
    for (const part of toPrune) {
      part.state.time.compacted = Date.now()  // Mark as compacted
      await Session.updatePart(part)
    }
  }
}
```

When converting to model messages, compacted tool outputs become `"[Old tool result content cleared]"`.

---

## Snapshot & Revert System

OpenCode maintains file snapshots for undo/revert:

### Taking Snapshots

```typescript
async function track() {
  if (Instance.project.vcs !== "git") return
  
  const git = gitdir()  // .opencode/snapshot/{projectID}
  
  // Initialize if needed
  if (needsInit) {
    await $`git init`.env({ GIT_DIR: git, GIT_WORK_TREE: worktree })
  }
  
  // Stage all files
  await $`git --git-dir ${git} --work-tree ${worktree} add .`
  
  // Create tree object (no commit, just hash)
  const hash = await $`git --git-dir ${git} --work-tree ${worktree} write-tree`.text()
  
  return hash.trim()
}
```

### Tracking Changes

After each step, the processor records what changed:

```typescript
case "start-step":
  snapshot = await Snapshot.track()
  await Session.updatePart({ type: "step-start", snapshot })
  break

case "finish-step":
  const newSnapshot = await Snapshot.track()
  const patch = await Snapshot.patch(snapshot)  // Get changed files
  
  if (patch.files.length) {
    await Session.updatePart({ type: "patch", hash: patch.hash, files: patch.files })
  }
  break
```

### Reverting Changes

```typescript
async function revert(patches: Patch[]) {
  const files = new Set<string>()
  
  for (const patch of patches) {
    for (const file of patch.files) {
      if (files.has(file)) continue
      
      // Checkout file from snapshot
      const result = await $`git --git-dir ${git} checkout ${patch.hash} -- ${file}`
      
      if (result.exitCode !== 0) {
        // File didn't exist in snapshot - delete it
        const existedInSnapshot = await $`git ls-tree ${patch.hash} -- ${file}`.text()
        if (!existedInSnapshot) {
          await fs.unlink(file)
        }
      }
      
      files.add(file)
    }
  }
}
```

---

## Provider Abstraction

The `Provider` namespace manages model providers:

### Provider Registration

```typescript
const BUNDLED_PROVIDERS = {
  "@ai-sdk/anthropic": createAnthropic,
  "@ai-sdk/openai": createOpenAI,
  "@ai-sdk/google": createGoogleGenerativeAI,
  "@ai-sdk/amazon-bedrock": createAmazonBedrock,
  // ...more
}

// Custom loaders for provider-specific setup
const CUSTOM_LOADERS = {
  async anthropic() {
    return {
      autoload: false,
      options: {
        headers: { "anthropic-beta": "claude-code-20250219,..." },
      },
    }
  },
  
  async "amazon-bedrock"() {
    const region = config?.region ?? env.AWS_REGION ?? "us-east-1"
    const credentialProvider = fromNodeProviderChain({ profile })
    
    return {
      autoload: !!profile || !!accessKey,
      options: { region, credentialProvider },
    }
  },
}
```

### Model Resolution

```typescript
async function getModel(providerID: string, modelID: string): Model {
  const provider = state.providers[providerID]
  if (!provider) throw new ModelNotFoundError({ providerID, modelID, suggestions: fuzzyMatch(...) })
  
  const model = provider.models[modelID]
  if (!model) throw new ModelNotFoundError({ providerID, modelID, suggestions: fuzzyMatch(...) })
  
  return model
}

async function getLanguage(model: Model): LanguageModelV2 {
  const sdk = await getSDK(model)
  
  // Use custom loader if available
  if (state.modelLoaders[model.providerID]) {
    return state.modelLoaders[model.providerID](sdk, model.api.id, options)
  }
  
  return sdk.languageModel(model.api.id)
}
```

### Message Transformations

`ProviderTransform` handles model-specific quirks:

```typescript
function message(msgs: ModelMessage[], model: Model, options: object) {
  // Remove unsupported modalities
  msgs = unsupportedParts(msgs, model)
  
  // Normalize messages
  msgs = normalizeMessages(msgs, model, options)
  
  // Apply prompt caching for Anthropic/Bedrock
  if (supportsPromptCaching(model)) {
    msgs = applyCaching(msgs, model.providerID)
  }
  
  return msgs
}

function normalizeMessages(msgs, model, options) {
  // Strip OpenAI itemId metadata
  if (model.api.npm === "@ai-sdk/openai") {
    msgs = stripItemIds(msgs)
  }
  
  // Anthropic rejects empty content
  if (model.api.npm === "@ai-sdk/anthropic") {
    msgs = filterEmptyContent(msgs)
  }
  
  // Normalize tool call IDs for Claude
  if (model.api.id.includes("claude")) {
    msgs = normalizeToolCallIds(msgs)
  }
  
  // Handle reasoning content field for some models
  if (model.capabilities.interleaved?.field === "reasoning_content") {
    msgs = extractReasoningToField(msgs)
  }
  
  return msgs
}
```

---

## Event Bus

The `Bus` provides pub/sub within an instance:

```typescript
namespace Bus {
  const subscriptions = new Map<string, Subscription[]>()
  
  async function publish<T>(def: BusEvent.Definition<T>, properties: T) {
    const payload = { type: def.type, properties }
    
    // Notify local subscribers
    for (const sub of subscriptions.get(def.type) ?? []) {
      sub(payload)
    }
    for (const sub of subscriptions.get("*") ?? []) {
      sub(payload)
    }
    
    // Notify global bus (cross-instance)
    GlobalBus.emit("event", { directory: Instance.directory, payload })
  }
  
  function subscribe<T>(def: BusEvent.Definition<T>, callback: (event: T) => void) {
    const subs = subscriptions.get(def.type) ?? []
    subs.push(callback)
    subscriptions.set(def.type, subs)
    
    return () => { /* unsubscribe */ }
  }
}
```

### Key Events

```typescript
// Session events
Session.Event.Created
Session.Event.Updated
Session.Event.Deleted
Session.Event.Error
Session.Event.Diff

// Message events  
MessageV2.Event.Updated
MessageV2.Event.PartUpdated
MessageV2.Event.Removed

// Permission events
PermissionNext.Event.Asked
PermissionNext.Event.Replied

// Status events
SessionStatus.Event.Status
```

---

## Storage Layer

File-based JSON storage with locking:

```typescript
namespace Storage {
  const dir = path.join(Global.Path.data, "storage")
  
  async function read<T>(key: string[]) {
    const target = path.join(dir, ...key) + ".json"
    using _ = await Lock.read(target)
    return await Bun.file(target).json() as T
  }
  
  async function write<T>(key: string[], content: T) {
    const target = path.join(dir, ...key) + ".json"
    using _ = await Lock.write(target)
    await Bun.write(target, JSON.stringify(content, null, 2))
  }
  
  async function update<T>(key: string[], fn: (draft: T) => void) {
    const target = path.join(dir, ...key) + ".json"
    using _ = await Lock.write(target)
    const content = await Bun.file(target).json()
    fn(content)
    await Bun.write(target, JSON.stringify(content, null, 2))
    return content as T
  }
  
  async function list(prefix: string[]) {
    const results = await glob.scan({ cwd: path.join(dir, ...prefix) })
    return results.map(x => [...prefix, ...x.split(path.sep)])
  }
}
```

### Storage Structure

```
~/.opencode/storage/
├── session/{projectID}/{sessionID}.json     # Session metadata
├── message/{sessionID}/{messageID}.json     # Message metadata
├── part/{messageID}/{partID}.json           # Message parts
├── share/{sessionID}.json                   # Share metadata
├── session_diff/{sessionID}.json            # File diffs
├── project/{projectID}.json                 # Project metadata
└── permission/{projectID}.json              # Approved permissions
```

---

## Plugin System

Plugins extend OpenCode's functionality:

### Plugin Interface

```typescript
interface PluginInstance {
  (input: PluginInput): Promise<Hooks>
}

interface PluginInput {
  client: OpencodeClient     // SDK client
  project: Project.Info
  worktree: string
  directory: string
  serverUrl: string
  $: BunShell
}

interface Hooks {
  auth?: (provider: string) => Promise<AuthResult>
  event?: (input: { event: any }) => void
  tool?: Record<string, ToolDefinition>
  
  // Experimental hooks
  "experimental.chat.system.transform"?: (ctx, output: { system: string[] }) => Promise<void>
  "experimental.chat.messages.transform"?: (ctx, output: { messages: Message[] }) => Promise<void>
  "experimental.text.complete"?: (ctx, output: { text: string }) => Promise<void>
  "experimental.session.compacting"?: (ctx, output: { context: string[], prompt?: string }) => Promise<void>
  "tool.execute.before"?: (ctx, output: { args: object }) => Promise<void>
  "tool.execute.after"?: (ctx, output: { result: object }) => Promise<void>
}
```

### Plugin Loading

```typescript
async function init() {
  // 1. Load internal plugins (Codex auth, Copilot auth)
  for (const plugin of INTERNAL_PLUGINS) {
    const hooks = await plugin(input)
    state.hooks.push(hooks)
  }
  
  // 2. Load builtin plugins from npm
  for (const plugin of BUILTIN) {
    const path = await BunProc.install(plugin)
    const mod = await import(path)
    for (const fn of Object.values(mod)) {
      const hooks = await fn(input)
      state.hooks.push(hooks)
    }
  }
  
  // 3. Load user plugins from config
  for (const plugin of config.plugin ?? []) {
    // Similar loading...
  }
}

async function trigger<Name extends keyof Hooks>(name: Name, input, output) {
  for (const hook of state.hooks) {
    const fn = hook[name]
    if (fn) await fn(input, output)
  }
  return output
}
```

---

## Putting It All Together

### Complete Request Flow

```
1. User sends message
   └── SessionPrompt.prompt(input)
       ├── Create user message with parts
       ├── Touch session (update timestamp)
       └── Call loop(sessionID)

2. Loop starts
   └── SessionPrompt.loop(sessionID)
       ├── Acquire lock (abort controller)
       ├── Load messages (respecting compaction)
       ├── Check exit conditions
       └── Enter while(true) loop

3. Each iteration
   ├── Check for subtasks → Execute in child session
   ├── Check for compaction → Run compaction
   ├── Check for overflow → Trigger compaction
   └── Normal processing:
       ├── Create assistant message
       ├── Resolve tools (with permissions)
       ├── Create SessionProcessor
       └── processor.process(...)

4. Processing
   └── SessionProcessor.process(streamInput)
       ├── Call LLM.stream(...)
       ├── For each stream event:
       │   ├── text-start/delta/end → Create/update TextPart
       │   ├── reasoning-start/delta/end → Create/update ReasoningPart
       │   ├── tool-input-start → Create pending ToolPart
       │   ├── tool-call → Execute tool, update to running
       │   ├── tool-result → Update to completed
       │   ├── tool-error → Update to error
       │   ├── start-step → Take snapshot
       │   ├── finish-step → Record tokens, patches
       │   └── error → Handle retries
       └── Return "continue" | "stop" | "compact"

5. LLM streaming
   └── LLM.stream(input)
       ├── Build system prompt
       ├── Apply provider transforms
       ├── Resolve tools with permissions
       └── streamText({
           model: wrappedModel,
           messages,
           tools,
           ...options
       })

6. Tool execution
   └── tool.execute(args, ctx)
       ├── Parse/validate arguments
       ├── ctx.ask() for permissions (may block)
       ├── Execute logic
       ├── ctx.metadata() for progress updates
       └── Return { title, output, metadata }

7. Loop continues until:
   ├── assistant.finish === "stop" (model done)
   ├── assistant.finish === "length" (hit limit)
   ├── No more tool calls needed
   ├── Error occurred
   └── User cancelled

8. Cleanup
   ├── Prune old tool outputs
   ├── Release lock
   └── Return final assistant message
```

### Key Implementation Considerations

1. **Streaming First**: Everything is designed for streaming. Parts are created incrementally, UI updates happen via Bus events.

2. **State Isolation**: Use `Instance.state()` for per-project state. Use `lazy()` for singleton state.

3. **Error Recovery**: Wrap retryable errors, use exponential backoff with header hints.

4. **Context Management**: Monitor token usage, trigger compaction before overflow, prune old outputs.

5. **Permission Safety**: Default to "ask", check permissions before tool execution, block until user responds.

6. **Extensibility**: Plugins can hook into system prompts, message transforms, tool execution.

7. **Snapshot for Safety**: Take snapshots before each LLM step, enable revert of file changes.

---

## Appendix: File Locations

| Component | Location |
|-----------|----------|
| Main Loop | `packages/opencode/src/session/prompt.ts` |
| Processor | `packages/opencode/src/session/processor.ts` |
| LLM Integration | `packages/opencode/src/session/llm.ts` |
| Message System | `packages/opencode/src/session/message-v2.ts` |
| Session | `packages/opencode/src/session/index.ts` |
| Tool Definition | `packages/opencode/src/tool/tool.ts` |
| Tool Registry | `packages/opencode/src/tool/registry.ts` |
| Permission System | `packages/opencode/src/permission/next.ts` |
| Provider Layer | `packages/opencode/src/provider/provider.ts` |
| Provider Transforms | `packages/opencode/src/provider/transform.ts` |
| Agent System | `packages/opencode/src/agent/agent.ts` |
| Compaction | `packages/opencode/src/session/compaction.ts` |
| Snapshot | `packages/opencode/src/snapshot/index.ts` |
| Storage | `packages/opencode/src/storage/storage.ts` |
| Event Bus | `packages/opencode/src/bus/index.ts` |
| Plugin System | `packages/opencode/src/plugin/index.ts` |
| Config | `packages/opencode/src/config/config.ts` |
| Instance | `packages/opencode/src/project/instance.ts` |
| MCP Integration | `packages/opencode/src/mcp/index.ts` |

---

*This document was generated by analyzing the OpenCode codebase. For the most up-to-date implementation details, refer to the source code directly.*
