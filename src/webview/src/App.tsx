import React, { useState, useCallback, useMemo } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { GraphCanvas } from './components/GraphCanvas';
import { InfoPanel } from './components/InfoPanel';
import { Toolbar } from './components/Toolbar';
import { FilterPanel } from './components/FilterPanel';
import { useVSCodeMessaging } from './hooks/useVSCodeMessaging';
import { LayoutAlgorithm } from './hooks/useGraphLayout';
import { GraphNode, CodebaseGraph } from '../../types/graph';
import { GraphFilter, WebviewConfig, ExtensionToWebviewMessage } from '../../types/webview';
import { ThemeKind } from './utils/theme';
import './styles/main.css';

export function App() {
  const [graphData, setGraphData] = useState<CodebaseGraph | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [layout, setLayout] = useState<LayoutAlgorithm>('hierarchical');
  const [searchQuery, setSearchQuery] = useState('');
  const [concurrencyOnly, setConcurrencyOnly] = useState(false);
  const [showFiles, setShowFiles] = useState(true);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0);
  const [selectedSubsystem, setSelectedSubsystem] = useState<string | null>(null);
  const [fitViewTrigger, setFitViewTrigger] = useState(0);
  const [themeKind, setThemeKind] = useState<ThemeKind>('dark');
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
      case 'theme':
        setThemeKind(message.payload.kind);
        break;
      case 'config': {
        const config: WebviewConfig = message.payload;
        setLayout(config.layout === 'radial' ? 'hierarchical' : config.layout);
        if (config.highlightConcurrency) {
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
      if (next.has(kind)) {
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  }, []);

  const handleToggleFiles = useCallback(() => {
    setShowFiles((prev) => {
      const next = !prev;
      setVisibleKinds((kinds) => {
        const updated = new Set(kinds);
        if (next) {
          updated.add('file');
        } else {
          updated.delete('file');
        }
        return updated;
      });
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
    graphNodes.forEach((n) => {
      if (n.cluster) clusters.add(n.cluster);
    });
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

  return (
    <div className="app" data-theme={themeKind}>
      <Toolbar
        layout={layout}
        onLayoutChange={setLayout}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        concurrencyOnly={concurrencyOnly}
        onConcurrencyToggle={() => setConcurrencyOnly((p) => !p)}
        onFitView={handleFitView}
        onExport={handleExport}
        showFiles={showFiles}
        onToggleFiles={handleToggleFiles}
      />
      <div className="app__content">
        <FilterPanel
          visibleKinds={visibleKinds}
          onToggleKind={handleToggleKind}
          confidenceThreshold={confidenceThreshold}
          onConfidenceChange={setConfidenceThreshold}
          subsystems={subsystems}
          selectedSubsystem={selectedSubsystem}
          onSubsystemChange={setSelectedSubsystem}
        />
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
        <InfoPanel
          selectedNode={selectedNode}
          connectedEdges={connectedEdges}
          onNavigateToSource={handleNavigateToSource}
          onRequestExplanation={handleRequestExplanation}
        />
      </div>
    </div>
  );
}
