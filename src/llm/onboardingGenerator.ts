/**
 * Generates onboarding guides — a "Start Here" reading order for new engineers.
 */

import { CodebaseGraph, Subsystem, SourceLocation } from '../types/graph';
import {
  OnboardingGuide,
  OnboardingStep,
  FileRecommendation,
  KeyConcept,
} from '../types/llm';
import { LLMClient } from './client';
import { buildSubsystemContext } from './contextBuilder';
import {
  SYSTEM_PROMPT_ONBOARDING,
  buildOnboardingUserPrompt,
} from './prompts';

interface OnboardingLLMResponse {
  title: string;
  steps: {
    order: number;
    title: string;
    description: string;
    files: {
      path: string;
      reason: string;
      focusRanges?: { startLine: number; endLine: number; reason: string }[];
    }[];
    lookFor: string[];
  }[];
  keyConcepts: {
    name: string;
    description: string;
    implementations: {
      file: string;
      startLine: number;
      startCol: number;
      endLine: number;
      endCol: number;
    }[];
    patterns?: string[];
  }[];
  estimatedMinutes?: number;
}

const MAX_CONTEXT_TOKENS = 8000;

export async function generateOnboardingGuide(
  client: LLMClient,
  graph: CodebaseGraph,
  subsystems: Subsystem[],
  sourceFiles: Map<string, string>,
): Promise<OnboardingGuide> {
  const projectOverview = buildProjectOverview(graph, subsystems);

  // Build context from all subsystems, splitting the token budget
  const perSubsystemBudget = Math.floor(
    MAX_CONTEXT_TOKENS / Math.max(subsystems.length, 1),
  );
  const contextParts: string[] = [];
  for (const subsystem of subsystems) {
    contextParts.push(
      buildSubsystemContext(subsystem, graph, sourceFiles, perSubsystemBudget),
    );
  }
  const context = contextParts.join('\n\n---\n\n');

  const userPrompt = buildOnboardingUserPrompt(projectOverview, context);

  const raw = await client.chatWithStructuredOutput<OnboardingLLMResponse>(
    SYSTEM_PROMPT_ONBOARDING,
    userPrompt,
    {},
  );

  const steps: OnboardingStep[] = raw.steps.map((s) => ({
    order: s.order,
    title: s.title,
    description: s.description,
    files: s.files.map(
      (f): FileRecommendation => ({
        path: f.path,
        reason: f.reason,
        focusRanges: f.focusRanges,
      }),
    ),
    lookFor: s.lookFor,
  }));

  const keyConcepts: KeyConcept[] = raw.keyConcepts.map((k) => ({
    name: k.name,
    description: k.description,
    implementations: k.implementations.map(
      (impl): SourceLocation => ({
        file: impl.file,
        startLine: impl.startLine,
        startCol: impl.startCol,
        endLine: impl.endLine,
        endCol: impl.endCol,
      }),
    ),
    patterns: k.patterns,
  }));

  return {
    title: raw.title,
    steps,
    keyConcepts,
    estimatedMinutes: raw.estimatedMinutes,
  };
}

function buildProjectOverview(
  graph: CodebaseGraph,
  subsystems: Subsystem[],
): string {
  const lines: string[] = [];
  lines.push(`Workspace root: ${graph.workspace.root}`);
  lines.push(`Total nodes: ${graph.nodes.length}`);
  lines.push(`Total edges: ${graph.edges.length}`);
  lines.push('');
  lines.push('Subsystems:');
  for (const s of subsystems) {
    lines.push(`- ${s.name} (${s.nodeIds.length} components)${s.description ? ': ' + s.description : ''}`);
  }

  // Identify entry points: nodes with 'function' kind named 'main' or top-level classes
  const entryPoints = graph.nodes.filter(
    (n) =>
      (n.kind === 'function' && n.label.toLowerCase().includes('main')) ||
      (n.kind === 'class' && !n.cluster),
  );
  if (entryPoints.length > 0) {
    lines.push('');
    lines.push('Entry points:');
    for (const ep of entryPoints) {
      const loc = ep.location
        ? ` (${ep.location.file}:${ep.location.startLine})`
        : '';
      lines.push(`- ${ep.label}${loc}`);
    }
  }

  return lines.join('\n');
}
