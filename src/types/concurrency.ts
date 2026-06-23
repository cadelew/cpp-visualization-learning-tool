/**
 * Types specific to concurrency pattern detection.
 */

export type ConcurrencyPrimitiveKind =
  | 'thread'
  | 'jthread'
  | 'mutex'
  | 'recursive_mutex'
  | 'shared_mutex'
  | 'lock_guard'
  | 'unique_lock'
  | 'shared_lock'
  | 'scoped_lock'
  | 'condition_variable'
  | 'condition_variable_any'
  | 'atomic'
  | 'semaphore'
  | 'latch'
  | 'barrier'
  | 'future'
  | 'promise'
  | 'async';

export type QueueKind =
  | 'std_queue_mutex'        // std::queue + mutex pattern
  | 'moodycamel_concurrent'  // moodycamel::ConcurrentQueue
  | 'boost_spsc'             // boost::lockfree::spsc_queue
  | 'boost_lockfree'         // boost::lockfree::queue
  | 'custom'                 // user-defined queue
  | 'unknown';

export type MemoryOrder =
  | 'relaxed'
  | 'consume'
  | 'acquire'
  | 'release'
  | 'acq_rel'
  | 'seq_cst';

export interface ThreadInfo {
  id: string;
  name: string;
  kind: 'thread' | 'jthread';
  /** Function used as thread entry point */
  entryFunction: string;
  /** Where the thread is spawned */
  spawnLocation: import('./graph').SourceLocation;
  /** Where join/detach happens (if found) */
  joinLocation?: import('./graph').SourceLocation;
  /** Whether the thread is detached */
  detached: boolean;
}

export interface MutexInfo {
  id: string;
  name: string;
  kind: ConcurrencyPrimitiveKind;
  /** Where the mutex is declared */
  declarationLocation: import('./graph').SourceLocation;
  /** Functions that acquire this mutex */
  acquiredBy: string[];
  /** Protected regions (approximate) */
  protectedRegions: import('./graph').SourceLocation[];
}

export interface AtomicInfo {
  id: string;
  name: string;
  type: string;
  /** Memory orders used on this atomic */
  memoryOrders: MemoryOrder[];
  /** Where declared */
  declarationLocation: import('./graph').SourceLocation;
  /** Functions that read this atomic */
  readers: string[];
  /** Functions that write this atomic */
  writers: string[];
}

export interface ConditionVariableInfo {
  id: string;
  name: string;
  /** Associated mutex (if detected) */
  associatedMutex?: string;
  /** Where declared */
  declarationLocation: import('./graph').SourceLocation;
  /** Functions that wait on this CV */
  waiters: string[];
  /** Functions that notify via this CV */
  notifiers: string[];
}

export interface QueueInfo {
  id: string;
  name: string;
  kind: QueueKind;
  elementType?: string;
  /** Where declared */
  declarationLocation: import('./graph').SourceLocation;
  /** Functions that produce to this queue */
  producers: string[];
  /** Functions that consume from this queue */
  consumers: string[];
  /** Detection confidence */
  confidence: number;
}

export interface ConcurrencyAnalysis {
  threads: ThreadInfo[];
  mutexes: MutexInfo[];
  atomics: AtomicInfo[];
  conditionVariables: ConditionVariableInfo[];
  queues: QueueInfo[];
  /** Detected patterns (e.g., producer-consumer, reader-writer) */
  patterns: ConcurrencyPattern[];
}

export interface ConcurrencyPattern {
  kind: 'producer_consumer' | 'reader_writer' | 'thread_pool' | 'pipeline' | 'fork_join' | 'monitor';
  name: string;
  description: string;
  /** Node IDs involved */
  participants: string[];
  confidence: number;
}
