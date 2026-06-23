# Architecture Overview

## System Diagram

```
+-----------------------------------------------------------+
|                    VS Code Extension Host                  |
|                                                           |
|  src/extension/index.ts                                   |
|  +-----------------------------------------------------+  |
|  |                  Extension Entry Point               |  |
|  |  - Registers 6 commands (show graph, analyze, etc.) |  |
|  |  - Wires analysis pipeline to webview messaging     |  |
|  |  - Manages LLM client lifecycle                     |  |
|  +--+-----------+-------------------+------------------+  |
|     |           |                   |                     |
|     v           v                   v                     |
|  +--------+ +----------+    +--------------+              |
|  |Analysis| |Concurrency|    | LLM Module  |              |
|  |Pipeline| |Detection  |    | (Optional)  |              |
|  +--------+ +----------+    +--------------+              |
|     |           |                   |                     |
|     +-----------+-------------------+                     |
|                 |                                         |
|                 v                                         |
|  +-----------------------------------------------------+  |
|  |            GraphWebviewPanel                         |  |
|  |  - Creates/manages webview panel                    |  |
|  |  - Sends graph data to React frontend               |  |
|  |  - Handles navigation, export, explanation requests |  |
|  +-----------------------------------------------------+  |
|                 |                                         |
+-----------------------------------------------------------+
                  | postMessage / onDidReceiveMessage
                  v
+-----------------------------------------------------------+
|                    Webview (React + React Flow)            |
|                                                           |
|  src/webview/src/App.tsx                                  |
|  +-----------------------------------------------------+  |
|  |  HeaderBar  |  Search  |  Layout  |  Filters |Export|  |
|  +-----------------------------------------------------+  |
|  |                                                     |  |
|  |                  GraphCanvas                        |  |
|  |    (React Flow + ELK layout engine)                 |  |
|  |    - 8 custom node types                            |  |
|  |    - Smoothstep edges with colored arrows           |  |
|  |    - Dot grid background, minimap, controls         |  |
|  |                                                     |  |
|  +-----------------------------------------------------+  |
|  |  ControlsOverlay (floating) |  DetailPanel (slide)  |  |
|  +-----------------------------------------------------+  |
+-----------------------------------------------------------+
```

## Data Flow

```
User opens C++ project and runs "C++ Viz: Show Architecture Graph"
    |
    v
1. SCAN: scanner.ts recursively finds all .cpp/.h files
    |     Respects exclude patterns, max file size
    |     Checks for compile_commands.json
    v
2. PARSE: parser.ts extracts symbols from each file
    |     Regex/heuristic-based extraction of:
    |     namespaces, classes, structs, functions, methods,
    |     enums, typedefs, fields, constructors, destructors
    |     Also extracts: includes, inheritance, call sites, member types
    v
3. INDEX: indexer.ts resolves cross-file relationships
    |     Resolves #include paths
    |     Links inheritance hierarchies
    |     Connects call graphs
    |     Maps member type composition
    v
4. BUILD GRAPH: graphBuilder.ts creates visualization-ready graph
    |     Converts symbols -> GraphNode[]
    |     Converts relationships -> GraphEdge[]
    |     Auto-detects subsystems from directory structure
    |     Assigns confidence scores
    v
5. CONCURRENCY: concurrencyDetector.ts + patternDetector.ts
    |     Per-file detection of threads, mutexes, atomics, CVs, queues
    |     Cross-file association (which functions lock which mutexes, etc.)
    |     Pattern detection: producer-consumer, thread pool, fork-join,
    |                        reader-writer, monitor
    |     concurrencyGraphBuilder.ts creates concurrency graph nodes/edges
    v
6. MERGE: Extension merges architecture + concurrency graphs
    |
    v
7. RENDER: Webview receives graph data via postMessage
    |     ELK computes layout (hierarchical or force-directed)
    |     React Flow renders interactive graph
    |     User can filter, search, click nodes, export
    v
8. (Optional) LLM: User requests explanation or onboarding guide
          contextBuilder.ts builds token-budgeted context
          prompts.ts provides system/user prompt templates
          client.ts calls OpenAI/Anthropic API
          Response sent back to webview
```

## Directory Structure

```
src/
  analysis/                  # C++ analysis pipeline
    scanner.ts               # Workspace file discovery
    parser.ts                # C++ source file parser (regex-based)
    indexer.ts                # Cross-file relationship resolver
    graphBuilder.ts           # Converts index to visualization graph
    manager.ts                # Orchestrates the full pipeline
    concurrency.ts            # Concurrency analysis entry point
    concurrencyDetector.ts    # Detects threads, mutexes, atomics, CVs, queues
    concurrencyGraphBuilder.ts # Creates concurrency graph nodes/edges
    patternDetector.ts        # Identifies concurrency patterns

  extension/                 # VS Code extension host code
    index.ts                 # Extension entry point (activate/deactivate)
    webviewPanel.ts          # Webview panel manager

  llm/                       # LLM-powered features
    client.ts                # OpenAI/Anthropic API client with retry
    contextBuilder.ts        # Builds token-budgeted LLM context
    prompts.ts               # System and user prompt templates
    explanationGenerator.ts  # Subsystem explanation generator
    onboardingGenerator.ts   # "Start Here" onboarding guide generator
    qaHandler.ts             # Codebase Q&A handler

  types/                     # Shared TypeScript types
    graph.ts                 # Core graph types (GraphNode, GraphEdge, etc.)
    concurrency.ts           # Concurrency-specific types
    analysis.ts              # Parser/indexer types
    llm.ts                   # LLM response types
    webview.ts               # Extension <-> webview message types
    index.ts                 # Re-exports

  webview/                   # React frontend
    src/
      index.tsx              # React entry point
      App.tsx                # Main application component
      components/
        GraphCanvas.tsx      # React Flow graph renderer
        NodeTypes.tsx        # 8 custom node components
        HeaderBar.tsx        # Top navigation bar
        ControlsOverlay.tsx  # Floating filter panel
        DetailPanel.tsx      # Node detail slide-out panel
      hooks/
        useGraphLayout.ts    # ELK layout computation hook
        useVSCodeMessaging.ts # VS Code API messaging hook
      styles/
        main.css             # All CSS (VS Code design tokens)
      utils/
        theme.ts             # Theme color utilities
    public/
      index.html             # Webview HTML template

test/
  fixtures/                  # Sample C++ files for testing
    sample.h
    sample.cpp
    concurrent_sample.h
    concurrent_sample.cpp
  analysis/
    parser.test.ts           # 17 tests
    graphBuilder.test.ts     # 16 tests
    concurrencyDetector.test.ts # 15 tests
  llm/
    client.test.ts           # 13 tests
    contextBuilder.test.ts   # 7 tests
    prompts.test.ts          # 7 tests
```

## Key Technologies

| Technology | Purpose | Location |
|---|---|---|
| TypeScript | All source code | `src/**/*.ts`, `src/**/*.tsx` |
| React 19 | Webview UI framework | `src/webview/` |
| React Flow (@xyflow/react) | Interactive graph visualization | `src/webview/src/components/GraphCanvas.tsx` |
| ELK.js | Graph layout algorithms | `src/webview/src/hooks/useGraphLayout.ts` |
| esbuild | Bundling (extension + webview) | `package.json` scripts |
| VS Code Extension API | Extension host integration | `src/extension/` |
| Vitest | Test runner | `test/` |
| @vscode/webview-ui-toolkit | VS Code native UI components | `package.json` dependency |

## Build Output

| File | Size | Description |
|---|---|---|
| `dist/extension.js` | ~104 KB | Extension host bundle (Node.js, CJS) |
| `dist/webview/index.js` | ~4.8 MB | Webview bundle (browser, IIFE) |
| `dist/webview/index.css` | ~31 KB | Webview styles |
