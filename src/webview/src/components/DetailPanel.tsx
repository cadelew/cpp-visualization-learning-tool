import React from 'react';
import { GraphNode, GraphEdge } from '../../../types/graph';

const KIND_COLORS: Record<string, string> = {
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

const KIND_ICONS: Record<string, string> = {
  file: 'F',
  namespace: 'N',
  class: 'C',
  struct: 'S',
  function: 'fn',
  method: 'fn',
  thread: 'T',
  mutex: 'M',
  atomic: 'A',
  condition_variable: 'CV',
  queue: 'Q',
  lock_guard: 'LG',
  subsystem: 'SS',
};

interface DetailPanelProps {
  selectedNode: GraphNode | null;
  connectedEdges: GraphEdge[];
  allNodes: GraphNode[];
  onClose: () => void;
  onNavigateToSource: (file: string, line: number, col: number) => void;
  onRequestExplanation: (subsystemId: string) => void;
}

function getEdgeColor(kind: string): string {
  const colors: Record<string, string> = {
    calls: '#888',
    includes: '#666',
    inherits: '#4ec9b0',
    contains: '#555',
    depends_on: '#777',
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
  return colors[kind] || '#888';
}

function confidenceColor(c: number): string {
  if (c >= 0.9) return '#4ec9b0';
  if (c >= 0.7) return '#dcdcaa';
  if (c >= 0.5) return '#ff9944';
  return '#ff4444';
}

export function DetailPanel({
  selectedNode,
  connectedEdges,
  allNodes,
  onClose,
  onNavigateToSource,
  onRequestExplanation,
}: DetailPanelProps) {
  if (!selectedNode) {
    return <div className="detail-panel detail-panel--hidden" />;
  }

  const color = KIND_COLORS[selectedNode.kind] || '#888';
  const icon = KIND_ICONS[selectedNode.kind] || '?';
  const loc = selectedNode.location;

  const findNodeLabel = (id: string) => {
    const n = allNodes.find((node) => node.id === id);
    return n?.label || id;
  };

  return (
    <div className="detail-panel">
      <div className="detail-panel__header">
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Details</span>
        <button className="detail-panel__close" onClick={onClose}>&times;</button>
      </div>
      <div className="detail-panel__body">
        <div className="detail-panel__node-header">
          <div className="detail-panel__node-icon" style={{ backgroundColor: color }}>
            {icon}
          </div>
          <div className="detail-panel__node-info">
            <div className="detail-panel__node-name">{selectedNode.label}</div>
            <div className="detail-panel__node-kind" style={{ color }}>
              {selectedNode.kind.replace(/_/g, ' ')}
            </div>
          </div>
        </div>

        {selectedNode.qualifiedName && (
          <div className="detail-panel__node-qualified">
            {selectedNode.qualifiedName}
          </div>
        )}

        {loc && (
          <div
            className="detail-panel__file-link"
            onClick={() => onNavigateToSource(loc.file, loc.startLine, loc.startCol)}
          >
            <span className="detail-panel__file-path">{loc.file}</span>
            <span className="detail-panel__file-line">:{loc.startLine}</span>
          </div>
        )}

        <div className="detail-panel__actions">
          {loc && (
            <button
              className="detail-panel__action-btn detail-panel__action-btn--primary"
              onClick={() => onNavigateToSource(loc.file, loc.startLine, loc.startCol)}
            >
              Go to Source
            </button>
          )}
          {selectedNode.cluster && (
            <button
              className="detail-panel__action-btn detail-panel__action-btn--secondary"
              onClick={() => onRequestExplanation(selectedNode.cluster!)}
            >
              Explain
            </button>
          )}
        </div>

        {connectedEdges.length > 0 && (
          <div className="detail-panel__section">
            <div className="detail-panel__section-title">
              Connections ({connectedEdges.length})
            </div>
            <div className="detail-panel__edge-list">
              {connectedEdges.map((edge) => {
                const isOutgoing = edge.source === selectedNode.id;
                const otherId = isOutgoing ? edge.target : edge.source;
                const otherLabel = findNodeLabel(otherId);
                return (
                  <div key={edge.id} className="detail-panel__edge-item">
                    <span
                      className="detail-panel__edge-kind"
                      style={{ color: getEdgeColor(edge.kind) }}
                    >
                      {isOutgoing ? '\u2192' : '\u2190'} {edge.kind.replace(/_/g, ' ')}
                    </span>
                    <span className="detail-panel__edge-target">{otherLabel}</span>
                    <span
                      className="detail-panel__edge-confidence"
                      style={{ color: confidenceColor(edge.confidence) }}
                    >
                      {Math.round(edge.confidence * 100)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
