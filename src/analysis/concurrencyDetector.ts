import {
  ThreadInfo,
  MutexInfo,
  AtomicInfo,
  ConditionVariableInfo,
  QueueInfo,
  MemoryOrder,
  ConcurrencyPrimitiveKind,
  QueueKind,
} from '../types/concurrency';
import { SourceLocation } from '../types/graph';

interface FileInput {
  path: string;
  content: string;
}

interface DetectionResult {
  threads: ThreadInfo[];
  mutexes: MutexInfo[];
  atomics: AtomicInfo[];
  conditionVariables: ConditionVariableInfo[];
  queues: QueueInfo[];
}

let nextId = 0;
function genId(prefix: string): string {
  return `${prefix}_${nextId++}`;
}

export function resetIdCounter(): void {
  nextId = 0;
}

function lineOf(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

function colOf(content: string, index: number): number {
  let col = 0;
  for (let i = index - 1; i >= 0 && content[i] !== '\n'; i--) {
    col++;
  }
  return col;
}

function makeLoc(file: string, content: string, index: number, length: number): SourceLocation {
  const startLine = lineOf(content, index);
  const startCol = colOf(content, index);
  const endIndex = index + length;
  const endLine = lineOf(content, endIndex);
  const endCol = colOf(content, endIndex);
  return { file, startLine, startCol, endLine, endCol };
}

function findEnclosingFunction(content: string, index: number): string {
  const before = content.slice(0, index);
  const funcPattern = /(?:[\w:~]+)\s*\([^)]*\)\s*(?:const\s*)?(?:override\s*)?(?:noexcept\s*)?(?:->[\s\w:&*<>]+)?\s*\{/g;
  let lastMatch: string | null = null;
  let lastIndex = -1;
  let match: RegExpExecArray | null;
  while ((match = funcPattern.exec(before)) !== null) {
    lastMatch = match[0];
    lastIndex = match.index;
  }
  if (lastMatch === null) return '<global>';

  const namePattern = /([\w:~]+)\s*\(/;
  const nameMatch = namePattern.exec(lastMatch);
  if (nameMatch) return nameMatch[1];
  return '<unknown>';
}

function findEnclosingClass(content: string, index: number): string | null {
  const before = content.slice(0, index);
  const classPattern = /(?:class|struct)\s+([\w]+)/g;
  let lastClass: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = classPattern.exec(before)) !== null) {
    lastClass = match[1];
  }
  return lastClass;
}

// ─── Thread Detection ──────────────────────────────────────────

function detectThreads(file: FileInput, threadVectorNames?: Set<string>): ThreadInfo[] {
  const threads: ThreadInfo[] = [];
  const content = file.content;

  // std::thread and std::jthread constructor calls
  const threadCtorRe = /std::(j?thread)\s+(\w+)\s*\(\s*(?:&?([\w:]+))?/g;
  let m: RegExpExecArray | null;
  while ((m = threadCtorRe.exec(content)) !== null) {
    const kind = m[1] === 'jthread' ? 'jthread' : 'thread';
    const varName = m[2];
    const entryFn = m[3] || '<lambda>';
    threads.push({
      id: genId('thread'),
      name: varName,
      kind: kind as 'thread' | 'jthread',
      entryFunction: entryFn,
      spawnLocation: makeLoc(file.path, content, m.index, m[0].length),
      detached: false,
    });
  }

  // emplace_back with thread constructor (common thread pool pattern)
  const emplaceThreadRe = /(\w+)\.emplace_back\s*\(\s*(?:&?([\w:]+))/g;
  while ((m = emplaceThreadRe.exec(content)) !== null) {
    const objName = m[1];
    const entryFn = m[2] || '<lambda>';
    // Check if the object is a known thread vector from cross-file scan
    const isKnownThreadVec = threadVectorNames && threadVectorNames.has(objName);
    // Also check local context
    const before = content.slice(Math.max(0, m.index - 500), m.index);
    const localThreadVec = /std::vector\s*<\s*std::(j?thread)\s*>/.test(before) ||
                           /std::(j?thread)/.test(before);
    // Also check full file for the vector declaration
    const fullFileThreadVec = new RegExp(`std::vector\\s*<\\s*std::(j?thread)\\s*>\\s+${objName}`).test(content);

    if (isKnownThreadVec || localThreadVec || fullFileThreadVec) {
      let kind: 'thread' | 'jthread' = 'thread';
      const kindMatch = content.match(/std::(j?thread)/);
      if (kindMatch && kindMatch[1] === 'jthread') kind = 'jthread';
      threads.push({
        id: genId('thread'),
        name: '<emplace>',
        kind,
        entryFunction: entryFn,
        spawnLocation: makeLoc(file.path, content, m.index, m[0].length),
        detached: false,
      });
    }
  }

  // pthread_create
  const pthreadRe = /pthread_create\s*\(\s*&?(\w+)\s*,\s*\w+\s*,\s*(\w+)/g;
  while ((m = pthreadRe.exec(content)) !== null) {
    threads.push({
      id: genId('thread'),
      name: m[1],
      kind: 'thread',
      entryFunction: m[2],
      spawnLocation: makeLoc(file.path, content, m.index, m[0].length),
      detached: false,
    });
  }

  // Detect join/detach on thread objects
  const joinRe = /(\w+)\.(join|detach)\s*\(/g;
  while ((m = joinRe.exec(content)) !== null) {
    const varName = m[1];
    const action = m[2];
    const loc = makeLoc(file.path, content, m.index, m[0].length);
    for (const t of threads) {
      if (t.name === varName || (t.name === '<emplace>' && varName === 'worker')) {
        t.joinLocation = loc;
        if (action === 'detach') t.detached = true;
      }
    }
  }

  // joinable check followed by join (common pattern)
  const joinableRe = /(\w+)\.joinable\s*\(\s*\)\s*\)\s*\{[^}]*(\w+)\.join\s*\(/g;
  while ((m = joinableRe.exec(content)) !== null) {
    const varName = m[2];
    const loc = makeLoc(file.path, content, m.index, m[0].length);
    for (const t of threads) {
      if (t.name === varName || t.name === '<emplace>') {
        t.joinLocation = loc;
      }
    }
  }

  // request_stop on jthread
  const requestStopRe = /(\w+)\.request_stop\s*\(/g;
  while ((m = requestStopRe.exec(content)) !== null) {
    // Just note it exists; associate with matching jthread if found
    const varName = m[1];
    for (const t of threads) {
      if (t.name === varName && t.kind === 'jthread') {
        if (!t.joinLocation) {
          t.joinLocation = makeLoc(file.path, content, m.index, m[0].length);
        }
      }
    }
  }

  return threads;
}

// ─── Mutex Detection ───────────────────────────────────────────

function detectMutexes(file: FileInput): MutexInfo[] {
  const mutexes: MutexInfo[] = [];
  const content = file.content;
  let m: RegExpExecArray | null;

  // Mutex declarations
  const mutexDeclRe = /std::(mutex|recursive_mutex|shared_mutex|shared_timed_mutex)\s+(\w+)/g;
  while ((m = mutexDeclRe.exec(content)) !== null) {
    const kindMap: Record<string, ConcurrencyPrimitiveKind> = {
      mutex: 'mutex',
      recursive_mutex: 'recursive_mutex',
      shared_mutex: 'shared_mutex',
      shared_timed_mutex: 'shared_mutex',
    };
    mutexes.push({
      id: genId('mutex'),
      name: m[2],
      kind: kindMap[m[1]],
      declarationLocation: makeLoc(file.path, content, m.index, m[0].length),
      acquiredBy: [],
      protectedRegions: [],
    });
  }

  // Also detect mutable mutex members
  const mutableMutexRe = /mutable\s+std::(mutex|recursive_mutex|shared_mutex|shared_timed_mutex)\s+(\w+)/g;
  while ((m = mutableMutexRe.exec(content)) !== null) {
    // Check if we already found this one
    const name = m[2];
    if (!mutexes.some(mx => mx.name === name)) {
      const kindMap: Record<string, ConcurrencyPrimitiveKind> = {
        mutex: 'mutex',
        recursive_mutex: 'recursive_mutex',
        shared_mutex: 'shared_mutex',
        shared_timed_mutex: 'shared_mutex',
      };
      mutexes.push({
        id: genId('mutex'),
        name,
        kind: kindMap[m[1]],
        declarationLocation: makeLoc(file.path, content, m.index, m[0].length),
        acquiredBy: [],
        protectedRegions: [],
      });
    }
  }

  // lock_guard, unique_lock, shared_lock, scoped_lock usage
  const lockRe = /std::(lock_guard|unique_lock|shared_lock|scoped_lock)\s*<[^>]*>\s+(\w+)\s*\(\s*(\w+)/g;
  while ((m = lockRe.exec(content)) !== null) {
    const mutexName = m[3];
    const fn = findEnclosingFunction(content, m.index);
    for (const mx of mutexes) {
      if (mx.name === mutexName) {
        if (!mx.acquiredBy.includes(fn)) mx.acquiredBy.push(fn);
        mx.protectedRegions.push(makeLoc(file.path, content, m.index, m[0].length));
      }
    }
  }

  // Direct .lock()/.unlock() calls
  const directLockRe = /(\w+)\.(lock|unlock|try_lock)\s*\(/g;
  while ((m = directLockRe.exec(content)) !== null) {
    const mutexName = m[1];
    const fn = findEnclosingFunction(content, m.index);
    for (const mx of mutexes) {
      if (mx.name === mutexName) {
        if (m[2] === 'lock' || m[2] === 'try_lock') {
          if (!mx.acquiredBy.includes(fn)) mx.acquiredBy.push(fn);
        }
        mx.protectedRegions.push(makeLoc(file.path, content, m.index, m[0].length));
      }
    }
  }

  return mutexes;
}

// ─── Atomic Detection ──────────────────────────────────────────

function detectAtomics(file: FileInput): AtomicInfo[] {
  const atomics: AtomicInfo[] = [];
  const content = file.content;
  let m: RegExpExecArray | null;

  // std::atomic<T> declarations
  const atomicDeclRe = /std::atomic\s*<\s*([^>]+)\s*>\s+(\w+)/g;
  while ((m = atomicDeclRe.exec(content)) !== null) {
    atomics.push({
      id: genId('atomic'),
      name: m[2],
      type: m[1].trim(),
      memoryOrders: [],
      declarationLocation: makeLoc(file.path, content, m.index, m[0].length),
      readers: [],
      writers: [],
    });
  }

  // Atomic operations: load, store, fetch_add, fetch_sub, compare_exchange_weak/strong
  const atomicOpRe = /(\w+)\.(load|store|fetch_add|fetch_sub|compare_exchange_weak|compare_exchange_strong|exchange)\s*\(/g;
  while ((m = atomicOpRe.exec(content)) !== null) {
    const varName = m[1];
    const op = m[2];
    const fn = findEnclosingFunction(content, m.index);
    for (const a of atomics) {
      if (a.name === varName) {
        if (op === 'load') {
          if (!a.readers.includes(fn)) a.readers.push(fn);
        } else {
          if (!a.writers.includes(fn)) a.writers.push(fn);
        }
      }
    }

    // Extract memory order from the call
    const callEnd = findMatchingParen(content, m.index + m[0].length - 1);
    if (callEnd > 0) {
      const callBody = content.slice(m.index, callEnd + 1);
      const moRe = /std::memory_order_(relaxed|consume|acquire|release|acq_rel|seq_cst)/g;
      let moMatch: RegExpExecArray | null;
      while ((moMatch = moRe.exec(callBody)) !== null) {
        const mo = moMatch[1] as MemoryOrder;
        for (const a of atomics) {
          if (a.name === varName && !a.memoryOrders.includes(mo)) {
            a.memoryOrders.push(mo);
          }
        }
      }
    }
  }

  return atomics;
}

function findMatchingParen(content: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < content.length; i++) {
    if (content[i] === '(') depth++;
    else if (content[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// ─── Condition Variable Detection ──────────────────────────────

function detectConditionVariables(file: FileInput, mutexes: MutexInfo[]): ConditionVariableInfo[] {
  const cvs: ConditionVariableInfo[] = [];
  const content = file.content;
  let m: RegExpExecArray | null;

  // std::condition_variable / std::condition_variable_any declarations
  const cvDeclRe = /std::(condition_variable(?:_any)?)\s+(\w+)/g;
  while ((m = cvDeclRe.exec(content)) !== null) {
    cvs.push({
      id: genId('cv'),
      name: m[2],
      declarationLocation: makeLoc(file.path, content, m.index, m[0].length),
      waiters: [],
      notifiers: [],
    });
  }

  // wait, wait_for, wait_until calls
  const waitRe = /(\w+)\.(wait|wait_for|wait_until)\s*\(/g;
  while ((m = waitRe.exec(content)) !== null) {
    const cvName = m[1];
    const fn = findEnclosingFunction(content, m.index);
    for (const cv of cvs) {
      if (cv.name === cvName) {
        if (!cv.waiters.includes(fn)) cv.waiters.push(fn);

        // Try to associate mutex: look for unique_lock/lock_guard in the wait call args
        const callEnd = findMatchingParen(content, m.index + m[0].length - 1);
        if (callEnd > 0) {
          const callBody = content.slice(m.index, callEnd + 1);
          const lockVarRe = /(\w+)/;
          const lockMatch = lockVarRe.exec(callBody.slice(m[0].length));
          if (lockMatch) {
            // Look back to find what mutex this lock guards
            const lockName = lockMatch[1];
            const lockDeclRe = new RegExp(`std::(?:unique_lock|lock_guard)\\s*<[^>]*>\\s+${lockName}\\s*\\(\\s*(\\w+)`);
            const lockDeclMatch = lockDeclRe.exec(content);
            if (lockDeclMatch) {
              const mutexName = lockDeclMatch[1];
              for (const mx of mutexes) {
                if (mx.name === mutexName) {
                  cv.associatedMutex = mx.id;
                }
              }
            }
          }
        }
      }
    }
  }

  // notify_one, notify_all calls
  const notifyRe = /(\w+)\.(notify_one|notify_all)\s*\(/g;
  while ((m = notifyRe.exec(content)) !== null) {
    const cvName = m[1];
    const fn = findEnclosingFunction(content, m.index);
    for (const cv of cvs) {
      if (cv.name === cvName) {
        if (!cv.notifiers.includes(fn)) cv.notifiers.push(fn);
      }
    }
  }

  return cvs;
}

// ─── Queue Detection ───────────────────────────────────────────

function detectQueues(file: FileInput, mutexes: MutexInfo[], cvs: ConditionVariableInfo[]): QueueInfo[] {
  const queues: QueueInfo[] = [];
  const content = file.content;
  let m: RegExpExecArray | null;

  // moodycamel::ConcurrentQueue
  const moodycamelRe = /moodycamel::ConcurrentQueue\s*<\s*([^>]+)\s*>\s+(\w+)/g;
  while ((m = moodycamelRe.exec(content)) !== null) {
    queues.push({
      id: genId('queue'),
      name: m[2],
      kind: 'moodycamel_concurrent',
      elementType: m[1].trim(),
      declarationLocation: makeLoc(file.path, content, m.index, m[0].length),
      producers: [],
      consumers: [],
      confidence: 0.85,
    });
  }

  // boost::lockfree::spsc_queue
  const boostSpscRe = /boost::lockfree::spsc_queue\s*<\s*([^>]+)\s*>\s+(\w+)/g;
  while ((m = boostSpscRe.exec(content)) !== null) {
    queues.push({
      id: genId('queue'),
      name: m[2],
      kind: 'boost_spsc',
      elementType: m[1].trim(),
      declarationLocation: makeLoc(file.path, content, m.index, m[0].length),
      producers: [],
      consumers: [],
      confidence: 0.85,
    });
  }

  // boost::lockfree::queue
  const boostLfRe = /boost::lockfree::queue\s*<\s*([^>]+)\s*>\s+(\w+)/g;
  while ((m = boostLfRe.exec(content)) !== null) {
    queues.push({
      id: genId('queue'),
      name: m[2],
      kind: 'boost_lockfree',
      elementType: m[1].trim(),
      declarationLocation: makeLoc(file.path, content, m.index, m[0].length),
      producers: [],
      consumers: [],
      confidence: 0.85,
    });
  }

  // std::queue with mutex pattern (heuristic)
  // Use greedy .+ to handle nested templates like std::queue<std::function<void()>>
  const stdQueueRe = /std::queue\s*<(.+)>\s+(\w+)/g;
  while ((m = stdQueueRe.exec(content)) !== null) {
    const queueName = m[2];
    const elementType = m[1].trim();
    const enclosingClass = findEnclosingClass(content, m.index);

    // Check if there's a mutex in the same scope (likely same class)
    const hasMutex = mutexes.some(mx => {
      if (enclosingClass) {
        const mxClass = findEnclosingClass(content, content.indexOf(mx.name));
        return mxClass === enclosingClass;
      }
      return true;
    });

    if (hasMutex) {
      queues.push({
        id: genId('queue'),
        name: queueName,
        kind: 'std_queue_mutex',
        elementType,
        declarationLocation: makeLoc(file.path, content, m.index, m[0].length),
        producers: [],
        consumers: [],
        confidence: 0.65,
      });
    }
  }

  // Detect push/pop operations on queues
  for (const q of queues) {
    const pushRe = new RegExp(`${q.name}\\.(push|emplace|enqueue|try_enqueue)\\s*\\(`, 'g');
    while ((m = pushRe.exec(content)) !== null) {
      const fn = findEnclosingFunction(content, m.index);
      if (!q.producers.includes(fn)) q.producers.push(fn);
    }

    const popRe = new RegExp(`${q.name}\\.(pop|front|dequeue|try_dequeue)\\s*\\(`, 'g');
    while ((m = popRe.exec(content)) !== null) {
      const fn = findEnclosingFunction(content, m.index);
      if (!q.consumers.includes(fn)) q.consumers.push(fn);
    }
  }

  // Custom queue heuristic: class with mutex + container + push/pop
  const classRe = /(?:class|struct)\s+(\w+)\s*(?::\s*[^{]*)?\{([^]*?)(?=\n(?:class|struct)\s|\n\}\s*;\s*$)/g;
  while ((m = classRe.exec(content)) !== null) {
    const className = m[1];
    const body = m[2];
    const hasMutexMember = /std::(mutex|recursive_mutex|shared_mutex)/.test(body);
    const hasContainer = /std::(vector|deque|queue|list)\s*</.test(body);
    const hasPushPop = /(push|enqueue|produce|add|put)\s*\(/.test(body) &&
                       /(pop|dequeue|consume|get|take)\s*\(/.test(body);

    if (hasMutexMember && hasContainer && hasPushPop) {
      // Make sure we haven't already detected this as a known queue
      if (!queues.some(q => findEnclosingClass(content, content.indexOf(q.name)) === className)) {
        queues.push({
          id: genId('queue'),
          name: className,
          kind: 'custom',
          declarationLocation: makeLoc(file.path, content, m.index, m[0].length),
          producers: [],
          consumers: [],
          confidence: 0.65,
        });
      }
    }
  }

  return queues;
}

// ─── Other Primitives Detection ────────────────────────────────

interface OtherPrimitives {
  futures: Array<{ name: string; location: SourceLocation }>;
  promises: Array<{ name: string; location: SourceLocation }>;
  asyncCalls: Array<{ name: string; location: SourceLocation }>;
  semaphores: Array<{ name: string; location: SourceLocation }>;
  latches: Array<{ name: string; location: SourceLocation }>;
  barriers: Array<{ name: string; location: SourceLocation }>;
}

function detectOtherPrimitives(file: FileInput): OtherPrimitives {
  const content = file.content;
  const result: OtherPrimitives = {
    futures: [],
    promises: [],
    asyncCalls: [],
    semaphores: [],
    latches: [],
    barriers: [],
  };
  let m: RegExpExecArray | null;

  // std::future
  const futureRe = /std::future\s*<\s*[^>]+\s*>\s+(\w+)/g;
  while ((m = futureRe.exec(content)) !== null) {
    result.futures.push({ name: m[1], location: makeLoc(file.path, content, m.index, m[0].length) });
  }

  // std::promise
  const promiseRe = /std::promise\s*<\s*[^>]+\s*>\s+(\w+)/g;
  while ((m = promiseRe.exec(content)) !== null) {
    result.promises.push({ name: m[1], location: makeLoc(file.path, content, m.index, m[0].length) });
  }

  // std::async
  const asyncRe = /std::async\s*\(\s*(?:std::launch::\w+\s*,\s*)?([\w:]+)/g;
  while ((m = asyncRe.exec(content)) !== null) {
    result.asyncCalls.push({ name: m[1], location: makeLoc(file.path, content, m.index, m[0].length) });
  }

  // std::counting_semaphore / std::binary_semaphore
  const semRe = /std::(counting_semaphore\s*<\s*\d+\s*>|binary_semaphore)\s+(\w+)/g;
  while ((m = semRe.exec(content)) !== null) {
    result.semaphores.push({ name: m[2], location: makeLoc(file.path, content, m.index, m[0].length) });
  }

  // std::latch
  const latchRe = /std::latch\s+(\w+)/g;
  while ((m = latchRe.exec(content)) !== null) {
    result.latches.push({ name: m[1], location: makeLoc(file.path, content, m.index, m[0].length) });
  }

  // std::barrier
  const barrierRe = /std::barrier\s*(?:<[^>]*>)?\s+(\w+)/g;
  while ((m = barrierRe.exec(content)) !== null) {
    result.barriers.push({ name: m[1], location: makeLoc(file.path, content, m.index, m[0].length) });
  }

  return result;
}

// ─── Main Detection Entry ──────────────────────────────────────

export function detectConcurrency(file: FileInput, threadVectorNames?: Set<string>): DetectionResult {
  const threads = detectThreads(file, threadVectorNames);
  const mutexes = detectMutexes(file);
  const atomics = detectAtomics(file);
  const conditionVariables = detectConditionVariables(file, mutexes);
  const queues = detectQueues(file, mutexes, conditionVariables);

  // We also detect other primitives but store them in metadata for now
  detectOtherPrimitives(file);

  return { threads, mutexes, atomics, conditionVariables, queues };
}

function crossFileAssociateAtomics(atomics: AtomicInfo[], files: FileInput[]): void {
  for (const file of files) {
    const content = file.content;
    const atomicOpRe = /(\w+)\.(load|store|fetch_add|fetch_sub|compare_exchange_weak|compare_exchange_strong|exchange)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = atomicOpRe.exec(content)) !== null) {
      const varName = m[1];
      const op = m[2];
      const fn = findEnclosingFunction(content, m.index);
      for (const a of atomics) {
        if (a.name === varName) {
          if (op === 'load') {
            if (!a.readers.includes(fn)) a.readers.push(fn);
          } else {
            if (!a.writers.includes(fn)) a.writers.push(fn);
          }

          const callEnd = findMatchingParen(content, m.index + m[0].length - 1);
          if (callEnd > 0) {
            const callBody = content.slice(m.index, callEnd + 1);
            const moRe = /std::memory_order_(relaxed|consume|acquire|release|acq_rel|seq_cst)/g;
            let moMatch: RegExpExecArray | null;
            while ((moMatch = moRe.exec(callBody)) !== null) {
              const mo = moMatch[1] as MemoryOrder;
              if (!a.memoryOrders.includes(mo)) {
                a.memoryOrders.push(mo);
              }
            }
          }
        }
      }
    }
  }
}

function crossFileAssociateCVs(cvs: ConditionVariableInfo[], mutexes: MutexInfo[], files: FileInput[]): void {
  for (const file of files) {
    const content = file.content;

    const waitRe = /(\w+)\.(wait|wait_for|wait_until)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = waitRe.exec(content)) !== null) {
      const cvName = m[1];
      const fn = findEnclosingFunction(content, m.index);
      for (const cv of cvs) {
        if (cv.name === cvName) {
          if (!cv.waiters.includes(fn)) cv.waiters.push(fn);

          if (!cv.associatedMutex) {
            const callEnd = findMatchingParen(content, m.index + m[0].length - 1);
            if (callEnd > 0) {
              const callBody = content.slice(m.index, callEnd + 1);
              const lockVarRe = /(\w+)/;
              const lockMatch = lockVarRe.exec(callBody.slice(m[0].length));
              if (lockMatch) {
                const lockName = lockMatch[1];
                const lockDeclRe = new RegExp(`std::(?:unique_lock|lock_guard)\\s*<[^>]*>\\s+${lockName}\\s*\\(\\s*(\\w+)`);
                const lockDeclMatch = lockDeclRe.exec(content);
                if (lockDeclMatch) {
                  const mutexName = lockDeclMatch[1];
                  for (const mx of mutexes) {
                    if (mx.name === mutexName) {
                      cv.associatedMutex = mx.id;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    const notifyRe = /(\w+)\.(notify_one|notify_all)\s*\(/g;
    while ((m = notifyRe.exec(content)) !== null) {
      const cvName = m[1];
      const fn = findEnclosingFunction(content, m.index);
      for (const cv of cvs) {
        if (cv.name === cvName) {
          if (!cv.notifiers.includes(fn)) cv.notifiers.push(fn);
        }
      }
    }
  }
}

function crossFileAssociateMutexes(mutexes: MutexInfo[], files: FileInput[]): void {
  for (const file of files) {
    const content = file.content;

    const lockRe = /std::(lock_guard|unique_lock|shared_lock|scoped_lock)\s*<[^>]*>\s+(\w+)\s*\(\s*(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = lockRe.exec(content)) !== null) {
      const mutexName = m[3];
      const fn = findEnclosingFunction(content, m.index);
      for (const mx of mutexes) {
        if (mx.name === mutexName) {
          if (!mx.acquiredBy.includes(fn)) mx.acquiredBy.push(fn);
        }
      }
    }

    const directLockRe = /(\w+)\.(lock|unlock|try_lock)\s*\(/g;
    while ((m = directLockRe.exec(content)) !== null) {
      const mutexName = m[1];
      const fn = findEnclosingFunction(content, m.index);
      for (const mx of mutexes) {
        if (mx.name === mutexName) {
          if (m[2] === 'lock' || m[2] === 'try_lock') {
            if (!mx.acquiredBy.includes(fn)) mx.acquiredBy.push(fn);
          }
        }
      }
    }
  }
}

function crossFileAssociateQueues(queues: QueueInfo[], files: FileInput[]): void {
  for (const file of files) {
    const content = file.content;
    for (const q of queues) {
      const pushRe = new RegExp(`${q.name}\\.(push|emplace|enqueue|try_enqueue)\\s*\\(`, 'g');
      let m: RegExpExecArray | null;
      while ((m = pushRe.exec(content)) !== null) {
        const fn = findEnclosingFunction(content, m.index);
        if (!q.producers.includes(fn)) q.producers.push(fn);
      }

      const popRe = new RegExp(`${q.name}\\.(pop|front|dequeue|try_dequeue)\\s*\\(`, 'g');
      while ((m = popRe.exec(content)) !== null) {
        const fn = findEnclosingFunction(content, m.index);
        if (!q.consumers.includes(fn)) q.consumers.push(fn);
      }
    }
  }
}

export function detectConcurrencyMultiFile(files: FileInput[]): DetectionResult {
  // Pre-scan: collect thread vector variable names across all files
  const threadVectorNames = new Set<string>();
  for (const file of files) {
    const vecRe = /std::vector\s*<\s*std::(?:j?thread)\s*>\s+(\w+)/g;
    let vm: RegExpExecArray | null;
    while ((vm = vecRe.exec(file.content)) !== null) {
      threadVectorNames.add(vm[1]);
    }
  }

  // First pass: per-file detection
  const combined: DetectionResult = {
    threads: [],
    mutexes: [],
    atomics: [],
    conditionVariables: [],
    queues: [],
  };

  for (const file of files) {
    const result = detectConcurrency(file, threadVectorNames);
    combined.threads.push(...result.threads);
    combined.mutexes.push(...result.mutexes);
    combined.atomics.push(...result.atomics);
    combined.conditionVariables.push(...result.conditionVariables);
    combined.queues.push(...result.queues);
  }

  // Second pass: cross-file association for usage patterns
  crossFileAssociateMutexes(combined.mutexes, files);
  crossFileAssociateAtomics(combined.atomics, files);
  crossFileAssociateCVs(combined.conditionVariables, combined.mutexes, files);
  crossFileAssociateQueues(combined.queues, files);

  return combined;
}
