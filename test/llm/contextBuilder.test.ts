import { describe, it, expect } from 'vitest';
import { buildSubsystemContext } from '../../src/llm/contextBuilder';
import { CodebaseGraph, Subsystem } from '../../src/types/graph';

function makeGraph(overrides?: Partial<CodebaseGraph>): CodebaseGraph {
  return {
    version: '1.0',
    workspace: { root: '/project' },
    nodes: [
      {
        id: 'class-scheduler',
        kind: 'class',
        label: 'Scheduler',
        location: {
          file: 'src/scheduler.cpp',
          startLine: 10,
          startCol: 0,
          endLine: 50,
          endCol: 0,
        },
        cluster: 'engine',
      },
      {
        id: 'func-run',
        kind: 'function',
        label: 'run',
        location: {
          file: 'src/scheduler.cpp',
          startLine: 52,
          startCol: 0,
          endLine: 80,
          endCol: 0,
        },
        cluster: 'engine',
      },
      {
        id: 'class-worker',
        kind: 'class',
        label: 'Worker',
        location: {
          file: 'src/worker.cpp',
          startLine: 1,
          startCol: 0,
          endLine: 40,
          endCol: 0,
        },
        cluster: 'engine',
      },
      {
        id: 'file-main',
        kind: 'file',
        label: 'main.cpp',
        location: {
          file: 'src/main.cpp',
          startLine: 1,
          startCol: 0,
          endLine: 20,
          endCol: 0,
        },
      },
    ],
    edges: [
      {
        id: 'e1',
        kind: 'calls',
        source: 'func-run',
        target: 'class-worker',
        confidence: 0.9,
        evidence: [],
      },
      {
        id: 'e2',
        kind: 'contains',
        source: 'class-scheduler',
        target: 'func-run',
        confidence: 1.0,
        evidence: [],
      },
    ],
    ...overrides,
  };
}

const subsystem: Subsystem = {
  id: 'engine',
  name: 'Engine',
  description: 'Core scheduling engine',
  nodeIds: ['class-scheduler', 'func-run', 'class-worker'],
};

function makeSourceFiles(): Map<string, string> {
  const files = new Map<string, string>();
  const schedulerLines: string[] = [];
  for (let i = 1; i <= 80; i++) {
    schedulerLines.push(`// line ${i} of scheduler.cpp`);
  }
  files.set('src/scheduler.cpp', schedulerLines.join('\n'));

  const workerLines: string[] = [];
  for (let i = 1; i <= 40; i++) {
    workerLines.push(`// line ${i} of worker.cpp`);
  }
  files.set('src/worker.cpp', workerLines.join('\n'));

  return files;
}

describe('buildSubsystemContext', () => {
  it('includes subsystem name and description', () => {
    const context = buildSubsystemContext(
      subsystem,
      makeGraph(),
      makeSourceFiles(),
      5000,
    );
    expect(context).toContain('## Subsystem: Engine');
    expect(context).toContain('Core scheduling engine');
  });

  it('includes node listings by kind', () => {
    const context = buildSubsystemContext(
      subsystem,
      makeGraph(),
      makeSourceFiles(),
      5000,
    );
    expect(context).toContain('Scheduler');
    expect(context).toContain('Worker');
    expect(context).toContain('run');
  });

  it('includes relationship information', () => {
    const context = buildSubsystemContext(
      subsystem,
      makeGraph(),
      makeSourceFiles(),
      5000,
    );
    expect(context).toContain('### Relationships');
    expect(context).toContain('calls');
    expect(context).toContain('run -> Worker');
  });

  it('includes source code snippets', () => {
    const context = buildSubsystemContext(
      subsystem,
      makeGraph(),
      makeSourceFiles(),
      5000,
    );
    expect(context).toContain('### Source Code');
    expect(context).toContain('```cpp');
  });

  it('respects token limits by truncating', () => {
    // Very small budget — should produce short output
    const context = buildSubsystemContext(
      subsystem,
      makeGraph(),
      makeSourceFiles(),
      100,
    );
    // Should at least have the overview, but source code may be omitted
    expect(context).toContain('## Subsystem: Engine');
    // Source section should not appear at such a low budget
    const sourceIdx = context.indexOf('### Source Code');
    if (sourceIdx >= 0) {
      // If present, the total should still be reasonably bounded
      expect(context.length).toBeLessThan(2000);
    }
  });

  it('handles subsystem with no edges', () => {
    const graphNoEdges = makeGraph({ edges: [] });
    const context = buildSubsystemContext(
      subsystem,
      graphNoEdges,
      makeSourceFiles(),
      5000,
    );
    expect(context).toContain('No relationships detected');
  });

  it('handles missing source files gracefully', () => {
    const emptyFiles = new Map<string, string>();
    const context = buildSubsystemContext(
      subsystem,
      makeGraph(),
      emptyFiles,
      5000,
    );
    // Should still have overview and relationships
    expect(context).toContain('## Subsystem: Engine');
    expect(context).toContain('### Relationships');
  });
});
