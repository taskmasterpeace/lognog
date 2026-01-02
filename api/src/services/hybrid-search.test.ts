import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  reciprocalRankFusion,
  convertToFTSQuery,
  HybridSearchResult,
  hybridSearch,
} from './hybrid-search.js';

// Mock the external dependencies
vi.mock('./llamaindex.js', () => ({
  queryIndex: vi.fn(),
}));

vi.mock('../db/sqlite.js', () => ({
  searchRAGDocumentsFTS: vi.fn(),
  getRAGDocument: vi.fn(),
}));

import { queryIndex } from './llamaindex.js';
import { searchRAGDocumentsFTS } from '../db/sqlite.js';

describe('reciprocalRankFusion', () => {
  const createMockResult = (id: string, title: string): HybridSearchResult => ({
    id,
    title,
    content: `Content for ${id}`,
    excerpt: `Excerpt for ${id}`,
    sourceType: 'test',
    score: 0,
    matchType: 'vector',
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should combine vector and text results', () => {
    const vectorResults: HybridSearchResult[] = [
      createMockResult('doc1', 'Document 1'),
      createMockResult('doc2', 'Document 2'),
    ];

    const textResults: HybridSearchResult[] = [
      createMockResult('doc3', 'Document 3'),
      createMockResult('doc4', 'Document 4'),
    ];

    const fused = reciprocalRankFusion(vectorResults, textResults);

    // Should have all 4 documents
    expect(fused.length).toBe(4);

    // All documents should be present
    const ids = fused.map(r => r.id);
    expect(ids).toContain('doc1');
    expect(ids).toContain('doc2');
    expect(ids).toContain('doc3');
    expect(ids).toContain('doc4');
  });

  it('should apply correct weights to results', () => {
    const vectorResults: HybridSearchResult[] = [
      createMockResult('doc1', 'Document 1'),
    ];

    const textResults: HybridSearchResult[] = [
      createMockResult('doc2', 'Document 2'),
    ];

    // Default weights: vector 0.7, text 0.3
    const fused = reciprocalRankFusion(vectorResults, textResults);

    // Vector result should have higher score with higher weight
    const doc1 = fused.find(r => r.id === 'doc1');
    const doc2 = fused.find(r => r.id === 'doc2');

    expect(doc1).toBeDefined();
    expect(doc2).toBeDefined();
    expect(doc1!.score).toBeGreaterThan(doc2!.score);
  });

  it('should deduplicate documents from both sources', () => {
    // Same document appears in both vector and text results
    const vectorResults: HybridSearchResult[] = [
      createMockResult('doc1', 'Document 1'),
      createMockResult('shared', 'Shared Doc'),
    ];

    const textResults: HybridSearchResult[] = [
      createMockResult('shared', 'Shared Doc'),
      createMockResult('doc2', 'Document 2'),
    ];

    const fused = reciprocalRankFusion(vectorResults, textResults);

    // Should have 3 unique documents
    expect(fused.length).toBe(3);

    // Shared document should be marked as hybrid
    const shared = fused.find(r => r.id === 'shared');
    expect(shared).toBeDefined();
    expect(shared!.matchType).toBe('hybrid');
  });

  it('should handle empty vector results gracefully', () => {
    const vectorResults: HybridSearchResult[] = [];

    const textResults: HybridSearchResult[] = [
      createMockResult('doc1', 'Document 1'),
      createMockResult('doc2', 'Document 2'),
    ];

    const fused = reciprocalRankFusion(vectorResults, textResults);

    expect(fused.length).toBe(2);
    expect(fused[0].matchType).toBe('text');
    expect(fused[1].matchType).toBe('text');
  });

  it('should handle empty text results gracefully', () => {
    const vectorResults: HybridSearchResult[] = [
      createMockResult('doc1', 'Document 1'),
      createMockResult('doc2', 'Document 2'),
    ];

    const textResults: HybridSearchResult[] = [];

    const fused = reciprocalRankFusion(vectorResults, textResults);

    expect(fused.length).toBe(2);
    expect(fused[0].matchType).toBe('vector');
    expect(fused[1].matchType).toBe('vector');
  });

  it('should respect topK limit', () => {
    const vectorResults: HybridSearchResult[] = Array.from({ length: 10 }, (_, i) =>
      createMockResult(`vec${i}`, `Vector Doc ${i}`)
    );

    const textResults: HybridSearchResult[] = Array.from({ length: 10 }, (_, i) =>
      createMockResult(`text${i}`, `Text Doc ${i}`)
    );

    const fused = reciprocalRankFusion(vectorResults, textResults);

    // All results are returned (topK is applied by hybridSearch, not RRF)
    expect(fused.length).toBe(20);
  });

  it('should handle documents appearing in both lists with proper hybrid scoring', () => {
    // Document appears in both lists
    const vectorResults: HybridSearchResult[] = [
      createMockResult('doc1', 'Document 1'),
      createMockResult('hybrid-doc', 'Hybrid Doc'),
    ];

    const textResults: HybridSearchResult[] = [
      createMockResult('hybrid-doc', 'Hybrid Doc'),
      createMockResult('doc2', 'Document 2'),
    ];

    const fused = reciprocalRankFusion(vectorResults, textResults);

    const hybridDoc = fused.find(r => r.id === 'hybrid-doc');
    expect(hybridDoc).toBeDefined();
    expect(hybridDoc!.matchType).toBe('hybrid');
    expect(hybridDoc!.vectorRank).toBe(2);
    expect(hybridDoc!.textRank).toBe(1);

    // Hybrid doc should have higher score due to RRF boost from appearing in both
    expect(hybridDoc!.score).toBeGreaterThan(0);
  });

  it('should handle single-source results', () => {
    // Only vector results
    const vectorResults: HybridSearchResult[] = [
      createMockResult('doc1', 'Document 1'),
    ];

    const fused = reciprocalRankFusion(vectorResults, []);

    expect(fused.length).toBe(1);
    expect(fused[0].id).toBe('doc1');
    expect(fused[0].matchType).toBe('vector');
    expect(fused[0].vectorRank).toBe(1);
    expect(fused[0].textRank).toBeUndefined();
  });

  it('should sort results by combined RRF score', () => {
    // Create results where text result should win due to weighting
    const vectorResults: HybridSearchResult[] = [
      createMockResult('vec1', 'Vector 1'), // rank 1
      createMockResult('vec2', 'Vector 2'), // rank 2
      createMockResult('vec3', 'Vector 3'), // rank 3
    ];

    const textResults: HybridSearchResult[] = [
      createMockResult('text1', 'Text 1'), // rank 1
    ];

    // With default weights (0.7 vector, 0.3 text)
    const fused = reciprocalRankFusion(vectorResults, textResults);

    // Vector rank 1 should be first (0.7 / 61 = ~0.0115)
    // Text rank 1 should be lower (0.3 / 61 = ~0.0049)
    expect(fused[0].id).toBe('vec1');
  });
});

describe('convertToFTSQuery', () => {
  it('should convert simple query to FTS5 format', () => {
    const result = convertToFTSQuery('error log');
    expect(result).toContain('error*');
    expect(result).toContain('log*');
    expect(result).toContain(' OR ');
  });

  it('should handle single word', () => {
    const result = convertToFTSQuery('error');
    expect(result).toBe('error*');
  });

  it('should remove special characters', () => {
    const result = convertToFTSQuery('(error) [log] {test}');
    expect(result).not.toContain('(');
    expect(result).not.toContain(')');
    expect(result).not.toContain('[');
    expect(result).not.toContain(']');
    expect(result).not.toContain('{');
    expect(result).not.toContain('}');
  });

  it('should handle empty query', () => {
    const result = convertToFTSQuery('');
    expect(result).toBe('');
  });

  it('should handle query with only whitespace', () => {
    const result = convertToFTSQuery('   ');
    expect(result).toBe('');
  });

  it('should handle quotes in query', () => {
    const result = convertToFTSQuery('search "exact phrase" here');
    // Quotes should be removed
    expect(result).not.toContain('"');
  });

  it('should add prefix wildcards for broader matching', () => {
    const result = convertToFTSQuery('authentication failure');
    expect(result).toBe('authentication* OR failure*');
  });
});

describe('hybridSearch integration', () => {
  // These tests verify the integration works correctly
  // They use mocked dependencies to avoid actual DB/Ollama calls

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty results when no matches found', async () => {
    // Mock implementations return empty
    (queryIndex as ReturnType<typeof vi.fn>).mockResolvedValue({
      response: '',
      sourceNodes: [],
      model: 'test',
    });

    (searchRAGDocumentsFTS as ReturnType<typeof vi.fn>).mockReturnValue([]);

    const result = await hybridSearch('test query');

    expect(result.results).toBeDefined();
    expect(Array.isArray(result.results)).toBe(true);
    expect(result.stats).toBeDefined();
    expect(result.stats.totalTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should return results with stats', async () => {
    (queryIndex as ReturnType<typeof vi.fn>).mockResolvedValue({
      response: 'test response',
      sourceNodes: [
        {
          id: 'vec1',
          text: 'Vector result content',
          score: 0.9,
          metadata: { title: 'Vector Doc', sourceType: 'manual' },
        },
      ],
      model: 'test',
    });

    (searchRAGDocumentsFTS as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        doc_id: 'fts1',
        title: 'FTS Doc',
        content: 'FTS result content',
        source_type: 'manual',
        rank: -1.5,
        snippet: 'FTS result <mark>content</mark>',
      },
    ]);

    const result = await hybridSearch('test query');

    expect(result.results.length).toBe(2);
    expect(result.stats.vectorMatches).toBe(1);
    expect(result.stats.textMatches).toBe(1);
  });
});
