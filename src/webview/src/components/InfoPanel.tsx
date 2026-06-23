import React from 'react';
import { GraphNode, GraphEdge } from '../../../types/graph';

interface InfoPanelProps {
  selectedNode: GraphNode | null;
  connectedEdges: GraphEdge[];
  onNavigateToSource: (file: string, line: number, col: number) => void;
  onRequestExplanation: (subsystemId: string) => void;
}

export function InfoPanel({
  selectedNode,
  connectedEdges,
  onNavigateToSource,
  onRequestExplanation,
}: InfoPanelProps) {
  if (!selectedNode) {
    return (
      <div className="info-panel info-panel--empty">
        <p>Select a node to view details</p>
      </div>
    );
  }

  return (
    <div className="info-panel">
      <div className="info-panel__header">
        <h3 className="info-panel__title">{selectedNode.label}</h3>
        <span className="info-panel__kind-badge">{selectedNode.kind}</span>
      </div>

      {selectedNode.qualifiedName && (
        <div className="info-panel__qualified-name">
          {selectedNode.qualifiedName}
        </div>
      )}

      {selectedNode.location && (
        <div className="info-panel__location">
          <span className="info-panel__file-path">
            {selectedNode.location.file}:{selectedNode.location.startLine}
          </span>
          <button
            className="info-panel__button"
            onClick={() =>
              onNavigateToSource(
                selectedNode.location!.file,
                selectedNode.location!.startLine,
                selectedNode.location!.startCol
              )
            }
          >
            Go to Source
          </button>
        </div>
      )}

      {selectedNode.cluster && (
        <div className="info-panel__section">
          <h4>Subsystem</h4>
          <span>{selectedNode.cluster}</span>
          <button
            className="info-panel__button info-panel__button--secondary"
            onClick={() => onRequestExplanation(selectedNode.cluster!)}
          >
            Explain
          </button>
        </div>
      )}

      {connectedEdges.length > 0 && (
        <div className="info-panel__section">
          <h4>Connections ({connectedEdges.length})</h4>
          <ul className="info-panel__edge-list">
            {connectedEdges.map((edge) => (
              <li key={edge.id} className="info-panel__edge-item">
                <span className="info-panel__edge-kind">{edge.kind.replace(/_/g, ' ')}</span>
                <span className="info-panel__edge-direction">
                  {edge.source === selectedNode.id ? `\u2192 ${edge.target}` : `\u2190 ${edge.source}`}
                </span>
                <span className="info-panel__confidence">
                  {Math.round(edge.confidence * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
