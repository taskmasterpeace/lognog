/**
 * Semantic and Recursive Chunker Service
 *
 * Provides intelligent text chunking strategies for better RAG retrieval.
 * Supports semantic chunking (paragraph/section based) and recursive chunking
 * (hierarchical splitting using multiple separators).
 */

export interface Chunk {
  id: string;
  content: string;
  index: number;
  metadata: {
    startOffset: number;
    endOffset: number;
    isCode: boolean;
    isHeader: boolean;
    overlapPrevious: boolean;
  };
}

export interface ChunkOptions {
  maxSize?: number;         // Maximum chunk size in characters
  minSize?: number;         // Minimum chunk size (avoid tiny chunks)
  overlap?: number;         // Overlap between chunks
  preserveCodeBlocks?: boolean;  // Keep code blocks intact
  preserveHeaders?: boolean;     // Keep headers with their content
}

const DEFAULT_OPTIONS: ChunkOptions = {
  maxSize: 1000,
  minSize: 100,
  overlap: 100,
  preserveCodeBlocks: true,
  preserveHeaders: true,
};

/**
 * Generate a unique chunk ID
 */
function generateChunkId(index: number, prefix: string = 'chunk'): string {
  return `${prefix}_${index}_${Date.now().toString(36)}`;
}

/**
 * Detect if a text segment is a code block
 */
export function isCodeBlock(text: string): boolean {
  const trimmed = text.trim();
  // Check for fenced code blocks (trimmed)
  if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
    return true;
  }
  // Check for indented code blocks (not trimmed - need leading whitespace)
  if (text.startsWith('    ') || text.startsWith('\t')) {
    return true;
  }
  return false;
}

/**
 * Detect if a line is a markdown header
 */
export function isHeader(text: string): boolean {
  const trimmed = text.trim();
  return /^#{1,6}\s/.test(trimmed);
}

/**
 * Split text by sentence boundaries
 */
export function splitBySentence(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.filter(s => s.trim().length > 0);
}

/**
 * Split text by paragraph boundaries
 */
export function splitByParagraph(text: string): string[] {
  // Split on double newlines
  const paragraphs = text.split(/\n\s*\n/);
  return paragraphs.filter(p => p.trim().length > 0);
}

/**
 * Semantic chunking - splits by meaningful boundaries
 *
 * Strategy:
 * 1. Split by sections (markdown headers)
 * 2. Split by paragraphs
 * 3. Merge small chunks
 * 4. Split large chunks by sentences
 * 5. Add overlap for context
 */
export function semanticChunk(
  text: string,
  options: ChunkOptions = {}
): Chunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const chunks: Chunk[] = [];
  let currentOffset = 0;

  // First, extract code blocks to preserve them
  const codeBlockPattern = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
  const codeBlocks: Array<{ start: number; end: number; content: string }> = [];

  if (opts.preserveCodeBlocks) {
    let match;
    while ((match = codeBlockPattern.exec(text)) !== null) {
      codeBlocks.push({
        start: match.index,
        end: match.index + match[0].length,
        content: match[0],
      });
    }
  }

  // Split by headers first
  const sections = text.split(/(?=^#{1,6}\s)/m);

  for (const section of sections) {
    if (section.trim().length === 0) continue;

    // Check if section starts with a header
    const headerMatch = section.match(/^(#{1,6}\s[^\n]*)/);
    const header = headerMatch ? headerMatch[1] : '';
    const content = headerMatch ? section.slice(header.length).trim() : section.trim();

    if (content.length === 0 && header) {
      // Just a header, include it with next section
      continue;
    }

    // Split content by paragraphs
    const paragraphs = splitByParagraph(content);

    let currentChunk = header ? header + '\n\n' : '';
    let chunkStartOffset = currentOffset;

    for (const paragraph of paragraphs) {
      // Check if this is a code block
      const isCode = isCodeBlock(paragraph);

      // If adding this paragraph exceeds max size, save current chunk
      if (currentChunk.length + paragraph.length > opts.maxSize! && currentChunk.length >= opts.minSize!) {
        if (currentChunk.trim().length > 0) {
          chunks.push({
            id: generateChunkId(chunks.length),
            content: currentChunk.trim(),
            index: chunks.length,
            metadata: {
              startOffset: chunkStartOffset,
              endOffset: currentOffset,
              isCode: false,
              isHeader: currentChunk.includes('#'),
              overlapPrevious: chunks.length > 0,
            },
          });
        }

        // Start new chunk with overlap
        if (opts.overlap! > 0 && currentChunk.length > opts.overlap!) {
          currentChunk = currentChunk.slice(-opts.overlap!);
          chunkStartOffset = currentOffset - opts.overlap!;
        } else {
          currentChunk = '';
          chunkStartOffset = currentOffset;
        }
      }

      currentChunk += paragraph + '\n\n';
      currentOffset += paragraph.length + 2;
    }

    // Add remaining content
    if (currentChunk.trim().length >= opts.minSize!) {
      chunks.push({
        id: generateChunkId(chunks.length),
        content: currentChunk.trim(),
        index: chunks.length,
        metadata: {
          startOffset: chunkStartOffset,
          endOffset: currentOffset,
          isCode: false,
          isHeader: currentChunk.includes('#'),
          overlapPrevious: chunks.length > 0,
        },
      });
    }
  }

  return chunks;
}

/**
 * Recursive chunking - uses hierarchical separators
 *
 * Tries separators in order until chunks are small enough:
 * 1. Markdown headers (## )
 * 2. Double newlines (paragraphs)
 * 3. Single newlines
 * 4. Sentences (. ! ?)
 * 5. Spaces (words)
 * 6. Characters (last resort)
 */
export function recursiveChunk(
  text: string,
  maxSize: number = 1000,
  separators: string[] = ['\n## ', '\n\n', '\n', '. ', ' ', '']
): Chunk[] {
  const chunks: Chunk[] = [];

  function splitRecursively(content: string, separatorIndex: number, offset: number): void {
    // Base case: content is small enough
    if (content.length <= maxSize) {
      if (content.trim().length > 0) {
        chunks.push({
          id: generateChunkId(chunks.length),
          content: content.trim(),
          index: chunks.length,
          metadata: {
            startOffset: offset,
            endOffset: offset + content.length,
            isCode: isCodeBlock(content),
            isHeader: isHeader(content),
            overlapPrevious: false,
          },
        });
      }
      return;
    }

    // No more separators, force split by characters
    if (separatorIndex >= separators.length - 1) {
      // Split at maxSize boundary
      for (let i = 0; i < content.length; i += maxSize) {
        const chunk = content.slice(i, i + maxSize);
        if (chunk.trim().length > 0) {
          chunks.push({
            id: generateChunkId(chunks.length),
            content: chunk.trim(),
            index: chunks.length,
            metadata: {
              startOffset: offset + i,
              endOffset: offset + i + chunk.length,
              isCode: isCodeBlock(chunk),
              isHeader: isHeader(chunk),
              overlapPrevious: i > 0,
            },
          });
        }
      }
      return;
    }

    const separator = separators[separatorIndex];
    const parts = content.split(separator);

    // If splitting didn't help, try next separator
    if (parts.length === 1) {
      splitRecursively(content, separatorIndex + 1, offset);
      return;
    }

    // Process each part
    let currentOffset = offset;
    for (let i = 0; i < parts.length; i++) {
      const part = i < parts.length - 1 ? parts[i] + separator : parts[i];

      if (part.length <= maxSize) {
        if (part.trim().length > 0) {
          chunks.push({
            id: generateChunkId(chunks.length),
            content: part.trim(),
            index: chunks.length,
            metadata: {
              startOffset: currentOffset,
              endOffset: currentOffset + part.length,
              isCode: isCodeBlock(part),
              isHeader: isHeader(part),
              overlapPrevious: false,
            },
          });
        }
      } else {
        // Part is too large, recurse with next separator
        splitRecursively(part, separatorIndex + 1, currentOffset);
      }

      currentOffset += part.length;
    }
  }

  splitRecursively(text, 0, 0);
  return chunks;
}

/**
 * Merge small consecutive chunks
 */
export function mergeSmallChunks(chunks: Chunk[], minSize: number = 100): Chunk[] {
  if (chunks.length <= 1) return chunks;

  const merged: Chunk[] = [];
  let current = chunks[0];

  for (let i = 1; i < chunks.length; i++) {
    const next = chunks[i];

    // If current is too small, merge with next
    if (current.content.length < minSize) {
      current = {
        ...current,
        content: current.content + '\n\n' + next.content,
        metadata: {
          ...current.metadata,
          endOffset: next.metadata.endOffset,
        },
      };
    } else {
      merged.push(current);
      current = next;
    }
  }

  merged.push(current);

  // Re-index chunks
  return merged.map((chunk, index) => ({
    ...chunk,
    index,
    id: generateChunkId(index),
  }));
}

/**
 * Add overlap between chunks for context continuity
 */
export function addOverlap(chunks: Chunk[], overlapSize: number = 100): Chunk[] {
  if (chunks.length <= 1 || overlapSize <= 0) return chunks;

  return chunks.map((chunk, index) => {
    if (index === 0) return chunk;

    const prevChunk = chunks[index - 1];
    const overlap = prevChunk.content.slice(-overlapSize);

    return {
      ...chunk,
      content: overlap + '\n\n' + chunk.content,
      metadata: {
        ...chunk.metadata,
        overlapPrevious: true,
        startOffset: chunk.metadata.startOffset - overlapSize,
      },
    };
  });
}

/**
 * Smart chunking - automatically selects best strategy
 *
 * Uses semantic chunking for markdown/structured text
 * Uses recursive chunking for plain text
 */
export function smartChunk(
  text: string,
  options: ChunkOptions = {}
): Chunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Detect if text is markdown (has headers, code blocks, etc.)
  const hasHeaders = /^#{1,6}\s/m.test(text);
  const hasCodeBlocks = /```[\s\S]*?```/.test(text);
  const isMarkdown = hasHeaders || hasCodeBlocks;

  let chunks: Chunk[];

  if (isMarkdown) {
    chunks = semanticChunk(text, opts);
  } else {
    chunks = recursiveChunk(text, opts.maxSize);
  }

  // Merge small chunks
  chunks = mergeSmallChunks(chunks, opts.minSize);

  // Add overlap if requested
  if (opts.overlap && opts.overlap > 0) {
    chunks = addOverlap(chunks, opts.overlap);
  }

  return chunks;
}
