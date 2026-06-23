/**
 * Builds LLM context from graph data and source code,
 * prioritizing declarations and signatures within a token budget.
 */

import { CodebaseGraph, GraphNode, GraphEdge, Subsystem } from '../types/graph';

/**
 * Rough token estimate: ~4 characters per token for code.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Build a context string for a subsystem, fitting within a token budget.
 */
export function buildSubsystemContext(
  subsystem: Subsystem,
  graph: CodebaseGraph,
  sourceFiles: Map<string, string>,
  maxTokens: number,
): string {
  const nodeIdSet = new Set(subsystem.nodeIds);
  const subsystemNodes = graph.nodes.filter((n) => nodeIdSet.has(n.id));
  const subsystemEdges = graph.edges.filter(
    (e) => nodeIdSet.has(e.source) || nodeIdSet.has(e.target),
  );

  const sections: string[] = [];

  // Section 1: File list and node overview
  sections.push(buildNodeOverview(subsystem, subsystemNodes));

  // Section 2: Relationships
  sections.push(buildRelationshipSection(subsystemEdges, graph.nodes));

  // Section 3: Source code snippets (budget-aware)
  const usedTokens = estimateTokens(sections.join('\n'));
  const remainingTokens = maxTokens - usedTokens;
  if (remainingTokens > 200) {
    sections.push(
      buildSourceSection(subsystemNodes, sourceFiles, remainingTokens),
    );
  }

  return sections.join('\n\n');
}

function buildNodeOverview(subsystem: Subsystem, nodes: GraphNode[]): string {
  const lines: string[] = [`## Subsystem: ${subsystem.name}`];
  if (subsystem.description) {
    lines.push(subsystem.description);
  }
  lines.push('');
  lines.push('### Components');

  const byKind = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    const list = byKind.get(node.kind) ?? [];
    list.push(node);
    byKind.set(node.kind, list);
  }

  for (const [kind, kindNodes] of byKind) {
    lines.push(`\n**${kind}s:**`);
    for (const node of kindNodes) {
      const loc = node.location
        ? ` (${node.location.file}:${node.location.startLine})`
        : '';
      lines.push(`- ${node.label}${loc}`);
    }
  }

  return lines.join('\n');
}

function buildRelationshipSection(
  edges: GraphEdge[],
  allNodes: GraphNode[],
): string {
  if (edges.length === 0) {
    return '### Relationships\nNo relationships detected.';
  }

  const nodeMap = new Map<string, GraphNode>();
  for (const n of allNodes) {
    nodeMap.set(n.id, n);
  }

  const lines: string[] = ['### Relationships'];
  const byKind = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    const list = byKind.get(edge.kind) ?? [];
    list.push(edge);
    byKind.set(edge.kind, list);
  }

  for (const [kind, kindEdges] of byKind) {
    lines.push(`\n**${kind}:**`);
    for (const edge of kindEdges) {
      const src = nodeMap.get(edge.source)?.label ?? edge.source;
      const tgt = nodeMap.get(edge.target)?.label ?? edge.target;
      lines.push(`- ${src} -> ${tgt}`);
    }
  }

  return lines.join('\n');
}

function buildSourceSection(
  nodes: GraphNode[],
  sourceFiles: Map<string, string>,
  maxTokens: number,
): string {
  const lines: string[] = ['### Source Code'];
  let tokenBudget = maxTokens - estimateTokens('### Source Code\n');

  // Collect unique files from nodes
  const fileSet = new Set<string>();
  for (const node of nodes) {
    if (node.location) {
      fileSet.add(node.location.file);
    }
  }

  // Prioritize: class/struct declarations, function signatures
  const priorityNodes = nodes
    .filter((n) =>
      ['class', 'struct', 'function', 'method'].includes(n.kind) && n.location,
    )
    .sort((a, b) => {
      const kindOrder: Record<string, number> = {
        class: 0,
        struct: 1,
        function: 2,
        method: 3,
      };
      return (kindOrder[a.kind] ?? 4) - (kindOrder[b.kind] ?? 4);
    });

  // Extract snippets for priority nodes
  for (const node of priorityNodes) {
    if (tokenBudget <= 100) break;
    if (!node.location) continue;

    const content = sourceFiles.get(node.location.file);
    if (!content) continue;

    const fileLines = content.split('\n');
    const startLine = Math.max(0, node.location.startLine - 1);
    const endLine = Math.min(fileLines.length, node.location.endLine);
    const snippet = fileLines.slice(startLine, endLine).join('\n');

    const truncated = truncateToTokens(snippet, tokenBudget - 50);
    const header = `\n#### ${node.label} (${node.location.file}:${node.location.startLine}-${node.location.endLine})`;
    const block = `${header}\n\`\`\`cpp\n${truncated}\n\`\`\``;

    const blockTokens = estimateTokens(block);
    if (blockTokens > tokenBudget) break;

    lines.push(block);
    tokenBudget -= blockTokens;
  }

  // Fill remaining budget with file contents not yet covered
  for (const filePath of fileSet) {
    if (tokenBudget <= 100) break;

    const content = sourceFiles.get(filePath);
    if (!content) continue;

    // Skip if we already have snippets from this file
    const alreadyCovered = priorityNodes.some(
      (n) => n.location?.file === filePath,
    );
    if (alreadyCovered) continue;

    const truncated = truncateToTokens(content, tokenBudget - 50);
    const block = `\n#### ${filePath}\n\`\`\`cpp\n${truncated}\n\`\`\``;
    const blockTokens = estimateTokens(block);
    if (blockTokens > tokenBudget) break;

    lines.push(block);
    tokenBudget -= blockTokens;
  }

  return lines.join('\n');
}

function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) {
    return text;
  }
  return text.slice(0, maxChars) + '\n// ... truncated';
}
