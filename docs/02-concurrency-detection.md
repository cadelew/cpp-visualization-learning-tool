# Feature: Concurrency Detection

The concurrency detection system identifies threading primitives, synchronization mechanisms, and higher-level concurrency patterns in C++ source code using regex-based static analysis.

**Source files:**
- `src/analysis/concurrencyDetector.ts` — Per-file primitive detection + cross-file association
- `src/analysis/concurrencyGraphBuilder.ts` — Creates graph nodes/edges from detected primitives
- `src/analysis/patternDetector.ts` — Identifies higher-level patterns (producer-consumer, thread pool, etc.)
- `src/analysis/concurrency.ts` — Entry point that orchestrates everything

---

## Entry Point

```typescript
// src/analysis/concurrency.ts

export async function analyzeConcurrency(
  files: Array<{ path: string; content: string }>,
  _existingGraph?: CodebaseGraph
): Promise<{ analysis: ConcurrencyAnalysis; nodes: GraphNode[]; edges: GraphEdge[] }> {
  // 1. Per-file detection: find all primitives across all files
  const detection = detectConcurrencyMultiFile(files);

  // 2. Pattern detection: identify higher-level patterns
  const patterns = detectPatterns(detection);

  // 3. Build graph nodes/edges for visualization
  const { nodes, edges } = buildConcurrencyGraph(detection);

  return { analysis, nodes, edges };
}
```

---

## 1. Primitive Detection (`concurrencyDetector.ts`)

### Thread Detection

Detects `std::thread`, `std::jthread`, and `pthread_create`.

**What it finds:**

| Pattern | Example | Detection Method |
|---|---|---|
| Thread constructor | `std::thread t(func, args...)` | Regex: `/std::(j?thread)\s+(\w+)\s*\(\s*(?:&?([\w:]+))?/g` |
| Emplace into thread vector | `workers.emplace_back(func)` | Checks if the object is a `std::vector<std::thread>` |
| pthread | `pthread_create(&t, NULL, func, arg)` | Regex: `/pthread_create\s*\(/g` |
| Join | `t.join()` | Regex: `/(\w+)\.(join\|detach)\s*\(/g` |
| Detach | `t.detach()` | Same regex, sets `detached: true` |
| Joinable check + join | `if (t.joinable()) t.join()` | Compound regex pattern |
| request_stop (jthread) | `t.request_stop()` | Regex: `/(\w+)\.request_stop\s*\(/g` |

**Output:**

```typescript
interface ThreadInfo {
  id: string;
  name: string;               // Variable name (e.g., "worker_thread")
  kind: 'thread' | 'jthread';
  entryFunction: string;       // Function passed to thread (e.g., "processTask")
  spawnLocation: SourceLocation;
  joinLocation?: SourceLocation;
  detached: boolean;
}
```

**Key code — thread detection:**

```typescript
// Standard thread constructors
const threadCtorRe = /std::(j?thread)\s+(\w+)\s*\(\s*(?:&?([\w:]+))?/g;

// Thread pool pattern: emplace_back into vector<thread>
const emplaceThreadRe = /(\w+)\.emplace_back\s*\(\s*(?:&?([\w:]+))/g;
// Verifies the object is a thread vector via:
//   1. Cross-file pre-scan for std::vector<std::thread> declarations
//   2. Local context check (last 500 chars before match)
//   3. Full-file regex check
```

### Mutex Detection

Detects all standard mutex types and their lock/unlock operations.

**What it finds:**

| Pattern | Example |
|---|---|
| Mutex declaration | `std::mutex mtx;` |
| Mutable mutex | `mutable std::shared_mutex rw_mtx;` |
| lock_guard | `std::lock_guard<std::mutex> lg(mtx);` |
| unique_lock | `std::unique_lock<std::mutex> ul(mtx);` |
| shared_lock | `std::shared_lock<std::shared_mutex> sl(mtx);` |
| scoped_lock | `std::scoped_lock sl(mtx1, mtx2);` |
| Direct lock | `mtx.lock()` / `mtx.try_lock()` / `mtx.unlock()` |

**Supported mutex kinds:** `mutex`, `recursive_mutex`, `shared_mutex`, `shared_timed_mutex`

**Output:**

```typescript
interface MutexInfo {
  id: string;
  name: string;                          // Variable name
  kind: ConcurrencyPrimitiveKind;        // 'mutex' | 'recursive_mutex' | 'shared_mutex'
  declarationLocation: SourceLocation;
  acquiredBy: string[];                  // Function names that acquire this mutex
  protectedRegions: SourceLocation[];    // Locations of lock statements
}
```

**Key behavior:** For each lock pattern, the detector finds the **enclosing function** and adds it to `acquiredBy`. This is done by scanning backwards from the match to find the nearest function signature:

```typescript
function findEnclosingFunction(content: string, index: number): string {
  const before = content.slice(0, index);
  const funcPattern = /(?:[\w:~]+)\s*\([^)]*\)\s*(?:const\s*)?...?\s*\{/g;
  // Returns the last function name found before the match position
}
```

### Atomic Detection

Detects `std::atomic<T>` declarations and their operations.

**What it finds:**

| Pattern | Example |
|---|---|
| Declaration | `std::atomic<bool> running{true};` |
| Load | `running.load(std::memory_order_acquire)` |
| Store | `running.store(false, std::memory_order_release)` |
| Fetch operations | `counter.fetch_add(1)`, `counter.fetch_sub(1)` |
| Compare-exchange | `flag.compare_exchange_weak(expected, desired)` |
| Exchange | `old = flag.exchange(new_val)` |

**Memory order detection:** Extracts `std::memory_order_*` from inside the call parentheses:
- `relaxed`, `consume`, `acquire`, `release`, `acq_rel`, `seq_cst`

**Output:**

```typescript
interface AtomicInfo {
  id: string;
  name: string;
  type: string;                      // Template parameter (e.g., "bool", "int")
  memoryOrders: MemoryOrder[];       // Memory orders used across all operations
  declarationLocation: SourceLocation;
  readers: string[];                 // Functions that call .load()
  writers: string[];                 // Functions that call .store/.fetch_*/.exchange
}
```

### Condition Variable Detection

Detects `std::condition_variable` and `std::condition_variable_any`.

**What it finds:**

| Pattern | Example |
|---|---|
| Declaration | `std::condition_variable cv;` |
| Wait | `cv.wait(lock)`, `cv.wait_for(lock, timeout)` |
| Notify | `cv.notify_one()`, `cv.notify_all()` |
| Mutex association | Traces the lock variable back to its mutex declaration |

**Mutex association logic:**

```
1. When a .wait() call is found:
2. Extract the first argument (lock variable name)
3. Search for: std::unique_lock<...> lockName(mutexName)
4. If found, associate this CV with that mutex's ID
```

**Output:**

```typescript
interface ConditionVariableInfo {
  id: string;
  name: string;
  associatedMutex?: string;          // Mutex ID (if traced)
  declarationLocation: SourceLocation;
  waiters: string[];                 // Functions that call .wait*()
  notifiers: string[];               // Functions that call .notify_*()
}
```

### Queue Detection

Detects several queue implementations used in concurrent C++ code.

**Supported queue types:**

| Queue Kind | Library | Confidence |
|---|---|---|
| `moodycamel_concurrent` | `moodycamel::ConcurrentQueue<T>` | 0.85 |
| `boost_spsc` | `boost::lockfree::spsc_queue<T>` | 0.85 |
| `boost_lockfree` | `boost::lockfree::queue<T>` | 0.85 |
| `std_queue_mutex` | `std::queue<T>` with a mutex in same scope | 0.65 |
| `custom` | Class with mutex + container + push/pop methods | 0.65 |

**Producer/consumer detection:** After finding queues, the detector searches for push/pop operations:

```typescript
// Producer operations
const pushRe = /queueName\.(push|emplace|enqueue|try_enqueue)\s*\(/g;

// Consumer operations
const popRe = /queueName\.(pop|front|dequeue|try_dequeue)\s*\(/g;
```

**Custom queue heuristic:** A class is detected as a custom queue if it has:
1. A mutex member (`std::mutex`, `std::recursive_mutex`, or `std::shared_mutex`)
2. A container member (`std::vector`, `std::deque`, `std::queue`, or `std::list`)
3. Both push-like and pop-like methods

### Other Primitives (Metadata Only)

The detector also identifies these primitives but stores them as metadata (not visualized as graph nodes):

- `std::future<T>`
- `std::promise<T>`
- `std::async()`
- `std::counting_semaphore` / `std::binary_semaphore`
- `std::latch`
- `std::barrier`

---

## 2. Cross-File Association

After per-file detection, `detectConcurrencyMultiFile()` performs a second pass across all files to find cross-file usage patterns:

```typescript
export function detectConcurrencyMultiFile(files: FileInput[]): DetectionResult {
  // Pre-scan: collect thread vector names across all files
  const threadVectorNames = new Set<string>();
  // ...scan for std::vector<std::thread> declarations...

  // First pass: per-file detection
  for (const file of files) {
    const result = detectConcurrency(file, threadVectorNames);
    combined.threads.push(...result.threads);
    // ... merge all primitives ...
  }

  // Second pass: cross-file association
  crossFileAssociateMutexes(combined.mutexes, files);    // Find lock() calls in other files
  crossFileAssociateAtomics(combined.atomics, files);     // Find load/store in other files
  crossFileAssociateCVs(combined.conditionVariables, combined.mutexes, files);
  crossFileAssociateQueues(combined.queues, files);       // Find push/pop in other files

  return combined;
}
```

This means a mutex declared in `thread_pool.h` with `lock()` called in `worker.cpp` will correctly show the worker function in `acquiredBy`.

---

## 3. Pattern Detection (`patternDetector.ts`)

After detecting primitives, the pattern detector identifies five higher-level concurrency patterns:

### Producer-Consumer

**Detection criteria:**
1. **Queue-based:** Any queue with at least one producer function AND at least one consumer function (where producers and consumers are different functions)
2. **CV-based (fallback):** A condition variable with both waiters and notifiers that aren't already covered by a queue-based detection

```typescript
// Queue-based: distinct producer and consumer functions
if (distinctProducers.length > 0 && distinctConsumers.length > 0) {
  patterns.push({
    kind: 'producer_consumer',
    name: `ProducerConsumer(${queue.name})`,
    confidence: queue.kind === 'std_queue_mutex' ? 0.8 : 0.85,
  });
}
```

### Reader-Writer

**Detection criteria:** Any `shared_mutex` is reported as a reader-writer pattern.

```typescript
if (mutex.kind === 'shared_mutex') {
  patterns.push({
    kind: 'reader_writer',
    name: `ReaderWriter(${mutex.name})`,
    confidence: 0.9,
  });
}
```

### Thread Pool

**Detection criteria (heuristic):**
1. Multiple threads (>= 2) OR an `<emplace>` thread (indicating vector of threads)
2. At least one queue
3. At least one condition variable
4. Confidence boost if there's a shutdown/stop/done/running atomic

```typescript
if (hasMultipleThreads && hasQueue && hasCV) {
  patterns.push({
    kind: 'thread_pool',
    confidence: hasShutdownAtomic ? 0.9 : 0.75,
  });
}
```

### Fork-Join

**Detection criteria:**
1. Multiple threads spawned in the same file
2. All threads have join locations (not detached)
3. At least 2 joined threads in the group

### Monitor

**Detection criteria:**
1. A mutex and condition variable declared in the same file
2. Within 30 lines of each other (heuristic for "same class")
3. Not already part of a detected thread pool pattern

---

## 4. Concurrency Graph Builder (`concurrencyGraphBuilder.ts`)

Converts detected primitives into `GraphNode[]` and `GraphEdge[]` for visualization.

### Node Types Created

| Primitive | Node Kind | Label | Qualified Name |
|---|---|---|---|
| Thread | `thread` | Variable name | `thread::workerThread` |
| Mutex | `mutex` | Variable name | `mutex::mtx` |
| Atomic | `atomic` | Variable name | `atomic<bool>::running` |
| Condition Variable | `condition_variable` | Variable name | `condition_variable::cv` |
| Queue | `queue` | Variable name | `queue::taskQueue` |

### Edge Types Created

| Relationship | Edge Kind | Source | Target |
|---|---|---|---|
| Thread spawn | `spawns` | `fn::entryFunction` | thread node |
| Thread join | `joins` | thread node | `fn::entryFunction` |
| Mutex acquire | `locks` | `fn::functionName` | mutex node |
| Atomic read | `reads_atomic` | `fn::functionName` | atomic node |
| Atomic write | `writes_atomic` | `fn::functionName` | atomic node |
| CV wait | `waits_on` | `fn::functionName` | CV node |
| CV notify | `notifies` | `fn::functionName` | CV node |
| Queue produce | `produces_to` | `fn::functionName` | queue node |
| Queue consume | `consumes_from` | `fn::functionName` | queue node |

All concurrency edges are rendered with animation in the UI to visually distinguish them from structural edges.
