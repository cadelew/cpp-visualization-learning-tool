# Feature: LLM Integration

The LLM module provides AI-powered code explanations, onboarding guides, and codebase Q&A. It supports OpenAI and Anthropic APIs, with structured JSON output and source-grounded references.

**Source files:**
- `src/llm/client.ts` — API client with retry logic
- `src/llm/contextBuilder.ts` — Builds token-budgeted context for prompts
- `src/llm/prompts.ts` — System and user prompt templates
- `src/llm/explanationGenerator.ts` — "Explain Subsystem" feature
- `src/llm/onboardingGenerator.ts` — "Start Here" onboarding guide feature
- `src/llm/qaHandler.ts` — Codebase Q&A feature

---

## 1. LLM Client (`client.ts`)

Unified client supporting OpenAI and Anthropic with automatic retry.

### Configuration

```typescript
interface LLMConfig {
  provider: 'none' | 'openai' | 'anthropic';
  apiKey: string;
  model: string;        // Default: 'gpt-4o-mini'
  maxTokens: number;    // Default: 4096
  temperature: number;  // Default: 0.3
}
```

Configured in VS Code settings:
```json
{
  "cppViz.llm.provider": "openai",
  "cppViz.llm.apiKey": "sk-...",
  "cppViz.llm.model": "gpt-4o-mini"
}
```

### API Methods

```typescript
class LLMClient {
  // Simple chat completion
  async chat(systemPrompt: string, userMessage: string): Promise<string>;

  // Chat with JSON parsing (adds JSON instruction to system prompt)
  async chatWithStructuredOutput<T>(
    systemPrompt: string,
    userMessage: string,
    schema: object
  ): Promise<T>;
}
```

### OpenAI Integration

```typescript
// POST https://api.openai.com/v1/chat/completions
{
  model: "gpt-4o-mini",
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage }
  ],
  max_tokens: 4096,
  temperature: 0.3
}
// Headers: Authorization: Bearer <apiKey>
```

### Anthropic Integration

```typescript
// POST https://api.anthropic.com/v1/messages
{
  model: "claude-3-haiku-20240307",
  system: systemPrompt,
  messages: [{ role: "user", content: userMessage }],
  max_tokens: 4096
}
// Headers: x-api-key: <apiKey>, anthropic-version: 2023-06-01
```

### Retry Logic

```typescript
// 3 retries with exponential backoff
// BASE_DELAY_MS = 1000
// Retry delays: 1s, 2s, 4s
// Retryable: 429 (rate limit), 500, 503
// Not retryable: 401/403 (auth), other 4xx
```

### JSON Response Parsing

For structured output, the client:
1. Appends "You MUST respond with valid JSON only" to the system prompt
2. Strips markdown code fences (` ```json ... ``` `) from the response
3. Parses with `JSON.parse()`
4. Throws `LLMError` on parse failure with first 200 chars of raw response

---

## 2. Context Builder (`contextBuilder.ts`)

Builds LLM context from graph data and source code, fitting within a token budget.

### Token Estimation

```typescript
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);  // ~4 chars per token for code
}
```

### Context Structure

For a subsystem, the context is built in three sections:

```
## Subsystem: core
[description if available]

### Components
**files:**
- main.cpp (src/main.cpp:1)
- engine.h (src/engine.h:1)

**classes:**
- Engine (src/engine.h:15)
- Scheduler (src/scheduler.h:8)

### Relationships
**calls:**
- main -> Engine::start
- Engine::start -> Scheduler::schedule

**inherits:**
- WorkerThread -> Thread

### Source Code

#### Engine (src/engine.h:15-120)
```cpp
class Engine {
  void start();
  void stop();
  // ...
};
```
```

### Budget Allocation

1. Node overview and relationships are built first
2. Remaining token budget goes to source code snippets
3. Priority order for source: classes/structs first, then functions/methods
4. Within budget, files not covered by priority nodes get remainder
5. Source snippets are truncated to fit with `// ... truncated` marker

### Key Function

```typescript
export function buildSubsystemContext(
  subsystem: Subsystem,
  graph: CodebaseGraph,
  sourceFiles: Map<string, string>,
  maxTokens: number,
): string {
  // 1. Build node overview (grouped by kind)
  // 2. Build relationship section (grouped by edge kind)
  // 3. Fill remaining budget with source code snippets
  return sections.join('\n\n');
}
```

---

## 3. Prompt Templates (`prompts.ts`)

Three system prompts define the LLM's behavior for each feature.

### Explanation System Prompt

```
You are an expert C++ systems engineer and technical writer.
You are explaining a subsystem of a C++ codebase to a new engineer.

Rules:
- Be concise and technical. Avoid filler.
- Reference specific files and line numbers (file:line format).
- Only reference files/symbols that appear in the provided context.
- Highlight ownership semantics, RAII, move semantics.
- Note concurrency patterns: mutexes, atomics, CVs, thread spawning.
- Explain as if onboarding a new engineer who knows C++ but not this codebase.

Expected JSON response:
{
  "summary": "high-level summary",
  "components": [{ "name", "role", "file", "startLine", ... }],
  "dataFlow": "how data flows (optional)",
  "concurrencyNotes": "concurrency patterns (optional)",
  "sourceReferences": [{ "description", "file", "startLine", ... }]
}
```

### Onboarding System Prompt

```
You are creating a "Start Here" onboarding guide for a new engineer.

Rules:
- Produce an ordered reading plan (incremental understanding).
- Start with entry points before internals.
- Order dependencies before dependents.
- List specific files and what to look for.
- Include key C++ concepts (RAII, smart pointers, templates, concurrency).
- Estimate reading time per step.

Expected JSON response:
{
  "title": "guide title",
  "steps": [{
    "order": 1,
    "title": "step title",
    "description": "what to learn",
    "files": [{ "path", "reason", "focusRanges": [{ startLine, endLine, reason }] }],
    "lookFor": ["specific things to notice"]
  }],
  "keyConcepts": [{ "name", "description", "implementations": [...], "patterns": [...] }],
  "estimatedMinutes": 30
}
```

### Q&A System Prompt

```
You are answering questions about a codebase.

Rules:
- Answer precisely and technically with file:line references.
- Only reference context that appears in the provided data.
- Explain ownership, RAII, concurrency, templates when relevant.
- If uncertain, say so and explain what additional context would help.
- Suggest 2-3 follow-up questions.

Expected JSON response:
{
  "answer": "the answer",
  "sourceReferences": [{ "description", "file", ... }],
  "confidence": 0.85,
  "suggestedFollowUps": ["follow-up question 1", ...]
}
```

---

## 4. Explanation Generator (`explanationGenerator.ts`)

Generates detailed explanations of a subsystem (group of files/symbols).

### Flow

```
1. buildSubsystemContext() — builds context within 6000 token budget
2. buildExplanationUserPrompt() — formats: "Explain subsystem: <name>\n<context>"
3. client.chatWithStructuredOutput() — calls LLM API
4. Parses response into SubsystemExplanation:
   - summary: string
   - components: ComponentExplanation[]  (name, role, location)
   - dataFlow?: string
   - concurrencyNotes?: string
   - sourceReferences: SourceReference[]  (description, location)
```

### Output Type

```typescript
interface SubsystemExplanation {
  subsystemId: string;
  title: string;
  summary: string;           // "This subsystem handles the core event loop..."
  components: ComponentExplanation[];
  dataFlow?: string;         // "Events flow from EventQueue -> Dispatcher -> Handler"
  concurrencyNotes?: string; // "Uses a mutex to protect shared state..."
  sourceReferences: SourceReference[];
}
```

---

## 5. Onboarding Generator (`onboardingGenerator.ts`)

Generates a "Start Here" reading plan for new engineers.

### Flow

```
1. buildProjectOverview() — workspace root, node/edge counts, subsystems, entry points
2. For each subsystem: buildSubsystemContext() with split token budget (8000 / N)
3. buildOnboardingUserPrompt() — combines overview + all subsystem contexts
4. client.chatWithStructuredOutput() — calls LLM API
5. Parses response into OnboardingGuide
```

### Project Overview Content

The overview sent to the LLM includes:
- Workspace root path
- Total node/edge counts
- List of subsystems with component counts
- Entry points: functions named "main" or unaffiliated top-level classes

### Output Type

```typescript
interface OnboardingGuide {
  title: string;                    // "Getting Started with MyProject"
  steps: OnboardingStep[];          // Ordered reading plan
  keyConcepts: KeyConcept[];        // C++ concepts to understand
  estimatedMinutes?: number;        // Total estimated reading time
}

interface OnboardingStep {
  order: number;
  title: string;                    // "Step 1: Understand the Event Loop"
  description: string;
  files: FileRecommendation[];      // Files to read with reasons
  lookFor: string[];                // "Notice the RAII pattern in..."
}

interface FileRecommendation {
  path: string;
  reason: string;                   // "This is the main entry point"
  focusRanges?: { startLine: number; endLine: number; reason: string }[];
}

interface KeyConcept {
  name: string;                     // "RAII"
  description: string;
  implementations: SourceLocation[];
  patterns?: string[];              // Related C++ patterns
}
```

---

## 6. Q&A Handler (`qaHandler.ts`)

Answers "How does this work?" questions about the codebase.

### Flow

```
1. findRelevantNodes() — finds graph nodes related to the question
2. buildQuestionContext() — summarizes relevant nodes
3. buildSourceContext() — extracts source code snippets (24000 char budget)
4. buildQAUserPrompt() — combines question + context + source
5. client.chatWithStructuredOutput() — calls LLM API
6. Parses response into CodebaseAnswer
```

### Node Relevance Algorithm

Nodes are found relevant in this priority order:

```
1. Nodes in the current file (if context.currentFile is set)
2. Nodes matching selected symbol name (label or qualifiedName contains it)
3. Nodes in the visible set (if context.visibleNodes provided)
4. 1-hop expansion: all nodes connected to already-relevant nodes
5. Fallback: keyword match against the question text (words > 2 chars)
```

### Source Context Building

For relevant nodes, source code is extracted:

```
1. Group relevant nodes by file
2. For each file, extract line ranges from node locations
3. Merge overlapping ranges (with 2-line gap tolerance)
4. Format as markdown: ### filepath\n```cpp\nLines X-Y:\n...\n```
5. Truncate to fit within 24000 character budget
```

### Output Type

```typescript
interface CodebaseAnswer {
  answer: string;
  sourceReferences: SourceReference[];
  confidence: number;              // 0.0 - 1.0, clamped
  suggestedFollowUps?: string[];   // 2-3 follow-up questions
}
```

---

## Anti-Hallucination Measures

All three features include safeguards against LLM hallucination:

1. **System prompt rule:** "Only reference files, symbols, and line numbers that appear in the provided context. Never fabricate references."
2. **Source-grounded context:** All prompts include actual source code snippets, not just descriptions
3. **Structured output:** JSON format forces specific fields (file, startLine, endLine) that can be validated
4. **Token budgeting:** Context is explicitly sized to avoid overwhelming the LLM while providing enough evidence
5. **Confidence scores:** Q&A responses include self-assessed confidence (0.0-1.0)
