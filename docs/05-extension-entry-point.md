# Feature: Extension Entry Point & Webview Panel

The extension entry point registers commands, wires the analysis pipeline to the webview, manages LLM client lifecycle, and handles all message routing.

**Source files:**
- `src/extension/index.ts` — Extension activation, commands, message routing
- `src/extension/webviewPanel.ts` — Webview panel lifecycle, HTML generation, theme handling

---

## 1. Extension Lifecycle

### Activation

The extension activates on:
- Opening a C++ or C file (`onLanguage:cpp`, `onLanguage:c`)
- Running any `cppViz.*` command

```typescript
// src/extension/index.ts

export function activate(context: vscode.ExtensionContext): void {
  const panelManager = GraphWebviewPanel.getInstance(context);

  // Set up message handler (wires analysis + LLM to webview)
  panelManager.setMessageHandler(async (message) => { ... });

  // Register 6 commands
  context.subscriptions.push(
    showArchitecture,
    showConcurrency,
    analyzeWorkspace,
    explainSubsystem,
    startHereGuide,
    refreshAnalysis,
  );
}
```

### Deactivation

```typescript
export function deactivate(): void {
  console.log('C++ Visualizer extension deactivated');
}
```

---

## 2. Commands

Six commands registered in `package.json` under `contributes.commands`:

| Command | Title | What It Does |
|---|---|---|
| `cppViz.showArchitectureGraph` | C++ Viz: Show Architecture Graph | Opens the webview panel, triggers full analysis |
| `cppViz.showConcurrencyGraph` | C++ Viz: Show Concurrency Graph | Opens the webview with `concurrencyOnly: true` filter pre-set |
| `cppViz.analyzeWorkspace` | C++ Viz: Analyze Workspace | Opens the webview (analysis runs automatically on `ready`) |
| `cppViz.explainSubsystem` | C++ Viz: Explain This Subsystem | Shows a quick-pick list of subsystems, triggers LLM explanation |
| `cppViz.startHereGuide` | C++ Viz: Start Here (Onboarding Guide) | Opens webview and triggers onboarding guide generation |
| `cppViz.refreshAnalysis` | C++ Viz: Refresh Analysis | Re-runs the analysis pipeline on the current workspace |

### Explain Subsystem Command

Uses a VS Code quick pick UI to let the user choose a subsystem:

```typescript
const explainSubsystem = vscode.commands.registerCommand(
  'cppViz.explainSubsystem',
  async () => {
    if (!currentAnalysis) {
      vscode.window.showWarningMessage('C++ Viz: Run analysis first.');
      return;
    }
    // Build list of subsystems for the quick pick
    const items = currentAnalysis.subsystems.map(s => ({
      label: s.name,
      description: s.description || `${s.nodeIds.length} symbols`,
      subsystemId: s.id,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a subsystem to explain',
    });

    if (picked) {
      panelManager.postMessage({
        type: 'analysisProgress',
        payload: { phase: 'explaining', percent: 50, message: `Generating explanation for ${picked.label}...` },
      });
      panelManager.handleExternalMessage({
        type: 'requestExplanation',
        payload: { subsystemId: picked.subsystemId },
      });
    }
  }
);
```

---

## 3. Message Routing

All communication between the webview (React app) and the extension host goes through typed messages.

### Webview -> Extension Messages

| Message Type | Payload | Handler |
|---|---|---|
| `ready` | (none) | Triggers full analysis pipeline: scan -> parse -> index -> graph -> concurrency -> merge -> send |
| `requestExplanation` | `{ subsystemId }` | Creates LLM client, calls `generateExplanation()`, sends result back |
| `requestOnboarding` | (none) | Creates LLM client, calls `generateOnboardingGuide()`, sends result back |
| `askQuestion` | `{ question, context? }` | Creates LLM client, calls `answerQuestion()`, sends result back |
| `navigateToSource` | `{ file, line, col }` | Opens file in VS Code editor at the specified position |
| `exportGraph` | `{ format }` | Shows save dialog, writes JSON graph to selected path |
| `requestRefresh` | (none) | Re-runs full analysis pipeline |
| `selectNode` | `{ nodeId }` | No-op (handled entirely in webview) |
| `filterGraph` | `{ filter }` | No-op (handled entirely in webview) |

### Extension -> Webview Messages

| Message Type | Payload | When Sent |
|---|---|---|
| `graphData` | `CodebaseGraph` | After analysis completes (merged architecture + concurrency) |
| `subsystems` | `Subsystem[]` | After analysis completes |
| `concurrencyData` | `ConcurrencyAnalysis` | After analysis completes |
| `config` | Layout/display config | When panel opens (with initial settings) |
| `theme` | `{ kind: 'light'\|'dark'\|'high-contrast' }` | On panel open + when VS Code theme changes |
| `analysisProgress` | `{ phase, percent, message }` | During analysis (scanning, concurrency, rendering, done) |
| `analysisError` | `{ message }` | On analysis failure |
| `explanation` | `SubsystemExplanation` | After LLM explanation completes |
| `onboardingGuide` | `OnboardingGuide` | After LLM onboarding guide completes |
| `answer` | `CodebaseAnswer` | After LLM Q&A completes |

---

## 4. Analysis Pipeline Orchestration

When the webview sends `ready`, the full pipeline runs:

```typescript
async function runAnalysis(panel: GraphWebviewPanel, workspaceRoot: string): Promise<void> {
  const analysisConfig = getAnalysisConfig(workspaceRoot);

  // 1. Progress: scanning (10%)
  panel.postMessage({ type: 'analysisProgress', payload: { phase: 'scanning', percent: 10 } });

  // 2. Run architecture analysis (scan -> parse -> index -> build graph)
  const result = await runWorkspaceAnalysis(analysisConfig);
  currentAnalysis = result;

  // 3. Progress: concurrency (60%)
  panel.postMessage({ type: 'analysisProgress', payload: { phase: 'concurrency', percent: 60 } });

  // 4. Load source files for concurrency analysis
  const filePaths = result.graph.nodes
    .filter(n => n.kind === 'file' && n.location?.file)
    .map(n => n.location!.file);
  currentSourceFiles = loadSourceFiles(workspaceRoot, filePaths);

  // 5. Run concurrency detection
  const filesForConcurrency = Array.from(currentSourceFiles.entries())
    .map(([filePath, content]) => ({ path: filePath, content }));
  const concurrencyResult = await analyzeConcurrency(filesForConcurrency, result.graph);

  // 6. Merge concurrency into main graph
  const mergedGraph: CodebaseGraph = {
    ...result.graph,
    nodes: [...result.graph.nodes, ...concurrencyResult.nodes],
    edges: [...result.graph.edges, ...concurrencyResult.edges],
  };

  // 7. Progress: rendering (90%)
  // 8. Send all data to webview
  panel.postMessage({ type: 'graphData', payload: mergedGraph });
  panel.postMessage({ type: 'subsystems', payload: result.subsystems });
  panel.postMessage({ type: 'concurrencyData', payload: concurrencyResult.analysis });

  // 9. Progress: done (100%) with summary stats
}
```

### State Management

Two module-level variables hold the current analysis results:

```typescript
let currentAnalysis: AnalysisResult | undefined;    // Graph + subsystems + errors + timing
let currentSourceFiles: Map<string, string> | undefined;  // filepath -> source content
```

These are used by:
- LLM features (explanation, onboarding, Q&A) — they need the graph + source
- Export command — needs the graph data
- Refresh command — triggers re-analysis

---

## 5. Webview Panel Manager (`webviewPanel.ts`)

### Singleton Pattern

Only one graph panel exists at a time:

```typescript
class GraphWebviewPanel {
  private static instance: GraphWebviewPanel | undefined;

  static getInstance(context: vscode.ExtensionContext): GraphWebviewPanel {
    if (!GraphWebviewPanel.instance) {
      GraphWebviewPanel.instance = new GraphWebviewPanel(context);
    }
    return GraphWebviewPanel.instance;
  }
}
```

### Panel Creation

```typescript
show(options?: { concurrencyOnly?: boolean }): void {
  // If panel exists, just reveal it
  if (this.panel) {
    this.panel.reveal(vscode.ViewColumn.One);
    return;
  }

  // Create new panel
  this.panel = vscode.window.createWebviewPanel(
    'cppVizGraph',
    'C++ Architecture Graph',
    vscode.ViewColumn.One,       // Full editor area (not side panel)
    {
      enableScripts: true,       // React app needs JavaScript
      retainContextWhenHidden: true,  // Keep state when tab isn't visible
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview'),
      ],
    }
  );
}
```

### HTML Generation

The webview content is loaded from a template file (`src/webview/public/index.html`) with placeholder substitution:

```
{{nonce}}     -> Random 32-char alphanumeric string (CSP nonce)
{{scriptUri}} -> Webview URI for dist/webview/index.js
{{styleUri}}  -> Webview URI for dist/webview/index.css
{{cspSource}} -> Webview CSP source domain
```

If the template file doesn't exist, a fallback inline HTML is used with the same structure.

### Content Security Policy

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'none';
  style-src {{cspSource}} 'unsafe-inline';
  script-src 'nonce-{{nonce}}';
  font-src {{cspSource}};
">
```

Only scripts with the correct nonce can execute. Styles are allowed inline (needed for React Flow).

### Theme Change Handling

The panel listens for VS Code theme changes and forwards them to the webview:

```typescript
vscode.window.onDidChangeActiveColorTheme((theme) => {
  this.postMessage({
    type: 'theme',
    payload: { kind: this.mapThemeKind(theme.kind) },
  });
});

// Maps VS Code theme kinds to simplified enum
private mapThemeKind(kind: vscode.ColorThemeKind): 'light' | 'dark' | 'high-contrast' {
  switch (kind) {
    case vscode.ColorThemeKind.Light:           return 'light';
    case vscode.ColorThemeKind.HighContrast:
    case vscode.ColorThemeKind.HighContrastLight: return 'high-contrast';
    default:                                    return 'dark';
  }
}
```

### Disposal

When the panel is closed:
- All disposables (event listeners) are cleaned up
- The singleton instance is reset to `undefined`
- Next `show()` call will create a fresh panel

---

## 6. Configuration

All settings are under the `cppViz` namespace in VS Code settings.

### Analysis Settings

```typescript
function getAnalysisConfig(workspaceRoot: string): AnalysisConfig {
  return {
    workspaceRoot,
    compileCommandsPath: config.get('compileCommandsPath') || undefined,
    excludePatterns: config.get('analysis.excludePatterns', [
      '**/build/**', '**/node_modules/**', '**/third_party/**', '**/.git/**',
    ]),
    maxFileSize: config.get('analysis.maxFileSize', 1048576),
    useTreeSitterFallback: true,
  };
}
```

| Setting | Type | Default | Description |
|---|---|---|---|
| `cppViz.compileCommandsPath` | string | `""` | Path to compile_commands.json (auto-detected if empty) |
| `cppViz.analysis.excludePatterns` | string[] | `["**/build/**", ...]` | Glob patterns to exclude |
| `cppViz.analysis.maxFileSize` | number | `1048576` | Max file size in bytes |
| `cppViz.graph.defaultLayout` | enum | `"hierarchical"` | Default layout algorithm |

### LLM Settings

```typescript
function getLLMConfig(): LLMConfig {
  return {
    provider: config.get('llm.provider', 'none'),  // 'none' | 'openai' | 'anthropic'
    apiKey: config.get('llm.apiKey', ''),
    model: config.get('llm.model', 'gpt-4o-mini'),
    maxTokens: 4096,
    temperature: 0.3,
  };
}
```

| Setting | Type | Default | Description |
|---|---|---|---|
| `cppViz.llm.provider` | enum | `"none"` | LLM provider (`none`, `openai`, `anthropic`) |
| `cppViz.llm.apiKey` | string | `""` | API key for the selected provider |
| `cppViz.llm.model` | string | `"gpt-4o-mini"` | Model to use |

---

## 7. VS Code UI Integration

### Activity Bar

The extension contributes an activity bar entry:
```json
{
  "viewsContainers": {
    "activitybar": [{
      "id": "cppVizExplorer",
      "title": "C++ Visualizer",
      "icon": "$(type-hierarchy)"
    }]
  }
}
```

### Sidebar Views

Three tree views are registered (currently placeholder):
- **Subsystems** — lists detected subsystems
- **Concurrency Artifacts** — lists threads, mutexes, atomics, etc.
- **Onboarding Guide** — shows the reading plan

### Navigate to Source

When the user clicks "Go to Source" in the detail panel:

```typescript
case 'navigateToSource': {
  const { file, line, col } = message.payload;
  const fullPath = path.isAbsolute(file) ? file : path.join(workspaceRoot || '', file);
  const uri = vscode.Uri.file(fullPath);
  const position = new vscode.Position(line - 1, col - 1);
  const range = new vscode.Range(position, position);

  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  editor.selection = new vscode.Selection(position, position);
  break;
}
```

This opens the source file in the main editor area and centers the view on the target line.
