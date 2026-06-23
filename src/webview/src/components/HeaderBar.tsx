import React from 'react';
import { LayoutAlgorithm } from '../hooks/useGraphLayout';

interface HeaderBarProps {
  nodeCount: number;
  edgeCount: number;
  layout: LayoutAlgorithm;
  onLayoutChange: (layout: LayoutAlgorithm) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  concurrencyOnly: boolean;
  onConcurrencyToggle: () => void;
  onFitView: () => void;
  onExport: () => void;
  showFilters: boolean;
  onToggleFilters: () => void;
}

export function HeaderBar({
  nodeCount,
  edgeCount,
  layout,
  onLayoutChange,
  searchQuery,
  onSearchChange,
  concurrencyOnly,
  onConcurrencyToggle,
  onFitView,
  onExport,
  showFilters,
  onToggleFilters,
}: HeaderBarProps) {
  return (
    <div className="header-bar">
      <div className="header-bar__left">
        <span className="header-bar__title">
          C++ Architecture
        </span>

        {nodeCount > 0 && (
          <>
            <div className="header-bar__separator" />
            <div className="header-bar__stats">
              <span className="header-bar__stat">
                <span className="header-bar__stat-value">{nodeCount}</span> nodes
              </span>
              <span className="header-bar__stat">
                <span className="header-bar__stat-value">{edgeCount}</span> edges
              </span>
            </div>
          </>
        )}
      </div>

      <div className="header-bar__right">
        <input
          className="search-input"
          type="text"
          placeholder="Search nodes..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />

        <select
          className="native-select"
          value={layout}
          onChange={(e) => onLayoutChange(e.target.value as LayoutAlgorithm)}
        >
          <option value="hierarchical">Hierarchical</option>
          <option value="force-directed">Force</option>
        </select>

        <button
          className={`text-btn ${concurrencyOnly ? 'text-btn--active' : ''}`}
          onClick={onConcurrencyToggle}
          title="Show only concurrency artifacts"
        >
          Concurrency
        </button>

        <button
          className={`text-btn ${showFilters ? 'text-btn--active' : ''}`}
          onClick={onToggleFilters}
          title="Toggle filter panel"
        >
          Filters
        </button>

        <div className="header-bar__separator" />

        <button className="icon-btn" onClick={onFitView} title="Fit to view">
          &#x26F6;
        </button>

        <button className="icon-btn" onClick={onExport} title="Export graph as JSON">
          &#x2913;
        </button>
      </div>
    </div>
  );
}
