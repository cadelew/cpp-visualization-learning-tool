/**
 * Graph builder: converts a CodebaseIndex into a CodebaseGraph.
 *
 * Creates GraphNode / GraphEdge arrays suitable for visualization,
 * auto-detects subsystems from directory structure, and assigns
 * confidence scores.
 */

import * as path from 'path';
import {
  GraphNode,
  GraphEdge,
  CodebaseGraph,
  Subsystem,
  AnalysisResult,
  AnalysisError,
  NodeKind,
  EdgeKind,
  SourceLocation,
} from '../types/graph';
import {
  CodebaseIndex,
  CppSymbol,
  CppRelationship,
  SymbolKind,
} from '../types/analysis';

// ─── Mapping helpers ────────────────────────────────────────────

const SYMBOL_TO_NODE_KIND: Partial<Record<SymbolKind, NodeKind>> = {
  file: 'file',
  namespace: 'namespace',
  class: 'class',
  struct: 'struct',
  function: 'function',
  method: 'method',
  constructor: 'method',
  destructor: 'method',
};

type RelKindToEdgeKind = Record<string, { kind: EdgeKind; confidence: number }>;

const RELATIONSHIP_MAPPING: RelKindToEdgeKind = {
  includes: { kind: 'includes', confidence: 0.95 },
  inherits: { kind: 'inherits', confidence: 0.95 },
  calls: { kind: 'calls', confidence: 0.7 },
  uses_type: { kind: 'depends_on', confidence: 0.7 },
  has_member: { kind: 'contains', confidence: 0.95 },
  implements: { kind: 'inherits', confidence: 0.95 },
  overrides: { kind: 'calls', confidence: 0.8 },
  instantiates_template: { kind: 'depends_on', confidence: 0.8 },
  friend_of: { kind: 'depends_on', confidence: 0.7 },
};

// ─── Node creation ──────────────────────────────────────────────

function symbolToNode(sym: CppSymbol, cluster?: string): GraphNode | null {
  const nodeKind = SYMBOL_TO_NODE_KIND[sym.kind];
  if (!nodeKind) return null;

  return {
    id: sym.id,
    kind: nodeKind,
    label: sym.name,
    qualifiedName: sym.qualifiedName,
    location: sym.location,
    cluster,
    metadata: {
      symbolKind: sym.kind,
      access: sym.access,
      isVirtual: sym.isVirtual,
      isStatic: sym.isStatic,
      isConst: sym.isConst,
    },
  };
}

function fileToNode(filePath: string, relativePath: string): GraphNode {
  return {
    id: `file::${filePath}`,
    kind: 'file',
    label: path.basename(filePath),
    qualifiedName: relativePath,
    location: { file: filePath, startLine: 1, startCol: 0, endLine: 1, endCol: 0 },
  };
}

// ─── Edge creation ──────────────────────────────────────────────

let edgeCounter = 0;

export function resetEdgeCounter(): void {
  edgeCounter = 0;
}

function relationshipToEdge(rel: CppRelationship): GraphEdge | null {
  const mapping = RELATIONSHIP_MAPPING[rel.kind];
  if (!mapping) return null;

  return {
    id: `edge::${edgeCounter++}`,
    kind: mapping.kind,
    source: rel.sourceId,
    target: rel.targetId,
    confidence: mapping.confidence,
    evidence: [{
      type: mapping.confidence >= 0.9 ? 'source' : 'heuristic',
      location: rel.location,
      description: `${rel.kind} relationship`,
    }],
  };
}

function createIncludeEdge(
  sourceFile: string,
  targetFile: string,
  location?: SourceLocation,
): GraphEdge {
  return {
    id: `edge::${edgeCounter++}`,
    kind: 'includes',
    source: `file::${sourceFile}`,
    target: `file::${targetFile}`,
    confidence: 0.95,
    evidence: [{
      type: 'source',
      location,
      description: '#include directive',
    }],
  };
}

// ─── Subsystem detection ────────────────────────────────────────

function detectSubsystems(
  index: CodebaseIndex,
  workspaceRoot: string,
): Subsystem[] {
  const dirToFiles = new Map<string, string[]>();

  for (const file of index.files) {
    const rel = path.relative(workspaceRoot, file.path);
    const topDir = rel.split(path.sep)[0] ?? '.';
    const existing = dirToFiles.get(topDir) ?? [];
    existing.push(file.path);
    dirToFiles.set(topDir, existing);
  }

  const subsystems: Subsystem[] = [];
  for (const [dir, files] of dirToFiles) {
    const nodeIds = files.map(f => `file::${f}`);
    // Also add symbol nodes from those files
    for (const file of index.files) {
      if (files.includes(file.path)) {
        for (const sym of file.symbols) {
          const nodeKind = SYMBOL_TO_NODE_KIND[sym.kind];
          if (nodeKind) {
            nodeIds.push(sym.id);
          }
        }
      }
    }

    subsystems.push({
      id: `subsystem::${dir}`,
      name: dir === '.' ? 'root' : dir,
      nodeIds,
      pathPattern: `${dir}/**`,
    });
  }

  return subsystems;
}

// ─── Assign clusters ────────────────────────────────────────────

function getClusterForFile(
  filePath: string,
  workspaceRoot: string,
): string {
  const rel = path.relative(workspaceRoot, filePath);
  const topDir = rel.split(path.sep)[0] ?? 'root';
  return topDir === '.' ? 'root' : topDir;
}

// ─── Main builder ───────────────────────────────────────────────

export function buildGraph(
  index: CodebaseIndex,
  workspaceRoot: string,
): AnalysisResult {
  edgeCounter = 0;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const errors: AnalysisError[] = [];
  const nodeIds = new Set<string>();

  // Create file nodes
  for (const file of index.files) {
    const cluster = getClusterForFile(file.path, workspaceRoot);
    const node = fileToNode(file.path, file.relativePath);
    node.cluster = cluster;
    if (!nodeIds.has(node.id)) {
      nodes.push(node);
      nodeIds.add(node.id);
    }
  }

  // Create symbol nodes
  for (const sym of index.symbols.values()) {
    const cluster = getClusterForFile(sym.location.file, workspaceRoot);
    const node = symbolToNode(sym, cluster);
    if (node && !nodeIds.has(node.id)) {
      nodes.push(node);
      nodeIds.add(node.id);
    }
  }

  // Create "contains" edges from file → top-level symbols
  for (const file of index.files) {
    const fileNodeId = `file::${file.path}`;
    for (const sym of file.symbols) {
      if (!sym.parentId && SYMBOL_TO_NODE_KIND[sym.kind]) {
        edges.push({
          id: `edge::${edgeCounter++}`,
          kind: 'contains',
          source: fileNodeId,
          target: sym.id,
          confidence: 0.95,
          evidence: [{ type: 'source', description: 'file contains symbol' }],
        });
      }
    }
  }

  // Create include edges (file-level)
  for (const file of index.files) {
    for (const inc of file.includes) {
      if (inc.resolvedPath) {
        const targetNodeId = `file::${inc.resolvedPath}`;
        if (nodeIds.has(targetNodeId)) {
          edges.push(createIncludeEdge(file.path, inc.resolvedPath, inc.location));
        }
      }
    }
  }

  // Create relationship edges (symbol-level)
  for (const rel of index.relationships) {
    // Skip include relationships at the symbol level — already handled at file level
    if (rel.kind === 'includes') continue;

    const edge = relationshipToEdge(rel);
    if (edge) {
      // Only add if both source and target nodes exist
      if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
        edges.push(edge);
      }
    }
  }

  // Detect subsystems
  const subsystems = detectSubsystems(index, workspaceRoot);

  // Create subsystem nodes
  for (const sub of subsystems) {
    nodes.push({
      id: sub.id,
      kind: 'subsystem',
      label: sub.name,
      metadata: { pathPattern: sub.pathPattern },
    });
  }

  const graph: CodebaseGraph = {
    version: '1.0.0',
    workspace: {
      root: workspaceRoot,
    },
    nodes,
    edges,
  };

  return {
    graph,
    subsystems,
    errors,
    duration: index.buildTime,
  };
}
