# C++ Codebase Visualizer — Documentation

In-depth documentation of every feature in the C++ Codebase Visualizer VS Code extension. Each document covers what the feature does, how it works internally, and the key code behind it.

## Documents

| # | Document | What It Covers |
|---|---|---|
| 00 | [Architecture Overview](./00-architecture-overview.md) | System diagram, data flow, directory structure, technology stack |
| 01 | [Analysis Engine](./01-analysis-engine.md) | Scanner, Parser, Indexer, Graph Builder, Manager — the full C++ analysis pipeline |
| 02 | [Concurrency Detection](./02-concurrency-detection.md) | Thread/mutex/atomic/CV/queue detection, cross-file association, pattern recognition |
| 03 | [Extension UI](./03-extension-ui.md) | React Flow graph, 8 node types, edge rendering, ELK layout, HeaderBar, filters, detail panel, theming |
| 04 | [LLM Integration](./04-llm-integration.md) | OpenAI/Anthropic client, context builder, explanation/onboarding/Q&A generators, anti-hallucination |
| 05 | [Extension Entry Point](./05-extension-entry-point.md) | Activation, 6 commands, message routing, webview panel manager, configuration |
| 06 | [Type System Reference](./06-type-system.md) | Every shared TypeScript type: graph, analysis, concurrency, LLM, webview messages |

## Quick Start

```bash
git clone https://github.com/cadelew/cpp-visualization-learning-tool.git
cd cpp-visualization-learning-tool
git checkout dev
npm install
npm run build
```

Open in VS Code, press F5 to launch Extension Development Host, then open a C++ project and run `Cmd+Shift+P` → **"C++ Viz: Show Architecture Graph"**.

## Feature Summary

### Analysis Engine
Scans workspace for `.cpp`/`.h` files, parses each file with regex patterns to extract namespaces, classes, functions, inheritance, and call sites. Builds a cross-file index resolving includes, inheritance chains, and call graphs. Converts everything into a visualization-ready graph with confidence-scored edges.

### Concurrency Detection
Detects `std::thread`, `std::jthread`, `pthread_create`, all mutex variants, `std::atomic<T>` with memory orders, condition variables, and queues (moodycamel, Boost, `std::queue` + mutex, custom). Cross-file association links functions to the primitives they use. Pattern detector identifies producer-consumer, reader-writer, thread pool, fork-join, and monitor patterns.

### Interactive Visualization
React Flow-based graph with 8 custom node types (file, class, function, thread, mutex, atomic, queue, subsystem). ELK.js computes hierarchical or force-directed layouts. Concurrency edges are animated. Nodes are filterable by kind, confidence, subsystem, and search query. Clicking a node shows a detail panel with connections and "Go to Source" navigation.

### LLM-Powered Features
Optional OpenAI/Anthropic integration for three features:
- **Explain Subsystem** — generates grounded explanations with source references
- **Start Here Guide** — creates ordered reading plans for new engineers
- **Codebase Q&A** — answers questions with context-aware source citations

### VS Code Integration
6 commands in the Command Palette, activity bar entry, theme-aware rendering, Content Security Policy for the webview, file navigation from graph nodes to source code.

## Tests

75 tests across 6 test files:

```bash
npm test
```

| Test File | Count | What It Tests |
|---|---|---|
| `parser.test.ts` | 17 | C++ symbol extraction, includes, inheritance, call sites |
| `graphBuilder.test.ts` | 16 | Node/edge creation, subsystem detection, confidence scores |
| `concurrencyDetector.test.ts` | 15 | Thread/mutex/atomic/CV/queue detection, patterns |
| `client.test.ts` | 13 | LLM API calls, retry logic, error handling |
| `contextBuilder.test.ts` | 7 | Token budgeting, context structure |
| `prompts.test.ts` | 7 | Prompt template validation |
