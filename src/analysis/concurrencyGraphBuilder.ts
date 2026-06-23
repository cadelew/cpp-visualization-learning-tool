import {
  ThreadInfo,
  MutexInfo,
  AtomicInfo,
  ConditionVariableInfo,
  QueueInfo,
} from '../types/concurrency';
import { GraphNode, GraphEdge, EdgeEvidence } from '../types/graph';

interface DetectionResult {
  threads: ThreadInfo[];
  mutexes: MutexInfo[];
  atomics: AtomicInfo[];
  conditionVariables: ConditionVariableInfo[];
  queues: QueueInfo[];
}

interface GraphBuildResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

let edgeIdCounter = 0;

function edgeId(): string {
  return `edge_${edgeIdCounter++}`;
}

export function resetGraphIdCounter(): void {
  edgeIdCounter = 0;
}

function makeEvidence(description: string, type: EdgeEvidence['type'] = 'source'): EdgeEvidence[] {
  return [{ type, description }];
}

export function buildConcurrencyGraph(detection: DetectionResult): GraphBuildResult {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // ─── Thread Nodes & Edges ──────────────────────────────────
  for (const thread of detection.threads) {
    nodes.push({
      id: thread.id,
      kind: 'thread',
      label: thread.name,
      qualifiedName: `${thread.kind}::${thread.name}`,
      location: thread.spawnLocation,
      metadata: {
        threadKind: thread.kind,
        entryFunction: thread.entryFunction,
        detached: thread.detached,
      },
    });

    // spawns edge: from the entry function context to the thread
    edges.push({
      id: edgeId(),
      kind: 'spawns',
      source: `fn::${thread.entryFunction}`,
      target: thread.id,
      confidence: 0.95,
      evidence: makeEvidence(`${thread.kind} spawned with entry ${thread.entryFunction}`),
    });

    // joins edge if join location exists
    if (thread.joinLocation && !thread.detached) {
      edges.push({
        id: edgeId(),
        kind: 'joins',
        source: thread.id,
        target: `fn::${thread.entryFunction}`,
        confidence: 0.95,
        evidence: makeEvidence(`Thread ${thread.name} joined`),
      });
    }
  }

  // ─── Mutex Nodes & Edges ───────────────────────────────────
  for (const mutex of detection.mutexes) {
    nodes.push({
      id: mutex.id,
      kind: 'mutex',
      label: mutex.name,
      qualifiedName: `${mutex.kind}::${mutex.name}`,
      location: mutex.declarationLocation,
      metadata: {
        mutexKind: mutex.kind,
        acquiredBy: mutex.acquiredBy,
      },
    });

    for (const fn of mutex.acquiredBy) {
      edges.push({
        id: edgeId(),
        kind: 'locks',
        source: `fn::${fn}`,
        target: mutex.id,
        confidence: 0.95,
        evidence: makeEvidence(`Function ${fn} acquires mutex ${mutex.name}`),
      });
    }
  }

  // ─── Atomic Nodes & Edges ──────────────────────────────────
  for (const atomic of detection.atomics) {
    nodes.push({
      id: atomic.id,
      kind: 'atomic',
      label: atomic.name,
      qualifiedName: `atomic<${atomic.type}>::${atomic.name}`,
      location: atomic.declarationLocation,
      metadata: {
        atomicType: atomic.type,
        memoryOrders: atomic.memoryOrders,
      },
    });

    for (const fn of atomic.readers) {
      edges.push({
        id: edgeId(),
        kind: 'reads_atomic',
        source: `fn::${fn}`,
        target: atomic.id,
        confidence: 0.95,
        evidence: makeEvidence(`Function ${fn} reads atomic ${atomic.name}`),
      });
    }

    for (const fn of atomic.writers) {
      edges.push({
        id: edgeId(),
        kind: 'writes_atomic',
        source: `fn::${fn}`,
        target: atomic.id,
        confidence: 0.95,
        evidence: makeEvidence(`Function ${fn} writes atomic ${atomic.name}`),
      });
    }
  }

  // ─── Condition Variable Edges ──────────────────────────────
  for (const cv of detection.conditionVariables) {
    nodes.push({
      id: cv.id,
      kind: 'condition_variable',
      label: cv.name,
      qualifiedName: `condition_variable::${cv.name}`,
      location: cv.declarationLocation,
      metadata: {
        associatedMutex: cv.associatedMutex,
      },
    });

    for (const fn of cv.waiters) {
      edges.push({
        id: edgeId(),
        kind: 'waits_on',
        source: `fn::${fn}`,
        target: cv.id,
        confidence: 0.95,
        evidence: makeEvidence(`Function ${fn} waits on ${cv.name}`),
      });
    }

    for (const fn of cv.notifiers) {
      edges.push({
        id: edgeId(),
        kind: 'notifies',
        source: `fn::${fn}`,
        target: cv.id,
        confidence: 0.95,
        evidence: makeEvidence(`Function ${fn} notifies ${cv.name}`),
      });
    }
  }

  // ─── Queue Nodes & Edges ───────────────────────────────────
  for (const queue of detection.queues) {
    nodes.push({
      id: queue.id,
      kind: 'queue',
      label: queue.name,
      qualifiedName: `queue::${queue.name}`,
      location: queue.declarationLocation,
      metadata: {
        queueKind: queue.kind,
        elementType: queue.elementType,
      },
    });

    const confidence = queue.confidence;

    for (const fn of queue.producers) {
      edges.push({
        id: edgeId(),
        kind: 'produces_to',
        source: `fn::${fn}`,
        target: queue.id,
        confidence,
        evidence: makeEvidence(`Function ${fn} produces to queue ${queue.name}`, 'heuristic'),
      });
    }

    for (const fn of queue.consumers) {
      edges.push({
        id: edgeId(),
        kind: 'consumes_from',
        source: `fn::${fn}`,
        target: queue.id,
        confidence,
        evidence: makeEvidence(`Function ${fn} consumes from queue ${queue.name}`, 'heuristic'),
      });
    }
  }

  return { nodes, edges };
}
