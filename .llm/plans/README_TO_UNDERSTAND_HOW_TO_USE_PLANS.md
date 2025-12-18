# Implementation Plans

This directory stores implementation plans as markdown files. Plans provide detailed roadmaps for complex code changes, helping AI agents break down large tasks into structured, executable steps.

## Purpose

**When to create a plan:**
- Complex features requiring multiple file changes across different modules
- Non-trivial refactoring that affects system architecture
- Bug fixes with unclear root causes requiring investigation
- Changes requiring careful consideration of edge cases and side effects
- Tasks where implementation approach needs documentation for future reference

**When NOT to create a plan:**
- Simple, single-file changes
- Straightforward bug fixes with obvious solutions
- Routine maintenance tasks
- Documentation-only updates

## Plan File Naming Convention

**Format:** `PLAN_YYYYMMdd_DESCRIPTION.md`

**Rules:**
- Prefix: `PLAN_`
- Date: 8-digit timestamp in format `YYYYMMdd` (e.g., `20251217` for December 17, 2025)
- Description: ALL_UPPERCASE with underscores separating words
- Extension: `.md`

**Examples:**
- `PLAN_20251217_ADD_USER_AUTHENTICATION.md`
- `PLAN_20251218_REFACTOR_WEBSOCKET_HANDLER.md`
- `PLAN_20251220_FIX_DATABASE_MIGRATION_ISSUE.md`

## Plan Structure

Each plan should contain:

1. **Overview** - Brief description of what needs to be done and why
2. **Current State** - What exists now, what's broken, or what's missing
3. **Proposed Solution** - High-level approach to solving the problem
4. **Implementation Steps** - Ordered list of concrete actions to take
5. **Files to Modify** - List of files that will be changed
6. **Testing Strategy** - How to verify the implementation works
7. **Potential Risks** - Edge cases, breaking changes, or migration concerns
8. **Rollback Plan** (if applicable) - How to undo changes if something goes wrong

## Workflow for AI Agents

### Creating a Plan

1. When given a complex task, create a plan file using the naming convention
2. Write the plan following the structure above
3. Before implementing, review the plan to ensure all steps are clear
4. Confirm the plan is complete and feasible

### Executing a Plan

1. Read the entire plan file first
2. Execute steps sequentially unless otherwise specified
3. Mark completed steps in the plan file by adding checkboxes `- [x]`
4. If you deviate from the plan, document why in the plan file
5. Update the plan if you discover new requirements or blockers

### Completing a Plan

1. Verify all implementation steps are complete
2. Run tests as specified in the testing strategy
3. Move the plan file to `done/` subdirectory (create if needed):
   ```bash
   mv PLAN_20251217_FEATURE_NAME.md done/
   ```
4. Update any related documentation (AGENTS.md, etc.)

## Plan Status

**Active Plans:** Plans in `.llm/plans/` root directory are pending/in-progress

**Completed Plans:** Plans in `.llm/plans/done/` are implemented and archived

**Important:** Only pending or in-progress plans should remain in the root `.llm/plans/` directory. Once a plan is fully implemented and tested, move it to `done/` to keep the workspace clean.

## Example Plan Snippet

```markdown
# Plan: Add User Authentication

## Overview
Implement JWT-based authentication for the chat application to support multi-user access.

## Current State
- Application currently has no authentication
- All conversations are accessible to anyone
- No user management system exists

## Proposed Solution
- Add user authentication using JWT tokens
- Create login/signup endpoints
- Add user table to database
- Associate conversations with user IDs

## Implementation Steps
- [ ] Add `users` table to database schema
- [ ] Create authentication middleware
- [ ] Implement login/signup commands
- [ ] Update conversation queries to filter by user
- [ ] Add authentication UI components
- [ ] Update WebSocket connection to include auth token

## Files to Modify
- `src/backend/db/schema.ts` - Add users table
- `src/backend/auth.ts` - New file for auth logic
- `src/backend/command-handlers.ts` - Add auth commands
- `src/frontend/pages/login/` - New login page

## Testing Strategy
- Create test user accounts
- Verify token generation/validation
- Test conversation isolation between users
- Verify WebSocket authentication

## Potential Risks
- Breaking existing conversations (need migration)
- WebSocket reconnection handling
- Token expiration edge cases
```

## Best Practices

1. **Be Specific:** Write concrete, actionable steps instead of vague descriptions
2. **Order Matters:** List steps in the order they should be executed
3. **Think Ahead:** Identify potential issues before starting implementation
4. **Document Decisions:** Explain *why* you chose a particular approach
5. **Update as You Go:** If the plan changes during implementation, update the file
6. **Don't Over-Plan:** For straightforward tasks, just do them without creating a plan
