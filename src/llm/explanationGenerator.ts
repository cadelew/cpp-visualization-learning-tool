/**
 * Generates subsystem explanations grounded in source code references.
 */

import { CodebaseGraph, Subsystem, SourceLocation } from '../types/graph';
import {
  SubsystemExplanation,
  ComponentExplanation,
  SourceReference,
} from '../types/llm';
import { LLMClient } from './client';
import { buildSubsystemContext } from './contextBuilder';
import {
  SYSTEM_PROMPT_EXPLANATION,
  buildExplanationUserPrompt,
} from './prompts';

interface ExplanationLLMResponse {
  summary: string;
  components: {
    name: string;
    role: string;
    file: string;
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
  }[];
  dataFlow?: string;
  concurrencyNotes?: string;
  sourceReferences: {
    description: string;
    file: string;
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
  }[];
}

const MAX_CONTEXT_TOKENS = 6000;

export async function generateExplanation(
  client: LLMClient,
  subsystem: Subsystem,
  graph: CodebaseGraph,
  sourceFiles: Map<string, string>,
): Promise<SubsystemExplanation> {
  const context = buildSubsystemContext(
    subsystem,
    graph,
    sourceFiles,
    MAX_CONTEXT_TOKENS,
  );

  const userPrompt = buildExplanationUserPrompt(subsystem.name, context);

  const raw = await client.chatWithStructuredOutput<ExplanationLLMResponse>(
    SYSTEM_PROMPT_EXPLANATION,
    userPrompt,
    {},
  );

  const components: ComponentExplanation[] = raw.components.map((c) => ({
    name: c.name,
    role: c.role,
    location: toSourceLocation(c),
  }));

  const sourceReferences: SourceReference[] = raw.sourceReferences.map(
    (r) => ({
      description: r.description,
      location: toSourceLocation(r),
    }),
  );

  return {
    subsystemId: subsystem.id,
    title: subsystem.name,
    summary: raw.summary,
    components,
    dataFlow: raw.dataFlow ?? undefined,
    concurrencyNotes: raw.concurrencyNotes ?? undefined,
    sourceReferences,
  };
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
