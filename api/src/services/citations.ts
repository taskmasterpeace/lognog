/**
 * Citations Formatter Service
 *
 * Formats search results into citations with relevance scores,
 * highlighted text, and metadata for display in the UI.
 */

import { HybridSearchResult } from './hybrid-search.js';

// Citation types
export interface CitedSource {
  id: string;
  title: string;
  relevanceScore: number;
  relevanceCategory: 'high' | 'medium' | 'low';
  matchType: 'vector' | 'text' | 'hybrid';
  excerpt: string;
  highlightedText: string;
  metadata: {
    sourceType: string;
    indexedAt?: string;
    chunkIndex?: number;
    totalChunks?: number;
  };
}

export interface CitationOptions {
  excerptLength?: number;     // Max length of excerpt
  highlightTag?: string;      // HTML tag for highlighting
  minRelevanceScore?: number; // Filter low-relevance results
}

const DEFAULT_OPTIONS: CitationOptions = {
  excerptLength: 200,
  highlightTag: 'mark',
  minRelevanceScore: 0,
};

/**
 * Calculate relevance category based on score
 */
export function getRelevanceCategory(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

/**
 * Normalize score to 0-1 range
 */
export function normalizeScore(score: number, minScore: number = 0, maxScore: number = 1): number {
  if (maxScore === minScore) return 1;
  const normalized = (score - minScore) / (maxScore - minScore);
  return Math.max(0, Math.min(1, normalized));
}

/**
 * Extract query keywords for highlighting
 */
export function extractKeywords(query: string): string[] {
  // Remove common words and extract meaningful keywords
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'up',
    'about', 'into', 'over', 'after', 'beneath', 'under', 'above',
    'and', 'or', 'but', 'not', 'if', 'then', 'else', 'when', 'where',
    'how', 'what', 'which', 'who', 'whom', 'this', 'that', 'these',
    'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your',
  ]);

  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .map(word => word.replace(/[^\w]/g, ''));
}

/**
 * Highlight keywords in text
 */
export function highlightText(
  text: string,
  keywords: string[],
  tag: string = 'mark'
): string {
  if (keywords.length === 0) return text;

  // Create regex pattern for all keywords
  const pattern = keywords
    .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) // Escape regex chars
    .join('|');

  if (!pattern) return text;

  const regex = new RegExp(`(${pattern})`, 'gi');
  return text.replace(regex, `<${tag}>$1</${tag}>`);
}

/**
 * Extract excerpt around matched keywords
 */
export function extractExcerpt(
  text: string,
  keywords: string[],
  maxLength: number = 200
): string {
  if (text.length <= maxLength) return text;

  if (keywords.length === 0) {
    return text.substring(0, maxLength) + '...';
  }

  // Find the first keyword match
  const lowerText = text.toLowerCase();
  let firstMatchIndex = -1;

  for (const keyword of keywords) {
    const index = lowerText.indexOf(keyword.toLowerCase());
    if (index !== -1 && (firstMatchIndex === -1 || index < firstMatchIndex)) {
      firstMatchIndex = index;
    }
  }

  if (firstMatchIndex === -1) {
    return text.substring(0, maxLength) + '...';
  }

  // Extract context around the match
  const contextBefore = Math.floor(maxLength / 3);
  const start = Math.max(0, firstMatchIndex - contextBefore);
  const end = Math.min(text.length, start + maxLength);

  let excerpt = text.substring(start, end);

  // Add ellipses if truncated
  if (start > 0) excerpt = '...' + excerpt;
  if (end < text.length) excerpt = excerpt + '...';

  return excerpt;
}

/**
 * Format a single search result as a citation
 */
export function formatCitation(
  result: HybridSearchResult,
  query: string,
  options: CitationOptions = {}
): CitedSource {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const keywords = extractKeywords(query);

  const excerpt = extractExcerpt(
    result.content,
    keywords,
    opts.excerptLength
  );

  const highlightedText = highlightText(
    excerpt,
    keywords,
    opts.highlightTag
  );

  // Parse metadata if it's a string
  let metadata: Record<string, unknown> = {};
  if (typeof result.metadata === 'string') {
    try {
      metadata = JSON.parse(result.metadata);
    } catch {
      metadata = {};
    }
  } else if (result.metadata) {
    metadata = result.metadata;
  }

  return {
    id: result.id,
    title: result.title,
    relevanceScore: result.score,
    relevanceCategory: getRelevanceCategory(result.score),
    matchType: result.matchType,
    excerpt,
    highlightedText,
    metadata: {
      sourceType: result.sourceType || String(metadata.sourceType || 'unknown'),
      indexedAt: metadata.indexedAt as string | undefined,
      chunkIndex: metadata.chunkIndex as number | undefined,
      totalChunks: metadata.totalChunks as number | undefined,
    },
  };
}

/**
 * Format multiple search results as citations
 */
export function formatCitations(
  results: HybridSearchResult[],
  query: string,
  options: CitationOptions = {}
): CitedSource[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Normalize scores across all results
  if (results.length > 0) {
    const scores = results.map(r => r.score);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);

    results = results.map(r => ({
      ...r,
      score: normalizeScore(r.score, minScore, maxScore),
    }));
  }

  // Format each result
  let citations = results.map(result =>
    formatCitation(result, query, opts)
  );

  // Filter by minimum relevance
  if (opts.minRelevanceScore && opts.minRelevanceScore > 0) {
    citations = citations.filter(c => c.relevanceScore >= opts.minRelevanceScore!);
  }

  return citations;
}

/**
 * Group citations by source type
 */
export function groupBySourceType(citations: CitedSource[]): Record<string, CitedSource[]> {
  const groups: Record<string, CitedSource[]> = {};

  for (const citation of citations) {
    const sourceType = citation.metadata.sourceType || 'unknown';
    if (!groups[sourceType]) {
      groups[sourceType] = [];
    }
    groups[sourceType].push(citation);
  }

  return groups;
}

/**
 * Sort citations by relevance score
 */
export function sortByRelevance(citations: CitedSource[]): CitedSource[] {
  return [...citations].sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * Get top N citations
 */
export function getTopCitations(citations: CitedSource[], n: number = 5): CitedSource[] {
  return sortByRelevance(citations).slice(0, n);
}

/**
 * Calculate citation statistics
 */
export function getCitationStats(citations: CitedSource[]): {
  total: number;
  byCategory: Record<string, number>;
  byMatchType: Record<string, number>;
  avgRelevance: number;
} {
  const byCategory: Record<string, number> = { high: 0, medium: 0, low: 0 };
  const byMatchType: Record<string, number> = { vector: 0, text: 0, hybrid: 0 };
  let totalRelevance = 0;

  for (const citation of citations) {
    byCategory[citation.relevanceCategory]++;
    byMatchType[citation.matchType]++;
    totalRelevance += citation.relevanceScore;
  }

  return {
    total: citations.length,
    byCategory,
    byMatchType,
    avgRelevance: citations.length > 0 ? totalRelevance / citations.length : 0,
  };
}
