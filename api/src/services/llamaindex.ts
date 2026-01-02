import {
  Document,
  VectorStoreIndex,
  storageContextFromDefaults,
  Settings,
} from 'llamaindex';
import { Ollama, OllamaEmbedding } from '@llamaindex/ollama';
import path from 'path';
import fs from 'fs';
import { createRAGDocument } from '../db/sqlite.js';

// Configuration
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'deepseek-coder-v2:16b';
const OLLAMA_REASONING_MODEL = process.env.OLLAMA_REASONING_MODEL || 'qwen3:30b';
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
const PERSIST_DIR = process.env.LLAMAINDEX_PERSIST_DIR || '/data/llamaindex';

// Initialize Ollama LLM and Embedding
let llm: Ollama | null = null;
let reasoningLlm: Ollama | null = null;
let embedModel: OllamaEmbedding | null = null;
let vectorIndex: VectorStoreIndex | null = null;

export function initializeLlamaIndex(): void {
  // Configure the default LLM (fast model for general queries)
  llm = new Ollama({
    model: OLLAMA_MODEL,
    config: { host: OLLAMA_URL },
  });

  // Configure reasoning LLM (for complex analysis)
  reasoningLlm = new Ollama({
    model: OLLAMA_REASONING_MODEL,
    config: { host: OLLAMA_URL },
  });

  // Configure embedding model
  embedModel = new OllamaEmbedding({
    model: OLLAMA_EMBED_MODEL,
    config: { host: OLLAMA_URL },
  });

  // Set global settings
  Settings.llm = llm;
  Settings.embedModel = embedModel;

  console.log(`LlamaIndex initialized with Ollama (${OLLAMA_URL})`);
  console.log(`  LLM: ${OLLAMA_MODEL}`);
  console.log(`  Reasoning: ${OLLAMA_REASONING_MODEL}`);
  console.log(`  Embeddings: ${OLLAMA_EMBED_MODEL}`);
}

export async function loadOrCreateIndex(): Promise<VectorStoreIndex> {
  if (vectorIndex) {
    return vectorIndex;
  }

  // Ensure persist directory exists
  if (!fs.existsSync(PERSIST_DIR)) {
    fs.mkdirSync(PERSIST_DIR, { recursive: true });
  }

  try {
    // Try to load existing index
    const storageContext = await storageContextFromDefaults({
      persistDir: PERSIST_DIR,
    });

    // Check if index exists
    const indexStorePath = path.join(PERSIST_DIR, 'index_store.json');
    if (fs.existsSync(indexStorePath)) {
      vectorIndex = await VectorStoreIndex.init({ storageContext });
      console.log('Loaded existing LlamaIndex vector store');
    } else {
      // Create new empty index
      vectorIndex = await VectorStoreIndex.fromDocuments([], { storageContext });
      console.log('Created new LlamaIndex vector store');
    }

    return vectorIndex;
  } catch (error) {
    console.error('Error loading index, creating new one:', error);
    const storageContext = await storageContextFromDefaults({
      persistDir: PERSIST_DIR,
    });
    vectorIndex = await VectorStoreIndex.fromDocuments([], { storageContext });
    return vectorIndex;
  }
}

export interface AddDocumentOptions {
  title: string;
  content: string;
  sourceType?: string;
  sourcePath?: string;
  metadata?: Record<string, unknown>;
}

export async function addDocument(options: AddDocumentOptions): Promise<string> {
  const index = await loadOrCreateIndex();

  const doc = new Document({
    text: options.content,
    metadata: {
      title: options.title,
      sourceType: options.sourceType || 'manual',
      sourcePath: options.sourcePath || '',
      ...options.metadata,
    },
  });

  // Insert document into LlamaIndex vector store
  await index.insert(doc);

  // Also sync to SQLite for FTS search (hybrid search support)
  try {
    createRAGDocument({
      title: options.title,
      content: options.content,
      source_type: options.sourceType || 'manual',
      source_path: options.sourcePath,
      metadata: options.metadata ? JSON.stringify(options.metadata) : '{}',
    });
  } catch (sqliteError) {
    console.warn('Failed to sync document to SQLite FTS:', sqliteError);
    // Don't fail - LlamaIndex document was added successfully
  }

  return doc.id_;
}

export interface QueryOptions {
  query: string;
  topK?: number;
  useReasoning?: boolean;
}

export interface QueryResult {
  response: string;
  sourceNodes: Array<{
    id: string;
    text: string;
    score?: number;
    metadata: Record<string, unknown>;
  }>;
  model: string;
}

export async function queryIndex(options: QueryOptions): Promise<QueryResult> {
  const index = await loadOrCreateIndex();

  // Use reasoning model if requested
  if (options.useReasoning && reasoningLlm) {
    Settings.llm = reasoningLlm;
  } else if (llm) {
    Settings.llm = llm;
  }

  const queryEngine = index.asQueryEngine({
    similarityTopK: options.topK || 5,
  });

  const response = await queryEngine.query({ query: options.query });

  // Extract source nodes - use type assertion for LlamaIndex API compatibility
  const sourceNodes = (response.sourceNodes || []).map((node: unknown) => {
    const n = node as { node: { id_: string; metadata?: Record<string, unknown> }; score?: number };
    // Access text content safely
    const nodeAny = n.node as Record<string, unknown>;
    const textContent = String(nodeAny.text || nodeAny.content || nodeAny.pageContent || '');
    return {
      id: n.node.id_,
      text: textContent.substring(0, 500),
      score: n.score,
      metadata: n.node.metadata || {},
    };
  });

  return {
    response: response.response,
    sourceNodes,
    model: options.useReasoning ? OLLAMA_REASONING_MODEL : OLLAMA_MODEL,
  };
}

export async function chatWithContext(
  message: string,
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  useReasoning: boolean = false
): Promise<string> {
  const index = await loadOrCreateIndex();

  if (useReasoning && reasoningLlm) {
    Settings.llm = reasoningLlm;
  } else if (llm) {
    Settings.llm = llm;
  }

  const chatEngine = index.asChatEngine();

  const response = await chatEngine.chat({
    message,
    chatHistory: chatHistory.map(msg => ({
      role: msg.role,
      content: msg.content,
    })),
  });

  return response.response;
}

export async function getIndexStats(): Promise<{
  documentCount: number;
  persistDir: string;
  models: {
    llm: string;
    reasoning: string;
    embedding: string;
  };
}> {
  const index = await loadOrCreateIndex();

  // Get document count from the docstore
  const docStore = index.storageContext.docStore;
  const docs = docStore.docs;
  const documentCount = Object.keys(docs).length;

  return {
    documentCount,
    persistDir: PERSIST_DIR,
    models: {
      llm: OLLAMA_MODEL,
      reasoning: OLLAMA_REASONING_MODEL,
      embedding: OLLAMA_EMBED_MODEL,
    },
  };
}

export async function deleteAllDocuments(): Promise<number> {
  // Remove persist directory and recreate
  if (fs.existsSync(PERSIST_DIR)) {
    fs.rmSync(PERSIST_DIR, { recursive: true });
  }
  fs.mkdirSync(PERSIST_DIR, { recursive: true });

  // Reset the index
  vectorIndex = null;
  await loadOrCreateIndex();

  return 0;
}

export { llm, reasoningLlm, embedModel };
