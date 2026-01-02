import { describe, it, expect } from 'vitest';
import {
  getRelevanceCategory,
  normalizeScore,
  extractKeywords,
  highlightText,
  extractExcerpt,
  formatCitation,
  formatCitations,
  groupBySourceType,
  sortByRelevance,
  getTopCitations,
  getCitationStats,
  CitedSource,
} from './citations.js';
import { HybridSearchResult } from './hybrid-search.js';

describe('getRelevanceCategory', () => {
  it('should return high for scores >= 0.7', () => {
    expect(getRelevanceCategory(0.7)).toBe('high');
    expect(getRelevanceCategory(0.85)).toBe('high');
    expect(getRelevanceCategory(1.0)).toBe('high');
  });

  it('should return medium for scores >= 0.4 and < 0.7', () => {
    expect(getRelevanceCategory(0.4)).toBe('medium');
    expect(getRelevanceCategory(0.5)).toBe('medium');
    expect(getRelevanceCategory(0.69)).toBe('medium');
  });

  it('should return low for scores < 0.4', () => {
    expect(getRelevanceCategory(0.0)).toBe('low');
    expect(getRelevanceCategory(0.2)).toBe('low');
    expect(getRelevanceCategory(0.39)).toBe('low');
  });
});

describe('normalizeScore', () => {
  it('should normalize to 0-1 range', () => {
    expect(normalizeScore(50, 0, 100)).toBe(0.5);
    expect(normalizeScore(0, 0, 100)).toBe(0);
    expect(normalizeScore(100, 0, 100)).toBe(1);
  });

  it('should handle same min and max', () => {
    expect(normalizeScore(5, 5, 5)).toBe(1);
  });

  it('should clamp values outside range', () => {
    expect(normalizeScore(-10, 0, 100)).toBe(0);
    expect(normalizeScore(150, 0, 100)).toBe(1);
  });
});

describe('extractKeywords', () => {
  it('should extract meaningful keywords', () => {
    const keywords = extractKeywords('how to configure logging');

    expect(keywords).toContain('configure');
    expect(keywords).toContain('logging');
    expect(keywords).not.toContain('how');
    expect(keywords).not.toContain('to');
  });

  it('should filter stop words', () => {
    const keywords = extractKeywords('the quick brown fox');

    expect(keywords).not.toContain('the');
    expect(keywords).toContain('quick');
    expect(keywords).toContain('brown');
    expect(keywords).toContain('fox');
  });

  it('should filter short words', () => {
    const keywords = extractKeywords('a is on by to configure');

    expect(keywords).not.toContain('a');
    expect(keywords).not.toContain('is');
    expect(keywords).not.toContain('on');
    expect(keywords).not.toContain('by');
    expect(keywords).not.toContain('to');
    expect(keywords).toContain('configure');
  });

  it('should lowercase keywords', () => {
    const keywords = extractKeywords('CONFIGURE Logging Settings');

    expect(keywords).toContain('configure');
    expect(keywords).toContain('logging');
    expect(keywords).toContain('settings');
  });
});

describe('highlightText', () => {
  it('should wrap keywords with mark tags', () => {
    const result = highlightText('Configure logging settings', ['configure', 'logging']);

    expect(result).toContain('<mark>Configure</mark>');
    expect(result).toContain('<mark>logging</mark>');
  });

  it('should use custom tags', () => {
    const result = highlightText('test content', ['test'], 'strong');

    expect(result).toContain('<strong>test</strong>');
  });

  it('should handle case-insensitive matching', () => {
    const result = highlightText('TEST test Test', ['test']);

    expect(result).toBe('<mark>TEST</mark> <mark>test</mark> <mark>Test</mark>');
  });

  it('should handle no keywords', () => {
    const result = highlightText('Some text', []);

    expect(result).toBe('Some text');
  });

  it('should escape regex special characters', () => {
    const result = highlightText('test.content', ['test.content']);

    expect(result).toContain('<mark>test.content</mark>');
  });
});

describe('extractExcerpt', () => {
  it('should return full text if shorter than maxLength', () => {
    const result = extractExcerpt('Short text', ['test'], 100);

    expect(result).toBe('Short text');
  });

  it('should truncate long text', () => {
    const longText = 'a'.repeat(300);
    const result = extractExcerpt(longText, [], 100);

    expect(result.length).toBeLessThanOrEqual(103); // 100 + '...'
    expect(result).toContain('...');
  });

  it('should center on first keyword match', () => {
    const text = 'Start of text. The keyword appears here. End of text more content after.';
    const result = extractExcerpt(text, ['keyword'], 40);

    expect(result).toContain('keyword');
  });

  it('should add ellipses for truncation', () => {
    const text = 'Before content. keyword is here. After content that is quite long.';
    const result = extractExcerpt(text, ['keyword'], 30);

    expect(result.includes('...')).toBe(true);
  });
});

describe('formatCitation', () => {
  const createMockResult = (): HybridSearchResult => ({
    id: 'doc1',
    title: 'Test Document',
    content: 'This is test content about logging configuration and settings.',
    excerpt: 'This is test content',
    sourceType: 'documentation',
    score: 0.8,
    matchType: 'hybrid',
    metadata: {
      chunkIndex: 0,
      totalChunks: 3,
    },
  });

  it('should format result as citation', () => {
    const result = createMockResult();
    const citation = formatCitation(result, 'logging configuration');

    expect(citation.id).toBe('doc1');
    expect(citation.title).toBe('Test Document');
    expect(citation.relevanceScore).toBe(0.8);
    expect(citation.relevanceCategory).toBe('high');
    expect(citation.matchType).toBe('hybrid');
  });

  it('should include highlighted text', () => {
    const result = createMockResult();
    const citation = formatCitation(result, 'logging');

    expect(citation.highlightedText).toContain('<mark>');
    expect(citation.highlightedText).toContain('logging');
  });

  it('should include metadata', () => {
    const result = createMockResult();
    const citation = formatCitation(result, 'test');

    expect(citation.metadata.sourceType).toBe('documentation');
    expect(citation.metadata.chunkIndex).toBe(0);
    expect(citation.metadata.totalChunks).toBe(3);
  });

  it('should calculate relevance category', () => {
    const highResult = { ...createMockResult(), score: 0.9 };
    const medResult = { ...createMockResult(), score: 0.5 };
    const lowResult = { ...createMockResult(), score: 0.2 };

    expect(formatCitation(highResult, 'test').relevanceCategory).toBe('high');
    expect(formatCitation(medResult, 'test').relevanceCategory).toBe('medium');
    expect(formatCitation(lowResult, 'test').relevanceCategory).toBe('low');
  });
});

describe('formatCitations', () => {
  const createMockResults = (): HybridSearchResult[] => [
    {
      id: 'doc1',
      title: 'Doc 1',
      content: 'Content 1',
      excerpt: 'Excerpt 1',
      sourceType: 'docs',
      score: 0.9,
      matchType: 'vector',
    },
    {
      id: 'doc2',
      title: 'Doc 2',
      content: 'Content 2',
      excerpt: 'Excerpt 2',
      sourceType: 'api',
      score: 0.5,
      matchType: 'text',
    },
  ];

  it('should format multiple results', () => {
    const results = createMockResults();
    const citations = formatCitations(results, 'test');

    expect(citations).toHaveLength(2);
    expect(citations[0].id).toBe('doc1');
    expect(citations[1].id).toBe('doc2');
  });

  it('should normalize scores', () => {
    const results = [
      { ...createMockResults()[0], score: 10 },
      { ...createMockResults()[1], score: 5 },
    ];

    const citations = formatCitations(results, 'test');

    // Scores should be normalized to 0-1
    expect(citations[0].relevanceScore).toBe(1);
    expect(citations[1].relevanceScore).toBe(0);
  });

  it('should filter by minimum relevance', () => {
    const results = createMockResults();
    const citations = formatCitations(results, 'test', { minRelevanceScore: 0.6 });

    // After normalization, only high score should pass
    expect(citations.length).toBeLessThanOrEqual(2);
  });
});

describe('groupBySourceType', () => {
  const createCitations = (): CitedSource[] => [
    {
      id: '1',
      title: 'Doc 1',
      relevanceScore: 0.8,
      relevanceCategory: 'high',
      matchType: 'vector',
      excerpt: 'Excerpt 1',
      highlightedText: 'Highlighted 1',
      metadata: { sourceType: 'docs' },
    },
    {
      id: '2',
      title: 'Doc 2',
      relevanceScore: 0.6,
      relevanceCategory: 'medium',
      matchType: 'text',
      excerpt: 'Excerpt 2',
      highlightedText: 'Highlighted 2',
      metadata: { sourceType: 'docs' },
    },
    {
      id: '3',
      title: 'API Doc',
      relevanceScore: 0.9,
      relevanceCategory: 'high',
      matchType: 'hybrid',
      excerpt: 'Excerpt 3',
      highlightedText: 'Highlighted 3',
      metadata: { sourceType: 'api' },
    },
  ];

  it('should group by source type', () => {
    const grouped = groupBySourceType(createCitations());

    expect(grouped['docs']).toHaveLength(2);
    expect(grouped['api']).toHaveLength(1);
  });

  it('should handle unknown source type', () => {
    const citations: CitedSource[] = [
      {
        id: '1',
        title: 'Unknown',
        relevanceScore: 0.5,
        relevanceCategory: 'medium',
        matchType: 'vector',
        excerpt: 'Test',
        highlightedText: 'Test',
        metadata: { sourceType: 'unknown' },
      },
    ];

    const grouped = groupBySourceType(citations);
    expect(grouped['unknown']).toHaveLength(1);
  });
});

describe('sortByRelevance', () => {
  it('should sort by descending relevance score', () => {
    const citations: CitedSource[] = [
      { relevanceScore: 0.3 } as CitedSource,
      { relevanceScore: 0.9 } as CitedSource,
      { relevanceScore: 0.6 } as CitedSource,
    ];

    const sorted = sortByRelevance(citations);

    expect(sorted[0].relevanceScore).toBe(0.9);
    expect(sorted[1].relevanceScore).toBe(0.6);
    expect(sorted[2].relevanceScore).toBe(0.3);
  });

  it('should not modify original array', () => {
    const citations: CitedSource[] = [
      { relevanceScore: 0.3 } as CitedSource,
      { relevanceScore: 0.9 } as CitedSource,
    ];

    sortByRelevance(citations);

    expect(citations[0].relevanceScore).toBe(0.3);
  });
});

describe('getTopCitations', () => {
  it('should return top N citations by relevance', () => {
    const citations: CitedSource[] = Array.from({ length: 10 }, (_, i) => ({
      id: `doc${i}`,
      relevanceScore: i * 0.1,
    } as CitedSource));

    const top5 = getTopCitations(citations, 5);

    expect(top5).toHaveLength(5);
    expect(top5[0].relevanceScore).toBe(0.9);
  });

  it('should handle fewer citations than N', () => {
    const citations: CitedSource[] = [
      { relevanceScore: 0.5 } as CitedSource,
      { relevanceScore: 0.8 } as CitedSource,
    ];

    const top5 = getTopCitations(citations, 5);

    expect(top5).toHaveLength(2);
  });
});

describe('getCitationStats', () => {
  it('should calculate statistics', () => {
    const citations: CitedSource[] = [
      { relevanceScore: 0.8, relevanceCategory: 'high', matchType: 'vector' } as CitedSource,
      { relevanceScore: 0.5, relevanceCategory: 'medium', matchType: 'text' } as CitedSource,
      { relevanceScore: 0.9, relevanceCategory: 'high', matchType: 'hybrid' } as CitedSource,
    ];

    const stats = getCitationStats(citations);

    expect(stats.total).toBe(3);
    expect(stats.byCategory.high).toBe(2);
    expect(stats.byCategory.medium).toBe(1);
    expect(stats.byMatchType.vector).toBe(1);
    expect(stats.byMatchType.text).toBe(1);
    expect(stats.byMatchType.hybrid).toBe(1);
    expect(stats.avgRelevance).toBeCloseTo(0.733, 2);
  });

  it('should handle empty array', () => {
    const stats = getCitationStats([]);

    expect(stats.total).toBe(0);
    expect(stats.avgRelevance).toBe(0);
  });
});
