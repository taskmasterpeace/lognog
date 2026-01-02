import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildRerankPrompt,
  parseScores,
  rerankWithLLM,
  simpleRerank,
} from './reranker.js';
import { HybridSearchResult } from './hybrid-search.js';

// Mock Ollama
const mockComplete = vi.fn();
vi.mock('@llamaindex/ollama', () => ({
  Ollama: vi.fn().mockImplementation(() => ({
    complete: mockComplete,
  })),
}));

describe('buildRerankPrompt', () => {
  const createMockResult = (id: string, title: string, content: string): HybridSearchResult => ({
    id,
    title,
    content,
    excerpt: content.substring(0, 100),
    sourceType: 'test',
    score: 0.5,
    matchType: 'hybrid',
  });

  it('should build a prompt with query and documents', () => {
    const query = 'how to configure logging';
    const documents = [
      createMockResult('doc1', 'Logging Configuration', 'Configure logging with the config file'),
      createMockResult('doc2', 'Error Handling', 'Handle errors in your application'),
    ];

    const prompt = buildRerankPrompt(query, documents);

    expect(prompt).toContain('how to configure logging');
    expect(prompt).toContain('Logging Configuration');
    expect(prompt).toContain('Error Handling');
    expect(prompt).toContain('[1]');
    expect(prompt).toContain('[2]');
  });

  it('should include instructions for JSON array response', () => {
    const prompt = buildRerankPrompt('test', [
      createMockResult('doc1', 'Test', 'Content'),
    ]);

    expect(prompt).toContain('JSON array');
    expect(prompt).toContain('1-10');
  });

  it('should specify the expected number of scores', () => {
    const documents = [
      createMockResult('doc1', 'Doc 1', 'Content 1'),
      createMockResult('doc2', 'Doc 2', 'Content 2'),
      createMockResult('doc3', 'Doc 3', 'Content 3'),
    ];

    const prompt = buildRerankPrompt('test', documents);

    expect(prompt).toContain('exactly 3 numbers');
  });
});

describe('parseScores', () => {
  it('should parse valid JSON array of scores', () => {
    const response = '[8, 5, 9, 3, 7]';
    const scores = parseScores(response, 5);

    expect(scores).toEqual([8, 5, 9, 3, 7]);
  });

  it('should extract JSON from text with surrounding content', () => {
    const response = 'Here are the scores: [8, 5, 9] based on my analysis.';
    const scores = parseScores(response, 3);

    expect(scores).toEqual([8, 5, 9]);
  });

  it('should return null for wrong number of scores', () => {
    const response = '[8, 5, 9]';
    const scores = parseScores(response, 5);

    expect(scores).toBeNull();
  });

  it('should return null for invalid JSON', () => {
    const response = 'I cannot provide scores';
    const scores = parseScores(response, 3);

    expect(scores).toBeNull();
  });

  it('should clamp scores to 1-10 range', () => {
    const response = '[0, 15, 5]';
    const scores = parseScores(response, 3);

    expect(scores).toEqual([1, 10, 5]);
  });

  it('should reject non-numeric array format', () => {
    // parseScores only accepts numeric arrays like [8, 5, 9]
    // String format like ["8", "5", "9"] is not matched by the regex
    const response = '["8", "5", "9"]';
    const scores = parseScores(response, 3);

    expect(scores).toBeNull();
  });

  it('should reject arrays with non-numeric values', () => {
    // Mixed arrays with strings don't match the numeric regex
    const response = '[8, "invalid", 9]';
    const scores = parseScores(response, 3);

    expect(scores).toBeNull();
  });

  it('should handle whitespace in arrays', () => {
    const response = '[ 8 , 5 , 9 ]';
    const scores = parseScores(response, 3);

    expect(scores).toEqual([8, 5, 9]);
  });
});

describe('rerankWithLLM', () => {
  const createMockResult = (id: string, score: number): HybridSearchResult => ({
    id,
    title: `Document ${id}`,
    content: `Content for ${id}`,
    excerpt: `Excerpt for ${id}`,
    sourceType: 'test',
    score,
    matchType: 'hybrid',
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty results for empty input', async () => {
    const result = await rerankWithLLM('test query', []);

    expect(result.results).toEqual([]);
    expect(result.reranked).toBe(false);
  });

  it('should return single document without reranking', async () => {
    const docs = [createMockResult('doc1', 0.8)];
    const result = await rerankWithLLM('test query', docs);

    expect(result.results).toHaveLength(1);
    expect(result.reranked).toBe(false);
  });

  it('should handle LLM timeout gracefully', async () => {
    // Mock slow response
    mockComplete.mockImplementation(() =>
      new Promise((resolve) => setTimeout(() => resolve({ text: '[8, 5]' }), 20000))
    );

    const docs = [
      createMockResult('doc1', 0.8),
      createMockResult('doc2', 0.6),
    ];

    // Use short timeout
    const result = await rerankWithLLM('test query', docs, { timeout: 10 });

    expect(result.reranked).toBe(false);
    expect(result.error).toContain('timeout');
  });

  it('should preserve original scores when requested', async () => {
    mockComplete.mockResolvedValue({ text: '[9, 3]' });

    const docs = [
      createMockResult('doc1', 0.8),
      createMockResult('doc2', 0.6),
    ];

    const result = await rerankWithLLM('test query', docs, { preserveScores: true });

    // Original scores should be preserved
    expect(result.results[0].score).toBe(0.8);
    expect(result.results[1].score).toBe(0.6);
  });

  it('should limit to topK after reranking', async () => {
    mockComplete.mockResolvedValue({ text: '[9, 8, 7, 6, 5]' });

    const docs = Array.from({ length: 5 }, (_, i) =>
      createMockResult(`doc${i}`, 0.5)
    );

    const result = await rerankWithLLM('test query', docs, { topK: 3 });

    expect(result.results).toHaveLength(3);
  });
});

describe('simpleRerank', () => {
  const createMockResult = (id: string, title: string, content: string): HybridSearchResult => ({
    id,
    title,
    content,
    excerpt: content.substring(0, 100),
    sourceType: 'test',
    score: 0.5,
    matchType: 'hybrid',
  });

  it('should reorder documents by keyword match', () => {
    const docs = [
      createMockResult('doc1', 'Unrelated', 'Something completely different'),
      createMockResult('doc2', 'Logging', 'Configure logging settings'),
      createMockResult('doc3', 'Config', 'Configuration for logging'),
    ];

    const result = simpleRerank('logging configuration', docs);

    // Documents with more keyword matches should rank higher
    expect(result[0].id).toBe('doc3'); // Has both 'logging' and 'configuration'
    expect(result[1].id).toBe('doc2'); // Has 'logging' and 'configure' (partial)
  });

  it('should respect topK limit', () => {
    const docs = Array.from({ length: 10 }, (_, i) =>
      createMockResult(`doc${i}`, `Title ${i}`, `Content ${i}`)
    );

    const result = simpleRerank('test', docs, 3);

    expect(result).toHaveLength(3);
  });

  it('should handle empty query', () => {
    const docs = [
      createMockResult('doc1', 'Title', 'Content'),
    ];

    const result = simpleRerank('', docs);

    expect(result).toHaveLength(1);
  });

  it('should handle short query words (< 3 chars filtered)', () => {
    const docs = [
      createMockResult('doc1', 'A B', 'This is content'),
      createMockResult('doc2', 'Testing', 'Testing content here'),
    ];

    // Short words like 'a' and 'b' should be filtered
    const result = simpleRerank('a b testing', docs);

    // 'testing' matches doc2
    expect(result[0].id).toBe('doc2');
  });

  it('should blend original score with keyword match', () => {
    const docs = [
      { ...createMockResult('doc1', 'No Match', 'Different content'), score: 0.9 },
      { ...createMockResult('doc2', 'Match', 'Query word here'), score: 0.3 },
    ];

    const result = simpleRerank('word', docs);

    // Both original score and keyword match should influence final score
    // doc1: 0.9 * 0.5 + 0 * 0.5 = 0.45
    // doc2: 0.3 * 0.5 + 1 * 0.5 = 0.65
    expect(result[0].id).toBe('doc2');
  });
});
