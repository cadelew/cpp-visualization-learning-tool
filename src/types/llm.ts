/**
 * Types for LLM integration and explanation generation.
 */

import { SourceLocation } from './graph';

export type LLMProvider = 'none' | 'openai' | 'anthropic';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

// ─── Explanations ─────────────────────────────────────────────

export interface SubsystemExplanation {
  subsystemId: string;
  title: string;
  /** High-level summary */
  summary: string;
  /** Key components and their roles */
  components: ComponentExplanation[];
  /** How data flows through this subsystem */
  dataFlow?: string;
  /** Concurrency notes */
  concurrencyNotes?: string;
  /** Source references backing the explanation */
  sourceReferences: SourceReference[];
}

export interface ComponentExplanation {
  name: string;
  role: string;
  location: SourceLocation;
}

export interface SourceReference {
  description: string;
  location: SourceLocation;
}

// ─── Onboarding Guide ─────────────────────────────────────────

export interface OnboardingGuide {
  title: string;
  /** Ordered steps for reading the codebase */
  steps: OnboardingStep[];
  /** Key concepts a new engineer should understand */
  keyConcepts: KeyConcept[];
  /** Estimated time to complete */
  estimatedMinutes?: number;
}

export interface OnboardingStep {
  order: number;
  title: string;
  description: string;
  /** Files to read in order */
  files: FileRecommendation[];
  /** What to look for in these files */
  lookFor: string[];
}

export interface FileRecommendation {
  path: string;
  reason: string;
  /** Specific line ranges to focus on */
  focusRanges?: { startLine: number; endLine: number; reason: string }[];
}

export interface KeyConcept {
  name: string;
  description: string;
  /** Where this concept is implemented */
  implementations: SourceLocation[];
  /** Related C++ patterns or design choices */
  patterns?: string[];
}

// ─── Q&A ──────────────────────────────────────────────────────

export interface CodebaseQuestion {
  question: string;
  context?: {
    currentFile?: string;
    selectedSymbol?: string;
    visibleNodes?: string[];
  };
}

export interface CodebaseAnswer {
  answer: string;
  sourceReferences: SourceReference[];
  confidence: number;
  /** Related follow-up questions */
  suggestedFollowUps?: string[];
}
