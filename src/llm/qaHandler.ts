/**
 * Handles "How does this work?" questions about the codebase.
 */

import { CodebaseGraph, GraphNode, SourceLocation } from '../types/graph';
import {
  CodebaseQuestion,
  CodebaseAnswer,
  SourceReference,
} from '../types/llm';
import { LLMClient } from './client';
import { SYSTEM_PROMPT_QA, buildQAUserPrompt } from './prompts';

interface QALLMResponse {
  answer: string;
  sourceReferences: {
    description: string;
    file: string;
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
  }[];
  confidence: number;
  suggestedFollowUps?: string[];
}

const MAX_CONTEXT_CHARS = 24000;

export async function answerQuestion(
  client: LLMClient,
  question: CodebaseQuestion,
  graph: CodebaseGraph,
  sourceFiles: Map<string, string>,
): Promise<CodebaseAnswer> {
  const relevantNodes = findRelevantNodes(question, graph);
  const contextInfo = buildQuestionContext(question, relevantNodes);
  const sourceContext = buildSourceContext(
    relevantNodes,
    sourceFiles,
    MAX_CONTEXT_CHARS,
  );

  const userPrompt = buildQAUserPrompt(
    question.question,
    contextInfo,
    sourceContext,
  );

  const raw = await client.chatWithStructuredOutput<QALLMResponse>(
    SYSTEM_PROMPT_QA,
    userPrompt,
    {},
  );

  const sourceReferences: SourceReference[] = raw.sourceReferences.map(
    (r) => ({
      description: r.description,
      location: toSourceLocation(r),
    }),
  );

  return {
    answer: raw.answer,
    sourceReferences,
    confidence: Math.max(0, Math.min(1, raw.confidence)),
    suggestedFollowUps: raw.suggestedFollowUps,
  };
}

function findRelevantNodes(
  question: CodebaseQuestion,
  graph: CodebaseGraph,
): GraphNode[] {
  const relevant: GraphNode[] = [];
  const seen = new Set<string>();

  // If context specifies a file, find nodes in that file
  if (question.context?.currentFile) {
    for (const node of graph.nodes) {
      if (node.location?.file === question.context.currentFile) {
        relevant.push(node);
        seen.add(node.id);
      }
    }
  }

  // If context specifies a symbol, find matching nodes
  if (question.context?.selectedSymbol) {
    const symbol = question.context.selectedSymbol.toLowerCase();
    for (const node of graph.nodes) {
      if (
        !seen.has(node.id) &&
        (node.label.toLowerCase().includes(symbol) ||
          node.qualifiedName?.toLowerCase().includes(symbol))
      ) {
        relevant.push(node);
        seen.add(node.id);
      }
    }
  }

  // If context specifies visible nodes, include them
  if (question.context?.visibleNodes) {
    const visibleSet = new Set(question.context.visibleNodes);
    for (const node of graph.nodes) {
      if (!seen.has(node.id) && visibleSet.has(node.id)) {
        relevant.push(node);
        seen.add(node.id);
      }
    }
  }

  // Expand to connected nodes (1 hop)
  const connectedIds = new Set<string>();
  for (const node of relevant) {
    for (const edge of graph.edges) {
      if (edge.source === node.id) connectedIds.add(edge.target);
      if (edge.target === node.id) connectedIds.add(edge.source);
    }
  }
  for (const id of connectedIds) {
    if (!seen.has(id)) {
      const node = graph.nodes.find((n) => n.id === id);
      if (node) {
        relevant.push(node);
        seen.add(node.id);
      }
    }
  }

  // If still no nodes, fall back to keyword matching against the question
  if (relevant.length === 0) {
    const words = question.question
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2);
    for (const node of graph.nodes) {
      const label = node.label.toLowerCase();
      if (words.some((w) => label.includes(w))) {
        relevant.push(node);
        seen.add(node.id);
      }
    }
  }

  return relevant;
}

function buildQuestionContext(
  question: CodebaseQuestion,
  nodes: GraphNode[],
): string {
  const lines: string[] = [];

  if (question.context?.currentFile) {
    lines.push(`Current file: ${question.context.currentFile}`);
  }
  if (question.context?.selectedSymbol) {
    lines.push(`Selected symbol: ${question.context.selectedSymbol}`);
  }

  lines.push(`Relevant components (${nodes.length}):`);
  for (const node of nodes.slice(0, 30)) {
    const loc = node.location
      ? ` (${node.location.file}:${node.location.startLine})`
      : '';
    lines.push(`- [${node.kind}] ${node.label}${loc}`);
  }

  return lines.join('\n');
}

function buildSourceContext(
  nodes: GraphNode[],
  sourceFiles: Map<string, string>,
  maxChars: number,
): string {
  const sections: string[] = [];
  let remaining = maxChars;

  // Collect unique files
  const fileNodes = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    if (!node.location) continue;
    const list = fileNodes.get(node.location.file) ?? [];
    list.push(node);
    fileNodes.set(node.location.file, list);
  }

  for (const [filePath, fileNodeList] of fileNodes) {
    if (remaining <= 200) break;
    const content = sourceFiles.get(filePath);
    if (!content) continue;

    const fileLines = content.split('\n');

    // Extract relevant line ranges
    const ranges: { start: number; end: number }[] = [];
    for (const node of fileNodeList) {
      if (!node.location) continue;
      ranges.push({
        start: Math.max(0, node.location.startLine - 1),
        end: Math.min(fileLines.length, node.location.endLine),
      });
    }

    // Merge overlapping ranges
    ranges.sort((a, b) => a.start - b.start);
    const merged: { start: number; end: number }[] = [];
    for (const range of ranges) {
      const last = merged[merged.length - 1];
      if (last && range.start <= last.end + 2) {
        last.end = Math.max(last.end, range.end);
      } else {
        merged.push({ ...range });
      }
    }

    const snippets: string[] = [];
    for (const range of merged) {
      const snippet = fileLines.slice(range.start, range.end).join('\n');
      snippets.push(`Lines ${range.start + 1}-${range.end}:\n${snippet}`);
    }

    const section = `### ${filePath}\n\`\`\`cpp\n${snippets.join('\n...\n')}\n\`\`\``;
    if (section.length > remaining) {
      const truncated = section.slice(0, remaining - 20) + '\n// truncated';
      sections.push(truncated);
      remaining = 0;
    } else {
      sections.push(section);
      remaining -= section.length;
    }
  }

  return sections.join('\n\n');
}

function toSourceLocation(ref: {
  file: string;
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}): SourceLocation {
  return {
    file: ref.file,
    startLine: ref.startLine,
    startCol: ref.startCol,
    endLine: ref.endLine,
    endCol: ref.endCol,
  };
}
