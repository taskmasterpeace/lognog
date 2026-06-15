import { Router, Request, Response } from 'express';
import { isOllamaAvailable, generateEmbedding, chunkText, findSimilarDocuments, generateWithOllama, getOllamaModel, getOllamaReasoningModel } from './shared.js';
import { getRAGDocuments, getRAGDocument, searchRAGDocuments, createRAGDocument, deleteRAGDocument, deleteRAGDocumentsBySource, RAGDocument } from '../../db/sqlite.js';

const router = Router();

// ============================================
// RAG (Retrieval Augmented Generation) Routes
// ============================================

// List all RAG documents
router.get('/rag/documents', async (req: Request, res: Response) => {
  try {
    const { source_type } = req.query;
    const documents = getRAGDocuments(source_type as string | undefined);
    return res.json({
      count: documents.length,
      documents: documents.map(d => ({
        id: d.id,
        title: d.title,
        source_type: d.source_type,
        source_path: d.source_path,
        chunk_index: d.chunk_index,
        has_embedding: !!d.embedding,
        created_at: d.created_at,
      })),
    });
  } catch (error) {
    console.error('Error listing RAG documents:', error);
    return res.status(500).json({ error: 'Failed to list documents' });
  }
});

// Get a specific RAG document
router.get('/rag/documents/:id', async (req: Request, res: Response) => {
  try {
    const doc = getRAGDocument(req.params.id);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    return res.json(doc);
  } catch (error) {
    console.error('Error getting RAG document:', error);
    return res.status(500).json({ error: 'Failed to get document' });
  }
});

// Add a document to RAG knowledge base
router.post('/rag/documents', async (req: Request, res: Response) => {
  try {
    const { title, content, source_type, source_path, metadata, chunk } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const available = await isOllamaAvailable();
    if (!available) {
      return res.status(503).json({ error: 'Ollama not available for embedding generation' });
    }

    // Chunk content if requested or if content is large
    const shouldChunk = chunk !== false && content.length > 1500;
    const chunks = shouldChunk ? chunkText(content) : [content];

    const documents: RAGDocument[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkContent = chunks[i];

      // Generate embedding
      const embedding = await generateEmbedding(chunkContent);

      const doc = createRAGDocument({
        title: chunks.length > 1 ? `${title} (Part ${i + 1})` : title,
        content: chunkContent,
        source_type: source_type || 'manual',
        source_path,
        chunk_index: i,
        embedding: JSON.stringify(embedding),
        metadata: JSON.stringify(metadata || {}),
      });

      documents.push(doc);
    }

    return res.json({
      message: `Indexed ${documents.length} document chunk(s)`,
      documents: documents.map(d => ({ id: d.id, title: d.title, chunk_index: d.chunk_index })),
    });
  } catch (error) {
    console.error('Error adding RAG document:', error);
    return res.status(500).json({ error: 'Failed to add document' });
  }
});

// Delete a RAG document
router.delete('/rag/documents/:id', async (req: Request, res: Response) => {
  try {
    const deleted = deleteRAGDocument(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Document not found' });
    }
    return res.json({ message: 'Document deleted' });
  } catch (error) {
    console.error('Error deleting RAG document:', error);
    return res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Search RAG documents (text search)
router.get('/rag/search', async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Query parameter q is required' });
    }
    const documents = searchRAGDocuments(q as string);
    return res.json({ count: documents.length, documents });
  } catch (error) {
    console.error('Error searching RAG documents:', error);
    return res.status(500).json({ error: 'Failed to search documents' });
  }
});

// RAG Query - Find similar documents and generate response
router.post('/rag/query', async (req: Request, res: Response) => {
  try {
    const { query, top_k, model, include_context } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const available = await isOllamaAvailable();
    if (!available) {
      return res.status(503).json({ error: 'Ollama not available' });
    }

    // Find similar documents
    const similarDocs = await findSimilarDocuments(query, top_k || 5);

    if (similarDocs.length === 0) {
      return res.json({
        response: 'No relevant documents found in the knowledge base. Please add documents first using POST /ai/rag/documents.',
        context: [],
        query,
      });
    }

    // Build context from similar documents
    const context = similarDocs
      .filter(d => d.similarity > 0.3) // Only include sufficiently similar docs
      .map(d => `[${d.title}]\n${d.content}`)
      .join('\n\n---\n\n');

    // Generate response with context
    const prompt = `You are a helpful assistant with access to a knowledge base. Use the following context to answer the question. If the context doesn't contain relevant information, say so.

CONTEXT:
${context}

QUESTION: ${query}

Provide a helpful, accurate response based on the context above.`;

    const selectedModel = model === 'reasoning' ? getOllamaReasoningModel() : getOllamaModel();
    const response = await generateWithOllama(prompt, selectedModel);

    const result: Record<string, unknown> = {
      response,
      query,
      model: selectedModel,
      documents_used: similarDocs.length,
    };

    if (include_context) {
      result.context = similarDocs.map(d => ({
        id: d.id,
        title: d.title,
        similarity: d.similarity.toFixed(3),
        excerpt: d.content.substring(0, 200) + '...',
      }));
    }

    return res.json(result);
  } catch (error) {
    console.error('Error in RAG query:', error);
    return res.status(500).json({ error: 'Failed to process RAG query' });
  }
});

// Index log samples from ClickHouse for RAG
router.post('/rag/index-logs', async (req: Request, res: Response) => {
  try {
    const { query, title, limit } = req.body;

    if (!query || !title) {
      return res.status(400).json({ error: 'Query and title are required' });
    }

    const available = await isOllamaAvailable();
    if (!available) {
      return res.status(503).json({ error: 'Ollama not available for embedding generation' });
    }

    // Import ClickHouse client dynamically to avoid circular deps
    const { getClickHouseClient } = await import('../../db/clickhouse.js');
    const client = getClickHouseClient();

    // Execute the query to get log samples
    const resultSet = await client.query({
      query: `${query} LIMIT ${limit || 100}`,
      format: 'JSONEachRow',
    });

    const logs = await resultSet.json() as Array<Record<string, unknown>>;

    if (logs.length === 0) {
      return res.json({ message: 'No logs found matching the query', indexed: 0 });
    }

    // Create a summary document from the logs
    const logSummary = logs.map((log, i) => {
      const fields = Object.entries(log)
        .filter(([k]) => !['raw', 'structured_data'].includes(k))
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      return `Log ${i + 1}: ${fields}`;
    }).join('\n');

    const content = `Log Analysis: ${title}\n\nSample logs (${logs.length} entries):\n${logSummary}`;

    // Generate embedding and store
    const embedding = await generateEmbedding(content);

    const doc = createRAGDocument({
      title,
      content,
      source_type: 'logs',
      source_path: query,
      embedding: JSON.stringify(embedding),
      metadata: JSON.stringify({ log_count: logs.length, query }),
    });

    return res.json({
      message: `Indexed ${logs.length} log samples as "${title}"`,
      document_id: doc.id,
    });
  } catch (error) {
    console.error('Error indexing logs for RAG:', error);
    return res.status(500).json({ error: 'Failed to index logs' });
  }
});

// Clear RAG documents by source type
router.delete('/rag/clear', async (req: Request, res: Response) => {
  try {
    const { source_type, source_path } = req.body;

    if (!source_type) {
      return res.status(400).json({ error: 'source_type is required' });
    }

    const deleted = deleteRAGDocumentsBySource(source_type, source_path);
    return res.json({ message: `Deleted ${deleted} document(s)`, deleted });
  } catch (error) {
    console.error('Error clearing RAG documents:', error);
    return res.status(500).json({ error: 'Failed to clear documents' });
  }
});

// Get RAG stats
router.get('/rag/stats', async (_req: Request, res: Response) => {
  try {
    const allDocs = getRAGDocuments();
    const withEmbeddings = allDocs.filter(d => d.embedding);

    const bySource: Record<string, number> = {};
    for (const doc of allDocs) {
      bySource[doc.source_type] = (bySource[doc.source_type] || 0) + 1;
    }

    return res.json({
      total_documents: allDocs.length,
      with_embeddings: withEmbeddings.length,
      by_source_type: bySource,
    });
  } catch (error) {
    console.error('Error getting RAG stats:', error);
    return res.status(500).json({ error: 'Failed to get stats' });
  }
});

export default router;
