# OpenCode Core Tools Reference

This document provides a comprehensive reference for implementing a similar agent system, detailing all core tools for reading, editing, finding, and searching files.

## Table of Contents

- [Tool System Overview](#tool-system-overview)
- [Read Tool](#read-tool)
- [Write Tool](#write-tool)
- [Edit Tool](#edit-tool)
- [MultiEdit Tool](#multiedit-tool)
- [Grep Tool](#grep-tool)
- [Glob Tool](#glob-tool)
- [List Tool](#list-tool)
- [Bash Tool](#bash-tool)
- [Output Truncation](#output-truncation)

---

## Tool System Overview

### Tool Definition Structure

All tools are defined using the `Tool.define()` function with the following TypeScript interface:

```typescript
interface Info<Parameters extends z.ZodType = z.ZodType, Metadata extends object = object> {
  id: string
  init: (ctx?: InitContext) => Promise<{
    description: string
    parameters: Parameters // Zod schema for parameters
    execute(
      args: z.infer<Parameters>,
      ctx: Context,
    ): Promise<{
      title: string
      metadata: Metadata
      output: string
      attachments?: MessageV2.FilePart[]
    }>
    formatValidationError?(error: z.ZodError): string
  }>
}
```

### Context Object

The execute function receives a context object with:

```typescript
type Context<Metadata = object> = {
  sessionID: string
  messageID: string
  agent: string
  abort: AbortSignal
  callID?: string
  extra?: { [key: string]: any }
  metadata(input: { title?: string; metadata?: Metadata }): void
  ask(input: Omit<PermissionRequest, "id" | "sessionID" | "tool">): Promise<void>
}
```

### Tool Registry

Tools are registered and initialized through the tool registry, which:

1. Loads built-in tools
2. Discovers custom tools from `tool/*.{js,ts}` in config directories
3. Loads tools from plugins
4. Validates parameters using Zod schemas
5. Applies output truncation

---

## Read Tool

**Tool ID**: `read`

### Purpose

Reads file contents from the local filesystem with support for:

- Pagination (offset/limit)
- Binary file detection
- Image/PDF preview with base64 attachments
- Line numbers in `cat -n` format

### Schema

```typescript
{
  filePath: z.string().describe("The path to the file to read")
  offset: z.coerce.number().describe("The line number to start reading from (0-based)").optional()
  limit: z.coerce.number().describe("The number of lines to read (defaults to 2000)").optional()
}
```

### Constants

```typescript
const DEFAULT_READ_LIMIT = 2000
const MAX_LINE_LENGTH = 2000
const MAX_BYTES = 50 * 1024 // Applied via truncation
```

### Execution Logic

1. **Path Resolution**: Converts relative paths to absolute paths based on `process.cwd()`

2. **External Directory Check**: Validates file path is within allowed directories

3. **Permission Check**: Asks for "read" permission

4. **File Existence Check**: Returns error with suggestions if file not found

5. **Binary Detection**:
   - Checks extension against known binary types (`.zip`, `.exe`, `.dll`, `.so`, `.class`, `.jar`, `.wasm`, `.pyc`, etc.)
   - If extension unknown, checks first 4KB for non-printable characters
   - If >30% non-printable or contains null bytes, treats as binary

6. **Special File Types**:
   - **Images**: Returns base64-encoded attachment, output: "Image read successfully"
   - **PDF**: Returns base64-encoded attachment, output: "PDF read successfully"

7. **Content Reading**:
   - Splits content into lines
   - Applies offset and limit
   - Truncates lines exceeding `MAX_LINE_LENGTH` (2000 chars)
   - Enforces `MAX_BYTES` (50KB) total limit

8. **Output Format**:

```
<file>
00001| line 1
00002| line 2
...
</file>
```

9. **Metadata**: LSP client is warmed up for the file

### Key Behaviors

- **Batch Reading Recommended**: Can read multiple files in parallel
- **Empty Files**: Returns system reminder for empty content
- **Truncation**: Indicates if more content exists beyond limit
- **Binary Files**: Throws error, cannot read

---

## Write Tool

**Tool ID**: `write`

### Purpose

Writes or overwrites files with:

- Diff generation for permission confirmation
- LSP diagnostics integration
- File modification tracking

### Schema

```typescript
{
  content: z.string().describe("The content to write to the file")
  filePath: z.string().describe("The absolute path to the file to write (must be absolute, not relative)")
}
```

### Constants

```typescript
const MAX_DIAGNOSTICS_PER_FILE = 20
const MAX_PROJECT_DIAGNOSTICS_FILES = 5
```

### Execution Logic

1. **Path Resolution**: Resolves absolute path (or relative to instance directory)

2. **External Directory Check**: Validates path is within allowed directories

3. **File Status Check**: Determines if file exists and reads existing content

4. **Modification Time Check**: Asserts file hasn't been modified since last read

5. **Diff Generation**: Uses `createTwoFilesPatch()` to generate unified diff

6. **Permission Check**: Asks for "edit" permission with diff metadata

7. **File Write**: Uses `Bun.write()` to write content

8. **Event Publishing**: Publishes `File.Event.Edited` event

9. **Diagnostics Retrieval**:
   - Triggers LSP touch with `edit: true`
   - Retrieves diagnostics via `LSP.diagnostics()`
   - Shows errors from edited file and up to 5 other project files
   - Limits to 20 errors per file

10. **Output**: Returns formatted diagnostics if errors present

### Key Behaviors

- **Overwrites Existing**: Replaces entire file content
- **Requires Previous Read**: Implicitly tracked via `FileTime.assert()` (but not explicitly checked in this tool)
- **Trims Diff**: Removes leading whitespace from diff for cleaner display
- **Diagnostics**: Shows errors in edited file and ripple effects in other files

---

## Edit Tool

**Tool ID**: `edit`

### Purpose

Performs string replacement with sophisticated fuzzy matching to handle:

- Whitespace variations
- Indentation differences
- Multiple occurrences
- Context-aware matching

### Schema

```typescript
{
  filePath: z.string().describe("The absolute path to the file to modify")
  oldString: z.string().describe("The text to replace")
  newString: z.string().describe("The text to replace it with (must be different from oldString)")
  replaceAll: z.boolean().optional().describe("Replace all occurrences of oldString (default false)")
}
```

### Constants

```typescript
const MAX_DIAGNOSTICS_PER_FILE = 20
const SINGLE_CANDIDATE_SIMILARITY_THRESHOLD = 0.0
const MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD = 0.3
```

### Execution Logic

1. **Validation**:
   - Throws if `filePath` is missing
   - Throws if `oldString === newString`

2. **Path Resolution**: Resolves absolute path

3. **External Directory Check**: Validates path is within allowed directories

4. **File Locking**: Uses `FileTime.withLock()` for atomic operations

5. **Special Case - Empty oldString**: Creates new file directly

6. **Normal Case - String Replacement**:
   - Reads existing file content
   - Validates file exists and is not directory
   - Asserts file hasn't been modified since last read
   - Calls `replace()` function with fuzzy matching strategies

7. **Permission Check**: Asks for "edit" permission with trimmed diff

8. **File Write**: Writes new content

9. **Diff Calculation**: Generates diff for display and metadata

10. **Event Publishing**: Publishes `File.Event.Edited` event

11. **Snapshot Metadata**: Tracks additions and deletions

12. **Diagnostics**: Retrieves and displays LSP errors

### Fuzzy Matching Strategies

The `replace()` function applies multiple replacers in order:

#### 1. SimpleReplacer

Exact string match

#### 2. LineTrimmedReplacer

Matches lines when both sides are `.trim()`-ed (ignores leading/trailing whitespace)

#### 3. BlockAnchorReplacer

Matches multi-line blocks using first and last lines as anchors:

- Requires minimum 3 lines
- Uses Levenshtein distance to calculate similarity
- Single candidate: accepts if similarity ≥ 0.0 (very lenient)
- Multiple candidates: accepts if similarity ≥ 0.3

#### 4. WhitespaceNormalizedReplacer

Normalizes all whitespace to single spaces before matching

#### 5. IndentationFlexibleReplacer

Removes relative indentation before matching (maintains absolute structure)

#### 6. EscapeNormalizedReplacer

Unescapes escape sequences (`\n`, `\t`, `\"`, etc.) before matching

#### 7. TrimmedBoundaryReplacer

Trims whitespace from boundaries before matching

#### 8. ContextAwareReplacer

Multi-line matching with first/last lines as anchors, requires 50% line similarity

#### 9. MultiOccurrenceReplacer

Yields all exact matches (used with `replaceAll`)

### Levenshtein Distance Algorithm

```typescript
function levenshtein(a: string, b: string): number {
  if (a === "" || b === "") return Math.max(a.length, b.length)

  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost)
    }
  }

  return matrix[a.length][b.length]
}
```

### Key Behaviors

- **Multiple Matches**: Throws error if `oldString` found multiple times unless `replaceAll=true`
- **Line Number Prefix**: Must exclude line number prefix when copying from Read tool
- **Whitespace Preservation**: Original file whitespace is preserved, matching is flexible
- **Atomic**: Operations are wrapped in file lock for safety

---

## MultiEdit Tool

**Tool ID**: `multiedit`

### Purpose

Performs multiple sequential edits on a single file in one operation.

### Schema

```typescript
{
  filePath: z.string().describe("The absolute path to the file to modify")
  edits: z.array(
    z.object({
      filePath: z.string().describe("The absolute path to the file to modify"),
      oldString: z.string().describe("The text to replace"),
      newString: z.string().describe("The text to replace it with (must be different from oldString)"),
      replaceAll: z.boolean().optional().describe("Replace all occurrences of oldString (default false)"),
    }),
  ).describe("Array of edit operations to perform sequentially on the file")
}
```

### Execution Logic

1. Initializes EditTool
2. Iterates through edits array
3. Executes each edit operation sequentially
4. Aggregates results
5. Returns final result with aggregated metadata

### Key Behaviors

- **Sequential Execution**: Edits are applied one after another, not in parallel
- **Shared Context**: All edits share the same context object
- **Final Output**: Returns output from the last edit operation

---

## Grep Tool

**Tool ID**: `grep`

### Purpose

Fast content search using ripgrep for:

- Regex pattern matching
- File filtering by pattern
- Sorted results by modification time

### Schema

```typescript
{
  pattern: z.string().describe("The regex pattern to search for in file contents")
  path: z.string().optional().describe("The directory to search in. Defaults to the current working directory.")
  include: z.string().optional().describe('File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")')
}
```

### Constants

```typescript
const MAX_LINE_LENGTH = 2000
const LIMIT = 100 // Maximum number of matches returned
```

### Execution Logic

1. **Validation**: Throws if `pattern` is empty

2. **Permission Check**: Asks for "grep" permission

3. **Path Resolution**: Resolves search directory (default: instance directory)

4. **External Directory Check**: Validates path is within allowed directories

5. **Ripgrep Execution**:
   - Path: Retrieved via `Ripgrep.filepath()`
   - Args: `["-nH", "--hidden", "--follow", "--field-match-separator=|", "--regexp", pattern]`
   - If `include` provided: adds `["--glob", include]`
   - Spawns process with stdout/stderr piped

6. **Output Parsing**:
   - Splits by `\r?\n` (handles both Unix and Windows line endings)
   - Parses format: `filePath|lineNum|lineText`
   - Filters out invalid entries

7. **Sorting**: Sorts matches by modification time (newest first)

8. **Truncation**: Limits to 100 matches, marks as truncated if more

9. **Output Format**:

```
Found N matches

/path/to/file1:
  Line 123: matching line text
  Line 456: another match

/path/to/file2:
  Line 789: match in another file
```

### Key Behaviors

- **No Matches**: Returns "No files found" (exit code 1 is success)
- **Line Truncation**: Truncates lines exceeding 2000 characters
- **Pattern Escape**: Regex pattern is passed directly to ripgrep
- **Hidden Files**: Searches hidden files (`--hidden` flag)
- **Symlinks**: Follows symbolic links (`--follow` flag)

---

## Glob Tool

**Tool ID**: `glob`

### Purpose

Fast file pattern matching using ripgrep for finding files by name patterns.

### Schema

```typescript
{
  pattern: z.string().describe("The glob pattern to match files against")
  path: z.string()
    .optional()
    .describe(
      `The directory to search in. If not specified, the current working directory will be used. IMPORTANT: Omit this field to use the default directory. DO NOT enter "undefined" or "null" - simply omit it for the default behavior. Must be a valid directory path if provided.`,
    )
}
```

### Constants

```typescript
const LIMIT = 100 // Maximum number of files returned
```

### Execution Logic

1. **Permission Check**: Asks for "glob" permission

2. **Path Resolution**: Resolves search directory (default: instance directory)

3. **External Directory Check**: Validates path is within allowed directories

4. **File Search**:
   - Uses `Ripgrep.files()` with glob pattern
   - Iterates asynchronously over results
   - Stops when limit (100) reached

5. **Metadata Collection**:
   - Resolves full path
   - Gets file modification time via `Bun.file().stat().mtime`
   - Handles missing files gracefully (returns 0)

6. **Sorting**: Sorts files by modification time (newest first)

7. **Output Format**:

```
/path/to/file1
/path/to/file2
...
```

8. **Truncation**: Adds message if results truncated

### Key Behaviors

- **Batch Recommended**: Can run multiple globs in parallel
- **No Matches**: Returns "No files found"
- **Modification Time**: Uses file stats for sorting
- **Async Iteration**: Uses async generator for efficiency

---

## List Tool

**Tool ID**: `list`

### Purpose

Lists directory contents in tree structure with intelligent ignoring of common directories.

### Schema

```typescript
{
  path: z.string().describe("The absolute path to the directory to list (must be absolute, not relative)").optional()
  ignore: z.array(z.string()).describe("List of glob patterns to ignore").optional()
}
```

### Constants

```typescript
const IGNORE_PATTERNS = [
  "node_modules/",
  "__pycache__/",
  ".git/",
  "dist/",
  "build/",
  "target/",
  "vendor/",
  "bin/",
  "obj/",
  ".idea/",
  ".vscode/",
  ".zig-cache/",
  "zig-out",
  ".coverage",
  "coverage/",
  "vendor/",
  "tmp/",
  "temp/",
  ".cache/",
  "cache/",
  "logs/",
  ".venv/",
  "venv/",
  "env/",
]

const LIMIT = 100 // Maximum number of files listed
```

### Execution Logic

1. **Path Resolution**: Resolves search path (default: instance directory)

2. **External Directory Check**: Validates path is within allowed directories

3. **Permission Check**: Asks for "list" permission

4. **Ignore Pattern Setup**:
   - Combines default patterns with user patterns
   - Prefixes with `!` for negation

5. **File Discovery**:
   - Uses `Ripgrep.files()` with negated ignore patterns
   - Stops when limit (100) reached

6. **Directory Structure Building**:
   - Collects all unique directories
   - Maps files to their parent directories

7. **Tree Rendering**:
   - Recursively renders directory structure
   - Shows subdirectories first, then files
   - Uses 2-space indentation per level

8. **Output Format**:

```
/path/to/list/

subdir1/
  subdir2/
    file1.ts
    file2.ts
  file3.ts
file4.ts
```

### Key Behaviors

- **Tree Structure**: Maintains hierarchical directory tree
- **Sorted**: Files and directories sorted alphabetically
- **Common Ignores**: Automatically excludes build artifacts and cache directories
- **Custom Ignores**: Allows user-specified ignore patterns

---

## Bash Tool

**Tool ID**: `bash`

### Purpose

Executes shell commands with:

- Timeout handling
- Permission system
- Abort support
- Command parsing for security
- Directory and path tracking

### Schema

```typescript
{
  command: z.string().describe("The command to execute")
  timeout: z.number().describe("Optional timeout in milliseconds").optional()
  workdir: z.string()
    .describe(
      `The working directory to run the command in. Defaults to ${Instance.directory}. Use this instead of 'cd' commands.`,
    )
    .optional()
  description: z.string().describe(
    "Clear, concise description of what this command does in 5-10 words. Examples:\n" +
      "Input: ls\nOutput: Lists files in current directory\n\n" +
      "Input: git status\nOutput: Shows working tree status\n\n" +
      "Input: npm install\nOutput: Installs package dependencies\n\n" +
      "Input: mkdir foo\nOutput: Creates directory 'foo'",
  )
}
```

### Constants

```typescript
const MAX_METADATA_LENGTH = 30_000 // For preview in metadata
const DEFAULT_TIMEOUT = 2 * 60 * 1000 // 2 minutes (can be overridden by flag)
```

### Execution Logic

1. **Working Directory Setup**: Uses `workdir` or defaults to instance directory

2. **Timeout Validation**: Ensures timeout is positive if provided

3. **Command Parsing**:
   - Uses tree-sitter-bash parser to parse command
   - Extracts all command structures

4. **Path Extraction**:
   - Iterates through command nodes
   - Identifies file operations: `cd`, `rm`, `cp`, `mv`, `mkdir`, `touch`, `chmod`, `chown`
   - Resolves file paths using `realpath`
   - Handles Windows Git Bash path conversion (`/c/Users/...` → `C:\Users\...`)

5. **Permission Requests**:
   - **External Directory**: Asks permission if command accesses paths outside instance
   - **Bash Permission**: Asks permission for command execution
   - Calculates allowed patterns using `BashArity.prefix()`

6. **Process Spawning**:
   - Uses detected shell (via `Shell.acceptable()`)
   - Spawns with:
     - `detached: false` (Windows), `detached: true` (Unix)
     - `stdio: ["ignore", "pipe", "pipe"]`
     - Inherited environment variables

7. **Stream Handling**:
   - Attaches handlers to stdout and stderr
   - Appends chunks to output
   - Updates metadata in real-time (truncated to 30KB)

8. **Abort Handling**:
   - Listens to `ctx.abort` signal
   - Kills process tree on abort

9. **Timeout Handling**:
   - Sets timeout timer (+100ms buffer)
   - Kills process tree on timeout

10. **Cleanup**:
    - Clears timers and event listeners on process exit

11. **Output Formatting**:
    - Adds metadata messages for timeout/abort
    - Returns full output (truncated separately if needed)

### Command Parsing Detail

Uses `tree-sitter-bash` Wasm parser to:

- Parse command structure
- Identify command names and arguments
- Extract paths from file operations
- Detect command chaining

### BashArity

Calculates permission patterns:

- `BashArity.prefix(command)`: Returns command prefix pattern for permission checking
- Used to generate `always` allow patterns

### Key Behaviors

- **No cd**: Use `workdir` instead of `cd` commands
- **Real-time Updates**: Metadata updates during execution
- **Process Tree Killing**: Properly kills entire process tree
- **Timeout**: Default 2 minutes, configurable
- **Path Tracking**: Identifies external directory access
- **Windows Support**: Handles Git Bash path conversion

---

## Output Truncation

### Purpose

Automatically truncates large tool outputs to manage context while preserving full output for later access.

### Constants

```typescript
const MAX_LINES = 2000
const MAX_BYTES = 50 * 1024 // 50KB
const DIR = path.join(Global.Path.data, "tool-output")
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
```

### Truncation Logic

The `Truncate.output()` function:

1. **Check Limits**:
   - Split text into lines
   - Calculate total bytes
   - Return early if within both limits

2. **Direction-based Truncation**:
   - **head** (default): Keep first N lines/bytes
   - **tail**: Keep last N lines/bytes

3. **Byte-aware Truncation**:
   - Accumulate lines until limit hit
   - Stop when `bytes + size > maxBytes`

4. **Full Output Storage**:
   - Generates unique ID using `Identifier.ascending("tool")`
   - Writes full output to file in `tool-output/` directory

5. **Hint Generation**:
   - If agent has Task tool permission: Suggest using Task subagent
   - Otherwise: Suggest using Grep or Read with offset/limit

6. **Message Format**:
   - **head**: Shows preview, truncation info, hint
   - **tail**: Shows truncation info, hint, preview

### Cleanup

Automatically cleans up output files older than 7 days on first truncation.

### Example Output

```
[First 2000 lines of output]

...500 lines truncated...

The tool call succeeded but the output was truncated. Full output saved to: /path/to/tool-output/tool_123
Use Grep to search the full content or Read with offset/limit to view specific sections.
```

### Integration with Tools

All tools except `write` and `edit` (which handle their own output) are automatically wrapped with truncation via the `Tool.define()` wrapper.

---

## Implementation Notes

### Zod Schema Validation

All tool parameters are validated using Zod schemas. If validation fails:

1. Calls `formatValidationError()` if provided
2. Otherwise, throws generic error message with Zod error details

### File System Operations

- **Bun APIs**: Preferred over Node.js fs (e.g., `Bun.file()`, `Bun.write()`)
- **Path Resolution**: Always resolve relative paths to absolute
- **Error Handling**: Use `.catch()` for graceful file stat failures

### External Directory Checking

The `assertExternalDirectory()` function:

- Checks if path is within instance directory
- Supports `kind: "directory"` validation
- Supports `bypass` flag for special cases
- Throws error if path is outside allowed directories

### LSP Integration

- **Touch File**: `LSP.touchFile(filepath, edit: boolean)` warms up LSP client
- **Diagnostics**: `LSP.diagnostics()` returns error information across project
- **File Format**: Uses `Filesystem.normalizePath()` for consistent paths

### Event System

- **File Events**: Publish `File.Event.Edited` on write/edit operations
- **Event Bus**: Uses `Bus.publish()` for event distribution

### File Time Tracking

- **Read Tracking**: `FileTime.read(sessionID, filepath)` records read operations
- **Modification Assertion**: `FileTime.assert(sessionID, filepath)` ensures file hasn't changed
- **Locking**: `FileTime.withLock(filepath, callback)` provides atomic file operations

---

## Tool Dependencies

### External Dependencies

- **zod**: Schema validation
- **diff**: Unified diff generation (`createTwoFilesPatch`, `diffLines`)
- **tree-sitter-bash**: Bash command parsing (Wasm)
- **ripgrep**: Fast file search (binary, path resolved at runtime)

### Internal Modules

- **Tool**: Core tool definition and execution
- **Instance**: Project directory and worktree management
- **Filesystem**: Path normalization utilities
- **LSP**: Language Server Protocol integration
- **FileTime**: File modification tracking and locking
- **Bus**: Event publishing system
- **Shell**: Shell detection and process management
- **Ripgrep**: Ripgrep binary resolution and execution

---

## Key Design Patterns

### 1. Tool Registry Pattern

- Tools are defined and registered centrally
- Lazy initialization on first use
- Custom tools discovered from plugins

### 2. Permission Integration

- All tools ask for permission before critical operations
- Permission requests include patterns for granular control
- Metadata provides context for permission decisions

### 3. Output Truncation Pattern

- Automatic truncation for large outputs
- Full output preserved for later access
- Hint system guides agent to access full output

### 4. Fuzzy Matching Pattern

- Multiple strategies attempted in order
- Graceful degradation from exact to fuzzy
- Context-aware matching for better accuracy

### 5. Streaming Pattern

- Real-time output updates via metadata
- Progressive information delivery
- Abort support for long operations

---

## Summary

This core tool system provides:

- **8 Core Tools**: read, write, edit, multiedit, grep, glob, list, bash
- **Robust Validation**: Zod schema validation for all parameters
- **Security**: Permission system with pattern-based access control
- **Performance**: Fast operations using ripgrep and Bun APIs
- **User Experience**: Fuzzy matching, real-time updates, helpful error messages
- **Extensibility**: Plugin system for custom tools
- **Reliability**: File locking, atomic operations, proper cleanup

The system prioritizes safety (permissions, validation), performance (ripgrep, lazy loading), and usability (fuzzy matching, clear errors, streaming updates) to provide a powerful yet safe code editing agent.
