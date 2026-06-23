/**
 * Core graph data types shared across all modules.
 * These types define the architecture and concurrency graph schema.
 */

// ─── Node Types ───────────────────────────────────────────────

export type NodeKind =
  | 'file'
  | 'namespace'
  | 'class'
  | 'struct'
  | 'function'
  | 'method'
  | 'thread'
  | 'mutex'
  | 'atomic'
  | 'condition_variable'
  | 'queue'
  | 'lock_guard'
  | 'subsystem';

export interface SourceLocation {
  file: string;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  /** Fully qualified name (e.g., namespace::class::method) */
  qualifiedName?: string;
  /** Source location for jump-to-source */
  location?: SourceLocation;
  /** Cluster/subsystem this node belongs to */
  cluster?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ─── Edge Types ───────────────────────────────────────────────

export type EdgeKind =
  | 'calls'
  | 'includes'
  | 'inherits'
  | 'contains'
  | 'depends_on'
  | 'spawns'
  | 'joins'
  | 'locks'
  | 'unlocks'
  | 'waits_on'
  | 'notifies'
  | 'reads_atomic'
  | 'writes_atomic'
  | 'produces_to'
  | 'consumes_from';

export type EvidenceType = 'source' | 'call' | 'heuristic' | 'runtime' | 'user_annotation';

export interface EdgeEvidence {
  type: EvidenceType;
  location?: SourceLocation;
  callee?: string;
  description?: string;
}

export interface GraphEdge {
  id: string;
  kind: EdgeKind;
  source: string;
  target: string;
  /** Confidence score 0.0 - 1.0 */
  confidence: number;
  /** Evidence backing this edge */
  evidence: EdgeEvidence[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ─── Graph Container ──────────────────────────────────────────

export interface CodebaseGraph {
  version: string;
  workspace: {
    root: string;
    buildConfig?: string;
    compileCommandsPath?: string;
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Runtime observations overlaid on the graph */
  observations?: RuntimeObservation[];
}

export interface RuntimeObservation {
  edgeId: string;
  type: 'runtime';
  source: string;
  metric: string;
  value: number;
}

// ─── Cluster / Subsystem ──────────────────────────────────────

export interface Subsystem {
  id: string;
  name: string;
  description?: string;
  /** Node IDs belonging to this subsystem */
  nodeIds: string[];
  /** Directory path pattern */
  pathPattern?: string;
}

// ─── Analysis Result ──────────────────────────────────────────

export interface AnalysisResult {
  graph: CodebaseGraph;
  subsystems: Subsystem[];
  /** Files that failed to parse */
  errors: AnalysisError[];
  /** Analysis duration in milliseconds */
  duration: number;
}

export interface AnalysisError {
  file: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}
