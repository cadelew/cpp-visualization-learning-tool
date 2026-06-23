import { ConcurrencyAnalysis } from '../types/concurrency';
import { GraphNode, GraphEdge, CodebaseGraph } from '../types/graph';
import { detectConcurrencyMultiFile, resetIdCounter } from './concurrencyDetector';
import { buildConcurrencyGraph, resetGraphIdCounter } from './concurrencyGraphBuilder';
import { detectPatterns } from './patternDetector';

export async function analyzeConcurrency(
  files: Array<{ path: string; content: string }>,
  _existingGraph?: CodebaseGraph
): Promise<{ analysis: ConcurrencyAnalysis; nodes: GraphNode[]; edges: GraphEdge[] }> {
  resetIdCounter();
  resetGraphIdCounter();

  const detection = detectConcurrencyMultiFile(files);
  const patterns = detectPatterns(detection);

  const analysis: ConcurrencyAnalysis = {
    threads: detection.threads,
    mutexes: detection.mutexes,
    atomics: detection.atomics,
    conditionVariables: detection.conditionVariables,
    queues: detection.queues,
    patterns,
  };

  const { nodes, edges } = buildConcurrencyGraph(detection);

  return { analysis, nodes, edges };
}
