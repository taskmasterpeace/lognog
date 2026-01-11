import {
  Document,
  VectorStoreIndex,
  storageContextFromDefaults,
  Settings,
} from 'llamaindex';
import { Ollama, OllamaEmbedding } from '@llamaindex/ollama';
import { OpenAI, OpenAIEmbedding } from '@llamaindex/openai';
import path from 'path';
import fs from 'fs';
import { createRAGDocument, getSystemSetting } from '../db/sqlite.js';

// Dynamic configuration getters - read from database first, then env, then defaults
function getOllamaUrl(): string {
  return getSystemSetting('ai_ollama_url') || process.env.OLLAMA_URL || 'http://localhost:11434';
}
function getOllamaModel(): string {
  return getSystemSetting('ai_ollama_model') || process.env.OLLAMA_MODEL || 'deepseek-coder-v2:16b';
}
function getOllamaReasoningModel(): string {
  return getSystemSetting('ai_ollama_reasoning_model') || process.env.OLLAMA_REASONING_MODEL || 'qwen3:30b';
}
function getOllamaEmbedModel(): string {
  return getSystemSetting('ai_ollama_embed_model') || process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
}

// OpenRouter configuration
function getOpenRouterApiKey(): string {
  return getSystemSetting('ai_openrouter_api_key') || process.env.OPENROUTER_API_KEY || '';
}
function getOpenRouterModel(): string {
  return getSystemSetting('ai_openrouter_model') || process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
}

const PERSIST_DIR = process.env.LLAMAINDEX_PERSIST_DIR || '/data/llamaindex';

// Provider tracking
let currentProvider: 'ollama' | 'openrouter' | null = null;

// Initialize LLM and Embedding (supports Ollama or OpenRouter)
let llm: Ollama | OpenAI | null = null;
let reasoningLlm: Ollama | OpenAI | null = null;
let embedModel: OllamaEmbedding | OpenAIEmbedding | null = null;
let vectorIndex: VectorStoreIndex | null = null;

// Check if Ollama is available
async function isOllamaAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${getOllamaUrl()}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function initializeLlamaIndex(): Promise<void> {
  const ollamaUrl = getOllamaUrl();
  const openRouterKey = getOpenRouterApiKey();

  // Try Ollama first
  const ollamaAvailable = await isOllamaAvailable();

  if (ollamaAvailable) {
    // Use Ollama
    const ollamaModel = getOllamaModel();
    const reasoningModel = getOllamaReasoningModel();
    const embedModelName = getOllamaEmbedModel();

    llm = new Ollama({
      model: ollamaModel,
      config: { host: ollamaUrl },
    });

    reasoningLlm = new Ollama({
      model: reasoningModel,
      config: { host: ollamaUrl },
    });

    embedModel = new OllamaEmbedding({
      model: embedModelName,
      config: { host: ollamaUrl },
    });

    currentProvider = 'ollama';
    Settings.llm = llm;
    Settings.embedModel = embedModel;

    console.log(`LlamaIndex initialized with Ollama (${ollamaUrl})`);
    console.log(`  LLM: ${ollamaModel}`);
    console.log(`  Reasoning: ${reasoningModel}`);
    console.log(`  Embeddings: ${embedModelName}`);
  } else if (openRouterKey) {
    // Fall back to OpenRouter with OpenAI embeddings
    const openRouterModel = getOpenRouterModel();

    // OpenRouter uses OpenAI-compatible API
    llm = new OpenAI({
      apiKey: openRouterKey,
      additionalSessionOptions: {
        baseURL: 'https://openrouter.ai/api/v1',
      },
      model: openRouterModel,
    });

    reasoningLlm = new OpenAI({
      apiKey: openRouterKey,
      additionalSessionOptions: {
        baseURL: 'https://openrouter.ai/api/v1',
      },
      model: openRouterModel,
    });

    // Use OpenAI embeddings (text-embedding-3-small is good and cheap)
    embedModel = new OpenAIEmbedding({
      apiKey: openRouterKey,
      additionalSessionOptions: {
        baseURL: 'https://openrouter.ai/api/v1',
      },
      model: 'openai/text-embedding-3-small',
    });

    currentProvider = 'openrouter';
    Settings.llm = llm;
    Settings.embedModel = embedModel;

    console.log(`LlamaIndex initialized with OpenRouter`);
    console.log(`  LLM: ${openRouterModel}`);
    console.log(`  Embeddings: openai/text-embedding-3-small`);
  } else {
    console.warn('LlamaIndex: No AI provider available (Ollama offline, no OpenRouter key)');
    currentProvider = null;
  }
}

export function getLlamaIndexProvider(): 'ollama' | 'openrouter' | null {
  return currentProvider;
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

  // Determine model name based on provider
  let modelName: string;
  if (currentProvider === 'openrouter') {
    modelName = getOpenRouterModel();
  } else {
    modelName = options.useReasoning ? getOllamaReasoningModel() : getOllamaModel();
  }

  return {
    response: response.response,
    sourceNodes,
    model: modelName,
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
      llm: getOllamaModel(),
      reasoning: getOllamaReasoningModel(),
      embedding: getOllamaEmbedModel(),
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
