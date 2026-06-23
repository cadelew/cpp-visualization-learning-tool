import React from 'react';

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

const ALL_KINDS = [
  'file', 'namespace', 'class', 'struct', 'function', 'method',
  'thread', 'mutex', 'atomic', 'condition_variable', 'queue', 'lock_guard', 'subsystem',
];

interface ControlsOverlayProps {
  visibleKinds: Set<string>;
  onToggleKind: (kind: string) => void;
  confidenceThreshold: number;
  onConfidenceChange: (value: number) => void;
  subsystems: string[];
  selectedSubsystem: string | null;
  onSubsystemChange: (subsystem: string | null) => void;
}

export function ControlsOverlay({
  visibleKinds,
  onToggleKind,
  confidenceThreshold,
  onConfidenceChange,
  subsystems,
  selectedSubsystem,
  onSubsystemChange,
}: ControlsOverlayProps) {
  return (
    <div className="controls-panel">
      <div className="controls-card">
        <div className="controls-card__header">
          <span className="controls-card__title">Node Types</span>
        </div>
        <div className="filter-chips">
          {ALL_KINDS.map((kind) => {
            const active = visibleKinds.has(kind);
            const color = KIND_COLORS[kind] || '#888';
            return (
              <button
                key={kind}
                className={`filter-chip ${active ? 'filter-chip--active' : 'filter-chip--inactive'}`}
                style={active ? { backgroundColor: color + '30', color: color, borderColor: color + '60' } : undefined}
                onClick={() => onToggleKind(kind)}
              >
                <span className="filter-chip__dot" style={{ backgroundColor: active ? color : 'var(--text-muted)' }} />
                {kind.replace(/_/g, ' ')}
              </button>
            );
          })}
        </div>
      </div>

      <div className="controls-card">
        <div className="controls-card__header">
          <span className="controls-card__title">Confidence</span>
        </div>
        <div className="confidence-row">
          <label>Min</label>
          <input
            type="range"
            min={0}
            max={100}
            value={confidenceThreshold * 100}
            onChange={(e) => onConfidenceChange(Number(e.target.value) / 100)}
          />
          <span className="confidence-value">{Math.round(confidenceThreshold * 100)}%</span>
        </div>
      </div>

      {subsystems.length > 0 && (
        <div className="controls-card">
          <div className="controls-card__header">
            <span className="controls-card__title">Subsystem</span>
          </div>
          <select
            className="native-select"
            style={{ width: '100%' }}
            value={selectedSubsystem || ''}
            onChange={(e) => onSubsystemChange(e.target.value || null)}
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
