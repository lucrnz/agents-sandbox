# Find Application Issues (AI Command Center)

Perform a comprehensive audit of the codebase to identify security vulnerabilities, architectural flaws, reliability issues, and quality gaps.

## 1. Analysis Scope

Audit the following areas, applying both generic best practices and project-specific architecture:

### Security & Sandbox Integrity
- **Agent Sandbox Escapes**: Verify `src/backend/agent/` tools (`view-tool.ts`, `grep-tool.ts`, `web-fetch.ts`) strictly validate paths against `/home/agent` (virtual root) and prevent path traversal (`../`).
- **FFI Memory Safety**: Check `go-lib-ffi` (Go) and `src/backend/go-lib-ffi.ts` for memory leaks, unclosed C-strings, or unsafe pointer handling across the CGO boundary.
- **Input Validation**: Ensure all incoming WebSocket commands are validated against Zod schemas. Check for XSS in markdown rendering.
- **Database Security**: Check for raw SQL usage that might bypass Drizzle ORM parameterization.
- **Secret Management**: Ensure `XAI_API_KEY` and `MISTRAL_API_KEY` are never logged or sent to the client.
- **Dependency Vulnerabilities**: Check for known CVEs in dependencies (`bun audit` or manual review of `bun.lock`).

### Code Quality & Patterns
- **Dead Code**: Identify unused imports/variables. 
  - **Exception**: Unused shadcn components in `src/frontend/components/ui/` are permitted as they may be utilized later.
- **Code Duplication**: Identify repeated logic that should be abstracted into shared utilities.
- **Magic Values**: Check for hardcoded strings/numbers that should be constants or config.
- **Cyclomatic Complexity**: Flag overly complex functions that are difficult to test/maintain.
- **Project Patterns**: Check `src/frontend/components/ui/` for consistency with shadcn/ui patterns (`cva`, `cn`).
- **Agent Tool Robustness**: Ensure tools handle failures (timeouts, network errors) without crashing the server.
- **Bun Specifics**: Identify accidental Node.js-only API usage (should use `Bun.*` APIs).

### Testing & Test Quality
- **Missing Unit Tests**: Identify critical paths lacking test coverage:
  - Agent tools (`src/backend/agent/*.ts`) - sandbox validation, error handling.
  - WebSocket command handlers (`src/backend/command-handlers.ts`).
  - Database queries (`src/backend/db/queries.ts`).
  - Go FFI functions (`go-lib-ffi/`).
- **Test Best Practices**:
  - Tests should be isolated (no shared mutable state between tests).
  - Avoid testing implementation details; test behavior and contracts.
  - Mock external dependencies (network, database) appropriately.
  - Use descriptive test names that explain the expected behavior.
  - Avoid flaky tests (timing-dependent assertions, order-dependent tests).
- **Test Anti-Patterns**:
  - Tests that always pass (no real assertions).
  - Overly broad assertions (e.g., `expect(result).toBeTruthy()` when specific values matter).
  - Missing edge case coverage (null inputs, empty arrays, error states).
  - Tests coupled to UI implementation details instead of user-visible behavior.

### Error Handling & Resilience
- **Swallowed Errors**: Check for `catch` blocks that log but don't propagate or handle errors meaningfully.
- **Error Context**: Ensure errors include enough context (file, operation, inputs) for debugging.
- **Graceful Degradation**: Verify the app handles external service failures (AI API down, network issues) gracefully.
- **User-Facing Errors**: Ensure error messages shown to users are helpful, not raw stack traces.
- **Retry Logic**: Check for missing retries on transient failures (network timeouts, rate limits).

### Architectural Issues
- **Sub-Agent Isolation**: Verify the separation between `ChatAgent` (parent) and `AgenticFetch` (sub-agent). Ensure recursive depth is limited.
- **Separation of Concerns**: Check for tight coupling or circular dependencies.
- **WebSocket State**: Ensure connection state (e.g. `conversationId`) is managed correctly.
- **Abstraction Leaks**: Check if implementation details leak across module boundaries.
- **Scalability**: Identify potential bottlenecks (blocking operations, unbounded queues, memory accumulation).

### Performance
- **Frontend**:
  - Unnecessary re-renders (missing `useMemo`, `useCallback`, or React.memo).
  - Heavy computations in render path.
  - Large bundle sizes or missing code splitting.
  - Memory leaks (event listeners, subscriptions not cleaned up).
- **Backend**:
  - Blocking operations in async handlers.
  - Inefficient database queries (N+1, missing indexes).
  - Unbounded data structures that grow without limits.

### TypeScript Best Practices
- **Type Safety**: Usage of `any` instead of proper typing; excessive type assertions (`as`).
- **Return Types**: Missing explicit return types on public functions.
- **Null Handling**: Improper handling of `null`/`undefined`, especially from database queries.
- **Generics**: Missing or incorrect generics where type inference would benefit.
- **Discriminated Unions**: Missing discriminated unions for state management (e.g., loading/success/error states).

### Async & Concurrency
- **Floating Promises**: Unawaited async calls that silently fail.
- **Race Conditions**: Shared state modified by concurrent operations without synchronization.
- **Deadlocks**: Circular awaits or improper lock ordering.
- **Cancellation**: Missing `AbortController` support for long-running operations.
- **Error Propagation**: Errors in async callbacks not properly surfaced.

### Golang Best Practices (go-lib-ffi)
- **Panic Safety**: Ensure `CleanHTML`, `ParseSearchResults` handle malformed inputs without panicking.
- **Error Handling**: Check for ignored errors, especially from `Close()`, `Write()`.
- **Resource Leaks**: Unclosed files, HTTP response bodies, or channels.
- **CGO Memory**: Verify proper usage of `C.CString` and `C.free` in the FFI layer.
- **Context Propagation**: Ensure contexts are passed through for cancellation support.
- **Goroutine Leaks**: Goroutines that never terminate or aren't properly joined.

### Documentation & Maintainability
- **Missing Comments**: Complex logic or non-obvious code without explanatory comments.
- **Outdated Comments**: Comments that don't match the current code behavior.
- **TODO/FIXME**: Unresolved TODOs that indicate incomplete features or known bugs.
- **API Documentation**: Missing JSDoc/GoDoc for public APIs.

---

## 2. Issue Severity Categories

### 🚨 Critical
Immediate security risks, data loss, or catastrophic failures:
- Remote code execution or sandbox escapes.
- Authentication/authorization bypasses.
- Unhandled panics in critical backend paths.
- Credential exposure (API keys in logs/client).
- Data corruption or loss bugs.

### 🔴 High
Significant problems affecting core functionality or reliability:
- Race conditions or memory leaks in FFI/Concurrent code.
- Resource leaks (unclosed files/connections) that accumulate.
- Missing input validation on external inputs.
- Bugs affecting agent reasoning or command execution.
- Missing tests for critical security-sensitive code paths.

### 🟠 Medium
Maintainability impacts or edge case problems:
- Error handling that swallows context.
- Brittle code patterns or deviations from Go/TS idioms.
- Missing timeouts on network operations.
- Improper separation of concerns.
- Test anti-patterns that reduce test reliability.
- Performance issues under normal load.

### 🟡 Low
Minor improvements with no immediate risk:
- Code style inconsistencies (outside of shadcn components).
- Opportunities for simplification or performance tweaks.
- Documentation gaps in internal APIs.
- Missing tests for non-critical helper functions.
- Minor code duplication.

---

## 3. Output Format

### Codebase Review Summary
Brief overview of the current state of the codebase, written like a senior engineer who just reviewed the entire app.

| Severity | Count |
|----------|-------|
| 🚨 Critical | X     |
| 🔴 High     | X     |
| 🟠 Medium   | X     |
| 🟡 Low      | X     |

### Issues (Ordered by Severity)

#### [<Severity-Code>-<Number>] <Short descriptive title>
**Location**: `file/path.ts:line`
**Category**: Security | Testing | Reliability | Architecture | Performance | etc.

**Description**:
What the issue is and why it matters.

**Code**:
```typescript
// The problematic code snippet
```

**Impact**:
Specific consequences if not addressed.

**Suggested Fix**:
```typescript
// How to fix it
```

---

### 📝 Notes
Any observations about the codebase that don't fit into issues but are worth mentioning.

*Note: If no issues are found in a severity category, omit that section entirely. If no issues are found at all, provide a congratulations message starting with 🎉.*
