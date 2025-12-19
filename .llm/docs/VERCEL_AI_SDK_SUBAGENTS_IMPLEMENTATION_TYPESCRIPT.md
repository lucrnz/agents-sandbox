### Multi-Agent Implementation Guide (TypeScript)

#### 1. Vercel AI SDK 6 Beta Agent Architecture
Vercel AI SDK 6 Beta introduces a standardized `Agent` interface for building custom agents and orchestrators, including multi-agent delegation.

```typescript
import { Agent, generateText } from 'ai';

class Orchestrator implements Agent {
  constructor(private subAgents: Record<string, Agent>) {}

  async generate(params: AgentGenerateParams) {
    const agentType = await this.determineAgentType(params.prompt);
    const subAgent = this.subAgents[agentType];
   
    if (!subAgent) {
      throw new Error(`No suitable agent found for: ${agentType}`);
    }
   
    return subAgent.generate(params);
  }
 
  private async determineAgentType(prompt: string): Promise<string> {
    const { text: agentType } = await generateText({
      model: openai('gpt-4o'), // Or any supported model
      prompt: `Classify this request and return only the agent type: ${prompt}`,
    });
   
    return agentType.trim().toLowerCase();
  }
}

const orchestrator = new Orchestrator({
  weather: weatherAgent,
  code: codeAnalysisAgent,
  research: researchAgent,
  creative: creativeWritingAgent,
});
```

#### 2. LangGraph Multi-Agent Pattern
LangGraph (LangChain JS/TS) supports hierarchical supervisor patterns with graph-based routing.

```typescript
import { StateGraph, START, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { BaseMessage, HumanMessage } from '@langchain/core/messages';

interface AgentState {
  messages: BaseMessage[];
  next: string;
}

// Specialized agents
async function createResearchAgent() {
  const llm = new ChatOpenAI({ modelName: 'gpt-4o', temperature: 0 });
  return async (state: AgentState) => {
    const result = await llm.invoke([new HumanMessage(state.messages.at(-1)?.content ?? '')]);
    return { messages: [...state.messages, result] };
  };
}

// Similar for codeAgent...

async function createSupervisor() {
  const llm = new ChatOpenAI({ modelName: 'gpt-4o', temperature: 0 });
  const members = ['researcher', 'code_analyzer'];
 
  return async (state: AgentState) => {
    const prompt = `Route to one of: ${members.join(', ')} or FINISH. Request: ${state.messages.at(-1)?.content}`;
    const result = await llm.invoke([new HumanMessage(prompt)]);
    const next = result.content.toString().trim().toLowerCase();
    return { next: members.includes(next) ? next : END };
  };
}

// Graph construction (standard LangGraph JS pattern)
const workflow = new StateGraph<AgentState>({ /* channels */ })
  .addNode('supervisor', await createSupervisor())
  .addNode('researcher', await createResearchAgent())
  // ...
  .addEdge(START, 'supervisor')
  .addConditionalEdges('supervisor', (state) => state.next)
  .compile();
```

#### 3. Orchestrator-Worker Pattern with Vercel AI SDK
A practical pattern using AI SDK core functions for planning and execution.

```typescript
import { generateObject, generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const workers = { /* research, analysis, creative as in original */ };

class TaskOrchestrator {
  async processTask(userInput: string) {
    const { object: plan } = await generateObject({
      model: openai('gpt-4o'),
      schema: z.object({ /* taskType, steps with worker/input/dependencies */ }),
      prompt: userInput,
    });

    const results: Record<string, string> = {};

    for (const step of plan.steps) {
      let input = step.input;
      if (step.dependencies) {
        // Append prior results
      }
      results[step.worker] = await workers[step.worker as keyof typeof workers](input);
    }

    const { text: finalOutput } = await generateText({ /* synthesize */ });
    return { plan, results, finalOutput };
  }
}
```

#### 4. Best Practices and Considerations
- Maintain state with conversation history.
- Use dynamic routing via LLM classification.
- Implement error fallbacks and parallel execution where possible.
- Optimize costs by model selection.

These patterns provide flexible options: native interface support in AI SDK 6 Beta, graph-based workflows in LangGraph, or custom planning with core primitives.

### Key Citations
- Vercel AI SDK 6 Beta Announcement and Agent Interface: https://ai-sdk.dev/docs/announcing-ai-sdk-6-beta
- Agents Overview (Agent Class/Interface): https://ai-sdk.dev/docs/agents/overview
- LangGraph Supervisor Documentation: https://docs.langchain.com/oss/javascript/langchain/supervisor
- AI SDK Core Functions (generateText/Object): https://ai-sdk.dev/docs/introduction
- Community Agent Workflow Patterns: https://www.callstack.com/blog/building-ai-agent-workflows-with-vercels-ai-sdk-a-practical-guide
