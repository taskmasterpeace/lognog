/**
 * LLM Re-ranker Service
 *
 * Uses Ollama LLM to re-rank search results by relevance.
 * This improves search quality by using semantic understanding
 * to score documents against the query.
 */

import { Ollama } from '@llamaindex/ollama';
import { HybridSearchResult } from './hybrid-search.js';

// Configuration
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const RERANK_TIMEOUT_MS = 10000; // 10 second timeout per batch
const MAX_BATCH_SIZE = 5; // Process documents in batches

export interface RerankOptions {
  topK?: number;           // Number of results to return after reranking
  timeout?: number;        // Timeout in ms for LLM call
  preserveScores?: boolean; // Keep original scores as fallback
}

export interface RerankResult {
  results: HybridSearchResult[];
  reranked: boolean;
  timeMs: number;
  error?: string;
}

/**
 * Create an Ollama instance for reranking
 */
function createOllamaClient(): Ollama {
  return new Ollama({
    model: OLLAMA_MODEL,
    config: { host: OLLAMA_URL },
  });
}

/**
 * Build the reranking prompt for the LLM
 */
export function buildRerankPrompt(query: string, documents: HybridSearchResult[]): string {
  const docList = documents
    .map((doc, i) => `[${i + 1}] Title: ${doc.title}\nContent: ${doc.excerpt || doc.content.substring(0, 300)}`)
    .join('\n\n');

  return `You are a relevance scoring expert. Given a query and a list of documents, rate each document's relevance to the query on a scale of 1-10.

Query: "${query}"

Documents:
${docList}

For each document, respond with ONLY a JSON array of scores in order, like: [8, 5, 9, 3, 7]
The array must have exactly ${documents.length} numbers.
Do not include any other text, just the JSON array.`;
}

/**
 * Parse the LLM response to extract scores
 */
export function parseScores(response: string, expectedCount: number): number[] | null {
  try {
    // Try to extract JSON array from response
    const jsonMatch = response.match(/\[[\d,\s]+\]/);
    if (!jsonMatch) {
      return null;
    }

    const scores = JSON.parse(jsonMatch[0]) as number[];

    // Validate scores
    if (!Array.isArray(scores) || scores.length !== expectedCount) {
      return null;
    }

    // Ensure all scores are valid numbers between 1-10
    const validScores = scores.map(s => {
      const num = Number(s);
      if (isNaN(num)) return 5; // Default to middle score
      return Math.max(1, Math.min(10, num));
    });

    return validScores;
  } catch {
    return null;
  }
}

/**
 * Re-rank documents using the LLM
 */
export async function rerankWithLLM(
  query: string,
  documents: HybridSearchResult[],
  options: RerankOptions = {}
): Promise<RerankResult> {
  const startTime = Date.now();
  const topK = options.topK ?? documents.length;
  const timeout = options.timeout ?? RERANK_TIMEOUT_MS;

  // Return early if no documents
  if (documents.length === 0) {
    return {
      results: [],
      reranked: false,
      timeMs: 0,
    };
  }

  // Return early if only one document
  if (documents.length === 1) {
    return {
      results: documents,
      reranked: false,
      timeMs: Date.now() - startTime,
    };
  }

  try {
    const ollama = createOllamaClient();
    const prompt = buildRerankPrompt(query, documents);

    // Call LLM with timeout
    const responsePromise = ollama.complete({ prompt });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Rerank timeout')), timeout)
    );

    const response = await Promise.race([responsePromise, timeoutPromise]);
    const scores = parseScores(response.text, documents.length);

    if (!scores) {
      // Failed to parse scores, return original order
      console.warn('Failed to parse rerank scores, returning original order');
      return {
        results: documents.slice(0, topK),
        reranked: false,
        timeMs: Date.now() - startTime,
        error: 'Failed to parse LLM response',
      };
    }

    // Apply scores and sort
    const scoredDocs = documents.map((doc, i) => ({
      ...doc,
      rerankScore: scores[i],
      score: options.preserveScores ? doc.score : scores[i] / 10, // Normalize to 0-1
    }));

    // Sort by rerank score (descending)
    scoredDocs.sort((a, b) => (b.rerankScore || 0) - (a.rerankScore || 0));

    return {
      results: scoredDocs.slice(0, topK),
      reranked: true,
      timeMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Rerank error:', errorMessage);

    // Return original order on error
    return {
      results: documents.slice(0, topK),
      reranked: false,
      timeMs: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

/**
 * Re-rank documents in batches for large result sets
 * This processes documents in smaller batches to avoid LLM context limits
 */
export async function rerankBatched(
  query: string,
  documents: HybridSearchResult[],
  options: RerankOptions = {}
): Promise<RerankResult> {
  const startTime = Date.now();
  const topK = options.topK ?? 10;

  if (documents.length <= MAX_BATCH_SIZE) {
    return rerankWithLLM(query, documents, options);
  }

  // Split into batches
  const batches: HybridSearchResult[][] = [];
  for (let i = 0; i < documents.length; i += MAX_BATCH_SIZE) {
    batches.push(documents.slice(i, i + MAX_BATCH_SIZE));
  }

  // Process batches in parallel
  const batchResults = await Promise.all(
    batches.map(batch => rerankWithLLM(query, batch, options))
  );

  // Combine results
  const allReranked: HybridSearchResult[] = [];
  let anyReranked = false;
  let lastError: string | undefined;

  for (const result of batchResults) {
    allReranked.push(...result.results);
    if (result.reranked) anyReranked = true;
    if (result.error) lastError = result.error;
  }

  // Sort combined results by score
  allReranked.sort((a, b) => b.score - a.score);

  return {
    results: allReranked.slice(0, topK),
    reranked: anyReranked,
    timeMs: Date.now() - startTime,
    error: lastError,
  };
}

/**
 * Simple relevance scoring without LLM (fallback)
 * Uses keyword matching for basic relevance
 */
export function simpleRerank(
  query: string,
  documents: HybridSearchResult[],
  topK: number = 10
): HybridSearchResult[] {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  const scored = documents.map(doc => {
    const text = `${doc.title} ${doc.content}`.toLowerCase();
    let matchCount = 0;

    for (const word of queryWords) {
      if (text.includes(word)) {
        matchCount++;
      }
    }

    // Simple relevance: fraction of query words matched
    const relevance = queryWords.length > 0 ? matchCount / queryWords.length : 0;

    return {
      ...doc,
      score: (doc.score * 0.5) + (relevance * 0.5), // Blend original score with keyword match
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
