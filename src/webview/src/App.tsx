import React, { useState, useCallback, useMemo } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { GraphCanvas } from './components/GraphCanvas';
import { DetailPanel } from './components/DetailPanel';
import { HeaderBar } from './components/HeaderBar';
import { ControlsOverlay } from './components/ControlsOverlay';
import { useVSCodeMessaging } from './hooks/useVSCodeMessaging';
import { LayoutAlgorithm } from './hooks/useGraphLayout';
import { GraphNode, GraphEdge, CodebaseGraph } from '../../types/graph';
import { GraphFilter, ExtensionToWebviewMessage } from '../../types/webview';
import './styles/main.css';

export function App() {
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
    new Set([
      'file', 'namespace', 'class', 'struct', 'function', 'method',
      'thread', 'mutex', 'atomic', 'condition_variable', 'queue',
      'lock_guard', 'subsystem',
    ])
  );

  const handleMessage = useCallback((message: ExtensionToWebviewMessage) => {
    switch (message.type) {
      case 'graphData':
        setGraphData(message.payload);
        break;
      case 'config': {
        setLayout(message.payload.layout === 'radial' ? 'hierarchical' : message.payload.layout);
        if (message.payload.highlightConcurrency) {
          setConcurrencyOnly(true);
        }
        break;
      }
    }
  }, []);

  const { postMessage } = useVSCodeMessaging(handleMessage);

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      setSelectedNode(node);
      postMessage({ type: 'selectNode', payload: { nodeId: node.id } });
    },
    [postMessage]
  );

  const handleCloseDetail = useCallback(() => setSelectedNode(null), []);

  const handleNavigateToSource = useCallback(
    (file: string, line: number, col: number) => {
      postMessage({ type: 'navigateToSource', payload: { file, line, col } });
    },
    [postMessage]
  );

  const handleRequestExplanation = useCallback(
    (subsystemId: string) => {
      postMessage({ type: 'requestExplanation', payload: { subsystemId } });
    },
    [postMessage]
  );

  const handleExport = useCallback(() => {
    postMessage({ type: 'exportGraph', payload: { format: 'json' } });
  }, [postMessage]);

  const handleFitView = useCallback(() => {
    setFitViewTrigger((prev) => prev + 1);
  }, []);

  const handleToggleKind = useCallback((kind: string) => {
    setVisibleKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);

  const graphNodes = graphData?.nodes || [];
  const graphEdges = graphData?.edges || [];

  const connectedEdges = useMemo(() => {
    if (!selectedNode) return [];
    return graphEdges.filter(
      (e) => e.source === selectedNode.id || e.target === selectedNode.id
    );
  }, [selectedNode, graphEdges]);

  const subsystems = useMemo(() => {
    const clusters = new Set<string>();
    graphNodes.forEach((n) => { if (n.cluster) clusters.add(n.cluster); });
    return Array.from(clusters).sort();
  }, [graphNodes]);

  const filter: GraphFilter = useMemo(
    () => ({
      nodeKinds: Array.from(visibleKinds),
      minConfidence: confidenceThreshold,
      concurrencyOnly,
      subsystemId: selectedSubsystem || undefined,
      searchQuery: searchQuery || undefined,
    }),
    [visibleKinds, confidenceThreshold, concurrencyOnly, selectedSubsystem, searchQuery]
  );

  const nodeCount = graphNodes.length;
  const edgeCount = graphEdges.length;

  return (
    <div className="app">
      <HeaderBar
        nodeCount={nodeCount}
        edgeCount={edgeCount}
        layout={layout}
        onLayoutChange={setLayout}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        concurrencyOnly={concurrencyOnly}
        onConcurrencyToggle={() => setConcurrencyOnly((p) => !p)}
        onFitView={handleFitView}
        onExport={handleExport}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters((p) => !p)}
      />
      <div className="app__main">
        <ReactFlowProvider>
          <GraphCanvas
            graphNodes={graphNodes}
            graphEdges={graphEdges}
            layout={layout}
            filter={filter}
            onNodeClick={handleNodeClick}
            fitViewTrigger={fitViewTrigger}
          />
        </ReactFlowProvider>

        {showFilters && (
          <ControlsOverlay
            visibleKinds={visibleKinds}
            onToggleKind={handleToggleKind}
            confidenceThreshold={confidenceThreshold}
            onConfidenceChange={setConfidenceThreshold}
            subsystems={subsystems}
            selectedSubsystem={selectedSubsystem}
            onSubsystemChange={setSelectedSubsystem}
          />
        )}

        <DetailPanel
          selectedNode={selectedNode}
          connectedEdges={connectedEdges}
          allNodes={graphNodes}
          onClose={handleCloseDetail}
          onNavigateToSource={handleNavigateToSource}
          onRequestExplanation={handleRequestExplanation}
        />
      </div>
    </div>
  );
}
