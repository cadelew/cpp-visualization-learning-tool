/**
 * Types for communication between the VS Code extension and the webview.
 */

import { CodebaseGraph, GraphNode, GraphEdge, Subsystem } from './graph';
import { ConcurrencyAnalysis } from './concurrency';
import { SubsystemExplanation, OnboardingGuide, CodebaseAnswer } from './llm';

// ─── Extension → Webview Messages ─────────────────────────────

export type ExtensionToWebviewMessage =
  | { type: 'graphData'; payload: CodebaseGraph }
  | { type: 'concurrencyData'; payload: ConcurrencyAnalysis }
  | { type: 'subsystems'; payload: Subsystem[] }
  | { type: 'explanation'; payload: SubsystemExplanation }
  | { type: 'onboardingGuide'; payload: OnboardingGuide }
  | { type: 'answer'; payload: CodebaseAnswer }
  | { type: 'analysisProgress'; payload: { phase: string; percent: number; message: string } }
  | { type: 'analysisError'; payload: { message: string; details?: string } }
  | { type: 'theme'; payload: { kind: 'light' | 'dark' | 'high-contrast' } }
  | { type: 'config'; payload: WebviewConfig };

// ─── Webview → Extension Messages ─────────────────────────────

export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'navigateToSource'; payload: { file: string; line: number; col: number } }
  | { type: 'requestExplanation'; payload: { subsystemId: string } }
  | { type: 'requestOnboarding'; payload: {} }
  | { type: 'askQuestion'; payload: { question: string; context?: { nodeId?: string } } }
  | { type: 'filterGraph'; payload: GraphFilter }
  | { type: 'selectNode'; payload: { nodeId: string } }
  | { type: 'requestRefresh'; payload: {} }
  | { type: 'exportGraph'; payload: { format: 'svg' | 'png' | 'json' } };

// ─── Graph Display Config ─────────────────────────────────────

export interface WebviewConfig {
  layout: 'hierarchical' | 'force-directed' | 'radial';
  showLabels: boolean;
  showEdgeLabels: boolean;
  showConfidence: boolean;
  clusterBySubsystem: boolean;
  highlightConcurrency: boolean;
}

export interface GraphFilter {
  nodeKinds?: string[];
  edgeKinds?: string[];
  minConfidence?: number;
  subsystemId?: string;
  searchQuery?: string;
  /** Show only concurrency-related artifacts */
  concurrencyOnly?: boolean;
  /** Show path between two nodes */
  pathBetween?: { from: string; to: string };
}
