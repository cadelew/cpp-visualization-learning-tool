import React from 'react';
import { NodeKind } from '../../../types/graph';

interface FilterPanelProps {
  visibleKinds: Set<string>;
  onToggleKind: (kind: string) => void;
  confidenceThreshold: number;
  onConfidenceChange: (threshold: number) => void;
  subsystems: string[];
  selectedSubsystem: string | null;
  onSubsystemChange: (subsystem: string | null) => void;
}

const ALL_NODE_KINDS: NodeKind[] = [
  'file', 'namespace', 'class', 'struct', 'function', 'method',
  'thread', 'mutex', 'atomic', 'condition_variable', 'queue',
  'lock_guard', 'subsystem',
];

export function FilterPanel({
  visibleKinds,
  onToggleKind,
  confidenceThreshold,
  onConfidenceChange,
  subsystems,
  selectedSubsystem,
  onSubsystemChange,
}: FilterPanelProps) {
  return (
    <div className="filter-panel">
      <div className="filter-panel__section">
        <h4 className="filter-panel__heading">Node Types</h4>
        <div className="filter-panel__checkboxes">
          {ALL_NODE_KINDS.map((kind) => (
            <label key={kind} className="filter-panel__checkbox">
              <input
                type="checkbox"
                checked={visibleKinds.has(kind)}
                onChange={() => onToggleKind(kind)}
              />
              <span>{kind.replace(/_/g, ' ')}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="filter-panel__section">
        <h4 className="filter-panel__heading">
          Confidence: {Math.round(confidenceThreshold * 100)}%
        </h4>
        <input
          type="range"
          min="0"
          max="100"
          value={confidenceThreshold * 100}
          onChange={(e) => onConfidenceChange(Number((e.target as HTMLInputElement).value) / 100)}
          className="filter-panel__slider"
        />
      </div>

      {subsystems.length > 0 && (
        <div className="filter-panel__section">
          <h4 className="filter-panel__heading">Subsystem</h4>
          <select
            className="filter-panel__select"
            value={selectedSubsystem || ''}
            onChange={(e) => onSubsystemChange((e.target as HTMLSelectElement).value || null)}
          >
            <option value="">All subsystems</option>
            {subsystems.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
