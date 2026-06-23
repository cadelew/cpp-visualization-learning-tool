# C++ Codebase Visualizer

A VS Code extension that helps engineers understand complex C++ codebases through interactive visualizations, concurrency flow diagrams, and AI-powered explanations.

## Features

- **Architecture Graph**: Interactive file/module/class architecture maps with clickable source navigation
- **Concurrency Visualization**: Thread topology, mutex/atomic/queue relationships, producer-consumer flows
- **LLM Explanations**: "Explain this subsystem" with source-grounded explanations
- **Onboarding Guide**: Auto-generated "Start Here" reading order for new engineers
- **Source-Linked Navigation**: Every graph node and edge links directly to source code

## Development

```bash
npm install
npm run build
# Press F5 in VS Code to launch Extension Development Host
```

## Architecture

```
src/
  types/          # Shared type definitions (graph, concurrency, analysis, LLM)
  extension/      # VS Code extension host code
  analysis/       # C++ parsing and indexing engine (Tree-sitter based)
  visualization/  # Graph generation and layout
  llm/            # LLM integration for explanations and onboarding
  webview/        # React-based graph UI rendered in VS Code webview
```

## License

MIT
