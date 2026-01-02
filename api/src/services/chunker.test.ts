import { describe, it, expect } from 'vitest';
import {
  isCodeBlock,
  isHeader,
  splitBySentence,
  splitByParagraph,
  semanticChunk,
  recursiveChunk,
  mergeSmallChunks,
  addOverlap,
  smartChunk,
  Chunk,
} from './chunker.js';

describe('isCodeBlock', () => {
  it('should detect fenced code blocks with backticks', () => {
    expect(isCodeBlock('```javascript\ncode\n```')).toBe(true);
  });

  it('should detect fenced code blocks with tildes', () => {
    expect(isCodeBlock('~~~python\ncode\n~~~')).toBe(true);
  });

  it('should detect indented code blocks', () => {
    expect(isCodeBlock('    const x = 1;')).toBe(true);
    expect(isCodeBlock('\tconst x = 1;')).toBe(true);
  });

  it('should not detect regular text', () => {
    expect(isCodeBlock('This is regular text')).toBe(false);
  });
});

describe('isHeader', () => {
  it('should detect markdown headers', () => {
    expect(isHeader('# Header 1')).toBe(true);
    expect(isHeader('## Header 2')).toBe(true);
    expect(isHeader('### Header 3')).toBe(true);
    expect(isHeader('#### Header 4')).toBe(true);
    expect(isHeader('##### Header 5')).toBe(true);
    expect(isHeader('###### Header 6')).toBe(true);
  });

  it('should not detect non-headers', () => {
    expect(isHeader('Regular text')).toBe(false);
    expect(isHeader('#hashtag')).toBe(false);
    expect(isHeader('####### Not a header')).toBe(false);
  });

  it('should handle whitespace', () => {
    expect(isHeader('  # Header with leading space')).toBe(true);
    expect(isHeader('  ## Header')).toBe(true);
  });
});

describe('splitBySentence', () => {
  it('should split on sentence-ending punctuation', () => {
    const text = 'First sentence. Second sentence! Third sentence?';
    const sentences = splitBySentence(text);

    expect(sentences).toHaveLength(3);
    expect(sentences[0]).toBe('First sentence.');
    expect(sentences[1]).toBe('Second sentence!');
    expect(sentences[2]).toBe('Third sentence?');
  });

  it('should handle single sentence', () => {
    const sentences = splitBySentence('Just one sentence.');
    expect(sentences).toHaveLength(1);
  });

  it('should filter empty segments', () => {
    const sentences = splitBySentence('First.   Second.');
    expect(sentences).toHaveLength(2);
  });
});

describe('splitByParagraph', () => {
  it('should split on double newlines', () => {
    const text = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.';
    const paragraphs = splitByParagraph(text);

    expect(paragraphs).toHaveLength(3);
  });

  it('should handle extra whitespace', () => {
    const text = 'Paragraph one.\n\n\n\nParagraph two.';
    const paragraphs = splitByParagraph(text);

    expect(paragraphs).toHaveLength(2);
  });

  it('should filter empty paragraphs', () => {
    const text = 'Content.\n\n\n\n';
    const paragraphs = splitByParagraph(text);

    expect(paragraphs).toHaveLength(1);
  });
});

describe('semanticChunk', () => {
  it('should split on paragraph boundaries', () => {
    const text = `First paragraph with some content.

Second paragraph with more content.

Third paragraph with even more content.`;

    const chunks = semanticChunk(text, { maxSize: 100, minSize: 10 });

    expect(chunks.length).toBeGreaterThan(0);
    chunks.forEach(chunk => {
      expect(chunk.content.length).toBeGreaterThan(0);
    });
  });

  it('should maintain sentence integrity', () => {
    const text = 'This is a complete sentence. This is another sentence.';
    const chunks = semanticChunk(text, { maxSize: 500, minSize: 10 });

    // Sentences should not be split mid-word
    chunks.forEach(chunk => {
      expect(chunk.content).not.toMatch(/\s$/);
    });
  });

  it('should add overlap between chunks', () => {
    const text = `# Section 1

This is the first section with content.

# Section 2

This is the second section with content.`;

    const chunks = semanticChunk(text, { maxSize: 50, overlap: 20, minSize: 10 });

    // With overlap enabled, later chunks should have overlap metadata
    const hasOverlap = chunks.some(c => c.metadata.overlapPrevious);
    expect(hasOverlap || chunks.length <= 1).toBe(true);
  });

  it('should handle code blocks specially', () => {
    const text = `Introduction text.

\`\`\`javascript
const code = 'example';
function test() {}
\`\`\`

More text after code.`;

    const chunks = semanticChunk(text, { preserveCodeBlocks: true, maxSize: 500 });

    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should handle markdown headers', () => {
    const text = `# Main Header

Introduction paragraph.

## Sub Header

Sub section content.`;

    const chunks = semanticChunk(text, { preserveHeaders: true, maxSize: 100, minSize: 10 });

    // Headers should be included in chunks
    const hasHeader = chunks.some(c => c.content.includes('#'));
    expect(hasHeader).toBe(true);
  });
});

describe('recursiveChunk', () => {
  it('should try separators in order', () => {
    const text = `## Section 1

Content for section 1.

## Section 2

Content for section 2.`;

    const chunks = recursiveChunk(text, 50);

    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should fall back to character split', () => {
    const longWord = 'a'.repeat(200);
    const chunks = recursiveChunk(longWord, 50);

    // Should split the long word into smaller chunks
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach(chunk => {
      expect(chunk.content.length).toBeLessThanOrEqual(50);
    });
  });

  it('should respect maxSize limit', () => {
    const text = `This is a paragraph with multiple sentences. It has some content.

Another paragraph here. With more content. And even more.

A third paragraph for good measure. Some final content.`;

    const maxSize = 100;
    const chunks = recursiveChunk(text, maxSize);

    chunks.forEach(chunk => {
      expect(chunk.content.length).toBeLessThanOrEqual(maxSize);
    });
  });

  it('should handle empty text', () => {
    const chunks = recursiveChunk('', 100);
    expect(chunks).toHaveLength(0);
  });

  it('should handle text shorter than maxSize', () => {
    const text = 'Short text';
    const chunks = recursiveChunk(text, 1000);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('Short text');
  });
});

describe('mergeSmallChunks', () => {
  const createChunk = (content: string, index: number): Chunk => ({
    id: `chunk_${index}`,
    content,
    index,
    metadata: {
      startOffset: 0,
      endOffset: content.length,
      isCode: false,
      isHeader: false,
      overlapPrevious: false,
    },
  });

  it('should merge chunks smaller than minSize', () => {
    const chunks = [
      createChunk('Small', 0),
      createChunk('Chunks', 1),
      createChunk('Here', 2),
    ];

    const merged = mergeSmallChunks(chunks, 100);

    // All small chunks should be merged
    expect(merged.length).toBeLessThan(chunks.length);
  });

  it('should preserve large chunks', () => {
    const largeContent = 'a'.repeat(200);
    const chunks = [
      createChunk(largeContent, 0),
      createChunk('Small', 1),
    ];

    const merged = mergeSmallChunks(chunks, 100);

    // Large chunk should not be merged with small
    expect(merged[0].content.length).toBeGreaterThanOrEqual(200);
  });

  it('should re-index chunks after merging', () => {
    const chunks = [
      createChunk('One', 0),
      createChunk('Two', 1),
      createChunk('Three', 2),
    ];

    const merged = mergeSmallChunks(chunks, 100);

    merged.forEach((chunk, i) => {
      expect(chunk.index).toBe(i);
    });
  });

  it('should handle single chunk', () => {
    const chunks = [createChunk('Single', 0)];
    const merged = mergeSmallChunks(chunks, 100);

    expect(merged).toHaveLength(1);
  });
});

describe('addOverlap', () => {
  const createChunk = (content: string, index: number): Chunk => ({
    id: `chunk_${index}`,
    content,
    index,
    metadata: {
      startOffset: index * 100,
      endOffset: (index + 1) * 100,
      isCode: false,
      isHeader: false,
      overlapPrevious: false,
    },
  });

  it('should add content from previous chunk', () => {
    const chunks = [
      createChunk('First chunk content here', 0),
      createChunk('Second chunk content', 1),
    ];

    const withOverlap = addOverlap(chunks, 10);

    // Second chunk should contain overlap from first
    expect(withOverlap[1].content).toContain('here');
    expect(withOverlap[1].metadata.overlapPrevious).toBe(true);
  });

  it('should not modify first chunk', () => {
    const chunks = [
      createChunk('First chunk', 0),
      createChunk('Second chunk', 1),
    ];

    const withOverlap = addOverlap(chunks, 10);

    expect(withOverlap[0].content).toBe('First chunk');
    expect(withOverlap[0].metadata.overlapPrevious).toBe(false);
  });

  it('should handle single chunk', () => {
    const chunks = [createChunk('Only chunk', 0)];
    const withOverlap = addOverlap(chunks, 10);

    expect(withOverlap).toHaveLength(1);
    expect(withOverlap[0].content).toBe('Only chunk');
  });

  it('should handle zero overlap', () => {
    const chunks = [
      createChunk('First', 0),
      createChunk('Second', 1),
    ];

    const withOverlap = addOverlap(chunks, 0);

    expect(withOverlap).toEqual(chunks);
  });
});

describe('smartChunk', () => {
  it('should use semantic chunking for markdown', () => {
    const markdown = `# Header

Content under header.

## Subheader

More content.`;

    const chunks = smartChunk(markdown, { maxSize: 100, minSize: 10 });

    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should use recursive chunking for plain text', () => {
    const plainText = `This is plain text without any markdown formatting.
It just has some paragraphs and sentences.
Nothing special about it.`;

    const chunks = smartChunk(plainText, { maxSize: 100, minSize: 10 });

    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should detect code blocks as markdown', () => {
    const textWithCode = `Some introduction.

\`\`\`python
def hello():
    print("Hello")
\`\`\`

Some conclusion.`;

    const chunks = smartChunk(textWithCode, { maxSize: 200, minSize: 10 });

    expect(chunks.length).toBeGreaterThan(0);
  });

  it('should apply merge and overlap options', () => {
    const text = `Section one content.

Section two content.

Section three content.`;

    const chunks = smartChunk(text, {
      maxSize: 50,
      minSize: 20,
      overlap: 10,
    });

    expect(chunks.length).toBeGreaterThan(0);
  });
});
