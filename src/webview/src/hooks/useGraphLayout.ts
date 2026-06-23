import { useCallback, useState } from 'react';
import { Node, Edge } from '@xyflow/react';
import ELK, { ElkNode } from 'elkjs/lib/elk.bundled.js';
import { GraphNode, GraphEdge } from '../../../types/graph';

export type LayoutAlgorithm = 'hierarchical' | 'force-directed';

interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
}

const elk = new ELK();

function mapNodeKindToColor(kind: string): string {
  const colors: Record<string, string> = {
    file: '#4a9eff',
    namespace: '#7c68ee',
    class: '#4ec9b0',
    struct: '#4ec9b0',
    function: '#dcdcaa',
    method: '#dcdcaa',
    thread: '#ff9944',
    mutex: '#ff4444',
    atomic: '#ff6b9d',
    condition_variable: '#c586c0',
    queue: '#9cdcfe',
    lock_guard: '#ff4444',
    subsystem: '#569cd6',
  };
  return colors[kind] || '#d4d4d4';
}

function graphNodeToFlowNode(node: GraphNode): Node {
  return {
    id: node.id,
    type: getNodeType(node.kind),
    position: { x: 0, y: 0 },
    data: {
      label: node.label,
      kind: node.kind,
      qualifiedName: node.qualifiedName,
      location: node.location,
      cluster: node.cluster,
      color: mapNodeKindToColor(node.kind),
    },
  };
}

function getNodeType(kind: string): string {
  switch (kind) {
    case 'file':
      return 'fileNode';
    case 'class':
    case 'struct':
      return 'classNode';
    case 'function':
    case 'method':
      return 'functionNode';
    case 'thread':
      return 'threadNode';
    case 'mutex':
    case 'lock_guard':
      return 'mutexNode';
    case 'atomic':
      return 'atomicNode';
    case 'queue':
      return 'queueNode';
    case 'subsystem':
      return 'subsystemNode';
    default:
      return 'functionNode';
  }
}

const edgeColors: Record<string, string> = {
  calls: '#888888',
  includes: '#666666',
  inherits: '#4ec9b0',
  contains: '#555555',
  depends_on: '#777777',
  spawns: '#ff9944',
  joins: '#ff9944',
  locks: '#ff4444',
  unlocks: '#ff6666',
  waits_on: '#c586c0',
  notifies: '#c586c0',
  reads_atomic: '#ff6b9d',
  writes_atomic: '#ff6b9d',
  produces_to: '#9cdcfe',
  consumes_from: '#9cdcfe',
};

function graphEdgeToFlowEdge(edge: GraphEdge): Edge {
  const isConcurrency = [
    'spawns', 'joins', 'locks', 'unlocks', 'waits_on',
    'notifies', 'reads_atomic', 'writes_atomic',
    'produces_to', 'consumes_from',
  ].includes(edge.kind);

  const color = edgeColors[edge.kind] || '#888';

  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'smoothstep',
    label: edge.kind.replace(/_/g, ' '),
    labelStyle: { fill: '#aaa', fontSize: 10, fontWeight: 500 },
    labelBgStyle: { fill: '#1e1e1e', fillOpacity: 0.85 },
    labelBgPadding: [4, 2] as [number, number],
    labelBgBorderRadius: 3,
    animated: isConcurrency,
    style: {
      stroke: color,
      strokeWidth: isConcurrency ? 2 : 1.5,
      opacity: Math.max(0.4, edge.confidence),
    },
    markerEnd: {
      type: 'arrowclosed' as const,
      color: color,
      width: 16,
      height: 16,
    },
    data: {
      kind: edge.kind,
      confidence: edge.confidence,
      evidence: edge.evidence,
    },
  };
}

async function applyElkLayout(
  nodes: Node[],
  edges: Edge[],
  algorithm: LayoutAlgorithm
): Promise<LayoutResult> {
  const elkAlgorithm = algorithm === 'hierarchical'
    ? 'layered'
    : 'force';

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': elkAlgorithm,
      'elk.spacing.nodeNode': '80',
      'elk.layered.spacing.nodeNodeBetweenLayers': '100',
      'elk.direction': 'DOWN',
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: 180,
      height: 60,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const layoutResult = await elk.layout(elkGraph);

  const positionedNodes = nodes.map((node) => {
    const elkNode = layoutResult.children?.find((n) => n.id === node.id);
    return {
      ...node,
      position: {
        x: elkNode?.x ?? 0,
        y: elkNode?.y ?? 0,
      },
    };
  });

  return { nodes: positionedNodes, edges };
}

export function useGraphLayout() {
  const [isLayouting, setIsLayouting] = useState(false);

  const computeLayout = useCallback(
    async (
      graphNodes: GraphNode[],
      graphEdges: GraphEdge[],
      algorithm: LayoutAlgorithm
    ): Promise<LayoutResult> => {
      setIsLayouting(true);
      try {
        const flowNodes = graphNodes.map(graphNodeToFlowNode);
        const flowEdges = graphEdges.map(graphEdgeToFlowEdge);
        const result = await applyElkLayout(flowNodes, flowEdges, algorithm);
        return result;
      } finally {
        setIsLayouting(false);
      }
    },
    []
  );

  return { computeLayout, isLayouting };
}
