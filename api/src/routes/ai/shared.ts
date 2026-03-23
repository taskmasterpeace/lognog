import { getSystemSetting } from '../../db/sqlite.js';
import { logAIRequest } from '../../services/internal-logger.js';
import {
  getRAGDocumentsWithEmbeddings,
  RAGDocument,
} from '../../db/sqlite.js';

// Dynamic configuration getters - read from database first, then env, then defaults
// This allows settings changed in the UI to take effect without server restart
export function getOllamaUrl(): string {
  return getSystemSetting('ai_ollama_url') || process.env.OLLAMA_URL || 'http://localhost:11434';
}
export function getOllamaModel(): string {
  return getSystemSetting('ai_ollama_model') || process.env.OLLAMA_MODEL || 'deepseek-coder-v2:16b';
}
export function getOllamaReasoningModel(): string {
  return getSystemSetting('ai_ollama_reasoning_model') || process.env.OLLAMA_REASONING_MODEL || 'qwen3:30b';
}
export function getOllamaEmbedModel(): string {
  return getSystemSetting('ai_ollama_embed_model') || process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
}
export function getOpenRouterApiKey(): string | undefined {
  return getSystemSetting('ai_openrouter_api_key') || process.env.OPENROUTER_API_KEY || undefined;
}
export function getOpenRouterModel(): string {
  return getSystemSetting('ai_openrouter_model') || process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
}

// OpenRouter API endpoint (constant)
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Check if Ollama is available
export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${getOllamaUrl()}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Check if ANY AI provider is available (OpenRouter OR Ollama)
export async function isAnyAIAvailable(): Promise<boolean> {
  // OpenRouter is primary - check it first
  if (getOpenRouterApiKey()) return true;
  // Fall back to Ollama if no OpenRouter key
  return await isOllamaAvailable();
}

// Generate text with Ollama
export async function generateWithOllama(prompt: string, model?: string): Promise<string> {
  const response = await fetch(`${getOllamaUrl()}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || getOllamaModel(),
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

// Generate text with OpenRouter (cloud fallback)
export async function generateWithOpenRouter(prompt: string, model?: string): Promise<string> {
  if (!getOpenRouterApiKey()) {
    throw new Error('OpenRouter API key not configured');
  }

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getOpenRouterApiKey()}`,
      'HTTP-Referer': 'https://lognog.io',
      'X-Title': 'LogNog',
    },
    body: JSON.stringify({
      model: model || getOpenRouterModel(),
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

// Unified generate function - OpenRouter PRIMARY, Ollama fallback
export async function generateText(prompt: string, options?: { model?: string; useReasoning?: boolean; endpoint?: string }): Promise<{ response: string; provider: 'ollama' | 'openrouter' }> {
  const startTime = Date.now();

  // Try OpenRouter first (PRIMARY - no local server needed)
  if (getOpenRouterApiKey()) {
    const model = options?.model || getOpenRouterModel();
    try {
      const response = await generateWithOpenRouter(prompt, model);

      // Log successful OpenRouter request
      logAIRequest({
        provider: 'openrouter',
        model,
        duration_ms: Date.now() - startTime,
        success: true,
        endpoint: options?.endpoint,
      });

      return { response, provider: 'openrouter' };
    } catch (error) {
      // Log failed OpenRouter request
      logAIRequest({
        provider: 'openrouter',
        model,
        duration_ms: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        endpoint: options?.endpoint,
      });
      console.warn('OpenRouter generation failed, trying Ollama fallback:', error);
    }
  }

  // Fallback to Ollama (local)
  const ollamaAvailable = await isOllamaAvailable();
  if (ollamaAvailable) {
    const model = options?.useReasoning ? getOllamaReasoningModel() : (options?.model || getOllamaModel());
    const ollamaStart = Date.now();
    try {
      const response = await generateWithOllama(prompt, model);

      // Log successful Ollama request
      logAIRequest({
        provider: 'ollama',
        model,
        duration_ms: Date.now() - ollamaStart,
        success: true,
        endpoint: options?.endpoint,
      });

      return { response, provider: 'ollama' };
    } catch (error) {
      // Log failed Ollama request
      logAIRequest({
        provider: 'ollama',
        model,
        duration_ms: Date.now() - ollamaStart,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        endpoint: options?.endpoint,
      });
      console.error('Ollama fallback failed:', error);
      throw error;
    }
  }

  throw new Error('No AI provider available. Configure OpenRouter API key in Settings or start Ollama.');
}

// Generate embeddings with Ollama
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch(`${getOllamaUrl()}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: getOllamaEmbedModel(),
      prompt: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama embedding error: ${response.statusText}`);
  }

  const data = await response.json() as { embedding: number[] };
  return data.embedding;
}

// Extract JSON from LLM response (handles markdown code blocks)
export function extractJSON(text: string): string {
  // Try to extract JSON from markdown code blocks
  const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    return jsonBlockMatch[1].trim();
  }
  // Try to find raw JSON object or array
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }
  return text.trim();
}

// Calculate cosine similarity between two vectors
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Find similar documents using embeddings
export async function findSimilarDocuments(query: string, topK: number = 5): Promise<Array<RAGDocument & { similarity: number }>> {
  const queryEmbedding = await generateEmbedding(query);
  const documents = getRAGDocumentsWithEmbeddings();

  const scored = documents.map(doc => {
    const docEmbedding = JSON.parse(doc.embedding!) as number[];
    const similarity = cosineSimilarity(queryEmbedding, docEmbedding);
    return { ...doc, similarity };
  });

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topK);
}

// Chunk text into smaller pieces for embedding
export function chunkText(text: string, maxChunkSize: number = 1000, overlap: number = 100): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxChunkSize;

    // Try to break at sentence or paragraph boundary
    if (end < text.length) {
      const lastNewline = text.lastIndexOf('\n', end);
      const lastPeriod = text.lastIndexOf('. ', end);
      if (lastNewline > start + maxChunkSize / 2) {
        end = lastNewline + 1;
      } else if (lastPeriod > start + maxChunkSize / 2) {
        end = lastPeriod + 2;
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
  }

  return chunks.filter(c => c.length > 0);
}
