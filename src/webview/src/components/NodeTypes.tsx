import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';

interface NodeData {
  label: string;
  kind: string;
  qualifiedName?: string;
  color: string;
  [key: string]: unknown;
}

const baseNodeStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid',
  fontSize: '12px',
  minWidth: '120px',
  textAlign: 'center',
  fontFamily: 'var(--vscode-font-family, sans-serif)',
};

function KindBadge({ kind, color }: { kind: string; color: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 5px',
        borderRadius: '3px',
        fontSize: '9px',
        fontWeight: 600,
        textTransform: 'uppercase',
        backgroundColor: color + '33',
        color: color,
        marginBottom: '4px',
      }}
    >
      {kind}
    </span>
  );
}

function BaseNode({ data, selected, icon }: { data: NodeData; selected?: boolean; icon: string }) {
  const borderColor = selected ? 'var(--vscode-focusBorder, #007acc)' : data.color + '88';
  const bgColor = selected ? data.color + '22' : 'var(--vscode-editor-background, #1e1e1e)';

  return (
    <div
      style={{
        ...baseNodeStyle,
        borderColor,
        backgroundColor: bgColor,
        boxShadow: selected ? `0 0 0 2px ${data.color}44` : 'none',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: data.color }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '14px' }}>{icon}</span>
          <KindBadge kind={data.kind} color={data.color} />
        </div>
        <div
          style={{
            color: 'var(--vscode-editor-foreground, #d4d4d4)',
            fontWeight: 500,
            fontSize: '11px',
            maxWidth: '150px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={data.qualifiedName || data.label}
        >
          {data.label}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: data.color }} />
    </div>
  );
}

export const FileNode = memo(({ data, selected }: NodeProps) => (
  <BaseNode data={data as unknown as NodeData} selected={selected} icon="\u{1F4C4}" />
));
FileNode.displayName = 'FileNode';

export const ClassNode = memo(({ data, selected }: NodeProps) => (
  <BaseNode data={data as unknown as NodeData} selected={selected} icon="\u{1F3DB}" />
));
ClassNode.displayName = 'ClassNode';

export const FunctionNode = memo(({ data, selected }: NodeProps) => (
  <BaseNode data={data as unknown as NodeData} selected={selected} icon="\u{26A1}" />
));
FunctionNode.displayName = 'FunctionNode';

export const ThreadNode = memo(({ data, selected }: NodeProps) => (
  <BaseNode data={data as unknown as NodeData} selected={selected} icon="\u{1F9F5}" />
));
ThreadNode.displayName = 'ThreadNode';

export const MutexNode = memo(({ data, selected }: NodeProps) => (
  <BaseNode data={data as unknown as NodeData} selected={selected} icon="\u{1F512}" />
));
MutexNode.displayName = 'MutexNode';

export const AtomicNode = memo(({ data, selected }: NodeProps) => (
  <BaseNode data={data as unknown as NodeData} selected={selected} icon="\u{269B}" />
));
AtomicNode.displayName = 'AtomicNode';

export const QueueNode = memo(({ data, selected }: NodeProps) => (
  <BaseNode data={data as unknown as NodeData} selected={selected} icon="\u{1F4E8}" />
));
QueueNode.displayName = 'QueueNode';

export const SubsystemNode = memo(({ data, selected }: NodeProps) => (
  <BaseNode data={data as unknown as NodeData} selected={selected} icon="\u{1F4E6}" />
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
