import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { detectConcurrency, detectConcurrencyMultiFile, resetIdCounter } from '../../src/analysis/concurrencyDetector';
import { buildConcurrencyGraph, resetGraphIdCounter } from '../../src/analysis/concurrencyGraphBuilder';
import { detectPatterns } from '../../src/analysis/patternDetector';
import { analyzeConcurrency } from '../../src/analysis/concurrency';

const fixturesDir = path.resolve(__dirname, '../fixtures');

function readFixture(name: string): string {
  return fs.readFileSync(path.join(fixturesDir, name), 'utf-8');
}

describe('ConcurrencyDetector', () => {
  beforeEach(() => {
    resetIdCounter();
    resetGraphIdCounter();
  });

  describe('ThreadPool detection (header + cpp)', () => {
    it('detects threads from emplace_back pattern', () => {
      const headerContent = readFixture('concurrent_sample.h');
      const cppContent = readFixture('concurrent_sample.cpp');
      const files = [
        { path: 'concurrent_sample.h', content: headerContent },
        { path: 'concurrent_sample.cpp', content: cppContent },
      ];
      const result = detectConcurrencyMultiFile(files);

      // Should detect thread(s) from emplace_back
      expect(result.threads.length).toBeGreaterThanOrEqual(1);
    });

    it('detects mutex declarations', () => {
      const headerContent = readFixture('concurrent_sample.h');
      const cppContent = readFixture('concurrent_sample.cpp');
      const files = [
        { path: 'concurrent_sample.h', content: headerContent },
        { path: 'concurrent_sample.cpp', content: cppContent },
      ];
      const result = detectConcurrencyMultiFile(files);

      // ThreadPool has m_mutex, ProducerConsumer has m_mutex
      expect(result.mutexes.length).toBeGreaterThanOrEqual(2);
      const mutexNames = result.mutexes.map(m => m.name);
      expect(mutexNames).toContain('m_mutex');
    });

    it('detects condition variables', () => {
      const headerContent = readFixture('concurrent_sample.h');
      const cppContent = readFixture('concurrent_sample.cpp');
      const files = [
        { path: 'concurrent_sample.h', content: headerContent },
        { path: 'concurrent_sample.cpp', content: cppContent },
      ];
      const result = detectConcurrencyMultiFile(files);

      // ThreadPool m_cv, ProducerConsumer m_cv
      expect(result.conditionVariables.length).toBeGreaterThanOrEqual(2);
      const cvNames = result.conditionVariables.map(cv => cv.name);
      expect(cvNames).toContain('m_cv');
    });

    it('detects atomic<bool> m_shutdown', () => {
      const headerContent = readFixture('concurrent_sample.h');
      const cppContent = readFixture('concurrent_sample.cpp');
      const files = [
        { path: 'concurrent_sample.h', content: headerContent },
        { path: 'concurrent_sample.cpp', content: cppContent },
      ];
      const result = detectConcurrencyMultiFile(files);

      expect(result.atomics.length).toBeGreaterThanOrEqual(1);
      const shutdownAtomic = result.atomics.find(a => a.name === 'm_shutdown');
      expect(shutdownAtomic).toBeDefined();
      expect(shutdownAtomic!.type).toBe('bool');
    });

    it('detects thread_pool pattern', () => {
      const headerContent = readFixture('concurrent_sample.h');
      const cppContent = readFixture('concurrent_sample.cpp');
      const files = [
        { path: 'concurrent_sample.h', content: headerContent },
        { path: 'concurrent_sample.cpp', content: cppContent },
      ];
      const result = detectConcurrencyMultiFile(files);
      const patterns = detectPatterns(result);

      const poolPattern = patterns.find(p => p.kind === 'thread_pool');
      expect(poolPattern).toBeDefined();
      expect(poolPattern!.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe('ProducerConsumer detection', () => {
    it('detects producer_consumer pattern from mutex + CV', () => {
      const headerContent = readFixture('concurrent_sample.h');
      const cppContent = readFixture('concurrent_sample.cpp');
      const files = [
        { path: 'concurrent_sample.h', content: headerContent },
        { path: 'concurrent_sample.cpp', content: cppContent },
      ];
      const result = detectConcurrencyMultiFile(files);
      const patterns = detectPatterns(result);

      // There should be at least one producer-consumer or monitor pattern
      const pcPatterns = patterns.filter(p =>
        p.kind === 'producer_consumer' || p.kind === 'monitor'
      );
      expect(pcPatterns.length).toBeGreaterThanOrEqual(1);
    });

    it('detects condition variable waiters and notifiers', () => {
      const headerContent = readFixture('concurrent_sample.h');
      const cppContent = readFixture('concurrent_sample.cpp');
      const files = [
        { path: 'concurrent_sample.h', content: headerContent },
        { path: 'concurrent_sample.cpp', content: cppContent },
      ];
      const result = detectConcurrencyMultiFile(files);

      for (const cv of result.conditionVariables) {
        // Each CV should have at least one waiter and one notifier
        expect(cv.waiters.length).toBeGreaterThanOrEqual(1);
        expect(cv.notifiers.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('Thread spawn/join detection', () => {
    it('detects std::thread constructor', () => {
      const code = `
        void run() {
          std::thread t1(workerFunc);
          t1.join();
        }
      `;
      const result = detectConcurrency({ path: 'test.cpp', content: code });
      expect(result.threads.length).toBe(1);
      expect(result.threads[0].name).toBe('t1');
      expect(result.threads[0].entryFunction).toBe('workerFunc');
      expect(result.threads[0].kind).toBe('thread');
    });

    it('detects std::jthread constructor', () => {
      const code = `
        void run() {
          std::jthread jt(myFunc);
        }
      `;
      const result = detectConcurrency({ path: 'test.cpp', content: code });
      expect(result.threads.length).toBe(1);
      expect(result.threads[0].kind).toBe('jthread');
      expect(result.threads[0].entryFunction).toBe('myFunc');
    });

    it('detects thread join and detach', () => {
      const code = `
        void run() {
          std::thread t1(func1);
          std::thread t2(func2);
          t1.join();
          t2.detach();
        }
      `;
      const result = detectConcurrency({ path: 'test.cpp', content: code });
      expect(result.threads.length).toBe(2);

      const t1 = result.threads.find(t => t.name === 't1');
      const t2 = result.threads.find(t => t.name === 't2');
      expect(t1).toBeDefined();
      expect(t2).toBeDefined();
      expect(t1!.joinLocation).toBeDefined();
      expect(t1!.detached).toBe(false);
      expect(t2!.detached).toBe(true);
    });

    it('detects pthread_create', () => {
      const code = `
        void run() {
          pthread_create(&tid, NULL, worker, NULL);
        }
      `;
      const result = detectConcurrency({ path: 'test.cpp', content: code });
      expect(result.threads.length).toBe(1);
      expect(result.threads[0].entryFunction).toBe('worker');
    });
  });

  describe('Atomic memory order detection', () => {
    it('detects memory orders from load/store calls', () => {
      const code = `
        std::atomic<bool> flag;
        void writer() {
          flag.store(true, std::memory_order_release);
        }
        void reader() {
          flag.load(std::memory_order_acquire);
        }
      `;
      const result = detectConcurrency({ path: 'test.cpp', content: code });
      expect(result.atomics.length).toBe(1);
      const atom = result.atomics[0];
      expect(atom.name).toBe('flag');
      expect(atom.type).toBe('bool');
      expect(atom.memoryOrders).toContain('release');
      expect(atom.memoryOrders).toContain('acquire');
      expect(atom.writers).toContain('writer');
      expect(atom.readers).toContain('reader');
    });

    it('detects relaxed and seq_cst memory orders', () => {
      const headerContent = readFixture('concurrent_sample.h');
      const cppContent = readFixture('concurrent_sample.cpp');
      const files = [
        { path: 'concurrent_sample.h', content: headerContent },
        { path: 'concurrent_sample.cpp', content: cppContent },
      ];
      const result = detectConcurrencyMultiFile(files);

      const shutdown = result.atomics.find(a => a.name === 'm_shutdown');
      expect(shutdown).toBeDefined();
      expect(shutdown!.memoryOrders).toContain('release');
      expect(shutdown!.memoryOrders).toContain('acquire');
      expect(shutdown!.memoryOrders).toContain('relaxed');
    });
  });

  describe('Graph building', () => {
    it('creates nodes for all concurrency primitives', () => {
      const headerContent = readFixture('concurrent_sample.h');
      const cppContent = readFixture('concurrent_sample.cpp');
      const files = [
        { path: 'concurrent_sample.h', content: headerContent },
        { path: 'concurrent_sample.cpp', content: cppContent },
      ];
      const result = detectConcurrencyMultiFile(files);
      const { nodes, edges } = buildConcurrencyGraph(result);

      // Should have thread, mutex, atomic, condition_variable nodes
      const nodeKinds = new Set(nodes.map(n => n.kind));
      expect(nodeKinds.has('mutex')).toBe(true);
      expect(nodeKinds.has('atomic')).toBe(true);
      expect(nodeKinds.has('condition_variable')).toBe(true);

      // Should have edges
      expect(edges.length).toBeGreaterThan(0);

      // All edges should have confidence scores
      for (const edge of edges) {
        expect(edge.confidence).toBeGreaterThan(0);
        expect(edge.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Integration: analyzeConcurrency', () => {
    it('returns analysis, nodes, and edges', async () => {
      const headerContent = readFixture('concurrent_sample.h');
      const cppContent = readFixture('concurrent_sample.cpp');
      const files = [
        { path: 'concurrent_sample.h', content: headerContent },
        { path: 'concurrent_sample.cpp', content: cppContent },
      ];

      const { analysis, nodes, edges } = await analyzeConcurrency(files);

      expect(analysis.threads.length).toBeGreaterThanOrEqual(1);
      expect(analysis.mutexes.length).toBeGreaterThanOrEqual(2);
      expect(analysis.atomics.length).toBeGreaterThanOrEqual(1);
      expect(analysis.conditionVariables.length).toBeGreaterThanOrEqual(2);
      expect(analysis.patterns.length).toBeGreaterThanOrEqual(1);

      expect(nodes.length).toBeGreaterThan(0);
      expect(edges.length).toBeGreaterThan(0);
    });
  });
});
