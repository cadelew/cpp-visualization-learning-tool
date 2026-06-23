import React from 'react';
import { LayoutAlgorithm } from '../hooks/useGraphLayout';

interface ToolbarProps {
  layout: LayoutAlgorithm;
  onLayoutChange: (layout: LayoutAlgorithm) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  concurrencyOnly: boolean;
  onConcurrencyToggle: () => void;
  onFitView: () => void;
  onExport: () => void;
  showFiles: boolean;
  onToggleFiles: () => void;
}

export function Toolbar({
  layout,
  onLayoutChange,
  searchQuery,
  onSearchChange,
  concurrencyOnly,
  onConcurrencyToggle,
  onFitView,
  onExport,
  showFiles,
  onToggleFiles,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbar__group">
        <select
          className="toolbar__select"
          value={layout}
          onChange={(e) => onLayoutChange((e.target as HTMLSelectElement).value as LayoutAlgorithm)}
        >
          <option value="hierarchical">Hierarchical</option>
          <option value="force-directed">Force-Directed</option>
        </select>
      </div>

      <div className="toolbar__group">
        <label className="toolbar__toggle">
          <input
            type="checkbox"
            checked={showFiles}
            onChange={onToggleFiles}
          />
          <span>Files</span>
        </label>
        <label className="toolbar__toggle">
          <input
            type="checkbox"
            checked={concurrencyOnly}
            onChange={onConcurrencyToggle}
          />
          <span>Concurrency Only</span>
        </label>
      </div>

      <div className="toolbar__group">
        <input
          className="toolbar__search"
          type="text"
          placeholder="Search nodes..."
          value={searchQuery}
          onChange={(e) => onSearchChange((e.target as HTMLInputElement).value)}
        />
      </div>

      <div className="toolbar__group">
        <button className="toolbar__button" onClick={onFitView} title="Fit to view">
          Fit
        </button>
        <button className="toolbar__button" onClick={onExport} title="Export graph">
          Export
        </button>
      </div>
    </div>
  );
}
