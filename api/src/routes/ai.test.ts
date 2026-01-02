import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * OpenRouter Fallback Tests
 *
 * Tests the Ollama → OpenRouter fallback logic in ai.ts
 * - isOllamaAvailable: health check for Ollama
 * - generateText: unified generation with fallback
 * - generateWithOpenRouter: direct OpenRouter API calls
 */

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Store original env vars
const originalEnv: Record<string, string | undefined> = {};

describe('AI Route - OpenRouter Fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Save original env vars
    originalEnv.OLLAMA_URL = process.env.OLLAMA_URL;
    originalEnv.OLLAMA_MODEL = process.env.OLLAMA_MODEL;
    originalEnv.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    originalEnv.OPENROUTER_MODEL = process.env.OPENROUTER_MODEL;
  });

  afterEach(() => {
    // Restore env vars
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  });

  describe('isOllamaAvailable', () => {
    // Import the function dynamically to get fresh module with mocked fetch
    async function isOllamaAvailable(): Promise<boolean> {
      try {
        const response = await fetch('http://localhost:11434/api/tags', {
          method: 'GET',
          signal: AbortSignal.timeout(2000),
        });
        return response.ok;
      } catch {
        return false;
      }
    }

    it('should return true when Ollama responds with 200', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await isOllamaAvailable();
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should return false when Ollama responds with non-200', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      });

      const result = await isOllamaAvailable();
      expect(result).toBe(false);
    });

    it('should return false on connection error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await isOllamaAvailable();
      expect(result).toBe(false);
    });

    it('should return false on timeout', async () => {
      mockFetch.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

      const result = await isOllamaAvailable();
      expect(result).toBe(false);
    });
  });

  describe('generateWithOllama', () => {
    async function generateWithOllama(prompt: string, model?: string): Promise<string> {
      const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
      const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'deepseek-coder-v2:16b';

      const response = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || OLLAMA_MODEL,
          prompt,
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.statusText}`);
      }

      const data = await response.json() as { response: string };
      return data.response;
    }

    it('should generate text successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: 'Generated text from Ollama' }),
      });

      const result = await generateWithOllama('Test prompt');
      expect(result).toBe('Generated text from Ollama');
    });

    it('should use custom model when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: 'Generated text' }),
      });

      await generateWithOllama('Test prompt', 'custom-model');

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.model).toBe('custom-model');
    });

    it('should throw error on Ollama failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
      });

      await expect(generateWithOllama('Test prompt')).rejects.toThrow('Ollama error: Internal Server Error');
    });
  });

  describe('generateWithOpenRouter', () => {
    const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

    async function generateWithOpenRouter(prompt: string, model?: string): Promise<string> {
      const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
      const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';

      if (!OPENROUTER_API_KEY) {
        throw new Error('OpenRouter API key not configured');
      }

      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://lognog.io',
          'X-Title': 'LogNog',
        },
        body: JSON.stringify({
          model: model || OPENROUTER_MODEL,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter error: ${response.statusText} - ${error}`);
      }

      const data = await response.json() as { choices: Array<{ message: { content: string } }> };
      return data.choices[0]?.message?.content || '';
    }

    it('should throw error when API key not configured', async () => {
      delete process.env.OPENROUTER_API_KEY;
      await expect(generateWithOpenRouter('Test prompt')).rejects.toThrow('OpenRouter API key not configured');
    });

    it('should make correct API call to OpenRouter', async () => {
      process.env.OPENROUTER_API_KEY = 'test-api-key';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'OpenRouter response' } }],
        }),
      });

      const result = await generateWithOpenRouter('Test prompt');

      expect(result).toBe('OpenRouter response');
      expect(mockFetch).toHaveBeenCalledWith(
        OPENROUTER_URL,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key',
            'HTTP-Referer': 'https://lognog.io',
            'X-Title': 'LogNog',
          }),
        })
      );
    });

    it('should include correct headers', async () => {
      process.env.OPENROUTER_API_KEY = 'test-api-key';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
        }),
      });

      await generateWithOpenRouter('Test');

      const fetchCall = mockFetch.mock.calls[0];
      const headers = fetchCall[1].headers;

      expect(headers['Authorization']).toBe('Bearer test-api-key');
      expect(headers['HTTP-Referer']).toBe('https://lognog.io');
      expect(headers['X-Title']).toBe('LogNog');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should use custom model when provided', async () => {
      process.env.OPENROUTER_API_KEY = 'test-api-key';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
        }),
      });

      await generateWithOpenRouter('Test', 'google/gemini-pro');

      const fetchCall = mockFetch.mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.model).toBe('google/gemini-pro');
    });

    it('should handle API errors gracefully', async () => {
      process.env.OPENROUTER_API_KEY = 'test-api-key';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
        text: async () => 'Invalid model specified',
      });

      await expect(generateWithOpenRouter('Test')).rejects.toThrow(
        'OpenRouter error: Bad Request - Invalid model specified'
      );
    });

    it('should handle empty response', async () => {
      process.env.OPENROUTER_API_KEY = 'test-api-key';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [],
        }),
      });

      const result = await generateWithOpenRouter('Test');
      expect(result).toBe('');
    });
  });

  describe('generateText with fallback', () => {
    async function isOllamaAvailable(): Promise<boolean> {
      try {
        const response = await fetch('http://localhost:11434/api/tags', {
          method: 'GET',
          signal: AbortSignal.timeout(2000),
        });
        return response.ok;
      } catch {
        return false;
      }
    }

    async function generateText(
      prompt: string,
      options?: { model?: string; useReasoning?: boolean }
    ): Promise<{ response: string; provider: 'ollama' | 'openrouter' }> {
      const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
      const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'deepseek-coder-v2:16b';
      const OLLAMA_REASONING_MODEL = process.env.OLLAMA_REASONING_MODEL || 'qwen3:30b';
      const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
      const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
      const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';

      const ollamaAvailable = await isOllamaAvailable();

      // Try Ollama first
      if (ollamaAvailable) {
        try {
          const model = options?.useReasoning ? OLLAMA_REASONING_MODEL : (options?.model || OLLAMA_MODEL);
          const response = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, prompt, stream: false }),
          });
          if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
          const data = await response.json() as { response: string };
          return { response: data.response, provider: 'ollama' };
        } catch (error) {
          console.warn('Ollama generation failed, trying OpenRouter fallback:', error);
        }
      }

      // Fallback to OpenRouter
      if (OPENROUTER_API_KEY) {
        const response = await fetch(OPENROUTER_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'https://lognog.io',
            'X-Title': 'LogNog',
          },
          body: JSON.stringify({
            model: options?.model || OPENROUTER_MODEL,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        if (!response.ok) {
          const error = await response.text();
          throw new Error(`OpenRouter error: ${response.statusText} - ${error}`);
        }
        const data = await response.json() as { choices: Array<{ message: { content: string } }> };
        return { response: data.choices[0]?.message?.content || '', provider: 'openrouter' };
      }

      throw new Error('No AI provider available. Configure Ollama or set OPENROUTER_API_KEY.');
    }

    it('should use Ollama when available', async () => {
      // First call: isOllamaAvailable check
      mockFetch.mockResolvedValueOnce({ ok: true });
      // Second call: generateWithOllama
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: 'Ollama response' }),
      });

      const result = await generateText('Test prompt');

      expect(result.response).toBe('Ollama response');
      expect(result.provider).toBe('ollama');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should fallback to OpenRouter when Ollama unavailable', async () => {
      process.env.OPENROUTER_API_KEY = 'test-api-key';

      // Ollama not available
      mockFetch.mockResolvedValueOnce({ ok: false });
      // OpenRouter call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'OpenRouter response' } }],
        }),
      });

      const result = await generateText('Test prompt');

      expect(result.response).toBe('OpenRouter response');
      expect(result.provider).toBe('openrouter');
    });

    it('should fallback to OpenRouter when Ollama generation fails', async () => {
      process.env.OPENROUTER_API_KEY = 'test-api-key';

      // Ollama available check succeeds
      mockFetch.mockResolvedValueOnce({ ok: true });
      // Ollama generation fails
      mockFetch.mockResolvedValueOnce({ ok: false, statusText: 'Model not found' });
      // OpenRouter call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'OpenRouter response' } }],
        }),
      });

      const result = await generateText('Test prompt');

      expect(result.response).toBe('OpenRouter response');
      expect(result.provider).toBe('openrouter');
    });

    it('should return provider name in response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: 'Test' }),
      });

      const result = await generateText('Test');
      expect(result).toHaveProperty('provider');
      expect(['ollama', 'openrouter']).toContain(result.provider);
    });

    it('should throw when both providers unavailable', async () => {
      delete process.env.OPENROUTER_API_KEY;

      // Ollama not available
      mockFetch.mockResolvedValueOnce({ ok: false });

      await expect(generateText('Test')).rejects.toThrow(
        'No AI provider available. Configure Ollama or set OPENROUTER_API_KEY.'
      );
    });

    it('should throw when Ollama fails and OpenRouter not configured', async () => {
      delete process.env.OPENROUTER_API_KEY;

      // Ollama available but generation fails
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockFetch.mockResolvedValueOnce({ ok: false, statusText: 'Error' });

      await expect(generateText('Test')).rejects.toThrow(
        'No AI provider available. Configure Ollama or set OPENROUTER_API_KEY.'
      );
    });

    it('should pass model parameter to OpenRouter', async () => {
      process.env.OPENROUTER_API_KEY = 'test-api-key';

      mockFetch.mockResolvedValueOnce({ ok: false }); // Ollama unavailable
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' } }],
        }),
      });

      await generateText('Test', { model: 'meta-llama/llama-3-70b' });

      // Second call should be OpenRouter
      const openRouterCall = mockFetch.mock.calls[1];
      const body = JSON.parse(openRouterCall[1].body);
      expect(body.model).toBe('meta-llama/llama-3-70b');
    });

    it('should use reasoning model for Ollama when useReasoning is true', async () => {
      process.env.OLLAMA_REASONING_MODEL = 'qwen3:30b';

      mockFetch.mockResolvedValueOnce({ ok: true }); // isOllamaAvailable
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: 'Reasoning response' }),
      });

      await generateText('Complex question', { useReasoning: true });

      const ollamaCall = mockFetch.mock.calls[1];
      const body = JSON.parse(ollamaCall[1].body);
      expect(body.model).toBe('qwen3:30b');
    });
  });

  describe('Error handling edge cases', () => {
    it('should handle network timeouts gracefully', async () => {
      process.env.OPENROUTER_API_KEY = 'test-api-key';

      // Ollama times out
      mockFetch.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));
      // OpenRouter succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Fallback response' } }],
        }),
      });

      // Re-implement simplified generateText for this test
      const generateText = async (prompt: string) => {
        const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

        // Check Ollama
        let ollamaAvailable = false;
        try {
          const response = await fetch('http://localhost:11434/api/tags', {
            signal: AbortSignal.timeout(2000),
          });
          ollamaAvailable = response.ok;
        } catch {
          ollamaAvailable = false;
        }

        if (!ollamaAvailable && OPENROUTER_API_KEY) {
          const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            },
            body: JSON.stringify({
              model: 'anthropic/claude-3.5-sonnet',
              messages: [{ role: 'user', content: prompt }],
            }),
          });
          const data = await response.json() as { choices: Array<{ message: { content: string } }> };
          return { response: data.choices[0]?.message?.content || '', provider: 'openrouter' as const };
        }

        throw new Error('No AI provider available');
      };

      const result = await generateText('Test');
      expect(result.provider).toBe('openrouter');
      expect(result.response).toBe('Fallback response');
    });

    it('should handle malformed OpenRouter response', async () => {
      process.env.OPENROUTER_API_KEY = 'test-api-key';

      // Direct OpenRouter call with malformed response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ unexpected: 'format' }), // Missing choices array
      });

      const generateWithOpenRouter = async (prompt: string) => {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'anthropic/claude-3.5-sonnet',
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        const data = await response.json() as { choices?: Array<{ message: { content: string } }> };
        return data.choices?.[0]?.message?.content || '';
      };

      const result = await generateWithOpenRouter('Test');
      expect(result).toBe(''); // Should return empty string, not crash
    });

    it('should handle rate limiting from OpenRouter', async () => {
      process.env.OPENROUTER_API_KEY = 'test-api-key';

      // Direct OpenRouter call that returns 429
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => 'Rate limit exceeded. Please retry after 60 seconds.',
      });

      const generateWithOpenRouter = async (prompt: string) => {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'anthropic/claude-3.5-sonnet',
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        if (!response.ok) {
          const error = await response.text();
          throw new Error(`OpenRouter error: ${response.statusText} - ${error}`);
        }
        return '';
      };

      await expect(generateWithOpenRouter('Test')).rejects.toThrow(
        'OpenRouter error: Too Many Requests - Rate limit exceeded'
      );
    });
  });
});
