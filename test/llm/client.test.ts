import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LLMClient, LLMError } from '../../src/llm/client';
import { LLMConfig } from '../../src/types/llm';

const openaiConfig: LLMConfig = {
  provider: 'openai',
  apiKey: 'test-key-123',
  model: 'gpt-4o-mini',
  maxTokens: 1024,
  temperature: 0.2,
};

const anthropicConfig: LLMConfig = {
  provider: 'anthropic',
  apiKey: 'test-key-456',
  model: 'claude-3-haiku-20240307',
  maxTokens: 1024,
  temperature: 0.2,
};

function mockFetchResponse(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe('LLMClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('throws when provider is none', () => {
      expect(
        () =>
          new LLMClient({
            provider: 'none',
            apiKey: '',
            model: '',
            maxTokens: 1024,
            temperature: 0,
          }),
      ).toThrow('No LLM provider configured');
    });

    it('throws when apiKey is empty', () => {
      expect(
        () =>
          new LLMClient({
            provider: 'openai',
            apiKey: '',
            model: 'gpt-4o-mini',
            maxTokens: 1024,
            temperature: 0,
          }),
      ).toThrow('No API key configured');
    });
  });

  describe('OpenAI chat', () => {
    it('parses a successful response', async () => {
      globalThis.fetch = mockFetchResponse({
        choices: [{ message: { content: 'Hello from OpenAI' } }],
      });

      const client = new LLMClient(openaiConfig);
      const result = await client.chat('system prompt', 'user message');

      expect(result).toBe('Hello from OpenAI');
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      const call = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(call[0]).toBe('https://api.openai.com/v1/chat/completions');
      const opts = call[1] as RequestInit;
      expect(opts.method).toBe('POST');
      const headers = opts.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-key-123');
    });

    it('throws LLMError on empty response', async () => {
      globalThis.fetch = mockFetchResponse({
        choices: [{ message: { content: '' } }],
      });

      const client = new LLMClient(openaiConfig);
      await expect(client.chat('sys', 'usr')).rejects.toThrow('Empty response from OpenAI');
    });
  });

  describe('Anthropic chat', () => {
    it('parses a successful response', async () => {
      globalThis.fetch = mockFetchResponse({
        content: [{ type: 'text', text: 'Hello from Anthropic' }],
      });

      const client = new LLMClient(anthropicConfig);
      const result = await client.chat('system prompt', 'user message');

      expect(result).toBe('Hello from Anthropic');

      const call = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(call[0]).toBe('https://api.anthropic.com/v1/messages');
      const opts = call[1] as RequestInit;
      const headers = opts.headers as Record<string, string>;
      expect(headers['x-api-key']).toBe('test-key-456');
      expect(headers['anthropic-version']).toBe('2023-06-01');
    });

    it('throws LLMError on empty response', async () => {
      globalThis.fetch = mockFetchResponse({
        content: [],
      });

      const client = new LLMClient(anthropicConfig);
      await expect(client.chat('sys', 'usr')).rejects.toThrow('Empty response from Anthropic');
    });
  });

  describe('error handling', () => {
    it('throws non-retryable error on 401', async () => {
      globalThis.fetch = mockFetchResponse(
        { error: { message: 'Invalid API key' } },
        401,
      );

      const client = new LLMClient(openaiConfig);
      try {
        await client.chat('sys', 'usr');
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(LLMError);
        const llmErr = err as LLMError;
        expect(llmErr.statusCode).toBe(401);
        expect(llmErr.retryable).toBe(false);
        expect(llmErr.message).toContain('Authentication failed');
      }
    });

    it('throws retryable error on 429 (rate limit)', async () => {
      globalThis.fetch = mockFetchResponse(
        { error: { message: 'Rate limit exceeded' } },
        429,
      );

      const client = new LLMClient(openaiConfig);
      try {
        await client.chat('sys', 'usr');
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(LLMError);
        const llmErr = err as LLMError;
        expect(llmErr.statusCode).toBe(429);
        expect(llmErr.retryable).toBe(true);
      }
    });
  });

  describe('retry logic', () => {
    it('retries on retryable errors up to 3 times', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve('rate limited'),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve('rate limited'),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              choices: [{ message: { content: 'success after retries' } }],
            }),
          text: () => Promise.resolve(''),
        });

      globalThis.fetch = fetchMock;

      const client = new LLMClient(openaiConfig);
      const result = await client.chat('sys', 'usr');
      expect(result).toBe('success after retries');
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('does not retry non-retryable errors', async () => {
      globalThis.fetch = mockFetchResponse(
        { error: { message: 'forbidden' } },
        403,
      );

      const client = new LLMClient(openaiConfig);
      await expect(client.chat('sys', 'usr')).rejects.toThrow('Authentication failed');
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('chatWithStructuredOutput', () => {
    it('parses JSON from response', async () => {
      globalThis.fetch = mockFetchResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({ name: 'test', value: 42 }),
            },
          },
        ],
      });

      const client = new LLMClient(openaiConfig);
      const result = await client.chatWithStructuredOutput<{
        name: string;
        value: number;
      }>('sys', 'usr', {});

      expect(result.name).toBe('test');
      expect(result.value).toBe(42);
    });

    it('handles markdown-fenced JSON', async () => {
      globalThis.fetch = mockFetchResponse({
        choices: [
          {
            message: {
              content: '```json\n{"key": "value"}\n```',
            },
          },
        ],
      });

      const client = new LLMClient(openaiConfig);
      const result = await client.chatWithStructuredOutput<{ key: string }>(
        'sys',
        'usr',
        {},
      );
      expect(result.key).toBe('value');
    });

    it('throws on invalid JSON', async () => {
      globalThis.fetch = mockFetchResponse({
        choices: [
          {
            message: {
              content: 'this is not json at all',
            },
          },
        ],
      });

      const client = new LLMClient(openaiConfig);
      await expect(
        client.chatWithStructuredOutput('sys', 'usr', {}),
      ).rejects.toThrow('Failed to parse LLM response as JSON');
    });
  });
});
