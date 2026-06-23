import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';

interface NodeData {
  label: string;
  kind: string;
  qualifiedName?: string;
  color: string;
  [key: string]: unknown;
}

const kindIcons: Record<string, string> = {
  file: '\u{1F4C4}',
  namespace: '\u{1F4C1}',
  class: '\u{1F3DB}',
  struct: '\u{1F3DB}',
  function: 'f',
  method: 'fn',
  thread: '\u{1F9F5}',
  mutex: '\u{1F512}',
  atomic: '\u{269B}',
  condition_variable: '\u{1F514}',
  queue: '\u{1F4E8}',
  lock_guard: '\u{1F512}',
  subsystem: '\u{1F4E6}',
};

function BaseNode({ data, selected, useTextIcon }: { data: NodeData; selected?: boolean; useTextIcon?: boolean }) {
  const borderColor = selected ? '#007acc' : data.color;
  const icon = kindIcons[data.kind] || '\u{2B24}';

  return (
    <div
      style={{
        padding: '10px 16px',
        borderRadius: '8px',
        border: `2px solid ${borderColor}`,
        backgroundColor: selected ? data.color + '30' : '#252526',
        boxShadow: selected
          ? `0 0 0 3px ${data.color}40, 0 4px 12px rgba(0,0,0,0.3)`
          : `0 2px 6px rgba(0,0,0,0.25)`,
        minWidth: '140px',
        maxWidth: '220px',
        fontFamily: 'var(--vscode-font-family, -apple-system, sans-serif)',
        transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
        cursor: 'pointer',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: data.color,
          width: 8,
          height: 8,
          border: '2px solid #252526',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            backgroundColor: data.color + '25',
            border: `1px solid ${data.color}50`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: useTextIcon ? '12px' : '14px',
            fontWeight: useTextIcon ? 700 : 400,
            color: data.color,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
          <span
            style={{
              fontSize: '9px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: data.color,
              opacity: 0.8,
            }}
          >
            {data.kind.replace(/_/g, ' ')}
          </span>
          <span
            style={{
              color: '#e0e0e0',
              fontWeight: 500,
              fontSize: '12px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={data.qualifiedName || data.label}
          >
            {data.label}
          </span>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: data.color,
          width: 8,
          height: 8,
          border: '2px solid #252526',
        }}
      />
    </div>
  );
}

export const FileNode = memo(({ data, selected }: NodeProps) => (
  <BaseNode data={data as unknown as NodeData} selected={selected} />
));
FileNode.displayName = 'FileNode';

export const ClassNode = memo(({ data, selected }: NodeProps) => (
  <BaseNode data={data as unknown as NodeData} selected={selected} />
));
ClassNode.displayName = 'ClassNode';

export const FunctionNode = memo(({ data, selected }: NodeProps) => (
  <BaseNode data={data as unknown as NodeData} selected={selected} useTextIcon />
));
FunctionNode.displayName = 'FunctionNode';

export const ThreadNode = memo(({ data, selected }: NodeProps) => (
  <BaseNode data={data as unknown as NodeData} selected={selected} />
));
ThreadNode.displayName = 'ThreadNode';

export const MutexNode = memo(({ data, selected }: NodeProps) => (
  <BaseNode data={data as unknown as NodeData} selected={selected} />
));
MutexNode.displayName = 'MutexNode';

export const AtomicNode = memo(({ data, selected }: NodeProps) => (
  <BaseNode data={data as unknown as NodeData} selected={selected} />
));
AtomicNode.displayName = 'AtomicNode';

export const QueueNode = memo(({ data, selected }: NodeProps) => (
  <BaseNode data={data as unknown as NodeData} selected={selected} />
));
QueueNode.displayName = 'QueueNode';

export const SubsystemNode = memo(({ data, selected }: NodeProps) => (
  <BaseNode data={data as unknown as NodeData} selected={selected} />
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
