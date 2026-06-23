import {
  ConcurrencyPattern,
  ThreadInfo,
  MutexInfo,
  AtomicInfo,
  ConditionVariableInfo,
  QueueInfo,
} from '../types/concurrency';

interface DetectionResult {
  threads: ThreadInfo[];
  mutexes: MutexInfo[];
  atomics: AtomicInfo[];
  conditionVariables: ConditionVariableInfo[];
  queues: QueueInfo[];
}

export function detectPatterns(detection: DetectionResult): ConcurrencyPattern[] {
  const patterns: ConcurrencyPattern[] = [];

  patterns.push(...detectProducerConsumer(detection));
  patterns.push(...detectReaderWriter(detection));
  patterns.push(...detectThreadPool(detection));
  patterns.push(...detectForkJoin(detection));
  patterns.push(...detectMonitor(detection));

  return patterns;
}

// ─── Producer-Consumer ─────────────────────────────────────────
// Thread A pushes to queue, Thread B pops from queue (or mutex+CV pattern)

function detectProducerConsumer(detection: DetectionResult): ConcurrencyPattern[] {
  const patterns: ConcurrencyPattern[] = [];

  // Queue-based: any queue with both producers and consumers
  for (const queue of detection.queues) {
    if (queue.producers.length > 0 && queue.consumers.length > 0) {
      const producerFns = queue.producers;
      const consumerFns = queue.consumers;
      // Check these are different functions (not same fn doing both)
      const distinctProducers = producerFns.filter(p => !consumerFns.includes(p));
      const distinctConsumers = consumerFns.filter(c => !producerFns.includes(c));

      if (distinctProducers.length > 0 && distinctConsumers.length > 0) {
        patterns.push({
          kind: 'producer_consumer',
          name: `ProducerConsumer(${queue.name})`,
          description: `Producer-consumer pattern via queue ${queue.name}. ` +
            `Producers: ${distinctProducers.join(', ')}. ` +
            `Consumers: ${distinctConsumers.join(', ')}.`,
          participants: [queue.id, ...distinctProducers, ...distinctConsumers],
          confidence: queue.kind === 'std_queue_mutex' ? 0.8 : 0.85,
        });
      }
    }
  }

  // Mutex+CV pattern: a CV with both waiters and notifiers, and an associated mutex
  for (const cv of detection.conditionVariables) {
    if (cv.waiters.length > 0 && cv.notifiers.length > 0) {
      const waitFns = cv.waiters;
      const notifyFns = cv.notifiers;
      const distinctWaiters = waitFns.filter(w => !notifyFns.includes(w));
      const distinctNotifiers = notifyFns.filter(n => !waitFns.includes(n));

      if (distinctWaiters.length > 0 && distinctNotifiers.length > 0) {
        // Check if there's an associated queue already detected
        const alreadyCovered = patterns.some(p =>
          p.kind === 'producer_consumer' &&
          (distinctWaiters.some(w => p.participants.includes(w)) ||
           distinctNotifiers.some(n => p.participants.includes(n)))
        );

        if (!alreadyCovered) {
          const participants = [cv.id];
          if (cv.associatedMutex) participants.push(cv.associatedMutex);
          participants.push(...distinctNotifiers, ...distinctWaiters);

          patterns.push({
            kind: 'producer_consumer',
            name: `ProducerConsumer(${cv.name})`,
            description: `Producer-consumer pattern via condition variable ${cv.name}. ` +
              `Producers (notify): ${distinctNotifiers.join(', ')}. ` +
              `Consumers (wait): ${distinctWaiters.join(', ')}.`,
            participants,
            confidence: 0.7,
          });
        }
      }
    }
  }

  return patterns;
}

// ─── Reader-Writer ─────────────────────────────────────────────
// shared_mutex with shared_lock (readers) and unique_lock (writers)

function detectReaderWriter(detection: DetectionResult): ConcurrencyPattern[] {
  const patterns: ConcurrencyPattern[] = [];

  for (const mutex of detection.mutexes) {
    if (mutex.kind === 'shared_mutex') {
      // This is a reader-writer lock
      patterns.push({
        kind: 'reader_writer',
        name: `ReaderWriter(${mutex.name})`,
        description: `Reader-writer pattern using shared_mutex ${mutex.name}. ` +
          `Accessed by: ${mutex.acquiredBy.join(', ')}.`,
        participants: [mutex.id, ...mutex.acquiredBy],
        confidence: 0.9,
      });
    }
  }

  return patterns;
}

// ─── Thread Pool ───────────────────────────────────────────────
// Multiple threads consuming from a single queue

function detectThreadPool(detection: DetectionResult): ConcurrencyPattern[] {
  const patterns: ConcurrencyPattern[] = [];

  // Heuristic: multiple threads + a queue + a CV + a shutdown atomic
  const hasMultipleThreads = detection.threads.length >= 2 ||
    detection.threads.some(t => t.name === '<emplace>');
  const hasQueue = detection.queues.length > 0;
  const hasCV = detection.conditionVariables.length > 0;
  const hasShutdownAtomic = detection.atomics.some(a =>
    a.name.includes('shutdown') || a.name.includes('stop') || a.name.includes('done') || a.name.includes('running')
  );

  if (hasMultipleThreads && hasQueue && hasCV) {
    const participants: string[] = [];
    for (const t of detection.threads) participants.push(t.id);
    for (const q of detection.queues) participants.push(q.id);
    for (const cv of detection.conditionVariables) participants.push(cv.id);
    if (hasShutdownAtomic) {
      for (const a of detection.atomics) {
        if (a.name.includes('shutdown') || a.name.includes('stop') || a.name.includes('done') || a.name.includes('running')) {
          participants.push(a.id);
        }
      }
    }

    patterns.push({
      kind: 'thread_pool',
      name: 'ThreadPool',
      description: `Thread pool pattern: ${detection.threads.length} thread(s) consuming from ` +
        `${detection.queues.length} queue(s) with condition variable synchronization.`,
      participants,
      confidence: hasShutdownAtomic ? 0.9 : 0.75,
    });
  }

  return patterns;
}

// ─── Fork-Join ─────────────────────────────────────────────────
// Thread spawns multiple threads then joins all

function detectForkJoin(detection: DetectionResult): ConcurrencyPattern[] {
  const patterns: ConcurrencyPattern[] = [];

  // Group threads by entry function location file
  const threadsByFile = new Map<string, ThreadInfo[]>();
  for (const t of detection.threads) {
    const file = t.spawnLocation.file;
    const existing = threadsByFile.get(file) || [];
    existing.push(t);
    threadsByFile.set(file, existing);
  }

  for (const [_file, threads] of threadsByFile) {
    // Multiple threads spawned that all get joined
    const joinedThreads = threads.filter(t => t.joinLocation && !t.detached);
    if (joinedThreads.length >= 2) {
      // Check if they're all spawned from roughly the same context
      const entryFns = new Set(joinedThreads.map(t => t.entryFunction));
      if (entryFns.size <= joinedThreads.length) {
        patterns.push({
          kind: 'fork_join',
          name: 'ForkJoin',
          description: `Fork-join pattern: ${joinedThreads.length} threads spawned and joined.`,
          participants: joinedThreads.map(t => t.id),
          confidence: 0.8,
        });
      }
    }
  }

  return patterns;
}

// ─── Monitor ───────────────────────────────────────────────────
// Class with mutex + condition_variable + state

function detectMonitor(detection: DetectionResult): ConcurrencyPattern[] {
  const patterns: ConcurrencyPattern[] = [];

  // A monitor has a mutex AND a condition_variable in the same file region
  // and potentially some state (atomics or other fields)
  if (detection.mutexes.length > 0 && detection.conditionVariables.length > 0) {
    // Group by file
    const mutexesByFile = new Map<string, MutexInfo[]>();
    for (const mx of detection.mutexes) {
      const file = mx.declarationLocation.file;
      const existing = mutexesByFile.get(file) || [];
      existing.push(mx);
      mutexesByFile.set(file, existing);
    }

    const cvsByFile = new Map<string, ConditionVariableInfo[]>();
    for (const cv of detection.conditionVariables) {
      const file = cv.declarationLocation.file;
      const existing = cvsByFile.get(file) || [];
      existing.push(cv);
      cvsByFile.set(file, existing);
    }

    for (const [file, fileMutexes] of mutexesByFile) {
      const fileCVs = cvsByFile.get(file) || [];
      if (fileCVs.length > 0) {
        // Check if mutex and CV are close together (likely same class)
        for (const mx of fileMutexes) {
          for (const cv of fileCVs) {
            const lineDiff = Math.abs(mx.declarationLocation.startLine - cv.declarationLocation.startLine);
            if (lineDiff < 30) {
              // Check if already detected as thread_pool
              const isPartOfPool = patterns.some(p =>
                p.kind === 'thread_pool' &&
                (p.participants.includes(mx.id) || p.participants.includes(cv.id))
              );

              if (!isPartOfPool) {
                patterns.push({
                  kind: 'monitor',
                  name: `Monitor(${mx.name}, ${cv.name})`,
                  description: `Monitor pattern: mutex ${mx.name} with condition variable ${cv.name}.`,
                  participants: [mx.id, cv.id],
                  confidence: 0.7,
                });
              }
            }
          }
        }
      }
    }
  }

  return patterns;
}
