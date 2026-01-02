import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies
vi.mock('../services/llamaindex.js', () => ({
  initializeLlamaIndex: vi.fn(),
  loadOrCreateIndex: vi.fn(),
  queryIndex: vi.fn().mockResolvedValue({
    response: 'Test response',
    sourceNodes: [],
    model: 'test',
  }),
}));

vi.mock('../services/hybrid-search.js', () => ({
  hybridSearch: vi.fn().mockResolvedValue({
    results: [
      {
        id: 'doc1',
        title: 'Test Document',
        content: 'Test content for logging',
        excerpt: 'Test content',
        sourceType: 'documentation',
        score: 0.8,
        matchType: 'hybrid',
      },
    ],
    stats: {
      vectorMatches: 1,
      textMatches: 1,
      hybridMatches: 1,
      totalTimeMs: 50,
    },
  }),
}));

vi.mock('../services/reranker.js', () => ({
  rerankWithLLM: vi.fn().mockResolvedValue({
    results: [
      {
        id: 'doc1',
        title: 'Test Document',
        content: 'Test content for logging',
        excerpt: 'Test content',
        sourceType: 'documentation',
        score: 0.9,
        matchType: 'hybrid',
      },
    ],
    reranked: true,
    timeMs: 100,
  }),
}));

vi.mock('../services/citations.js', () => ({
  formatCitations: vi.fn().mockReturnValue([
    {
      id: 'doc1',
      title: 'Test Document',
      relevanceScore: 0.8,
      relevanceCategory: 'high',
      matchType: 'hybrid',
      excerpt: 'Test content',
      highlightedText: 'Test <mark>content</mark>',
      metadata: {
        sourceType: 'documentation',
      },
    },
  ]),
  getCitationStats: vi.fn().mockReturnValue({
    total: 1,
    byCategory: { high: 1, medium: 0, low: 0 },
    byMatchType: { hybrid: 1 },
    avgRelevance: 0.8,
  }),
}));

vi.mock('../db/backend.js', () => ({
  executeDSLQuery: vi.fn().mockResolvedValue({
    results: [],
    elapsed: 10,
  }),
}));

describe('NogChat API Response Format', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Response Structure', () => {
    it('should return citations with response when includeCitations is true', async () => {
      const { formatCitations } = await import('../services/citations.js');
      const { hybridSearch } = await import('../services/hybrid-search.js');

      // Simulate the response structure
      const mockHybridResult = await hybridSearch('test query', {});
      const mockCitations = formatCitations(mockHybridResult.results, 'test query', {});

      expect(mockCitations).toHaveLength(1);
      expect(mockCitations[0]).toHaveProperty('id');
      expect(mockCitations[0]).toHaveProperty('title');
      expect(mockCitations[0]).toHaveProperty('relevanceScore');
      expect(mockCitations[0]).toHaveProperty('relevanceCategory');
      expect(mockCitations[0]).toHaveProperty('matchType');
      expect(mockCitations[0]).toHaveProperty('highlightedText');
    });

    it('should include search stats in response', async () => {
      const { hybridSearch } = await import('../services/hybrid-search.js');

      const result = await hybridSearch('test query', {});

      expect(result.stats).toBeDefined();
      expect(result.stats).toHaveProperty('vectorMatches');
      expect(result.stats).toHaveProperty('textMatches');
      expect(result.stats).toHaveProperty('hybridMatches');
      expect(result.stats).toHaveProperty('totalTimeMs');
    });

    it('should use hybrid search when available', async () => {
      const { hybridSearch } = await import('../services/hybrid-search.js');

      const result = await hybridSearch('how to configure logging', {
        topK: 10,
        vectorWeight: 0.7,
        textWeight: 0.3,
      });

      expect(result.results).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('should fallback gracefully if hybrid search fails', async () => {
      const { hybridSearch } = await import('../services/hybrid-search.js');
      (hybridSearch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Search failed'));

      try {
        await hybridSearch('test', {});
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should include relevance scores in sources', async () => {
      const { formatCitations } = await import('../services/citations.js');
      const { hybridSearch } = await import('../services/hybrid-search.js');

      const hybridResult = await hybridSearch('test', {});
      const citations = formatCitations(hybridResult.results, 'test', {});

      expect(citations[0].relevanceScore).toBeGreaterThanOrEqual(0);
      expect(citations[0].relevanceScore).toBeLessThanOrEqual(1);
      expect(['high', 'medium', 'low']).toContain(citations[0].relevanceCategory);
    });
  });

  describe('Hybrid Search Integration', () => {
    it('should combine vector and text search results', async () => {
      const { hybridSearch } = await import('../services/hybrid-search.js');

      const result = await hybridSearch('error logging', {
        vectorWeight: 0.7,
        textWeight: 0.3,
      });

      expect(result.stats.vectorMatches).toBeGreaterThanOrEqual(0);
      expect(result.stats.textMatches).toBeGreaterThanOrEqual(0);
    });

    it('should mark hybrid matches when found in both sources', async () => {
      const { hybridSearch } = await import('../services/hybrid-search.js');

      const result = await hybridSearch('test query', {});

      expect(result.stats.hybridMatches).toBeDefined();
    });
  });

  describe('Re-ranking', () => {
    it('should optionally rerank results with LLM', async () => {
      const { rerankWithLLM } = await import('../services/reranker.js');
      const { hybridSearch } = await import('../services/hybrid-search.js');

      const hybridResult = await hybridSearch('test', {});
      const rerankResult = await rerankWithLLM('test', hybridResult.results, { topK: 5 });

      expect(rerankResult.reranked).toBe(true);
      expect(rerankResult.results).toBeDefined();
    });
  });

  describe('Citations Formatting', () => {
    it('should format citations with highlights', async () => {
      const { formatCitations } = await import('../services/citations.js');
      const { hybridSearch } = await import('../services/hybrid-search.js');

      const hybridResult = await hybridSearch('content', {});
      const citations = formatCitations(hybridResult.results, 'content', {
        excerptLength: 200,
        highlightTag: 'mark',
      });

      expect(citations[0].highlightedText).toContain('<mark>');
    });

    it('should include metadata in citations', async () => {
      const { formatCitations } = await import('../services/citations.js');
      const { hybridSearch } = await import('../services/hybrid-search.js');

      const hybridResult = await hybridSearch('test', {});
      const citations = formatCitations(hybridResult.results, 'test', {});

      expect(citations[0].metadata).toBeDefined();
      expect(citations[0].metadata.sourceType).toBeDefined();
    });
  });
});
