import { describe, it, expect } from 'vitest';
import {
  SYSTEM_PROMPT_EXPLANATION,
  SYSTEM_PROMPT_ONBOARDING,
  SYSTEM_PROMPT_QA,
  buildExplanationUserPrompt,
  buildOnboardingUserPrompt,
  buildQAUserPrompt,
} from '../../src/llm/prompts';

describe('system prompts', () => {
  it('SYSTEM_PROMPT_EXPLANATION is well-formed', () => {
    expect(SYSTEM_PROMPT_EXPLANATION).toBeTruthy();
    expect(SYSTEM_PROMPT_EXPLANATION).toContain('C++ systems engineer');
    expect(SYSTEM_PROMPT_EXPLANATION).toContain('JSON');
    expect(SYSTEM_PROMPT_EXPLANATION).toContain('summary');
    expect(SYSTEM_PROMPT_EXPLANATION).toContain('components');
    expect(SYSTEM_PROMPT_EXPLANATION).toContain('sourceReferences');
    expect(SYSTEM_PROMPT_EXPLANATION).toContain('file:line');
    expect(SYSTEM_PROMPT_EXPLANATION).toContain('concurrency');
  });

  it('SYSTEM_PROMPT_ONBOARDING is well-formed', () => {
    expect(SYSTEM_PROMPT_ONBOARDING).toBeTruthy();
    expect(SYSTEM_PROMPT_ONBOARDING).toContain('onboarding');
    expect(SYSTEM_PROMPT_ONBOARDING).toContain('JSON');
    expect(SYSTEM_PROMPT_ONBOARDING).toContain('steps');
    expect(SYSTEM_PROMPT_ONBOARDING).toContain('keyConcepts');
    expect(SYSTEM_PROMPT_ONBOARDING).toContain('entry points');
  });

  it('SYSTEM_PROMPT_QA is well-formed', () => {
    expect(SYSTEM_PROMPT_QA).toBeTruthy();
    expect(SYSTEM_PROMPT_QA).toContain('answering questions');
    expect(SYSTEM_PROMPT_QA).toContain('JSON');
    expect(SYSTEM_PROMPT_QA).toContain('answer');
    expect(SYSTEM_PROMPT_QA).toContain('sourceReferences');
    expect(SYSTEM_PROMPT_QA).toContain('suggestedFollowUps');
    expect(SYSTEM_PROMPT_QA).toContain('confidence');
  });

  it('all prompts instruct to only reference provided code', () => {
    for (const prompt of [
      SYSTEM_PROMPT_EXPLANATION,
      SYSTEM_PROMPT_ONBOARDING,
      SYSTEM_PROMPT_QA,
    ]) {
      // Each prompt should contain anti-hallucination instruction
      const hasGrounding =
        prompt.includes('only reference') ||
        prompt.includes('Only reference') ||
        prompt.includes('Never fabricate') ||
        prompt.includes('Never hallucinate');
      expect(hasGrounding).toBe(true);
    }
  });
});

describe('user prompt builders', () => {
  it('buildExplanationUserPrompt includes subsystem name and context', () => {
    const result = buildExplanationUserPrompt('Scheduler', 'some context here');
    expect(result).toContain('Scheduler');
    expect(result).toContain('some context here');
    expect(result).toContain('JSON');
  });

  it('buildOnboardingUserPrompt includes overview and context', () => {
    const result = buildOnboardingUserPrompt(
      'Project overview text',
      'source context text',
    );
    expect(result).toContain('Project overview text');
    expect(result).toContain('source context text');
    expect(result).toContain('JSON');
  });

  it('buildQAUserPrompt includes question, context, and source', () => {
    const result = buildQAUserPrompt(
      'How does the scheduler work?',
      'Current file: scheduler.cpp',
      '```cpp\nclass Scheduler {};\n```',
    );
    expect(result).toContain('How does the scheduler work?');
    expect(result).toContain('Current file: scheduler.cpp');
    expect(result).toContain('class Scheduler');
    expect(result).toContain('JSON');
  });
});
