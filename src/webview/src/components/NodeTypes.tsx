import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';

interface NodeData {
  label: string;
  kind: string;
  qualifiedName?: string;
  color: string;
  [key: string]: unknown;
}

const KIND_ABBREV: Record<string, string> = {
  file: 'F',
  namespace: 'N',
  class: 'C',
  struct: 'S',
  function: 'fn',
  method: 'fn',
  thread: 'T',
  mutex: 'M',
  atomic: 'A',
  condition_variable: 'CV',
  queue: 'Q',
  lock_guard: 'LG',
  subsystem: 'SS',
};

function CppNode({ data, selected }: { data: NodeData; selected?: boolean }) {
  const c = data.color;
  const abbrev = KIND_ABBREV[data.kind] || '?';
  const borderCol = selected ? '#007acc' : c + '60';
  const bgCol = selected ? c + '18' : '#1e1e1e';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 12px 7px 8px',
        borderRadius: 6,
        border: `1.5px solid ${borderCol}`,
        background: bgCol,
        minWidth: 110,
        maxWidth: 200,
        fontFamily: 'var(--vscode-font-family, -apple-system, sans-serif)',
        cursor: 'pointer',
        boxShadow: selected
          ? `0 0 0 2px ${c}30, 0 4px 12px rgba(0,0,0,0.35)`
          : '0 1px 4px rgba(0,0,0,0.2)',
        transition: 'border-color 0.12s, box-shadow 0.12s',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: c, width: 6, height: 6, border: '1.5px solid #1e1e1e', top: -3 }}
      />

      {/* Icon badge */}
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: 5,
          background: c + '22',
          border: `1px solid ${c}40`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 700,
          color: c,
          letterSpacing: -0.3,
          flexShrink: 0,
        }}
      >
        {abbrev}
      </div>

      {/* Label */}
      <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: '#d4d4d4',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={data.qualifiedName || data.label}
        >
          {data.label}
        </span>
        <span
          style={{
            fontSize: 9,
            color: c,
            opacity: 0.7,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
            fontWeight: 600,
          }}
        >
          {data.kind.replace(/_/g, ' ')}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: c, width: 6, height: 6, border: '1.5px solid #1e1e1e', bottom: -3 }}
      />
    </div>
  );
}

export const FileNode = memo(({ data, selected }: NodeProps) => (
  <CppNode data={data as unknown as NodeData} selected={selected} />
));
FileNode.displayName = 'FileNode';

export const ClassNode = memo(({ data, selected }: NodeProps) => (
  <CppNode data={data as unknown as NodeData} selected={selected} />
));
ClassNode.displayName = 'ClassNode';

export const FunctionNode = memo(({ data, selected }: NodeProps) => (
  <CppNode data={data as unknown as NodeData} selected={selected} />
));
FunctionNode.displayName = 'FunctionNode';

export const ThreadNode = memo(({ data, selected }: NodeProps) => (
  <CppNode data={data as unknown as NodeData} selected={selected} />
));
ThreadNode.displayName = 'ThreadNode';

export const MutexNode = memo(({ data, selected }: NodeProps) => (
  <CppNode data={data as unknown as NodeData} selected={selected} />
));
MutexNode.displayName = 'MutexNode';

export const AtomicNode = memo(({ data, selected }: NodeProps) => (
  <CppNode data={data as unknown as NodeData} selected={selected} />
));
AtomicNode.displayName = 'AtomicNode';

export const QueueNode = memo(({ data, selected }: NodeProps) => (
  <CppNode data={data as unknown as NodeData} selected={selected} />
));
QueueNode.displayName = 'QueueNode';

export const SubsystemNode = memo(({ data, selected }: NodeProps) => (
  <CppNode data={data as unknown as NodeData} selected={selected} />
));
SubsystemNode.displayName = 'SubsystemNode';

export const nodeTypes = {
  fileNode: FileNode,
  classNode: ClassNode,
  functionNode: FunctionNode,
  threadNode: ThreadNode,
  mutexNode: MutexNode,
  atomicNode: AtomicNode,
  queueNode: QueueNode,
  subsystemNode: SubsystemNode,
};
