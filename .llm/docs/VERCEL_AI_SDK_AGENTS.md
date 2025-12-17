# Creating Agents with Vercel AI SDK in TypeScript

The Vercel AI SDK is a powerful, open-source framework for building AI applications with TypeScript. It provides a unified interface for working with various language models and tools, making it easy to create sophisticated AI agents.

## What is an Agent?

An **agent** is a large language model (LLM) that uses **tools** in a **loop** to accomplish complex tasks. The three key components work together:

- **LLMs**: Process input and decide the next action
- **Tools**: Extend capabilities beyond text generation (API calls, file operations, database queries, etc.)
- **Loop**: Orchestrates execution through context management and stopping conditions

## Getting Started

### Installation

```bash
npm i ai
npm install zod  # For schema validation
```

### Basic Agent Example

```typescript
import { Experimental_Agent as Agent, tool } from 'ai';
import { z } from 'zod';

const weatherAgent = new Agent({
  model: "anthropic/claude-sonnet-4.5",
  tools: {
    weather: tool({
      description: 'Get the weather in a location (in Fahrenheit)',
      inputSchema: z.object({
        location: z.string().describe('The location to get the weather for'),
      }),
      execute: async ({ location }) => ({
        location,
        temperature: 72 + Math.floor(Math.random() * 21) - 10,
      }),
    }),
    convertFahrenheitToCelsius: tool({
      description: 'Convert temperature from Fahrenheit to Celsius',
      inputSchema: z.object({
        temperature: z.number().describe('Temperature in Fahrenheit'),
      }),
      execute: async ({ temperature }) => {
        const celsius = Math.round((temperature - 32) * (5 / 9));
        return { celsius };
      },
    }),
  },
  stopWhen: stepCountIs(20), // Allow up to 20 steps
});

const result = await weatherAgent.generate({
  prompt: 'What is the weather in San Francisco in celsius?',
});

console.log(result.text); // Final answer
console.log(result.steps); // Steps taken by the agent
```

## Available Providers

The AI SDK supports numerous providers with a unified interface:

### Official Providers
- **OpenAI** (`@ai-sdk/openai`)
- **Anthropic** (`@ai-sdk/anthropic`) 
- **Google** (`@ai-sdk/google`)
- **Azure OpenAI** (`@ai-sdk/azure`)
- **Amazon Bedrock** (`@ai-sdk/amazon-bedrock`)
- **Mistral** (`@ai-sdk/mistral`)
- **Groq** (`@ai-sdk/groq`)
- **Together.ai** (`@ai-sdk/togetherai`)
- And many more...

### Community Providers
- **Ollama** (for self-hosted models)
- **LM Studio** (OpenAI compatible)
- **OpenRouter**
- **Cloudflare Workers AI**
- And many others...

### Usage Examples

```typescript
// Using different providers
const openaiAgent = new Agent({
  model: "openai/gpt-4o",
  // ... configuration
});

const anthropicAgent = new Agent({
  model: "anthropic/claude-3-5-sonnet-20241022",
  // ... configuration
});

const groqAgent = new Agent({
  model: "groq/llama-3.1-70b-versatile",
  // ... configuration
});
```

## Creating Advanced Agents

### System Prompts and Behavior Control

```typescript
const codeReviewAgent = new Agent({
  model: "anthropic/claude-sonnet-4.5",
  system: `You are a senior software engineer conducting code reviews.

Your approach:
- Focus on security vulnerabilities first
- Identify performance bottlenecks
- Suggest improvements for readability and maintainability
- Be constructive and educational in your feedback
- Always explain why something is an issue and how to fix it`,
  tools: {
    analyzeCode,
    suggestFixes,
    checkSecurity,
  },
});
```

### Structured Output

```typescript
import { Output } from 'ai';
import { z } from 'zod';

const analysisAgent = new Agent({
  model: "anthropic/claude-sonnet-4.5",
  experimental_output: Output.object({
    schema: z.object({
      sentiment: z.enum(['positive', 'neutral', 'negative']),
      summary: z.string(),
      keyPoints: z.array(z.string()),
    }),
  }),
  stopWhen: stepCountIs(10),
});

const { experimental_output: output } = await analysisAgent.generate({
  prompt: 'Analyze customer feedback from the last quarter',
});
```

### Tool Choice Configuration

```typescript
// Force tool usage
const agent = new Agent({
  model: "anthropic/claude-sonnet-4.5",
  tools: {
    weather: weatherTool,
    cityAttractions: attractionsTool,
  },
  toolChoice: 'required', // Force tool use
});

// Force specific tool
const agent = new Agent({
  model: "anthropic/claude-sonnet-4.5",
  tools: {
    weather: weatherTool,
    cityAttractions: attractionsTool,
  },
  toolChoice: {
    type: 'tool',
    toolName: 'weather', // Force the weather tool to be used
  },
});
```

## Building Tools

### Basic Tool Structure

```typescript
import { tool } from 'ai';
import { z } from 'zod';

const myTool = tool({
  description: 'A helpful tool that performs a specific task',
  inputSchema: z.object({
    query: z.string().describe('The input to process'),
    option: z.enum(['option1', 'option2']).optional(),
  }),
  execute: async ({ query, option }) => {
    // Tool logic here
    const result = await processQuery(query, option);
    return { success: true, data: result };
  },
});
```

### Tool Examples

```typescript
// Web search tool
const webSearchTool = tool({
  description: 'Search the web for current information',
  inputSchema: z.object({
    query: z.string().describe('The search query'),
  }),
  execute: async ({ query }) => {
    const response = await fetch(`https://api.example.com/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    return { results: data.results };
  },
});

// File processing tool
const fileProcessorTool = tool({
  description: 'Process uploaded files',
  inputSchema: z.object({
    fileUrl: z.string().describe('URL of the file to process'),
    operation: z.enum(['extract-text', 'analyze-content', 'summarize']),
  }),
  execute: async ({ fileUrl, operation }) => {
    const fileContent = await downloadFile(fileUrl);
    const result = await processFile(fileContent, operation);
    return { result, metadata: { operation, fileSize: fileContent.length } };
  },
});
```

## Ready-to-Use Tool Packages

The community has created many pre-built tool packages:

### Popular Tool Packages
- **[@exalabs/ai-sdk](https://www.npmjs.com/package/@exalabs/ai-sdk)** - Web search tools
- **[@parallel-web/ai-sdk-tools](https://www.npmjs.com/package/@parallel-web/ai-sdk-tools)** - Web search and extraction
- **[@perplexity-ai/ai-sdk](https://www.npmjs.com/package/@perplexity-ai/ai-sdk)** - Advanced search with filtering
- **[@tavily/ai-sdk](https://www.npmjs.com/package/@tavily/ai-sdk)** - Enterprise-grade web exploration
- **[Stripe agent tools](https://docs.stripe.com/agents?framework=vercel)** - Payment processing
- **[StackOne ToolSet](https://docs.stackone.com/agents/typescript/frameworks/vercel-ai-sdk)** - SaaS integrations

### Using Tool Packages

```typescript
import { generateText, stepCountIs } from 'ai';
import { searchTool } from '@exalabs/ai-sdk';

const { text } = await generateText({
  model: 'anthropic/claude-haiku-4.5',
  prompt: 'When was Vercel Ship AI?',
  tools: {
    webSearch: searchTool,
  },
  stopWhen: stepCountIs(10),
});
```

## Advanced Agent Patterns

### RAG (Retrieval-Augmented Generation) Agent

```typescript
import { findRelevantContent } from './embedding';

const ragAgent = new Agent({
  model: "anthropic/claude-sonnet-4.5",
  system: `You are a helpful assistant. Check your knowledge base before answering any questions.
  Only respond to questions using information from tool calls.
  If no relevant information is found in the tool calls, respond, "Sorry, I don't know."`,
  tools: {
    searchKnowledgeBase: tool({
      description: 'Search knowledge base for relevant information',
      inputSchema: z.object({
        question: z.string().describe('The user question'),
      }),
      execute: async ({ question }) => findRelevantContent(question),
    }),
    addResource: tool({
      description: 'Add a new resource to the knowledge base',
      inputSchema: z.object({
        content: z.string().describe('The content to add'),
      }),
      execute: async ({ content }) => createResource(content),
    }),
  },
  stopWhen: stepCountIs(5),
});
```

### Multi-Step Agent with Loop Control

```typescript
import { stepCountIs, prepareStep } from 'ai';

const multiStepAgent = new Agent({
  model: "anthropic/claude-sonnet-4.5",
  stopWhen: [
    stepCountIs(15), // Maximum 15 steps
    (context) => context.some(step => step.tool === 'finish'), // Custom stop condition
  ],
  prepareStep: async (context) => {
    // Custom step preparation logic
    if (context.stepCount > 10) {
      // Add urgency to system prompt
      context.systemPrompt += " This is urgent - complete the task quickly.";
    }
    return context;
  },
});
```

## Using Agents in Applications

### API Route Integration

```typescript
// app/api/chat/route.ts
import { Experimental_Agent as Agent, tool } from 'ai';
import { z } from 'zod';

const customerServiceAgent = new Agent({
  model: "anthropic/claude-sonnet-4.5",
  system: `You are a customer support specialist. Be helpful and professional.`,
  tools: {
    checkOrderStatus,
    lookupPolicy,
    createTicket,
  },
});

export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = await customerServiceAgent.generate({
    prompt: messages[messages.length - 1].text,
  });
  
  return Response.json({ text: result.text });
}
```

### Streaming Responses

```typescript
const stream = myAgent.stream({
  prompt: 'Tell me a story about AI agents',
});

for await (const chunk of stream.textStream) {
  console.log(chunk); // Stream text chunks
}

// Handle tool calls
for await (const chunk of stream.toolCallStream) {
  console.log('Tool called:', chunk.toolName);
  console.log('Input:', chunk.input);
}
```

### Client Integration with useChat

```typescript
// components/Chat.tsx
'use client';

import { useChat } from '@ai-sdk/react';
import type { MyAgentUIMessage } from '@/agent/my-agent';

export function Chat() {
  const { messages, input, handleSubmit, setInput } = useChat<MyAgentUIMessage>({
    api: '/api/chat',
  });

  return (
    <div className="chat-container">
      {messages.map((message) => (
        <div key={message.id}>
          <strong>{message.role}:</strong>
          {message.parts.map((part) => (
            <p key={part.type}>{part.text}</p>
          ))}
        </div>
      ))}
      
      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask something..."
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

## Best Practices

### 1. Type Safety
```typescript
import { Experimental_InferAgentUIMessage as InferAgentUIMessage } from 'ai';

const myAgent = new Agent({
  // ... configuration
});

export type MyAgentUIMessage = InferAgentUIMessage<typeof myAgent>;
```

### 2. Error Handling
```typescript
const robustAgent = new Agent({
  model: "anthropic/claude-sonnet-4.5",
  tools: {
    riskyOperation: tool({
      description: 'Operation that might fail',
      inputSchema: z.object({
        data: z.string(),
      }),
      execute: async ({ data }) => {
        try {
          const result = await performRiskyOperation(data);
          return { success: true, result };
        } catch (error) {
          return { success: false, error: error.message };
        }
      },
    }),
  },
});
```

### 3. Performance Optimization
```typescript
const optimizedAgent = new Agent({
  model: "anthropic/claude-sonnet-4.5",
  tools: {
    // Cache heavy operations
    expensiveCalculation: tool({
      description: 'Perform expensive calculation',
      inputSchema: z.object({
        input: z.string(),
      }),
      execute: async ({ input }) => {
        // Check cache first
        const cached = await getCachedResult(input);
        if (cached) return cached;
        
        const result = await performExpensiveCalculation(input);
        await cacheResult(input, result);
        return result;
      },
    }),
  },
});
```

## Real-World Examples

### 1. Research Assistant Agent
```typescript
const researchAgent = new Agent({
  model: "anthropic/claude-sonnet-4.5",
  system: `You are a research assistant. Always cite your sources and cross-reference information.`,
  tools: {
    webSearch: webSearchTool,
    analyzeDocument: documentAnalysisTool,
    extractQuotes: quoteExtractionTool,
  },
});
```

### 2. Code Review Agent
```typescript
const codeReviewAgent = new Agent({
  model: "anthropic/claude-sonnet-4.5",
  system: `You are a senior software engineer. Focus on security, performance, and maintainability.`,
  tools: {
    analyzeCode: codeAnalysisTool,
    checkSecurity: securityScannerTool,
    suggestFixes: codeSuggestionTool,
  },
});
```

### 3. Data Analysis Agent
```typescript
const dataAnalysisAgent = new Agent({
  model: "anthropic/claude-sonnet-4.5",
  system: `You are a data analyst. Provide insights based on the data provided.`,
  tools: {
    queryDatabase: dbQueryTool,
    visualizeData: chartGenerationTool,
    generateReport: reportGenerationTool,
  },
});
```

## Integration with Bun

Since this project uses Bun, here's how to integrate the Vercel AI SDK with a Bun-based backend:

```typescript
// server.ts
import { Experimental_Agent as Agent, tool } from 'ai';
import { z } from 'zod';

const agent = new Agent({
  model: "anthropic/claude-sonnet-4.5",
  tools: {
    readFile: tool({
      description: 'Read the contents of a file',
      inputSchema: z.object({
        path: z.string().describe('The file path to read'),
      }),
      execute: async ({ path }) => {
        const file = Bun.file(path);
        const exists = await file.exists();
        
        if (!exists) {
          return { error: 'File not found', path };
        }
        
        const contents = await file.text();
        return { path, contents };
      },
    }),
  },
});

// Create a Bun server
const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    
    if (url.pathname === '/api/agent' && req.method === 'POST') {
      try {
        const body = await req.json();
        const result = await agent.generate({
          prompt: body.prompt,
        });
        
        return Response.json(result);
      } catch (error) {
        return new Response(error.message, { status: 500 });
      }
    }
    
    return new Response('Not Found', { status: 404 });
  },
});

console.log(`Server running at http://localhost:${server.port}`);
```

## Next Steps

1. **Explore the [AI SDK Documentation](https://sdk.vercel.ai)** for more advanced features
2. **Check out the [Cookbook](https://sdk.vercel.ai/examples)** for practical examples
3. **Join the community** for support and collaboration
4. **Consider templates** for faster development:
   - Chatbot Starter Template
   - Internal Knowledge Base (RAG)
   - Multi-Modal Chat
   - Natural Language PostgreSQL

The Vercel AI SDK provides a robust foundation for building sophisticated AI agents with TypeScript, offering type safety, excellent tooling, and support for multiple providers. Start with simple agents and gradually incorporate more complex patterns as you become familiar with the framework.