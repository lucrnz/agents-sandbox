# Plan: Centralize AI Model Configuration

## Overview

Centralize AI model configuration to eliminate hardcoded model strings and provide a single source of truth for big and small model instances. This refactoring will make the codebase more maintainable and set up infrastructure for future small model usage across the application.

## Current State

**Problems:**
- Model instantiation is scattered across multiple files with hardcoded strings
- `xai("grok-4-1-fast-reasoning")` appears in 2 different locations
- `openrouter("google/gemma-3-4b-it")` is hardcoded in title generation
- `model-config.ts` exists but exports unused GPT model strings instead of actual model instances
- No centralized way to switch models or add fallback providers

**Current model usage:**
- `src/backend/agent/chat-agent.ts:30` - Hardcoded `xai("grok-4-1-fast-reasoning")` for main agent
- `src/backend/agent/title-generation.ts:12` - Hardcoded `openrouter("google/gemma-3-4b-it")` for conversation titles
- `src/backend/agent/title-generation.ts:42` - Hardcoded `xai("grok-4-1-fast-reasoning")` for page title inference

## Proposed Solution

Create a centralized model configuration file that:
1. Exports actual model instances (not strings) created via Vercel AI SDK
2. Provides `bigModel` and `smallModel` exports for use throughout the application
3. Consolidates all provider imports and API key configuration
4. Sets foundation for future small model usage (debugging filenames, logs, etc.)

**Model assignments:**
- **Small Model**: `openrouter("mistralai/mistral-nemo")` - Mistral Nemo via OpenRouter
  - Current use: Conversation title generation
  - Future use: Page title inference, debug filenames, log generation, any small text generation
- **Big Model**: `xai("grok-4-1-fast-reasoning")` - xAI Grok (frontier model)
  - Use: Everything else (main chat agent, complex reasoning tasks)

## Implementation Steps

### Step 1: Rewrite `src/backend/agent/model-config.ts`
- [ ] Remove old `MODEL_CONFIG` constant with GPT model strings
- [ ] Import `xai` from `@ai-sdk/xai`
- [ ] Import `openrouter` from `@openrouter/ai-sdk-provider`
- [ ] Create and export `smallModel` instance: `openrouter("mistralai/mistral-nemo")`
- [ ] Create and export `bigModel` instance: `xai("grok-4-1-fast-reasoning")`
- [ ] Add JSDoc comments explaining when to use each model
- [ ] Export TypeScript type for model instances if needed

### Step 2: Update `src/backend/agent/title-generation.ts`
- [ ] Remove direct imports of `xai` and `openrouter`
- [ ] Import `{ smallModel, bigModel }` from `./model-config.js`
- [ ] Replace `openrouter("google/gemma-3-4b-it")` with `smallModel` in `generateConversationTitle` (line 12)
- [ ] Replace `xai("grok-4-1-fast-reasoning")` with `smallModel` in `inferPageTitle` (line 42)
  - Note: This changes from big model to small model, which is more appropriate for this task
- [ ] Remove unused `MODEL_CONFIG` import (line 4)
- [ ] Update comments if needed to reflect small model usage

### Step 3: Update `src/backend/agent/chat-agent.ts`
- [ ] Remove direct import of `xai` from `@ai-sdk/xai`
- [ ] Import `{ bigModel }` from `./model-config.js`
- [ ] Replace `xai("grok-4-1-fast-reasoning")` with `bigModel` in Agent constructor (line 30)
- [ ] Remove unused `createOpenRouter` import (line 3) - was never used
- [ ] Verify agent initialization still works correctly

### Step 4: Verify Environment Variables
- [ ] Confirm `OPENROUTER_API_KEY` is set in `.env` file
- [ ] Confirm `XAI_API_KEY` is set in `.env` file
- [ ] Check `.env.example` has both keys documented

### Step 5: Update Documentation
- [ ] Update `AGENTS.md` to reflect centralized model configuration pattern
- [ ] Document the model-config.ts exports
- [ ] Note that all model usage should import from model-config.ts
- [ ] Add note about small model future use cases

## Files to Modify

1. **`src/backend/agent/model-config.ts`** - Complete rewrite
   - Export actual model instances instead of config strings
   - Add bigModel and smallModel exports

2. **`src/backend/agent/title-generation.ts`** - Update imports and usage
   - Import models from model-config.ts
   - Replace hardcoded model strings with imported instances
   - Switch page title inference to small model

3. **`src/backend/agent/chat-agent.ts`** - Update imports and usage
   - Import bigModel from model-config.ts
   - Replace hardcoded model string with imported instance
   - Clean up unused imports

4. **`AGENTS.md`** - Documentation update
   - Document centralized model configuration pattern

## Testing Strategy

### Manual Testing
1. **Test conversation title generation:**
   - Start a new conversation
   - Send a message
   - Verify title is generated correctly using small model
   - Check console logs for OpenRouter API calls

2. **Test main chat agent:**
   - Send various messages to the chat
   - Verify responses are generated correctly using big model
   - Test tool usage (agentic_fetch)
   - Check console logs for xAI API calls

3. **Test page title inference:**
   - Trigger agentic_fetch with a URL
   - Verify page title is inferred correctly using small model
   - Check console logs for OpenRouter API calls

### Error Testing
1. **Test missing API keys:**
   - Temporarily remove OPENROUTER_API_KEY
   - Verify graceful error handling for title generation
   - Restore API key

2. **Test model initialization:**
   - Restart server
   - Verify models are initialized on startup
   - Check for any import or initialization errors

### Verification Checklist
- [ ] No hardcoded model strings remain in codebase
- [ ] All model usage imports from model-config.ts
- [ ] Conversation titles generate successfully
- [ ] Main chat responses work correctly
- [ ] Page title inference works correctly
- [ ] No console errors related to model initialization
- [ ] Both OpenRouter and xAI API keys are being used

## Potential Risks

1. **API Key Issues:**
   - OpenRouter API key might not be configured
   - Different rate limits between providers
   - Mitigation: Verify API keys before deployment, add error handling

2. **Model Performance:**
   - Small model (Mistral Nemo) might be slower or less accurate than Grok for some tasks
   - Page title inference switching from big to small model might reduce quality
   - Mitigation: Test thoroughly, can revert page title to bigModel if needed

3. **Breaking Changes:**
   - Any code that directly imports xai() will break
   - Mitigation: This refactor covers all current usage, future code should follow pattern

4. **Import Cycles:**
   - model-config.ts must not import from files that import it
   - Mitigation: Keep model-config.ts as a leaf module with no local imports

## Rollback Plan

If issues arise:
1. Revert `model-config.ts` to previous version
2. Restore direct model imports in `chat-agent.ts` and `title-generation.ts`
3. Git commands:
   ```bash
   git checkout HEAD -- src/backend/agent/model-config.ts
   git checkout HEAD -- src/backend/agent/title-generation.ts
   git checkout HEAD -- src/backend/agent/chat-agent.ts
   ```

## Future Enhancements

Once this foundation is in place:
- Add small model usage for debug filename generation
- Add small model for log message generation
- Implement model fallback strategy (if primary fails, use backup)
- Add environment variable to override models for testing
- Consider adding medium-sized model tier for intermediate tasks
