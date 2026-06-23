# Feature: Extension UI (Webview)

The UI is a React application rendered inside a VS Code webview panel. It uses React Flow for graph visualization, ELK.js for layout computation, and custom CSS with VS Code design tokens for native theming.

**Source files:**
- `src/webview/src/App.tsx` — Root component, state management
- `src/webview/src/components/GraphCanvas.tsx` — React Flow wrapper
- `src/webview/src/components/NodeTypes.tsx` — 8 custom node components
- `src/webview/src/components/HeaderBar.tsx` — Top navigation bar
- `src/webview/src/components/ControlsOverlay.tsx` — Floating filter panel
- `src/webview/src/components/DetailPanel.tsx` — Node detail slide-out panel
- `src/webview/src/hooks/useGraphLayout.ts` — ELK layout computation
- `src/webview/src/hooks/useVSCodeMessaging.ts` — Extension <-> webview messaging
- `src/webview/src/styles/main.css` — All styles
- `src/webview/src/utils/theme.ts` — Theme color utilities

---

## Layout Structure

```
+-----------------------------------------------------------+
| HeaderBar                                                 |
| [C++ Architecture] [390 nodes] [597 edges] [Search...] [Hierarchical v] [Concurrency] [Filters] | [Fit] [Export] |
+-----------------------------------------------------------+
| app__main                                                 |
| +-----------------------------------------------+-------+ |
| |                                               |       | |
| |              GraphCanvas                      |Detail | |
| |         (React Flow + ELK layout)             |Panel  | |
| |                                               |(slide)| |
| |  +-----------+                                |       | |
| |  |Controls   |                                |       | |
| |  |Overlay    |                                |       | |
| |  |(floating) |                                |       | |
| |  +-----------+                                |       | |
| |                                               |       | |
| +-----------------------------------------------+-------+ |
+-----------------------------------------------------------+
```

- **HeaderBar:** Always visible, compact top bar
- **GraphCanvas:** Takes all remaining space (flex: 1)
- **ControlsOverlay:** Floats top-left, only visible when "Filters" is active
- **DetailPanel:** Slides from right, only visible when a node is selected

---

## 1. App Component (`App.tsx`)

The root component manages all state and wires together sub-components.

### State

```typescript
const [graphData, setGraphData] = useState<CodebaseGraph | null>(null);
const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
const [layout, setLayout] = useState<LayoutAlgorithm>('hierarchical');
const [searchQuery, setSearchQuery] = useState('');
const [concurrencyOnly, setConcurrencyOnly] = useState(false);
const [confidenceThreshold, setConfidenceThreshold] = useState(0);
const [selectedSubsystem, setSelectedSubsystem] = useState<string | null>(null);
const [fitViewTrigger, setFitViewTrigger] = useState(0);
const [showFilters, setShowFilters] = useState(false);
const [visibleKinds, setVisibleKinds] = useState<Set<string>>(
  new Set(['file', 'namespace', 'class', 'struct', 'function', 'method',
           'thread', 'mutex', 'atomic', 'condition_variable', 'queue',
           'lock_guard', 'subsystem'])
);
```

### Message Handling

The app listens for messages from the extension host:

```typescript
const handleMessage = useCallback((message: ExtensionToWebviewMessage) => {
  switch (message.type) {
    case 'graphData':      // Received analysis results
      setGraphData(message.payload);
      break;
    case 'config':         // Initial configuration
      setLayout(message.payload.layout);
      if (message.payload.highlightConcurrency) setConcurrencyOnly(true);
      break;
  }
}, []);
```

### Filter Construction

All filter state is combined into a single `GraphFilter` object passed to `GraphCanvas`:

```typescript
const filter: GraphFilter = useMemo(() => ({
  nodeKinds: Array.from(visibleKinds),
  minConfidence: confidenceThreshold,
  concurrencyOnly,
  subsystemId: selectedSubsystem || undefined,
  searchQuery: searchQuery || undefined,
}), [visibleKinds, confidenceThreshold, concurrencyOnly, selectedSubsystem, searchQuery]);
```

---

## 2. Graph Canvas (`GraphCanvas.tsx`)

Wraps React Flow with filtering, layout computation, and interaction handling.

### Filtering Pipeline

Applied in `useMemo` before layout:

```
1. Filter by nodeKinds (visible kinds from ControlsOverlay)
2. If concurrencyOnly: keep only thread/mutex/atomic/cv/queue/lock_guard nodes
3. If subsystemId: keep only nodes in that cluster
4. If searchQuery: keep only nodes whose label/qualifiedName matches
5. Filter edges by minConfidence
6. Remove edges whose source or target was filtered out
```

### Layout Computation

When filtered data changes, layout is recomputed:

```typescript
useEffect(() => {
  computeLayout(filteredData.nodes, filteredData.edges, layout).then((result) => {
    setNodes(result.nodes);
    setEdges(result.edges);
    setTimeout(() => fitView({ padding: 0.12, duration: 250 }), 60);
  });
}, [filteredData, layout]);
```

### React Flow Configuration

```typescript
<ReactFlow
  nodes={styledNodes}
  edges={edges}
  nodeTypes={nodeTypes}        // 8 custom node types
  fitView
  fitViewOptions={{ padding: 0.12 }}
  minZoom={0.02}               // Can zoom out very far for large graphs
  maxZoom={4}
  proOptions={{ hideAttribution: true }}
  defaultEdgeOptions={{
    type: 'smoothstep',        // Rounded edges
    style: { strokeWidth: 1.5 },
  }}
>
  <Background variant="dots" gap={24} size={1} color="#333" />
  <Controls showInteractive={false} />
  <MiniMap pannable zoomable />
</ReactFlow>
```

### Empty State

When no graph data exists:

```
    {}
  No graph data yet
  Open a folder with C++ files and run "C++ Viz: Analyze Workspace"
```

### Loading State

During layout computation, a spinner overlay with backdrop blur appears:

```
  [spinner]
  Computing layout...
```

---

## 3. Node Types (`NodeTypes.tsx`)

All 8 node types share a single `CppNode` component with a unified design.

### Node Design

```
+---------------------------------------+
|  [C]  MyClassName                      |
|       CLASS                            |
+---------------------------------------+
  ^      ^        ^
  |      |        |
  badge  label    kind (uppercase, colored)
```

- **Badge:** 24x24px rounded square with letter abbreviation, colored background/border
- **Label:** 11px, truncated with ellipsis, shows `qualifiedName` on hover
- **Kind:** 9px, uppercase, colored to match badge
- **Border:** 1.5px solid, colored per node kind (brighter when selected)
- **Selection:** Blue border (`#007acc`), glow shadow, tinted background

### Badge Abbreviations

| Kind | Abbreviation | Color |
|---|---|---|
| file | **F** | `#4a9eff` (blue) |
| namespace | **N** | `#7c68ee` (purple) |
| class | **C** | `#4ec9b0` (teal) |
| struct | **S** | `#4ec9b0` (teal) |
| function | **fn** | `#dcdcaa` (yellow) |
| method | **fn** | `#dcdcaa` (yellow) |
| thread | **T** | `#ff9944` (orange) |
| mutex | **M** | `#ff4444` (red) |
| atomic | **A** | `#ff6b9d` (pink) |
| condition_variable | **CV** | `#c586c0` (magenta) |
| queue | **Q** | `#9cdcfe` (light blue) |
| lock_guard | **LG** | `#ff4444` (red) |
| subsystem | **SS** | `#569cd6` (blue) |

### Handles (Connection Points)

Each node has:
- **Target handle** (top): Small circle colored per kind, positioned at top center
- **Source handle** (bottom): Same styling, positioned at bottom center

### Node Type Registration

All 8 exported components use the same `CppNode` internally:

```typescript
export const nodeTypes = {
  fileNode:      FileNode,
  classNode:     ClassNode,       // Also used for structs
  functionNode:  FunctionNode,    // Also used for methods
  threadNode:    ThreadNode,
  mutexNode:     MutexNode,       // Also used for lock_guard
  atomicNode:    AtomicNode,
  queueNode:     QueueNode,
  subsystemNode: SubsystemNode,
};
```

---

## 4. Edge Rendering

Edges are styled in `useGraphLayout.ts` during the conversion from `GraphEdge` to React Flow `Edge`:

### Edge Colors

| Edge Kind | Color | Animated |
|---|---|---|
| calls | `#888888` | No |
| includes | `#666666` | No |
| inherits | `#4ec9b0` | No |
| contains | `#555555` | No |
| depends_on | `#777777` | No |
| spawns | `#ff9944` | **Yes** |
| joins | `#ff9944` | **Yes** |
| locks | `#ff4444` | **Yes** |
| unlocks | `#ff6666` | **Yes** |
| waits_on | `#c586c0` | **Yes** |
| notifies | `#c586c0` | **Yes** |
| reads_atomic | `#ff6b9d` | **Yes** |
| writes_atomic | `#ff6b9d` | **Yes** |
| produces_to | `#9cdcfe` | **Yes** |
| consumes_from | `#9cdcfe` | **Yes** |

### Edge Properties

```typescript
{
  type: 'smoothstep',                        // Rounded corners
  label: edge.kind.replace(/_/g, ' '),       // e.g., "produces to"
  labelStyle: { fill: '#aaa', fontSize: 10 },
  labelBgStyle: { fill: '#1e1e1e', fillOpacity: 0.85 },
  animated: isConcurrency,                    // Dashed animation for concurrency edges
  style: {
    stroke: color,
    strokeWidth: isConcurrency ? 2 : 1.5,    // Thicker for concurrency
    opacity: Math.max(0.4, edge.confidence),  // Faded for low confidence
  },
  markerEnd: { type: 'arrowclosed', color },  // Arrow at target end
}
```

---

## 5. Layout Engine (`useGraphLayout.ts`)

Uses **ELK.js** (Eclipse Layout Kernel) to compute node positions.

### Supported Algorithms

| Algorithm | ELK Algorithm | Description |
|---|---|---|
| `hierarchical` | `layered` | Top-down layered layout (default) |
| `force-directed` | `force` | Physics-based force simulation |

### ELK Configuration

```typescript
const elkGraph = {
  id: 'root',
  layoutOptions: {
    'elk.algorithm': algorithm === 'hierarchical' ? 'layered' : 'force',
    'elk.spacing.nodeNode': '80',
    'elk.layered.spacing.nodeNodeBetweenLayers': '100',
    'elk.direction': 'DOWN',
  },
  children: nodes.map(node => ({ id: node.id, width: 180, height: 60 })),
  edges: edges.map(edge => ({
    id: edge.id,
    sources: [edge.source],
    targets: [edge.target],
  })),
};

const layoutResult = await elk.layout(elkGraph);
```

All nodes are sized at **180x60 pixels** with **80px spacing** between nodes and **100px spacing** between layers.

---

## 6. Header Bar (`HeaderBar.tsx`)

Compact top bar with all primary controls.

### Controls (left to right)

| Element | Type | Description |
|---|---|---|
| "C++ Architecture" | Label | Title text |
| "390 nodes" | Stat | Total node count |
| "597 edges" | Stat | Total edge count |
| Search box | Input | Filters nodes by label/qualifiedName |
| Layout selector | Select | "Hierarchical" or "Force" |
| "Concurrency" | Toggle button | Filters to concurrency-only nodes |
| "Filters" | Toggle button | Shows/hides ControlsOverlay |
| Fit icon | Button | Fits all nodes into view |
| Export icon | Button | Exports graph as JSON |

---

## 7. Controls Overlay (`ControlsOverlay.tsx`)

Floating panel at top-left, visible when "Filters" is toggled on.

### Sections

**Node Types:** Filter chips for all 13 node kinds. Each chip shows:
- Colored dot matching the node kind color
- Kind name (e.g., "condition variable")
- Active state: colored background, visible dot
- Inactive state: muted, dimmed dot

**Confidence:** Range slider (0-100%) that filters out edges below the threshold.

**Subsystem:** Dropdown to filter nodes by cluster (auto-detected from directory structure). Options include "All subsystems" plus each detected subsystem.

---

## 8. Detail Panel (`DetailPanel.tsx`)

Slides in from the right when a node is clicked.

### Layout

```
+---------------------------+
| Details              [x]  |   <- header with close button
+---------------------------+
| [C] MyClass               |   <- node icon (colored) + name
|     CLASS                  |   <- kind label
|                            |
| MyNamespace::MyClass       |   <- qualified name
|                            |
| src/core/myclass.h:42     |   <- clickable file link
|                            |
| [Go to Source] [Explain]   |   <- action buttons
|                            |
| Connections (12)           |   <- section header
| -> calls  processTask     |   <- outgoing edge
| <- includes  main.cpp     |   <- incoming edge
|    each with confidence %  |
+---------------------------+
```

### Features

- **Node header:** Colored icon badge + name + kind
- **Qualified name:** Full `Namespace::Class::Method` path
- **File link:** Clickable, sends `navigateToSource` message to open file in editor
- **Action buttons:**
  - "Go to Source" — opens file at the node's declaration line
  - "Explain" — triggers LLM explanation for the node's subsystem (if it has a cluster)
- **Connections list:** All connected edges showing:
  - Direction arrow (-> outgoing, <- incoming)
  - Edge kind (e.g., "calls", "locks", "produces to")
  - Target/source node name
  - Confidence percentage with color coding:
    - >= 90%: green (`#4ec9b0`)
    - >= 70%: yellow (`#dcdcaa`)
    - >= 50%: orange (`#ff9944`)
    - < 50%: red (`#ff4444`)

---

## 9. VS Code Messaging (`useVSCodeMessaging.ts`)

Hook that handles bidirectional communication between the webview and extension host.

### How It Works

```typescript
// Webview -> Extension
const { postMessage } = useVSCodeMessaging(handleMessage);
postMessage({ type: 'navigateToSource', payload: { file, line, col } });

// Extension -> Webview (via event listener)
window.addEventListener('message', (event) => {
  const message = event.data as ExtensionToWebviewMessage;
  handleMessage(message);
});
```

### On Mount

When the hook first mounts, it:
1. Acquires the VS Code API via `acquireVsCodeApi()` (singleton)
2. Sends a `{ type: 'ready' }` message to the extension
3. The extension responds by running the analysis pipeline and sending back graph data

### State Persistence

The hook also exposes `getState()` and `setState()` which use the VS Code webview state API to persist data across webview visibility changes.

---

## 10. CSS & Theming (`styles/main.css`)

All styles use VS Code CSS variables for native theme integration:

```css
:root {
  --graph-bg:      var(--vscode-editor-background, #1e1e1e);
  --panel-bg:      var(--vscode-sideBar-background, #252526);
  --accent:        var(--vscode-focusBorder, #007acc);
  --text-primary:  var(--vscode-editor-foreground, #cccccc);
  --text-secondary: var(--vscode-descriptionForeground, #9d9d9d);
  --text-muted:    #555;
  --border:        var(--vscode-panel-border, #2d2d2d);
  --input-bg:      var(--vscode-input-background, #3c3c3c);
  --input-border:  var(--vscode-input-border, #3c3c3c);
  --btn-bg:        var(--vscode-button-background, #0e639c);
  --btn-fg:        var(--vscode-button-foreground, #ffffff);
}
```

This means the UI automatically adapts to the user's VS Code theme (dark, light, or high contrast) without any manual theme switching.
