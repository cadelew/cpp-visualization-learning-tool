import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
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
  const initialFitDone = useRef(false);

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

    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    filteredEdges = filteredEdges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
    );

    return { nodes: filteredNodes, edges: filteredEdges };
  }, [graphNodes, graphEdges, filter]);

  useEffect(() => {
    if (filteredData.nodes.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    let cancelled = false;
    computeLayout(filteredData.nodes, filteredData.edges, layout).then((result) => {
      if (cancelled) return;
      setNodes(result.nodes);
      setEdges(result.edges);
      setTimeout(() => {
        fitView({ padding: 0.12, duration: 250 });
        initialFitDone.current = true;
      }, 60);
    });

    return () => { cancelled = true; };
  }, [filteredData, layout, computeLayout, setNodes, setEdges, fitView]);

  useEffect(() => {
    if (fitViewTrigger > 0) {
      setTimeout(() => fitView({ padding: 0.12, duration: 250 }), 60);
    }
  }, [fitViewTrigger, fitView]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
      const graphNode = graphNodes.find((n) => n.id === node.id);
      if (graphNode) onNodeClick(graphNode);
    },
    [graphNodes, onNodeClick]
  );

  const styledNodes = useMemo(
    () => nodes.map((node) => ({ ...node, selected: node.id === selectedNodeId })),
    [nodes, selectedNodeId]
  );

  const isEmpty = graphNodes.length === 0 && !isLayouting;

  return (
    <div className="graph-canvas">
      {isEmpty && (
        <div className="graph-canvas__empty">
          <div className="graph-canvas__empty-icon">{'{}'}</div>
          <div className="graph-canvas__empty-title">No graph data yet</div>
          <div className="graph-canvas__empty-subtitle">
            Open a folder with C++ files and run "C++ Viz: Analyze Workspace"
          </div>
        </div>
      )}

      {isLayouting && (
        <div className="graph-canvas__loading-overlay">
          <div className="graph-canvas__loading-card">
            <div className="graph-canvas__loading-spinner" />
            <div className="graph-canvas__loading-text">Computing layout...</div>
          </div>
        </div>
      )}

      <ReactFlow
        nodes={styledNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.02}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { strokeWidth: 1.5 },
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#333" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(node) => {
            const data = node.data as { color?: string };
            return data?.color || '#666';
          }}
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}
