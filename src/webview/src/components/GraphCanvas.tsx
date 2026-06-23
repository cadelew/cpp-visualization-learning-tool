import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Node,
  Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { nodeTypes } from './NodeTypes';
import { GraphNode, GraphEdge } from '../../../types/graph';
import { useGraphLayout, LayoutAlgorithm } from '../hooks/useGraphLayout';
import { GraphFilter } from '../../../types/webview';

interface GraphCanvasProps {
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  layout: LayoutAlgorithm;
  filter: GraphFilter;
  onNodeClick: (node: GraphNode) => void;
  fitViewTrigger: number;
}

export function GraphCanvas({
  graphNodes,
  graphEdges,
  layout,
  filter,
  onNodeClick,
  fitViewTrigger,
}: GraphCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { computeLayout, isLayouting } = useGraphLayout();
  const { fitView } = useReactFlow();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Apply filters
  const filteredData = useMemo(() => {
    let filteredNodes = graphNodes;
    let filteredEdges = graphEdges;

    if (filter.nodeKinds && filter.nodeKinds.length > 0) {
      filteredNodes = filteredNodes.filter((n) => filter.nodeKinds!.includes(n.kind));
    }

    if (filter.concurrencyOnly) {
      const concurrencyKinds = ['thread', 'mutex', 'atomic', 'condition_variable', 'queue', 'lock_guard'];
      filteredNodes = filteredNodes.filter((n) => concurrencyKinds.includes(n.kind));
    }

    if (filter.subsystemId) {
      filteredNodes = filteredNodes.filter((n) => n.cluster === filter.subsystemId);
    }

    if (filter.searchQuery) {
      const query = filter.searchQuery.toLowerCase();
      filteredNodes = filteredNodes.filter(
        (n) =>
          n.label.toLowerCase().includes(query) ||
          n.qualifiedName?.toLowerCase().includes(query)
      );
    }

    if (filter.minConfidence !== undefined) {
      filteredEdges = filteredEdges.filter((e) => e.confidence >= filter.minConfidence!);
    }

    if (filter.edgeKinds && filter.edgeKinds.length > 0) {
      filteredEdges = filteredEdges.filter((e) => filter.edgeKinds!.includes(e.kind));
    }

    // Only keep edges whose both ends exist in filtered nodes
    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    filteredEdges = filteredEdges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
    );

    return { nodes: filteredNodes, edges: filteredEdges };
  }, [graphNodes, graphEdges, filter]);

  // Compute layout when data or algorithm changes
  useEffect(() => {
    if (filteredData.nodes.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    let cancelled = false;
    computeLayout(filteredData.nodes, filteredData.edges, layout).then((result) => {
      if (!cancelled) {
        setNodes(result.nodes);
        setEdges(result.edges);
      }
    });

    return () => { cancelled = true; };
  }, [filteredData, layout, computeLayout, setNodes, setEdges]);

  // Fit view when trigger changes
  useEffect(() => {
    if (fitViewTrigger > 0) {
      setTimeout(() => fitView({ padding: 0.2 }), 100);
    }
  }, [fitViewTrigger, fitView]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
      const graphNode = graphNodes.find((n) => n.id === node.id);
      if (graphNode) {
        onNodeClick(graphNode);
      }
    },
    [graphNodes, onNodeClick]
  );

  // Highlight selected node
  const styledNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
      })),
    [nodes, selectedNodeId]
  );

  return (
    <div className="graph-canvas">
      {isLayouting && (
        <div className="graph-canvas__loading">Computing layout...</div>
      )}
      <ReactFlow
        nodes={styledNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const data = node.data as { color?: string };
            return data?.color || '#888';
          }}
          style={{ backgroundColor: 'var(--vscode-editor-background, #1e1e1e)' }}
        />
      </ReactFlow>
    </div>
  );
}
