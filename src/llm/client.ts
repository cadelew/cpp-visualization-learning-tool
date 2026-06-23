/**
 * LLM client supporting OpenAI and Anthropic APIs.
 * Uses built-in fetch (Node 18+). Includes retry with exponential backoff.
 */

import { LLMConfig } from '../types/llm';

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

export class LLMClient {
  private readonly config: LLMConfig;
  private static readonly MAX_RETRIES = 3;
  private static readonly BASE_DELAY_MS = 1000;

  constructor(config: LLMConfig) {
    if (config.provider === 'none') {
      throw new LLMError(
        'No LLM provider configured. Set cppViz.llm.provider and cppViz.llm.apiKey in VS Code settings.',
      );
    }
    if (!config.apiKey) {
      throw new LLMError(
        'No API key configured. Set cppViz.llm.apiKey in VS Code settings.',
      );
    }
    this.config = config;
  }

  async chat(systemPrompt: string, userMessage: string): Promise<string> {
    return this.withRetry(() => this.doChat(systemPrompt, userMessage));
  }

  async chatWithStructuredOutput<T>(
    systemPrompt: string,
    userMessage: string,
    _schema: object,
  ): Promise<T> {
    const promptWithJsonInstruction = `${systemPrompt}\n\nYou MUST respond with valid JSON only. No markdown, no explanation outside the JSON.`;
    const raw = await this.withRetry(() =>
      this.doChat(promptWithJsonInstruction, userMessage),
    );
    return this.parseJsonResponse<T>(raw);
  }

  private async doChat(
    systemPrompt: string,
    userMessage: string,
  ): Promise<string> {
    if (this.config.provider === 'openai') {
      return this.chatOpenAI(systemPrompt, userMessage);
    }
    if (this.config.provider === 'anthropic') {
      return this.chatAnthropic(systemPrompt, userMessage);
    }
    throw new LLMError(`Unsupported provider: ${this.config.provider}`);
  }

  private async chatOpenAI(
    systemPrompt: string,
    userMessage: string,
  ): Promise<string> {
    const body = {
      model: this.config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
    };

    const response = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      await this.handleHttpError(response);
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new LLMError('Empty response from OpenAI');
    }
    return content;
  }

  private async chatAnthropic(
    systemPrompt: string,
    userMessage: string,
  ): Promise<string> {
    const body = {
      model: this.config.model,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: this.config.maxTokens,
    };

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      await this.handleHttpError(response);
    }

    const data = (await response.json()) as {
      content: { type: string; text: string }[];
    };

    const textBlock = data.content?.find(
      (block: { type: string }) => block.type === 'text',
    );
    if (!textBlock) {
      throw new LLMError('Empty response from Anthropic');
    }
    return textBlock.text;
  }

  private async handleHttpError(response: Response): Promise<never> {
    let errorBody = '';
    try {
      errorBody = await response.text();
    } catch {
      // ignore read errors
    }

    const retryable =
      response.status === 429 ||
      response.status === 500 ||
      response.status === 503;

    if (response.status === 401 || response.status === 403) {
      throw new LLMError(
        `Authentication failed (${response.status}): check your API key. ${errorBody}`,
        response.status,
        false,
      );
    }

    if (response.status === 429) {
      throw new LLMError(
        `Rate limited (429): ${errorBody}`,
        response.status,
        true,
      );
    }

    throw new LLMError(
      `HTTP ${response.status}: ${errorBody}`,
      response.status,
      retryable,
    );
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < LLMClient.MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
        const isRetryable =
          err instanceof LLMError ? err.retryable : false;
        if (!isRetryable || attempt === LLMClient.MAX_RETRIES - 1) {
          throw err;
        }
        const delay =
          LLMClient.BASE_DELAY_MS * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }
    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private parseJsonResponse<T>(raw: string): T {
    // Strip markdown code fences if present
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      const firstNewline = cleaned.indexOf('\n');
      cleaned = cleaned.slice(firstNewline + 1);
      if (cleaned.endsWith('```')) {
        cleaned = cleaned.slice(0, -3);
      }
    }
    try {
      return JSON.parse(cleaned.trim()) as T;
    } catch {
      throw new LLMError(
        `Failed to parse LLM response as JSON: ${raw.slice(0, 200)}`,
      );
    }
  }
}
