/**
 * Hybrid Search Service
 *
 * Combines vector search (LlamaIndex) with full-text search (SQLite FTS5)
 * using Reciprocal Rank Fusion (RRF) for improved relevance.
 */

import { queryIndex } from './llamaindex';
import { searchRAGDocumentsFTS, getRAGDocument, FTSSearchResult } from '../db/sqlite';

// Search result types
export interface HybridSearchResult {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  sourceType: string;
  score: number;
  matchType: 'vector' | 'text' | 'hybrid';
  vectorRank?: number;
  textRank?: number;
  metadata?: Record<string, unknown>;
}

export interface HybridSearchOptions {
  vectorWeight?: number;  // 0-1, default 0.7
  textWeight?: number;    // 0-1, default 0.3
  topK?: number;          // Number of results to return, default 10
  minScore?: number;      // Minimum score threshold, default 0
}

export interface HybridSearchStats {
  vectorMatches: number;
  textMatches: number;
  hybridMatches: number;
  totalTimeMs: number;
}

export interface HybridSearchResponse {
  results: HybridSearchResult[];
  stats: HybridSearchStats;
}

/**
 * Reciprocal Rank Fusion (RRF) algorithm
 * Combines rankings from multiple sources
 *
 * Formula: score = sum(1 / (k + rank)) for each source
 * k is typically 60 (constant to prevent division by small numbers)
 */
export function reciprocalRankFusion(
  vectorResults: HybridSearchResult[],
  textResults: HybridSearchResult[],
  options: HybridSearchOptions = {}
): HybridSearchResult[] {
  const k = 60; // RRF constant
  const vectorWeight = options.vectorWeight ?? 0.7;
  const textWeight = options.textWeight ?? 0.3;

  // Map to track document scores by ID
  const scoreMap = new Map<string, {
    doc: HybridSearchResult;
    vectorRank: number | null;
    textRank: number | null;
    score: number;
  }>();

  // Process vector results
  vectorResults.forEach((doc, index) => {
    const rank = index + 1;
    const rrfScore = vectorWeight / (k + rank);

    const existing = scoreMap.get(doc.id);
    if (existing) {
      existing.vectorRank = rank;
      existing.score += rrfScore;
    } else {
      scoreMap.set(doc.id, {
        doc: { ...doc, matchType: 'vector' as const },
        vectorRank: rank,
        textRank: null,
        score: rrfScore,
      });
    }
  });

  // Process text results
  textResults.forEach((doc, index) => {
    const rank = index + 1;
    const rrfScore = textWeight / (k + rank);

    const existing = scoreMap.get(doc.id);
    if (existing) {
      existing.textRank = rank;
      existing.score += rrfScore;
      // Mark as hybrid if found in both
      if (existing.vectorRank !== null) {
        existing.doc.matchType = 'hybrid';
      }
    } else {
      scoreMap.set(doc.id, {
        doc: { ...doc, matchType: 'text' as const },
        vectorRank: null,
        textRank: rank,
        score: rrfScore,
      });
    }
  });

  // Sort by combined score and return
  const results = Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .map(({ doc, vectorRank, textRank, score }) => ({
      ...doc,
      score,
      vectorRank: vectorRank ?? undefined,
      textRank: textRank ?? undefined,
    }));

  return results;
}

/**
 * Perform vector search using LlamaIndex
 */
export async function vectorSearch(
  query: string,
  topK: number = 20
): Promise<HybridSearchResult[]> {
  try {
    const result = await queryIndex({ query, topK });

    return result.sourceNodes.map((node) => ({
      id: node.id,
      title: String(node.metadata?.title || 'Untitled'),
      content: node.text,
      excerpt: node.text.substring(0, 200),
      sourceType: String(node.metadata?.sourceType || 'unknown'),
      score: node.score || 0,
      matchType: 'vector' as const,
      metadata: node.metadata,
    }));
  } catch (error) {
    console.error('Vector search error:', error);
    return [];
  }
}

/**
 * Perform full-text search using SQLite FTS5
 */
export function ftsSearch(
  query: string,
  limit: number = 20
): HybridSearchResult[] {
  try {
    // Convert natural language query to FTS5 syntax
    const ftsQuery = convertToFTSQuery(query);
    const results = searchRAGDocumentsFTS(ftsQuery, limit);

    return results.map((result: FTSSearchResult) => {
      // Get full document to access metadata
      const fullDoc = getRAGDocument(result.doc_id);

      return {
        id: result.doc_id,
        title: result.title,
        content: result.content,
        excerpt: result.snippet || result.content.substring(0, 200),
        sourceType: result.source_type,
        score: Math.abs(result.rank), // BM25 scores are negative, lower is better
        matchType: 'text' as const,
        metadata: fullDoc?.metadata ? JSON.parse(fullDoc.metadata) : {},
      };
    });
  } catch (error) {
    console.error('FTS search error:', error);
    return [];
  }
}

/**
 * Convert natural language query to FTS5 query syntax
 * FTS5 uses a simple query syntax where:
 * - Words are searched with implicit AND
 * - Use OR for disjunction
 * - Use * for prefix matching
 * - Use quotes for exact phrases
 */
export function convertToFTSQuery(query: string): string {
  // Remove special FTS5 characters that could cause syntax errors
  // FTS5 special chars: AND OR NOT ( ) { } [ ] ^ ~ " \ * : ? -
  let ftsQuery = query.replace(/[(){}[\]^~"\\*:?-]/g, ' ');

  // Split into words and filter empty ones
  const words = ftsQuery.split(/\s+/).filter(w => w.length > 0);

  if (words.length === 0) {
    return '';
  }

  // Join words with OR for broader matching
  // This finds documents matching any of the words
  return words.map(w => `${w}*`).join(' OR ');
}

/**
 * Main hybrid search function
 * Combines vector and text search with RRF
 */
export async function hybridSearch(
  query: string,
  options: HybridSearchOptions = {}
): Promise<HybridSearchResponse> {
  const startTime = Date.now();
  const topK = options.topK ?? 10;
  const minScore = options.minScore ?? 0;

  // Fetch more results than needed for fusion
  const fetchCount = topK * 2;

  // Run both searches in parallel
  const [vectorResults, textResults] = await Promise.all([
    vectorSearch(query, fetchCount),
    Promise.resolve(ftsSearch(query, fetchCount)),
  ]);

  // Fuse results using RRF
  let fusedResults = reciprocalRankFusion(vectorResults, textResults, options);

  // Apply minimum score filter
  if (minScore > 0) {
    fusedResults = fusedResults.filter(r => r.score >= minScore);
  }

  // Limit to topK
  fusedResults = fusedResults.slice(0, topK);

  const endTime = Date.now();

  // Calculate stats
  const hybridCount = fusedResults.filter(r => r.matchType === 'hybrid').length;

  return {
    results: fusedResults,
    stats: {
      vectorMatches: vectorResults.length,
      textMatches: textResults.length,
      hybridMatches: hybridCount,
      totalTimeMs: endTime - startTime,
    },
  };
}

/**
 * Search with fallback
 * Uses hybrid search, falls back to vector-only or text-only if one fails
 */
export async function searchWithFallback(
  query: string,
  options: HybridSearchOptions = {}
): Promise<HybridSearchResponse> {
  const startTime = Date.now();
  const topK = options.topK ?? 10;

  try {
    return await hybridSearch(query, options);
  } catch (error) {
    console.error('Hybrid search failed, attempting fallback:', error);

    // Try vector-only
    try {
      const vectorResults = await vectorSearch(query, topK);
      return {
        results: vectorResults.slice(0, topK),
        stats: {
          vectorMatches: vectorResults.length,
          textMatches: 0,
          hybridMatches: 0,
          totalTimeMs: Date.now() - startTime,
        },
      };
    } catch {
      // Try text-only
      const textResults = ftsSearch(query, topK);
      return {
        results: textResults.slice(0, topK),
        stats: {
          vectorMatches: 0,
          textMatches: textResults.length,
          hybridMatches: 0,
          totalTimeMs: Date.now() - startTime,
        },
      };
    }
  }
}
