# Type System Reference

All shared types are defined in `src/types/` and re-exported through `src/types/index.ts`. This document catalogs every type used across the system.

---

## Graph Types (`src/types/graph.ts`)

The core data model for the visualization graph.

### NodeKind

```typescript
type NodeKind =
  | 'file'                // Source file (.cpp, .h)
  | 'namespace'           // C++ namespace
  | 'class'               // C++ class
  | 'struct'              // C++ struct
  | 'function'            // Free function
  | 'method'              // Class method (including constructors/destructors)
  | 'thread'              // std::thread / std::jthread
  | 'mutex'               // std::mutex and variants
  | 'atomic'              // std::atomic<T>
  | 'condition_variable'  // std::condition_variable
  | 'queue'               // Concurrent queue
  | 'lock_guard'          // Lock guard scope
  | 'subsystem';          // Auto-detected subsystem cluster
```

### GraphNode

```typescript
interface GraphNode {
  id: string;                     // Unique identifier
  kind: NodeKind;                 // Type of node
  label: string;                  // Display name
  qualifiedName?: string;         // Full qualified name (e.g., "ns::Class::method")
  location?: SourceLocation;      // Source file + line numbers
  cluster?: string;               // Subsystem this node belongs to
  metadata?: Record<string, unknown>;  // Extra data (varies by kind)
}
```

### EdgeKind

```typescript
type EdgeKind =
  // Structural edges (architecture)
  | 'calls'           // Function A calls function B
  | 'includes'        // File A #includes file B
  | 'inherits'        // Class A inherits from class B
  | 'contains'        // File/class contains a symbol
  | 'depends_on'      // Type dependency (uses_type, template, friend)
  // Concurrency edges
  | 'spawns'          // Function spawns a thread
  | 'joins'           // Thread joins back
  | 'locks'           // Function acquires a mutex
  | 'unlocks'         // Function releases a mutex
  | 'waits_on'        // Function waits on a condition variable
  | 'notifies'        // Function notifies a condition variable
  | 'reads_atomic'    // Function reads an atomic variable
  | 'writes_atomic'   // Function writes an atomic variable
  | 'produces_to'     // Function pushes to a queue
  | 'consumes_from';  // Function pops from a queue
```

### GraphEdge

```typescript
interface GraphEdge {
  id: string;
  kind: EdgeKind;
  source: string;          // Source node ID
  target: string;          // Target node ID
  confidence: number;      // 0.0 - 1.0 (how certain is this relationship)
  evidence: EdgeEvidence[];
  metadata?: Record<string, unknown>;
}
```

### EdgeEvidence

```typescript
type EvidenceType = 'source' | 'call' | 'heuristic' | 'runtime' | 'user_annotation';

interface EdgeEvidence {
  type: EvidenceType;
  location?: SourceLocation;
  callee?: string;
  description?: string;
}
```

### SourceLocation

```typescript
interface SourceLocation {
  file: string;        // File path
  startLine: number;   // 1-indexed
  startCol: number;
  endLine: number;
  endCol: number;
}
```

### CodebaseGraph

```typescript
interface CodebaseGraph {
  version: string;
  workspace: {
    root: string;
    buildConfig?: string;
    compileCommandsPath?: string;
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
  observations?: RuntimeObservation[];
}
```

### AnalysisResult

```typescript
interface AnalysisResult {
  graph: CodebaseGraph;
  subsystems: Subsystem[];
  errors: AnalysisError[];    // Files that failed to parse
  duration: number;           // Analysis time in ms
}
```

### Subsystem

```typescript
interface Subsystem {
  id: string;
  name: string;
  description?: string;
  nodeIds: string[];          // All node IDs in this subsystem
  pathPattern?: string;       // e.g., "src/**"
}
```

---

## Analysis Types (`src/types/analysis.ts`)

Types used by the parser, indexer, and scanner.

### CppSymbol

```typescript
interface CppSymbol {
  id: string;
  kind: SymbolKind;           // See below
  name: string;
  qualifiedName: string;
  location: SourceLocation;
  parentId?: string;          // Enclosing symbol (class -> namespace, method -> class)
  access?: AccessSpecifier;   // 'public' | 'protected' | 'private'
  templateParams?: string[];
  returnType?: string;
  paramTypes?: string[];
  isVirtual?: boolean;
  isStatic?: boolean;
  isConst?: boolean;
}
```

### SymbolKind

```typescript
type SymbolKind =
  | 'file' | 'namespace' | 'class' | 'struct' | 'union'
  | 'enum' | 'function' | 'method' | 'constructor' | 'destructor'
  | 'variable' | 'field' | 'typedef' | 'macro' | 'template';
```

### RelationshipKind

```typescript
type RelationshipKind =
  | 'includes'                 // #include "file.h"
  | 'inherits'                 // class Derived : public Base
  | 'implements'               // Interface implementation
  | 'calls'                    // Function call
  | 'uses_type'                // Uses a type as member/parameter
  | 'has_member'               // Class contains member
  | 'instantiates_template'    // Template instantiation
  | 'overrides'                // Virtual method override
  | 'friend_of';              // Friend declaration
```

### CppFileInfo

```typescript
interface CppFileInfo {
  path: string;               // Absolute file path
  relativePath: string;       // Relative to workspace root
  isHeader: boolean;          // .h, .hpp, etc.
  loc: number;                // Lines of code
  includes: IncludeDirective[];
  symbols: CppSymbol[];       // Top-level symbols in this file
}
```

### AnalysisConfig

```typescript
interface AnalysisConfig {
  workspaceRoot: string;
  compileCommandsPath?: string;
  excludePatterns: string[];     // Glob patterns to exclude
  maxFileSize: number;           // Max bytes per file
  useTreeSitterFallback: boolean;
}
```

### CodebaseIndex

```typescript
interface CodebaseIndex {
  files: CppFileInfo[];
  symbols: Map<string, CppSymbol>;
  relationships: CppRelationship[];
  buildTime: number;          // ms
  timestamp: number;          // epoch ms
}
```

---

## Concurrency Types (`src/types/concurrency.ts`)

Types for concurrency primitive detection and pattern recognition.

### ConcurrencyPrimitiveKind

```typescript
type ConcurrencyPrimitiveKind =
  | 'thread' | 'jthread'
  | 'mutex' | 'recursive_mutex' | 'shared_mutex'
  | 'lock_guard' | 'unique_lock' | 'shared_lock' | 'scoped_lock'
  | 'condition_variable' | 'condition_variable_any'
  | 'atomic'
  | 'semaphore' | 'latch' | 'barrier'
  | 'future' | 'promise' | 'async';
```

### QueueKind

```typescript
type QueueKind =
  | 'std_queue_mutex'        // std::queue + mutex
  | 'moodycamel_concurrent'  // moodycamel::ConcurrentQueue
  | 'boost_spsc'             // boost::lockfree::spsc_queue
  | 'boost_lockfree'         // boost::lockfree::queue
  | 'custom'                 // User-defined thread-safe queue
  | 'unknown';
```

### MemoryOrder

```typescript
type MemoryOrder =
  | 'relaxed' | 'consume' | 'acquire'
  | 'release' | 'acq_rel' | 'seq_cst';
```

### ConcurrencyPattern

```typescript
interface ConcurrencyPattern {
  kind: 'producer_consumer' | 'reader_writer' | 'thread_pool'
      | 'pipeline' | 'fork_join' | 'monitor';
  name: string;
  description: string;
  participants: string[];      // Node IDs involved
  confidence: number;          // 0.0 - 1.0
}
```

### ConcurrencyAnalysis

```typescript
interface ConcurrencyAnalysis {
  threads: ThreadInfo[];
  mutexes: MutexInfo[];
  atomics: AtomicInfo[];
  conditionVariables: ConditionVariableInfo[];
  queues: QueueInfo[];
  patterns: ConcurrencyPattern[];
}
```

See [02-concurrency-detection.md](./02-concurrency-detection.md) for the full `ThreadInfo`, `MutexInfo`, `AtomicInfo`, `ConditionVariableInfo`, and `QueueInfo` definitions.

---

## LLM Types (`src/types/llm.ts`)

Types for AI-powered features.

### LLMConfig

```typescript
type LLMProvider = 'none' | 'openai' | 'anthropic';

interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model: string;           // e.g., 'gpt-4o-mini'
  maxTokens: number;       // Default: 4096
  temperature: number;     // Default: 0.3
}
```

### SubsystemExplanation

```typescript
interface SubsystemExplanation {
  subsystemId: string;
  title: string;
  summary: string;
  components: ComponentExplanation[];  // { name, role, location }
  dataFlow?: string;
  concurrencyNotes?: string;
  sourceReferences: SourceReference[];  // { description, location }
}
```

### OnboardingGuide

```typescript
interface OnboardingGuide {
  title: string;
  steps: OnboardingStep[];       // Ordered reading plan
  keyConcepts: KeyConcept[];     // C++ concepts to understand
  estimatedMinutes?: number;
}

interface OnboardingStep {
  order: number;
  title: string;
  description: string;
  files: FileRecommendation[];   // { path, reason, focusRanges? }
  lookFor: string[];             // Things to notice
}
```

### CodebaseAnswer

```typescript
interface CodebaseAnswer {
  answer: string;
  sourceReferences: SourceReference[];
  confidence: number;            // 0.0 - 1.0
  suggestedFollowUps?: string[];
}
```

---

## Webview Types (`src/types/webview.ts`)

Message types for extension <-> webview communication.

### ExtensionToWebviewMessage

10 message types the extension can send to the webview:

```typescript
type ExtensionToWebviewMessage =
  | { type: 'graphData';          payload: CodebaseGraph }
  | { type: 'concurrencyData';    payload: ConcurrencyAnalysis }
  | { type: 'subsystems';         payload: Subsystem[] }
  | { type: 'explanation';        payload: SubsystemExplanation }
  | { type: 'onboardingGuide';    payload: OnboardingGuide }
  | { type: 'answer';             payload: CodebaseAnswer }
  | { type: 'analysisProgress';   payload: { phase: string; percent: number; message: string } }
  | { type: 'analysisError';      payload: { message: string; details?: string } }
  | { type: 'theme';              payload: { kind: 'light' | 'dark' | 'high-contrast' } }
  | { type: 'config';             payload: WebviewConfig };
```

### WebviewToExtensionMessage

9 message types the webview can send to the extension:

```typescript
type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'navigateToSource';    payload: { file: string; line: number; col: number } }
  | { type: 'requestExplanation';  payload: { subsystemId: string } }
  | { type: 'requestOnboarding';   payload: {} }
  | { type: 'askQuestion';         payload: { question: string; context?: { nodeId?: string } } }
  | { type: 'filterGraph';         payload: GraphFilter }
  | { type: 'selectNode';          payload: { nodeId: string } }
  | { type: 'requestRefresh';      payload: {} }
  | { type: 'exportGraph';         payload: { format: 'svg' | 'png' | 'json' } };
```

### GraphFilter

```typescript
interface GraphFilter {
  nodeKinds?: string[];
  edgeKinds?: string[];
  minConfidence?: number;
  subsystemId?: string;
  searchQuery?: string;
  concurrencyOnly?: boolean;
  pathBetween?: { from: string; to: string };
}
```
