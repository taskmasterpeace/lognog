import { Router, Request, Response } from 'express';
import {
  getInterviewSessions,
  getInterviewSession,
  createInterviewSession,
  updateInterviewSession,
  deleteInterviewSession,
  getRAGDocuments,
  getRAGDocument,
  searchRAGDocuments,
  createRAGDocument,
  updateRAGDocumentEmbedding,
  deleteRAGDocument,
  deleteRAGDocumentsBySource,
  getRAGDocumentsWithEmbeddings,
  RAGDocument,
  getSystemSetting,
} from '../db/sqlite.js';
import {
  initializeLlamaIndex,
  loadOrCreateIndex,
  addDocument as llamaAddDocument,
  queryIndex as llamaQueryIndex,
  chatWithContext,
  getIndexStats,
  deleteAllDocuments,
} from '../services/llamaindex.js';
import { executeDSLQuery } from '../db/backend.js';
import { hybridSearch, HybridSearchResponse, HybridSearchResult } from '../services/hybrid-search.js';
import { rerankWithLLM } from '../services/reranker.js';
import { formatCitations, CitedSource, getCitationStats } from '../services/citations.js';
import { logAIRequest } from '../services/internal-logger.js';
import {
  DSL_COMMANDS,
  DSL_COMPARISON_OPERATORS,
  DSL_LOGICAL_OPERATORS,
  DSL_AGGREGATION_FUNCTIONS,
  DSL_CORE_FIELDS,
  DSL_COMMON_PATTERNS,
} from '../data/dsl-reference.js';

const router = Router();

// Dynamic configuration getters - read from database first, then env, then defaults
// This allows settings changed in the UI to take effect without server restart
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
function getOpenRouterApiKey(): string | undefined {
  return getSystemSetting('ai_openrouter_api_key') || process.env.OPENROUTER_API_KEY || undefined;
}
function getOpenRouterModel(): string {
  return getSystemSetting('ai_openrouter_model') || process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
}

// OpenRouter API endpoint (constant)
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Check if Ollama is available
async function isOllamaAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${getOllamaUrl()}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Check if ANY AI provider is available (OpenRouter OR Ollama)
async function isAnyAIAvailable(): Promise<boolean> {
  // OpenRouter is primary - check it first
  if (getOpenRouterApiKey()) return true;
  // Fall back to Ollama if no OpenRouter key
  return await isOllamaAvailable();
}

// Generate text with Ollama
async function generateWithOllama(prompt: string, model?: string): Promise<string> {
  const response = await fetch(`${getOllamaUrl()}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || getOllamaModel(),
      prompt,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.statusText}`);
  }

  const data = await response.json() as { response: string };
  return data.response;
}

// Generate text with OpenRouter (cloud fallback)
async function generateWithOpenRouter(prompt: string, model?: string): Promise<string> {
  if (!getOpenRouterApiKey()) {
    throw new Error('OpenRouter API key not configured');
  }

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getOpenRouterApiKey()}`,
      'HTTP-Referer': 'https://lognog.io',
      'X-Title': 'LogNog',
    },
    body: JSON.stringify({
      model: model || getOpenRouterModel(),
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter error: ${response.statusText} - ${error}`);
  }

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content || '';
}

// Unified generate function - OpenRouter PRIMARY, Ollama fallback
async function generateText(prompt: string, options?: { model?: string; useReasoning?: boolean; endpoint?: string }): Promise<{ response: string; provider: 'ollama' | 'openrouter' }> {
  const startTime = Date.now();

  // Try OpenRouter first (PRIMARY - no local server needed)
  if (getOpenRouterApiKey()) {
    const model = options?.model || getOpenRouterModel();
    try {
      const response = await generateWithOpenRouter(prompt, model);

      // Log successful OpenRouter request
      logAIRequest({
        provider: 'openrouter',
        model,
        duration_ms: Date.now() - startTime,
        success: true,
        endpoint: options?.endpoint,
      });

      return { response, provider: 'openrouter' };
    } catch (error) {
      // Log failed OpenRouter request
      logAIRequest({
        provider: 'openrouter',
        model,
        duration_ms: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        endpoint: options?.endpoint,
      });
      console.warn('OpenRouter generation failed, trying Ollama fallback:', error);
    }
  }

  // Fallback to Ollama (local)
  const ollamaAvailable = await isOllamaAvailable();
  if (ollamaAvailable) {
    const model = options?.useReasoning ? getOllamaReasoningModel() : (options?.model || getOllamaModel());
    const ollamaStart = Date.now();
    try {
      const response = await generateWithOllama(prompt, model);

      // Log successful Ollama request
      logAIRequest({
        provider: 'ollama',
        model,
        duration_ms: Date.now() - ollamaStart,
        success: true,
        endpoint: options?.endpoint,
      });

      return { response, provider: 'ollama' };
    } catch (error) {
      // Log failed Ollama request
      logAIRequest({
        provider: 'ollama',
        model,
        duration_ms: Date.now() - ollamaStart,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        endpoint: options?.endpoint,
      });
      console.error('Ollama fallback failed:', error);
      throw error;
    }
  }

  throw new Error('No AI provider available. Configure OpenRouter API key in Settings or start Ollama.');
}

// Generate embeddings with Ollama
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch(`${getOllamaUrl()}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: getOllamaEmbedModel(),
      prompt: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama embedding error: ${response.statusText}`);
  }

  const data = await response.json() as { embedding: number[] };
  return data.embedding;
}

// Extract JSON from LLM response (handles markdown code blocks)
function extractJSON(text: string): string {
  // Try to extract JSON from markdown code blocks
  const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    return jsonBlockMatch[1].trim();
  }
  // Try to find raw JSON object or array
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    return jsonMatch[1].trim();
  }
  return text.trim();
}

// Calculate cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Find similar documents using embeddings
async function findSimilarDocuments(query: string, topK: number = 5): Promise<Array<RAGDocument & { similarity: number }>> {
  const queryEmbedding = await generateEmbedding(query);
  const documents = getRAGDocumentsWithEmbeddings();

  const scored = documents.map(doc => {
    const docEmbedding = JSON.parse(doc.embedding!) as number[];
    const similarity = cosineSimilarity(queryEmbedding, docEmbedding);
    return { ...doc, similarity };
  });

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topK);
}

// Chunk text into smaller pieces for embedding
function chunkText(text: string, maxChunkSize: number = 1000, overlap: number = 100): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxChunkSize;

    // Try to break at sentence or paragraph boundary
    if (end < text.length) {
      const lastNewline = text.lastIndexOf('\n', end);
      const lastPeriod = text.lastIndexOf('. ', end);
      if (lastNewline > start + maxChunkSize / 2) {
        end = lastNewline + 1;
      } else if (lastPeriod > start + maxChunkSize / 2) {
        end = lastPeriod + 2;
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
  }

  return chunks.filter(c => c.length > 0);
}

// Generate DSL query from natural language
router.post('/generate-query', async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const available = await isAnyAIAvailable();
    if (!available) {
      return res.status(503).json({
        error: 'AI service unavailable',
        message: 'No AI provider available. Configure OpenRouter API key in Settings or start Ollama.',
      });
    }

    // Build comprehensive DSL context from reference data
    const commandsList = DSL_COMMANDS.map(c => `- ${c.name}: ${c.syntax}`).join('\n');
    const operatorsList = DSL_COMPARISON_OPERATORS.map(o => o.symbol).join(' ') + ' | AND OR NOT';
    const aggFunctions = DSL_AGGREGATION_FUNCTIONS.map(f => f.name).join(', ');
    const fields = DSL_CORE_FIELDS.map(f => f.name).join(', ');
    const examples = DSL_COMMON_PATTERNS.slice(0, 6).map(p => `- "${p.name}" → ${p.query}`).join('\n');

    const systemPrompt = `You are a LogNog query generator. Convert natural language to LogNog DSL queries.

## Commands
${commandsList}

## Operators
${operatorsList}

## Aggregation Functions (use with stats/timechart)
${aggFunctions}

## Fields
${fields}
Note: Custom fields from structured_data are also available.

## Severity Levels
0=emergency, 1=alert, 2=critical, 3=error, 4=warning, 5=notice, 6=info, 7=debug
Use severity<=3 for errors and above.

## Time Spans (for timechart/bin)
1s, 5s, 30s, 1m, 5m, 15m, 30m, 1h, 4h, 12h, 1d, 1w

## Examples
${examples}

## User Request
${prompt}

Respond with ONLY the DSL query, no explanation. Always start with 'search'.`;

    const { response: query, provider } = await generateText(systemPrompt, { endpoint: '/ai/generate-query' });

    return res.json({
      query: query.trim(),
      prompt,
      provider,
    });
  } catch (error) {
    console.error('Error generating query:', error);
    return res.status(500).json({ error: 'Failed to generate query' });
  }
});

// Generate AI insights for a dashboard
router.post('/insights', async (req: Request, res: Response) => {
  try {
    const { dashboardId, timeRange } = req.body;

    const available = await isAnyAIAvailable();
    if (!available) {
      return res.status(503).json({
        error: 'AI service unavailable',
        message: 'No AI provider available. Configure OpenRouter API key in Settings or start Ollama.',
      });
    }

    // In a real implementation, we would:
    // 1. Fetch recent data from the dashboard panels
    // 2. Analyze for anomalies, trends, patterns
    // 3. Generate insights using the LLM

    const systemPrompt = `You are a log analysis assistant. Generate 2-3 brief insights about log data.
Each insight should have:
- type: "anomaly", "trend", or "suggestion"
- severity: "info", "warning", or "critical"
- title: short summary (max 10 words)
- description: brief explanation (max 30 words)

Respond in JSON format:
{"insights": [{"type": "...", "severity": "...", "title": "...", "description": "..."}]}

Generate realistic insights for a homelab log monitoring dashboard viewing ${timeRange} of data.`;

    const { response, provider } = await generateText(systemPrompt, { endpoint: '/ai/insights' });

    try {
      const parsed = JSON.parse(response);
      return res.json({ ...parsed, provider });
    } catch {
      // If parsing fails, return mock insights
      return res.json({
        insights: [
          {
            type: 'trend',
            severity: 'info',
            title: 'Log volume increasing',
            description: 'Log events have increased 15% compared to the previous period.',
          },
          {
            type: 'suggestion',
            severity: 'info',
            title: 'Consider adding alerts',
            description: 'Set up alerts for high error rates to catch issues early.',
          },
        ],
        provider,
      });
    }
  } catch (error) {
    console.error('Error generating insights:', error);
    return res.status(500).json({ error: 'Failed to generate insights' });
  }
});

// Check AI provider status
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const ollamaAvailable = await isOllamaAvailable();
    const openrouterConfigured = !!getOpenRouterApiKey();

    let ollamaModels: string[] = [];
    if (ollamaAvailable) {
      const response = await fetch(`${getOllamaUrl()}/api/tags`);
      const data = await response.json() as { models: Array<{ name: string }> };
      ollamaModels = data.models?.map((m: { name: string }) => m.name) || [];
    }

    return res.json({
      providers: {
        ollama: {
          available: ollamaAvailable,
          url: getOllamaUrl(),
          model: getOllamaModel(),
          reasoningModel: getOllamaReasoningModel(),
          embedModel: getOllamaEmbedModel(),
          availableModels: ollamaModels,
        },
        openrouter: {
          configured: openrouterConfigured,
          model: getOpenRouterModel(),
          status: openrouterConfigured ? 'ready (PRIMARY)' : 'not configured',
        },
      },
      primaryProvider: openrouterConfigured ? 'openrouter' : (ollamaAvailable ? 'ollama' : 'none'),
      aiAvailable: openrouterConfigured || ollamaAvailable,
    });
  } catch (error) {
    return res.json({
      aiAvailable: false,
      error: String(error),
    });
  }
});

// ============================================================================
// CODEBASE INTERVIEW WIZARD
// Helps development teams set up logging for their applications
// ============================================================================

// The initial questionnaire template
const INITIAL_QUESTIONNAIRE = `# LogNog Codebase Interview Questionnaire

Please answer the following questions about your application. Be as detailed as possible - this helps us generate better logging recommendations.

---

## 1. Application Overview

**1.1 What is the name of your application?**
>

**1.2 What does your application do? (Brief description)**
>

**1.3 What programming language(s) and framework(s) does your application use?**
> (e.g., Node.js/Express, Python/Django, Java/Spring, Go, etc.)

---

## 2. Architecture

**2.1 Is your application a monolith, microservices, or serverless?**
>

**2.2 What database(s) does your application use?**
> (e.g., PostgreSQL, MongoDB, Redis, etc.)

**2.3 Do you use message queues or event streaming?**
> (e.g., RabbitMQ, Kafka, Redis Pub/Sub, etc.)

**2.4 What external APIs or services does your application integrate with?**
>

---

## 3. Current Logging

**3.1 Do you currently have any logging in place? If yes, describe what and how.**
>

**3.2 What logging library do you use (if any)?**
> (e.g., Winston, Pino, Log4j, Python logging, slog, etc.)

**3.3 Where do your logs currently go?**
> (e.g., console only, files, existing log service, etc.)

---

## 4. Critical Paths

**4.1 What are the most critical user-facing operations in your application?**
> (e.g., user signup, checkout, file upload, etc.)

**4.2 What operations involve money, sensitive data, or compliance requirements?**
>

**4.3 What are the most common issues or errors you encounter?**
>

---

## 5. Infrastructure

**5.1 Where does your application run?**
> (e.g., Docker, Kubernetes, bare metal, AWS Lambda, Vercel, etc.)

**5.2 How is your application deployed?**
> (e.g., CI/CD pipeline, manual deployment, etc.)

**5.3 Do you run multiple instances/replicas of your application?**
>

---

## 6. Monitoring Goals

**6.1 What problems do you want logging to help you solve?**
> (e.g., debugging production issues, security monitoring, performance tracking, etc.)

**6.2 What metrics or events are most important to track?**
>

**6.3 Do you need real-time alerting? For what conditions?**
>

---

## 7. Team & Process

**7.1 How many developers work on this codebase?**
>

**7.2 Who will be reviewing logs regularly?**
> (e.g., developers, DevOps, security team, etc.)

---

## Additional Notes

**Anything else we should know about your application or logging requirements?**
>

---

*Please fill out all sections and return this document. We'll use AI to analyze your responses and generate customized logging recommendations and implementation code.*
`;

// Get all interview sessions
router.get('/interview', async (_req: Request, res: Response) => {
  try {
    const sessions = getInterviewSessions();
    return res.json(sessions);
  } catch (error) {
    console.error('Error getting interview sessions:', error);
    return res.status(500).json({ error: 'Failed to get interview sessions' });
  }
});

// Get single interview session
router.get('/interview/:id', async (req: Request, res: Response) => {
  try {
    const session = getInterviewSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Interview session not found' });
    }
    return res.json(session);
  } catch (error) {
    console.error('Error getting interview session:', error);
    return res.status(500).json({ error: 'Failed to get interview session' });
  }
});

// Create new interview session (Step 1: Generate questionnaire)
router.post('/interview/start', async (req: Request, res: Response) => {
  try {
    const { name, app_name, team_name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Session name is required' });
    }

    const session = createInterviewSession(name, {
      app_name,
      team_name,
      questionnaire: INITIAL_QUESTIONNAIRE,
    });

    return res.json({
      session,
      questionnaire: INITIAL_QUESTIONNAIRE,
      message: 'Interview session created. Send the questionnaire to your development team.',
      next_step: 'Submit their responses using POST /api/ai/interview/:id/respond',
    });
  } catch (error) {
    console.error('Error starting interview:', error);
    return res.status(500).json({ error: 'Failed to start interview session' });
  }
});

// Get questionnaire for a session
router.get('/interview/:id/questionnaire', async (req: Request, res: Response) => {
  try {
    const session = getInterviewSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Interview session not found' });
    }

    return res.json({
      session_id: session.id,
      session_name: session.name,
      questionnaire: session.questionnaire || INITIAL_QUESTIONNAIRE,
      status: session.status,
    });
  } catch (error) {
    console.error('Error getting questionnaire:', error);
    return res.status(500).json({ error: 'Failed to get questionnaire' });
  }
});

// Submit responses (Step 2: Process responses and generate follow-up questions)
router.post('/interview/:id/respond', async (req: Request, res: Response) => {
  try {
    const { responses } = req.body;
    const session = getInterviewSession(req.params.id);

    if (!session) {
      return res.status(404).json({ error: 'Interview session not found' });
    }

    if (!responses) {
      return res.status(400).json({ error: 'Responses are required' });
    }

    // Store the responses
    updateInterviewSession(session.id, {
      responses,
      status: 'processing',
      current_step: 2,
    });

    // Check if any AI provider is available
    const available = await isAnyAIAvailable();

    let followUpQuestions: string;
    let recommendedLogs: string;

    if (available) {
      // Generate AI-powered follow-up questions
      const followUpPrompt = `You are a logging expert helping a development team set up logging for their application.

Based on their questionnaire responses below, generate 3-5 specific follow-up questions to clarify their logging needs. Focus on:
- Specific endpoints or functions that need logging
- Error handling patterns in their code
- Authentication/authorization flows
- Data validation points
- Performance-critical sections

Their responses:
${responses}

Generate follow-up questions in markdown format with clear numbering. Be specific to their tech stack and architecture.`;

      try {
        const { response } = await generateText(followUpPrompt, { endpoint: '/ai/interview/respond' });
        followUpQuestions = response;
      } catch {
        followUpQuestions = generateDefaultFollowUpQuestions(responses);
      }

      // Generate initial log recommendations
      const recommendationsPrompt = `You are a logging expert. Based on these questionnaire responses, suggest what logs this application should capture.

Responses:
${responses}

Generate a JSON object with this structure:
{
  "critical_logs": ["list of critical events to log"],
  "security_logs": ["security-related events to log"],
  "performance_logs": ["performance metrics to capture"],
  "error_logs": ["error types to capture"],
  "business_logs": ["business events to track"]
}

Only output the JSON, no other text.`;

      try {
        const { response: recommendationsRaw } = await generateText(recommendationsPrompt, { endpoint: '/ai/interview/respond' });
        recommendedLogs = recommendationsRaw;
      } catch {
        recommendedLogs = JSON.stringify(generateDefaultRecommendations(responses), null, 2);
      }
    } else {
      // Fallback without AI
      followUpQuestions = generateDefaultFollowUpQuestions(responses);
      recommendedLogs = JSON.stringify(generateDefaultRecommendations(responses), null, 2);
    }

    // Update session with follow-up questions
    const updatedSession = updateInterviewSession(session.id, {
      follow_up_questions: followUpQuestions,
      recommended_logs: recommendedLogs,
      status: 'follow_up_sent',
      current_step: 2,
    });

    // Safely parse recommendations (LLM might wrap in code blocks)
    let parsedRecommendations;
    try {
      parsedRecommendations = JSON.parse(extractJSON(recommendedLogs));
    } catch {
      parsedRecommendations = { raw: recommendedLogs };
    }

    return res.json({
      session: updatedSession,
      follow_up_questions: followUpQuestions,
      preliminary_recommendations: parsedRecommendations,
      message: 'Responses received. Review the follow-up questions and preliminary recommendations.',
      next_step: 'Submit follow-up answers using POST /api/ai/interview/:id/follow-up OR generate implementation guide using POST /api/ai/interview/:id/generate',
      ai_available: available,
    });
  } catch (error) {
    console.error('Error processing responses:', error);
    return res.status(500).json({ error: 'Failed to process responses' });
  }
});

// Submit follow-up answers (optional Step 2.5)
router.post('/interview/:id/follow-up', async (req: Request, res: Response) => {
  try {
    const { follow_up_answers } = req.body;
    const session = getInterviewSession(req.params.id);

    if (!session) {
      return res.status(404).json({ error: 'Interview session not found' });
    }

    // Append follow-up answers to responses
    const updatedResponses = `${session.responses || ''}\n\n## Follow-up Answers\n\n${follow_up_answers}`;

    const updatedSession = updateInterviewSession(session.id, {
      responses: updatedResponses,
      current_step: 3,
    });

    return res.json({
      session: updatedSession,
      message: 'Follow-up answers recorded.',
      next_step: 'Generate implementation guide using POST /api/ai/interview/:id/generate',
    });
  } catch (error) {
    console.error('Error processing follow-up:', error);
    return res.status(500).json({ error: 'Failed to process follow-up answers' });
  }
});

// Generate implementation guide (Step 3)
router.post('/interview/:id/generate', async (req: Request, res: Response) => {
  try {
    const session = getInterviewSession(req.params.id);

    if (!session) {
      return res.status(404).json({ error: 'Interview session not found' });
    }

    if (!session.responses) {
      return res.status(400).json({ error: 'No responses recorded. Submit responses first.' });
    }

    updateInterviewSession(session.id, { status: 'processing' });

    const available = await isAnyAIAvailable();
    let implementationGuide: string;

    if (available) {
      const guidePrompt = `You are a senior developer generating a COPY-PASTE READY logging implementation guide. The developer should be able to implement this in under 30 minutes.

APPLICATION DETAILS:
${session.responses}

${session.recommended_logs ? `CRITICAL EVENTS TO LOG:\n${session.recommended_logs}` : ''}

Generate a markdown guide with ACTUAL CODE (not pseudocode) that includes:

## 1. Install Dependencies
Exact npm/pip/go commands for their framework.

## 2. Logger Configuration
Complete, working configuration file. Example for Node.js:
\`\`\`typescript
// src/lib/logger.ts - COPY THIS FILE
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'SERVICE_NAME', env: process.env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Structured logging helpers
export const logEvent = (event: string, data: Record<string, unknown>) => {
  logger.info({ event, ...data });
};
\`\`\`

## 3. HTTP Request Logging Middleware
Complete middleware code for their framework.

## 4. Critical Event Logging
For EACH critical event from their responses, provide exact code:
\`\`\`typescript
// Payment success - add to payment handler
logger.info({
  event: 'payment_success',
  user_id: user.id,
  amount: payment.amount,
  transaction_id: payment.id
}, 'Payment processed successfully');

// Payment failure - add to error handler
logger.error({
  event: 'payment_failure',
  user_id: user.id,
  error_code: error.code,
  error_message: error.message
}, 'Payment processing failed');
\`\`\`

## 5. Ship Logs to LogNog
Two options with complete configs:

### Option A: HTTP Ingestion (Recommended for Serverless/Vercel)
\`\`\`typescript
// Add to logger.ts
import { logger } from './logger';

const LOGNOG_URL = process.env.LOGNOG_URL || 'http://localhost:4000';
const LOGNOG_API_KEY = process.env.LOGNOG_API_KEY;

export async function shipToLogNog(logs: object[]) {
  await fetch(\`\${LOGNOG_URL}/api/ingest/http\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': LOGNOG_API_KEY || '',
    },
    body: JSON.stringify(logs),
  });
}
\`\`\`

### Option B: Syslog (for Docker/Server deployments)
\`\`\`toml
# vector.toml - add this source
[sources.app_logs]
type = "file"
include = ["/var/log/app/*.log"]

[sinks.lognog]
type = "socket"
inputs = ["app_logs"]
address = "lognog-vector:514"
mode = "udp"
\`\`\`

## 6. Environment Variables
\`\`\`bash
# .env.local
LOGNOG_URL=http://your-lognog-server:4000
LOGNOG_API_KEY=your-api-key-here
LOG_LEVEL=info
\`\`\`

## 7. LogNog Alert Rules
Ready-to-create alerts with DSL queries:
\`\`\`
Alert: High Error Rate
Query: search event=*_failure | timechart span=5m count | where count > 10
Threshold: Trigger when count > 10 in 5 minutes

Alert: Payment Failures
Query: search event=payment_failure | stats count
Threshold: Any occurrence
\`\`\`

## 8. Recommended Dashboard Panels
\`\`\`
Panel 1: Event Overview
Query: search * | stats count by event | sort desc count

Panel 2: Error Rate Over Time
Query: search severity>=error | timechart span=1h count

Panel 3: Top Users by Activity
Query: search event=* | stats count by user_id | sort desc count | limit 10
\`\`\`

## Quick Checklist
- [ ] Install dependencies
- [ ] Add logger configuration file
- [ ] Add HTTP middleware
- [ ] Add logging to critical paths (list specific files)
- [ ] Set environment variables
- [ ] Test locally with \`curl http://localhost:4000/health\`
- [ ] Create alerts in LogNog

BE SPECIFIC to their tech stack. If they use Next.js, show Next.js code. If they use Python/FastAPI, show Python code. Generate WORKING code they can copy-paste.`;

      try {
        const { response } = await generateText(guidePrompt, { endpoint: '/ai/interview/generate' });
        implementationGuide = response;
      } catch {
        implementationGuide = generateDefaultImplementationGuide(session.responses);
      }
    } else {
      implementationGuide = generateDefaultImplementationGuide(session.responses);
    }

    const updatedSession = updateInterviewSession(session.id, {
      implementation_guide: implementationGuide,
      status: 'implementation_ready',
      current_step: 4,
    });

    return res.json({
      session: updatedSession,
      implementation_guide: implementationGuide,
      message: 'Implementation guide generated! Share this with your development team.',
      ai_available: available,
    });
  } catch (error) {
    console.error('Error generating implementation guide:', error);
    return res.status(500).json({ error: 'Failed to generate implementation guide' });
  }
});

// Mark session as completed
router.post('/interview/:id/complete', async (req: Request, res: Response) => {
  try {
    const session = getInterviewSession(req.params.id);

    if (!session) {
      return res.status(404).json({ error: 'Interview session not found' });
    }

    const updatedSession = updateInterviewSession(session.id, {
      status: 'completed',
    });

    return res.json({
      session: updatedSession,
      message: 'Interview session marked as completed.',
    });
  } catch (error) {
    console.error('Error completing session:', error);
    return res.status(500).json({ error: 'Failed to complete session' });
  }
});

// Delete interview session
router.delete('/interview/:id', async (req: Request, res: Response) => {
  try {
    const deleted = deleteInterviewSession(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Interview session not found' });
    }
    return res.json({ message: 'Interview session deleted' });
  } catch (error) {
    console.error('Error deleting session:', error);
    return res.status(500).json({ error: 'Failed to delete session' });
  }
});

// Helper functions for fallback when Ollama is not available

function generateDefaultFollowUpQuestions(responses: string): string {
  const hasNode = responses.toLowerCase().includes('node') || responses.toLowerCase().includes('javascript');
  const hasPython = responses.toLowerCase().includes('python');
  const hasDocker = responses.toLowerCase().includes('docker');
  const hasDatabase = responses.toLowerCase().includes('database') || responses.toLowerCase().includes('sql') || responses.toLowerCase().includes('mongo');

  let questions = `# Follow-up Questions

Based on your responses, we have a few clarifying questions:

## Code Structure

1. **Entry Points**: What are the main entry points to your application? (e.g., API routes, event handlers, cron jobs)

2. **Error Handling**: How do you currently handle errors? Do you have a central error handler or try-catch blocks throughout?

`;

  if (hasDatabase) {
    questions += `3. **Database Operations**: Which database operations are most critical to your business? (e.g., user creation, order processing)

`;
  }

  if (hasNode || hasPython) {
    questions += `4. **Async Operations**: Do you have background jobs or async operations that should be logged?

`;
  }

  if (hasDocker) {
    questions += `5. **Container Logging**: Are your containers configured to output logs to stdout/stderr?

`;
  }

  questions += `
## Specific Scenarios

6. **Authentication Flow**: Can you describe your authentication flow? (login, token refresh, logout)

7. **Data Validation**: Where does your application validate user input?

8. **Third-Party Calls**: Which external API calls are most likely to fail or need monitoring?

---

*Please provide brief answers to help us generate more targeted logging recommendations.*
`;

  return questions;
}

function generateDefaultRecommendations(responses: string): Record<string, string[]> {
  const recommendations: Record<string, string[]> = {
    critical_logs: [
      'Application startup and shutdown',
      'Configuration loading (without secrets)',
      'Health check endpoints',
      'Critical business transactions',
    ],
    security_logs: [
      'Authentication attempts (success/failure)',
      'Authorization failures',
      'Password changes',
      'API key usage',
      'Suspicious activity patterns',
    ],
    performance_logs: [
      'Request/response times',
      'Database query durations',
      'External API call latencies',
      'Memory/CPU usage (periodic)',
      'Queue depths',
    ],
    error_logs: [
      'Unhandled exceptions',
      'Validation errors',
      'Database connection failures',
      'External service timeouts',
      'Rate limiting events',
    ],
    business_logs: [
      'User signup/onboarding',
      'Key feature usage',
      'Conversion events',
      'Subscription changes',
      'Data exports',
    ],
  };

  // Customize based on responses
  if (responses.toLowerCase().includes('payment') || responses.toLowerCase().includes('checkout')) {
    recommendations.critical_logs.push('Payment processing events');
    recommendations.security_logs.push('Payment fraud detection');
  }

  if (responses.toLowerCase().includes('file') || responses.toLowerCase().includes('upload')) {
    recommendations.critical_logs.push('File upload/download events');
    recommendations.error_logs.push('File processing failures');
  }

  return recommendations;
}

function generateDefaultImplementationGuide(responses: string): string {
  const hasNode = responses.toLowerCase().includes('node') || responses.toLowerCase().includes('express');
  const hasPython = responses.toLowerCase().includes('python') || responses.toLowerCase().includes('django') || responses.toLowerCase().includes('flask');

  let guide = `# Logging Implementation Guide

## Overview

This guide will help you implement structured logging in your application and ship logs to LogNog.

---

`;

  if (hasNode) {
    guide += `## 1. Logging Setup (Node.js)

### Install Dependencies

\`\`\`bash
npm install pino pino-pretty
\`\`\`

### Create Logger Configuration

\`\`\`javascript
// src/utils/logger.js
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: process.env.SERVICE_NAME || 'my-app',
    environment: process.env.NODE_ENV || 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

module.exports = logger;
\`\`\`

### Usage Examples

\`\`\`javascript
const logger = require('./utils/logger');

// Basic logging
logger.info('Application started');
logger.error({ err: error }, 'Database connection failed');

// With context
logger.info({ userId: user.id, action: 'login' }, 'User logged in');

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: Date.now() - start,
      ip: req.ip,
    }, 'HTTP request');
  });
  next();
});
\`\`\`

`;
  } else if (hasPython) {
    guide += `## 1. Logging Setup (Python)

### Install Dependencies

\`\`\`bash
pip install python-json-logger
\`\`\`

### Create Logger Configuration

\`\`\`python
# utils/logger.py
import logging
import os
from pythonjsonlogger import jsonlogger

def setup_logger(name='app'):
    logger = logging.getLogger(name)
    logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))

    handler = logging.StreamHandler()
    formatter = jsonlogger.JsonFormatter(
        '%(timestamp)s %(level)s %(name)s %(message)s',
        rename_fields={'levelname': 'level', 'asctime': 'timestamp'}
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)

    return logger

logger = setup_logger()
\`\`\`

### Usage Examples

\`\`\`python
from utils.logger import logger

# Basic logging
logger.info('Application started')
logger.error('Database connection failed', exc_info=True)

# With context
logger.info('User logged in', extra={'user_id': user.id, 'action': 'login'})

# Request logging decorator
def log_request(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        start = time.time()
        try:
            result = func(*args, **kwargs)
            logger.info('Request processed', extra={
                'function': func.__name__,
                'duration_ms': (time.time() - start) * 1000
            })
            return result
        except Exception as e:
            logger.error('Request failed', extra={
                'function': func.__name__,
                'error': str(e)
            }, exc_info=True)
            raise
    return wrapper
\`\`\`

`;
  } else {
    guide += `## 1. Logging Setup (Generic)

Choose a structured logging library for your language:

| Language | Recommended Library |
|----------|---------------------|
| Node.js | pino, winston |
| Python | python-json-logger, structlog |
| Go | zap, zerolog |
| Java | logback with JSON encoder |
| Ruby | semantic_logger |
| PHP | monolog with JSON formatter |

### Key Configuration Points

1. **Output format**: Use JSON for structured logging
2. **Log level**: Set via environment variable
3. **Base fields**: Include service name, environment, hostname
4. **Timestamp**: ISO 8601 format

`;
  }

  guide += `## 2. Log Format

### Recommended Structure

\`\`\`json
{
  "timestamp": "2025-01-15T10:30:00.000Z",
  "level": "info",
  "service": "my-app",
  "environment": "production",
  "hostname": "web-01",
  "message": "User logged in",
  "context": {
    "user_id": "12345",
    "action": "login",
    "ip": "192.168.1.100"
  },
  "trace_id": "abc123"
}
\`\`\`

### Required Fields

| Field | Description |
|-------|-------------|
| timestamp | ISO 8601 timestamp |
| level | Log level (debug, info, warn, error) |
| service | Application name |
| message | Human-readable message |

### Recommended Fields

| Field | Description |
|-------|-------------|
| hostname | Server hostname |
| environment | dev/staging/production |
| trace_id | Request correlation ID |
| user_id | Authenticated user |
| duration | Request/operation duration |

---

## 3. Where to Add Logging

### Application Lifecycle

\`\`\`javascript
// Startup
logger.info({ config: sanitizedConfig }, 'Application starting');

// Ready
logger.info({ port: PORT }, 'Application ready');

// Shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down');
});
\`\`\`

### HTTP Requests

Log every incoming request with:
- Method, path, status code
- Duration
- Client IP
- User ID (if authenticated)

### Database Operations

\`\`\`javascript
// Log slow queries
if (duration > 100) {
  logger.warn({ query, duration, params }, 'Slow database query');
}

// Log failures
logger.error({ query, error: err.message }, 'Database query failed');
\`\`\`

### Authentication

\`\`\`javascript
// Success
logger.info({ userId, method: 'password' }, 'Authentication successful');

// Failure
logger.warn({ email, reason: 'invalid_password', ip }, 'Authentication failed');
\`\`\`

### Errors

\`\`\`javascript
// Global error handler
app.use((err, req, res, next) => {
  logger.error({
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.id,
  }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});
\`\`\`

---

## 4. Integration with LogNog

### Option A: LogNog In Agent (Recommended)

1. Install the LogNog In agent on your server
2. Configure it to watch your log files or capture stdout
3. Agent handles batching, retries, and shipping

### Option B: HTTP Direct

\`\`\`javascript
const LOG_NOG_URL = process.env.LOG_NOG_URL;
const LOG_NOG_API_KEY = process.env.LOG_NOG_API_KEY;

async function shipToLogNog(logs) {
  await fetch(\`\${LOG_NOG_URL}/api/ingest/http\`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': LOG_NOG_API_KEY,
    },
    body: JSON.stringify(logs),
  });
}
\`\`\`

### Option C: Syslog (Docker/Linux)

Configure your logging library to output to syslog, then point syslog at LogNog:

\`\`\`
*.* @lognog-server:514
\`\`\`

---

## 5. Dashboard Recommendations

Create these panels in LogNog:

1. **Request Volume** - \`search * | timechart span=5m count\`
2. **Error Rate** - \`search level=error | timechart span=5m count\`
3. **Slow Requests** - \`search duration>1000 | stats count by path\`
4. **Top Errors** - \`search level=error | stats count by message | limit 10\`
5. **Active Users** - \`search user_id!=null | stats dc(user_id)\`

---

## 6. Alert Recommendations

Set up these alerts:

| Alert | Query | Condition |
|-------|-------|-----------|
| High Error Rate | \`search level=error | stats count\` | > 100 in 5 min |
| Authentication Failures | \`search action=login level=warn | stats count\` | > 10 in 5 min |
| Slow API | \`search duration>5000 | stats count\` | > 5 in 5 min |

---

## 7. What NOT to Log

**Never log:**
- Passwords or API keys
- Credit card numbers
- Social Security Numbers
- Personal health information
- Full request/response bodies (may contain PII)

**Mask sensitive data:**
\`\`\`javascript
function maskEmail(email) {
  const [user, domain] = email.split('@');
  return \`\${user[0]}***@\${domain}\`;
}

logger.info({ email: maskEmail(user.email) }, 'Password reset requested');
\`\`\`

---

## Next Steps

1. Implement the logging configuration
2. Add logging to your critical paths
3. Configure log shipping to LogNog
4. Create your first dashboard
5. Set up alerts for critical events

*Need help? Open an issue at github.com/machinekinglabs/lognog*
`;

  return guide;
}

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
    const { getClickHouseClient } = await import('../db/clickhouse.js');
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

// ============================================
// LlamaIndex Routes (Advanced RAG)
// ============================================

// Initialize LlamaIndex on first use
let llamaIndexInitialized = false;

async function ensureLlamaIndexReady(): Promise<boolean> {
  if (!llamaIndexInitialized) {
    try {
      await initializeLlamaIndex();
      await loadOrCreateIndex();
      llamaIndexInitialized = true;
    } catch (error) {
      console.error('Failed to initialize LlamaIndex:', error);
      return false;
    }
  }
  return true;
}

// LlamaIndex status and stats
router.get('/llama/stats', async (_req: Request, res: Response) => {
  try {
    const ready = await ensureLlamaIndexReady();
    if (!ready) {
      return res.status(503).json({ error: 'LlamaIndex not available' });
    }

    const stats = await getIndexStats();
    return res.json({
      available: true,
      ...stats,
    });
  } catch (error) {
    console.error('Error getting LlamaIndex stats:', error);
    return res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Add document to LlamaIndex
router.post('/llama/documents', async (req: Request, res: Response) => {
  try {
    const { title, content, source_type, source_path, metadata } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const ready = await ensureLlamaIndexReady();
    if (!ready) {
      return res.status(503).json({ error: 'LlamaIndex not available' });
    }

    const docId = await llamaAddDocument({
      title,
      content,
      sourceType: source_type,
      sourcePath: source_path,
      metadata,
    });

    return res.json({
      message: 'Document added to LlamaIndex',
      document_id: docId,
    });
  } catch (error) {
    console.error('Error adding document to LlamaIndex:', error);
    return res.status(500).json({ error: 'Failed to add document' });
  }
});

// Query LlamaIndex
router.post('/llama/query', async (req: Request, res: Response) => {
  try {
    const { query, top_k, reasoning } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const ready = await ensureLlamaIndexReady();
    if (!ready) {
      return res.status(503).json({ error: 'LlamaIndex not available' });
    }

    const result = await llamaQueryIndex({
      query,
      topK: top_k || 5,
      useReasoning: reasoning === true,
    });

    return res.json({
      response: result.response,
      model: result.model,
      sources: result.sourceNodes.map(node => ({
        id: node.id,
        title: node.metadata.title || 'Untitled',
        score: node.score,
        excerpt: node.text.substring(0, 300) + '...',
      })),
    });
  } catch (error) {
    console.error('Error querying LlamaIndex:', error);
    return res.status(500).json({ error: 'Failed to query index' });
  }
});

// Chat with LlamaIndex context
router.post('/llama/chat', async (req: Request, res: Response) => {
  try {
    const { message, history, reasoning } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const ready = await ensureLlamaIndexReady();
    if (!ready) {
      return res.status(503).json({ error: 'LlamaIndex not available' });
    }

    const response = await chatWithContext(
      message,
      history || [],
      reasoning === true
    );

    return res.json({ response });
  } catch (error) {
    console.error('Error in LlamaIndex chat:', error);
    return res.status(500).json({ error: 'Failed to process chat' });
  }
});

// Clear LlamaIndex
router.delete('/llama/clear', async (_req: Request, res: Response) => {
  try {
    const ready = await ensureLlamaIndexReady();
    if (!ready) {
      return res.status(503).json({ error: 'LlamaIndex not available' });
    }

    await deleteAllDocuments();
    return res.json({ message: 'LlamaIndex cleared' });
  } catch (error) {
    console.error('Error clearing LlamaIndex:', error);
    return res.status(500).json({ error: 'Failed to clear index' });
  }
});

// Seed LlamaIndex with LogNog documentation
router.post('/llama/seed-docs', async (_req: Request, res: Response) => {
  try {
    const ready = await ensureLlamaIndexReady();
    if (!ready) {
      return res.status(503).json({ error: 'LlamaIndex not available' });
    }

    // LogNog built-in documentation content
    const docs = [
      {
        title: 'LogNog Overview',
        content: `LogNog is a self-hosted, fully-local Splunk alternative for homelab log management. Zero cloud dependencies.
Key features: 100% local data, Splunk-like query language (DSL), built-in alerting and dashboards, supports syslog/OTLP/HTTP ingestion, AI-powered features using local LLMs.
Deploy in under 10 minutes with docker-compose up.`,
      },
      {
        title: 'LogNog Query Language Basics',
        content: `LogNog uses a Splunk-like DSL (Domain Specific Language). Queries are pipelines connected by |.
Basic search: search host=router severity>=warning
Common commands: search, filter, stats, sort, limit, table, timechart, dedup, rename, eval, rex.
Operators: = (exact), != (not), >= <= > < (compare), ~ (regex match), !~ (regex not match).
Example: search app_name=nginx | filter message~"404" | stats count by hostname`,
      },
      {
        title: 'LogNog Statistics Functions',
        content: `Statistics functions for aggregation:
count - count events
sum(field) - sum values
avg(field) - average
min(field) / max(field) - extremes
dc(field) - distinct count
values(field) - list unique values
p50, p90, p95, p99 - percentiles
Examples: stats count by hostname | stats avg(response_time) by endpoint | stats dc(user_id) as unique_users`,
      },
      {
        title: 'LogNog Severity Levels',
        content: `Syslog severity levels (lower = more severe):
0 = Emergency (system unusable)
1 = Alert (immediate action required)
2 = Critical (critical conditions)
3 = Error (error conditions)
4 = Warning (warning conditions)
5 = Notice (normal but significant)
6 = Info (informational)
7 = Debug (debug messages)
Query examples: severity>=error (0-3), severity>=warning (0-4), severity=info (6 only)`,
      },
      {
        title: 'LogNog Ingestion Methods',
        content: `Ways to send logs to LogNog:
1. Syslog (UDP/TCP port 514) - For servers and network devices
2. HTTP API (POST /api/ingest/http) - For applications with JSON payload
3. OTLP (POST /api/ingest/otlp/v1/logs) - OpenTelemetry format
4. LogNog In Agent - Windows/Linux agent for log files and Windows Events
5. Supabase Log Drains (POST /api/ingest/supabase) - For Supabase projects
6. Vercel Log Drains (POST /api/ingest/vercel) - For Vercel deployments
7. SmartThings (POST /api/ingest/smartthings) - For IoT device events
All HTTP endpoints require X-API-Key header for authentication.`,
      },
      {
        title: 'LogNog Timechart Command',
        content: `The timechart command creates time-based aggregations for visualizations.
Syntax: timechart span=<interval> <function> [by <field>]
Intervals: 1m, 5m, 15m, 1h, 1d, 1w
Examples:
timechart span=1h count - hourly event count
timechart span=5m count by hostname - events per 5 min by host
timechart span=1d avg(response_time) - daily average response time`,
      },
      {
        title: 'LogNog Alerts',
        content: `Creating alerts:
1. Go to Alerts page and click Create Alert
2. Enter DSL query (e.g., search severity>=error | stats count)
3. Set threshold condition (when count > X)
4. Choose notification method (email, webhook)
5. Set check interval
Alert examples:
- High errors: search severity>=error | stats count | where count > 50
- Auth failures: search message~"auth.*fail" | stats count | where count > 5
Silencing: Can silence globally, per-host, or per-alert rule`,
      },
      {
        title: 'LogNog Dashboards',
        content: `Creating dashboards:
1. Go to Dashboards and click Create Dashboard
2. Add panels with DSL queries
3. Choose visualization: table, line chart, bar chart, counter, pie chart
4. Save and optionally share
Panel examples:
- Event Overview: search * | stats count by app_name | sort desc count
- Error Timeline: search severity>=error | timechart span=1h count
- Top Hosts: search * | stats count by hostname | sort desc count | limit 10`,
      },
      {
        title: 'LogNog Rex Command',
        content: `The rex command extracts fields using regular expressions.
Syntax: rex field=<field> "<regex with named groups>"
Named groups use (?P<name>pattern) syntax.
Examples:
rex field=message "user=(?P<username>\\w+)" - extract username
rex field=message "status=(?P<status>\\d+)" - extract status code
rex field=message "ip=(?P<client_ip>[\\d.]+)" - extract IP address`,
      },
      {
        title: 'LogNog AI Features',
        content: `AI-powered features (requires Ollama):
1. Natural Language to Query - Ask in English, get DSL query
2. Interview Wizard - Generate logging recommendations for your app
3. LlamaIndex RAG - Chat with indexed documentation
4. Query Explanation - Understand what a DSL query does
AI status: GET /ai/status shows which providers are available
Models used: DeepSeek-Coder-V2 (fast), Qwen3:30b (reasoning)
Fallback: OpenRouter cloud API if Ollama unavailable`,
      },
      {
        title: 'LogNog Troubleshooting',
        content: `Common issues:
Logs not appearing:
- Check Vector: docker logs lognog-vector
- Test syslog: echo "<14>test" | nc -u localhost 514
- Check API health: curl http://localhost:4000/health
Slow queries:
- Add time constraints and limits
- Filter by specific fields (hostname, app_name)
- Avoid search * without limits
AI not working:
- Check Ollama: curl http://localhost:11434/api/tags
- Verify models: ollama list
- Check AI status: curl http://localhost:4000/ai/status`,
      },
      {
        title: 'LogNog Onboarding Guide',
        content: `Getting Started with LogNog - Step by Step:

STEP 1: Deploy LogNog
- Run: docker-compose up -d
- Wait for all containers to start (about 1 minute)
- Access the UI at http://localhost

STEP 2: Create Admin Account
- On first visit, you'll see the setup page
- Create your admin username and password
- This account has full access to all features

STEP 3: Send Your First Logs
- Test syslog: echo "<14>Test message" | nc -u localhost 514
- Check the Search page to see your log appear
- Try a simple query: search *

STEP 4: Set Up Your Log Sources
- Configure your servers/devices to send syslog to LogNog's IP on port 514
- For applications, use the HTTP API with an API key
- Install LogNog In agent for Windows/Linux file monitoring

STEP 5: Create Your First Dashboard
- Go to Dashboards > Create Dashboard
- Add panels with queries like: stats count by hostname
- Save and share with your team

STEP 6: Set Up Alerts
- Go to Alerts > Create Alert
- Use a query like: search severity>=error | stats count
- Set threshold: when count > 10
- Configure email or webhook notifications

STEP 7: Explore AI Features
- Click the AI assistant (purple chat icon)
- Ask questions about DSL syntax
- Use Interview Wizard to generate logging recommendations`,
      },
      {
        title: 'LogNog Source Types and Templates',
        content: `LogNog supports various log source types with built-in templates:

NETWORK DEVICES:
- Routers (Cisco, MikroTik, Ubiquiti)
- Firewalls (pfSense, OPNsense, iptables)
- Switches and access points
Query: search sourcetype=firewall | stats count by action

WEB SERVERS:
- Nginx access and error logs
- Apache HTTP Server
- Traefik, Caddy
Query: search sourcetype=nginx | rex field=message "\\\"(?P<method>\\w+) (?P<path>[^\\\"]+)"

DATABASES:
- MySQL/MariaDB slow queries and errors
- PostgreSQL
- MongoDB, Redis
Query: search sourcetype=mysql severity>=warning

SECURITY/AUTH:
- sshd login attempts
- sudo commands
- Authentication services
Query: search sourcetype=sshd | filter message~"Failed|Accepted"

CONTAINERS:
- Docker container logs
- Kubernetes events
- Container orchestration
Query: search sourcetype=docker | stats count by container_name

APPLICATIONS:
- Custom application logs via HTTP API
- Structured JSON logs
- OpenTelemetry traces
Query: search sourcetype=application | stats count by service_name

IOT/SMART HOME:
- SmartThings device events
- Home automation systems
Query: search sourcetype=smartthings | stats count by device_name

CLOUD SERVICES:
- Supabase Log Drains (database, auth, storage, edge functions)
- Vercel Log Drains (serverless, edge, static)
Query: search sourcetype=supabase | stats count by event_type`,
      },
      {
        title: 'Splunk to LogNog Migration Guide',
        content: `SPLUNK TO LOGNOG QUICK REFERENCE

COMMAND EQUIVALENTS:
Splunk SPL → LogNog DSL

index=main → search *
index=main host=server1 → search hostname=server1
sourcetype=syslog → search sourcetype=syslog
| stats count by host → | stats count by hostname
| stats count, sum(bytes) → | stats count, sum(bytes)
| top 10 host → | top 10 hostname
| rare host → | rare hostname
| sort -count → | sort desc count
| head 100 → | limit 100 (or | head 100)
| tail 50 → | tail 50
| dedup host → | dedup hostname
| table host, message → | table hostname, message
| fields - _raw → | fields - raw
| rename host AS server → | rename hostname as server
| rex field=message "user=(?<user>\\w+)" → | rex field=message "user=(?P<user>\\w+)"
| eval new_field=field1+field2 → | eval new_field=field1+field2
| where count > 10 → | where count > 10
| timechart span=1h count → | timechart span=1h count

KEY DIFFERENCES:
1. LogNog requires explicit "search" command (Splunk allows implicit)
2. Field names use snake_case: hostname, app_name, severity (not host, sourcetype)
3. Time range is set in UI/API, not in query (no earliest= or latest=)
4. Regex named groups use Python syntax: (?P<name>pattern) not (?<name>pattern)
5. Regex match operator is ~ not regex: message~"error"
6. Use != for not equal, !~ for regex not match

EXAMPLE TRANSLATIONS:
Splunk: index=main host=web* status>=400 | stats count by host, status | sort -count
LogNog: search hostname~"web.*" status>=400 | stats count by hostname, status | sort desc count

Splunk: index=security action=failed | stats count by src_ip | where count > 5
LogNog: search action=failed | stats count by src_ip | where count > 5`,
      },
      {
        title: 'LogNog Common Query Templates',
        content: `READY-TO-USE QUERY TEMPLATES

ERROR MONITORING:
# All errors in last hour
search severity>=error

# Error count by host
search severity>=error | stats count by hostname | sort desc count

# Error timeline
search severity>=error | timechart span=5m count

SECURITY QUERIES:
# Failed SSH logins
search app_name=sshd message~"Failed password" | stats count by hostname

# Authentication events
search message~"auth|login|password" severity>=warning

# Sudo commands
search app_name=sudo | table timestamp, hostname, message

WEB SERVER ANALYSIS:
# Nginx/Apache errors
search app_name~"nginx|apache" severity>=error | stats count by hostname

# HTTP status codes
search sourcetype=nginx | rex field=message "HTTP/\\d.\\d\" (?P<status>\\d+)" | stats count by status

# Top requested URLs
search sourcetype=nginx | rex field=message "\"\\w+ (?P<url>[^\\s]+)" | top 20 url

PERFORMANCE MONITORING:
# Event volume over time
search * | timechart span=1h count

# Top talkers (most logs)
search * | stats count by hostname | sort desc count | limit 10

# Errors by application
search severity>=error | stats count by app_name | sort desc count

NETWORK/FIREWALL:
# Blocked traffic
search action=blocked | stats count by src_ip, dst_ip

# Connection summary
search sourcetype=firewall | stats count by action | sort desc count

CONTAINER/DOCKER:
# Container errors
search sourcetype=docker severity>=warning | stats count by container_name

# Container log volume
search sourcetype=docker | timechart span=5m count by container_name`,
      },
      {
        title: 'LogNog API Keys and Authentication',
        content: `Authentication in LogNog:

USER AUTHENTICATION:
- Login at /login with username/password
- JWT tokens for session management
- Role-based access: admin, user, readonly

API KEYS (for programmatic access):
- Create in Settings > API Keys
- Used for log ingestion and API access
- Include in requests: X-API-Key header

CREATING API KEYS:
1. Go to Settings > API Keys
2. Click "Create API Key"
3. Give it a descriptive name
4. Copy the key (shown only once!)
5. Use in your applications

USING API KEYS:
curl -X POST http://localhost/api/ingest/http \\
  -H "X-API-Key: your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '[{"message": "test log", "severity": 6}]'

REVOKING KEYS:
- Go to Settings > API Keys
- Click delete on the key to revoke
- Revoked keys stop working immediately`,
      },
      {
        title: 'LogNog Anomaly Detection (UEBA)',
        content: `ANOMALY DETECTION - User and Entity Behavior Analytics

WHAT IT IS:
LogNog learns what "normal" looks like for your users, hosts, and applications, then alerts you when something unusual happens. Traditional alerts are static thresholds ("alert if failed logins > 5"), but anomaly detection learns each entity's unique baseline so "unusual" is personalized.

HOW IT WORKS:
1. Baselines: LogNog calculates moving averages for metrics like login counts, data transferred, error rates, activity by hour/day
2. Detection: When a new value deviates significantly (X standard deviations) from baseline, it's flagged as anomalous
3. LLM Analysis: Optional AI review provides risk scores (0-100), plain English explanations, and investigation steps

EXAMPLE SCENARIOS:
- User normally logs in 9-5 from Seattle, suddenly logs in at 3am from Russia
- Host normally sends 50MB/day, today sent 5GB (data exfiltration?)
- Service account with 0 failed logins suddenly has 50 in 5 minutes
- Employee accessing files they've never touched after giving notice

HOW TO USE:
1. Go to Anomaly in the sidebar
2. View Risk Dashboard showing entities with highest risk scores
3. Click anomaly to see: baseline vs actual value, AI analysis, recommendations
4. Mark as "true positive" or "false positive" to improve accuracy

Similar to Splunk UBA, but built-in and runs locally with Ollama.`,
      },
      {
        title: 'LogNog Assets and Identities',
        content: `ASSETS & IDENTITIES - Auto-discovered inventory from logs

WHAT IT IS:
A database of all "things" (assets) and "people" (identities) in your environment, automatically discovered from your logs.

Assets: Servers, workstations, network devices, applications, databases
Identities: Users, service accounts, API keys, email addresses

WHY IT MATTERS:
When you see "Failed login from 192.168.1.50 for jsmith" you want to know:
- Is 192.168.1.50 a critical server or random workstation?
- Is jsmith in finance or IT? A privileged admin?
- When did we first see this IP? Is it new?

HOW IT WORKS:
1. Auto-Discovery: LogNog scans logs and extracts hostnames, IPs, MAC addresses → Assets; usernames, emails, service accounts → Identities
2. Enrichment: Add metadata like criticality (1-100), owner, department/role, privileged flag
3. Correlation: When viewing logs or anomalies, see full context about who/what is involved

HOW TO USE:
1. Go to Assets or Identities in the sidebar
2. Click Discover to auto-populate from recent logs
3. Edit entries to add criticality scores, owners, tags
4. Use in searches: search host=* | lookup assets by hostname

Similar to Splunk Asset & Identity Framework from Enterprise Security, but simpler.`,
      },
      {
        title: 'LogNog Common Information Model (CIM)',
        content: `COMMON INFORMATION MODEL - Normalize field names across log sources

WHAT IT IS:
A way to standardize field names so you can write ONE query that works across all log sources.

THE PROBLEM:
Different systems call the same thing different names:
- Windows: AccountName, IpAddress, EventType
- Linux: user, src, action
- AWS CloudTrail: userIdentity.userName, sourceIPAddress, eventName
- Firewall: srcuser, src_ip, act

Without CIM: You need different searches for each source
With CIM: Write one search using standard field names

DATA MODELS (built-in):
- Authentication: user, src, dest, action, result
- Network Traffic: src_ip, dest_ip, src_port, dest_port, bytes
- Endpoint: host, process, file_path, action
- Web: src_ip, uri, method, status, user_agent

HOW TO USE:
1. Go to Data Models in the sidebar
2. View built-in models (Authentication, Network, etc.)
3. Click Field Mappings to set up translations
4. Example: Source Type=windows:security, Source Field=AccountName, CIM Field=user
5. Now searches using "user" automatically find Windows AccountName

BEFORE CIM:
search (sourcetype=windows AccountName=admin) OR (sourcetype=linux user=admin) OR (sourcetype=aws userIdentity.userName=admin)

AFTER CIM:
search user=admin

Similar to Splunk Common Information Model, just simplified.`,
      },
      {
        title: 'LogNog AI Agent Framework',
        content: `AI AGENT - Conversational assistant that searches and investigates logs

WHAT IT IS:
An AI assistant you can talk to in plain English. It searches logs, investigates issues, looks up assets, and creates alerts - all through natural conversation.

THE PROBLEM IT SOLVES:
Writing log queries requires knowing query syntax, field names, and how to structure complex searches. The AI Agent lets you just ask questions.

AGENT PERSONAS:
- Security Analyst: Threat hunting, investigating incidents
- SRE: Troubleshooting outages, performance issues
- Compliance: Audit queries, access reviews

WHAT THE AGENT CAN DO:
- "Show me failed logins in the last hour" → Runs: search action=failure | stats count by user
- "Is there anything unusual with the database server?" → Checks anomalies, reviews recent errors
- "Who logged into the VPN from outside the US?" → Searches VPN logs, enriches IPs with GeoIP, filters by country
- "Create an alert for more than 10 failed SSH logins" → Creates alert rule with proper thresholds

AVAILABLE TOOLS:
- search_logs: Execute DSL queries
- get_asset: Look up asset details
- enrich_ip: GeoIP lookup
- create_alert: Create alert rules
- get_anomalies: Check anomaly data

HOW TO USE:
1. Go to AI Agent in the sidebar
2. Select a persona (or use default)
3. Type your question in plain English
4. Watch the AI think, run searches, provide answers with evidence
5. Ask follow-up questions to dig deeper

Similar to Splunk AI Assistant, but runs locally with Ollama - no cloud costs.`,
      },
      {
        title: 'LogNog Synthetic Monitoring',
        content: `SYNTHETIC MONITORING - Proactive uptime testing

WHAT IT IS:
Automated tests that regularly check if your websites, APIs, and services are up and responding correctly - like a robot user continuously testing your services.

THE PROBLEM IT SOLVES:
Traditional monitoring is reactive - you find out something is down when users complain or logs show errors. Synthetic monitoring is proactive - it continuously tests from the outside and alerts before real users are affected.

TEST TYPES:
- HTTP: Is this URL responding with 200 OK?
- API: Does endpoint return valid JSON with expected fields?
- TCP: Can we connect to this database port?
- Browser: Full page render test (coming soon)

ASSERTIONS YOU CAN ADD:
- status equals 200
- responseTime lessThan 1000 (ms)
- body contains "Welcome"
- header Content-Type contains application/json
- jsonPath data.status equals "healthy"

EXAMPLE TESTS:
- Homepage returns 200: Know immediately if site is down
- API response < 500ms: Catch performance degradation before users notice
- Login page contains "Sign In": Detect if page is broken or showing errors
- Database port reachable: Know if DB is accepting connections

HOW TO USE:
1. Go to Synthetic in the sidebar
2. Click New Test
3. Fill in: Name, Type (HTTP/TCP/API), URL, Schedule (every 5 min), Assertions
4. Save and watch dashboard for results
5. View history for uptime percentages and trends

ALERTING:
After X consecutive failures, trigger an alert via email or webhook.

Similar to Splunk Synthetic Monitoring (formerly Rigor), but built-in and free.`,
      },
      {
        title: 'LogNog Feature Quick Reference',
        content: `LOGNOG FEATURE QUICK REFERENCE

WHERE TO FIND EVERYTHING:
| Feature | Sidebar Location | What You'll See |
|---------|------------------|-----------------|
| Anomaly Detection | Anomaly | Risk dashboard, anomaly timeline, baseline charts |
| Assets | Assets | Asset inventory, criticality scores, discovery |
| Identities | Identities | User/account inventory, privilege flags |
| Data Models (CIM) | Data Models | Field definitions, mappings, validation |
| AI Agent | AI Agent | Chat interface, tool execution, personas |
| Synthetic Monitoring | Synthetic | Test list, uptime stats, results history |

GETTING STARTED RECOMMENDATIONS:

If just exploring:
1. AI Agent: Ask "What are the most common errors in the last hour?"
2. Synthetic: Add HTTP check for a website you care about
3. Assets: Click Discover to auto-populate from logs

If you want security monitoring:
1. Run Asset & Identity discovery
2. Set criticality on important servers
3. Enable Anomaly Detection baseline calculation
4. Review Risk Dashboard daily

If you want unified searching:
1. Set up CIM field mappings for your main log sources
2. Now searches like user=admin work everywhere

FAQ:
Q: Does this require cloud services? No - everything runs locally with Ollama
Q: Will this slow down my system? Minimal - baselines calculate in background
Q: Do I need to set up everything? No - each feature is independent`,
      },
      {
        title: 'LogNog Index Management and Data Sources',
        content: `INDEX MANAGEMENT - How logs are organized in LogNog

HOW INDEXES WORK:
Logs are grouped into indexes (similar to Splunk indexes or folders). Each log belongs to one index.
- Default index is 'main' if not specified during ingestion
- Different ingestion sources have default indexes: agent='agent', supabase='supabase', vercel='vercel', http='http', otel='otel'
- You can specify a custom index when sending logs

HOW TO SPECIFY CUSTOM INDEX:
When sending logs via HTTP API, add the X-Index header:
curl -X POST /api/ingest/http \\
  -H "X-Index: my-custom-app" \\
  -H "X-API-Key: your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '[{"message": "test log", "severity": 6}]'

Index name rules:
- Lowercase only
- Alphanumeric characters, hyphens, and underscores allowed
- Must start with a letter
- Maximum 32 characters
- Special characters are removed automatically

WHERE TO VIEW YOUR INDEXES:
Go to Data Sources in the sidebar, then click the Active Sources tab.
- See all indexes with their log counts
- View which app_names/sources are sending to each index
- Check error counts and last seen timestamps

CAN I RENAME AN INDEX?
No - once logs are ingested to an index, they cannot be moved to a different index.
To use a different index name, update your log sender to use the X-Index header with the desired name.

HOW TO NORMALIZE FIELDS ACROSS DIFFERENT SOURCES:
Use the Common Information Model (CIM) feature:
1. Go to Data Models in the sidebar
2. Create field mappings to translate different field names to standard names
3. Example: Map Windows 'AccountName' and Linux 'user' both to CIM field 'user'
4. Then queries like 'search user=admin' work across all sources

DATA SOURCES PAGE FEATURES:
- Active Sources tab: See all indexes and sources currently sending logs
- Source Templates tab: Pre-configured templates for common log sources (MySQL, Nginx, sshd, etc.)
- Each template includes: field extraction patterns, sample queries, setup instructions`,
      },
    ];

    // Add documents to LlamaIndex
    let added = 0;
    for (const doc of docs) {
      try {
        await llamaAddDocument({
          title: doc.title,
          content: doc.content,
          sourceType: 'builtin-docs',
          metadata: { category: 'documentation' },
        });
        added++;
      } catch (error) {
        console.error(`Failed to add doc: ${doc.title}`, error);
      }
    }

    return res.json({
      message: 'Documentation seeded successfully',
      added,
      total: docs.length,
    });
  } catch (error) {
    console.error('Error seeding documentation:', error);
    return res.status(500).json({ error: 'Failed to seed documentation' });
  }
});

// Seed FTS-only (for hybrid search fallback when Ollama unavailable)
router.post('/llama/seed-fts', async (_req: Request, res: Response) => {
  try {
    // LogNog documentation for FTS search (same as seed-docs but without LlamaIndex)
    const docs = [
      { title: 'LogNog Overview', content: 'LogNog is a self-hosted, fully-local Splunk alternative for homelab log management. Zero cloud dependencies. Key features: 100% local data, Splunk-like query language (DSL), built-in alerting and dashboards, supports syslog/OTLP/HTTP ingestion, AI-powered features using local LLMs. Deploy in under 10 minutes with docker-compose up.' },
      { title: 'LogNog Query Language Basics', content: 'LogNog uses a Splunk-like DSL (Domain Specific Language). Queries are pipelines connected by |. Basic search: search host=router severity>=warning. Common commands: search, filter, stats, sort, limit, table, timechart, dedup, rename, eval, rex. Operators: = (exact), != (not), >= <= > < (compare), ~ (regex match), !~ (regex not match). Example: search app_name=nginx | filter message~"404" | stats count by hostname' },
      { title: 'LogNog Statistics Functions', content: 'Statistics functions for aggregation: count - count events, sum(field) - sum values, avg(field) - average, min(field) / max(field) - extremes, dc(field) - distinct count, values(field) - list unique values, list(field) - collect all values, p50/p90/p95/p99 - percentiles, stddev(field) - standard deviation, variance(field) - variance, range(field) - max minus min, earliest(field)/latest(field) - first/last value. Example: search * | stats count, avg(response_time), p95(response_time) by hostname' },
      { title: 'Searching for Errors', content: 'To search for errors in LogNog: search severity>=4 finds warnings and errors (syslog severity 4 = warning, 3 = error, 2 = critical). search message~"error|fail|exception" searches message content. search app_name=nginx severity<=3 finds critical errors from nginx. Combine with stats: search severity<=3 | stats count by hostname, app_name | sort desc count. Use timechart for error trends: search severity<=3 | timechart span=1h count by app_name' },
      { title: 'Time Filtering', content: 'LogNog uses the time picker in the UI for time ranges. Default is last 15 minutes. Time syntax in queries: earliest=-24h (last 24 hours), latest=-1h (up to 1 hour ago), earliest=2024-01-01T00:00:00 (specific time). The bin command buckets by time: bin span=1h timestamp creates hourly buckets. timechart is a shortcut: timechart span=5m count by hostname gives time-series data for charts.' },
      { title: 'Ingestion Methods', content: 'LogNog supports multiple ingestion methods: Syslog UDP/TCP port 514 for network devices, OTLP endpoint POST /api/ingest/otlp/v1/logs for OpenTelemetry, HTTP POST /api/ingest for generic JSON logs, LogNog In Agent for Windows Event Logs and file monitoring, Supabase Log Drains POST /api/ingest/supabase, Vercel Log Drains POST /api/ingest/vercel. All except syslog support API key authentication via X-API-Key header.' },
      { title: 'Dashboard Creation', content: 'To create dashboards: Go to Dashboards page, click New Dashboard, add panels using the DSL query editor. Panel types: Time series chart, table, single value stat, bar chart, pie chart. Use variables for dynamic dashboards: $hostname$ in queries, define in dashboard settings. Annotations mark events on charts. Dashboards auto-refresh (configurable interval).' },
      { title: 'Alerts Configuration', content: 'LogNog alerts: Create from Alerts page or convert saved search. Define DSL query that returns results when alert should fire. Set schedule (cron syntax). Notification channels: email via SMTP, Slack/Discord/Telegram via Apprise. Alert silencing: global, per-host, or per-alert. Silence scheduling with expiration time.' },
    ];

    let added = 0;
    for (const doc of docs) {
      try {
        createRAGDocument({
          title: doc.title,
          content: doc.content,
          source_type: 'builtin-docs',
          metadata: JSON.stringify({ category: 'documentation' }),
        });
        added++;
      } catch (error) {
        console.error(`Failed to add doc to FTS: ${doc.title}`, error);
      }
    }

    return res.json({
      message: 'FTS documentation seeded successfully',
      added,
      total: docs.length,
    });
  } catch (error) {
    console.error('Error seeding FTS documentation:', error);
    return res.status(500).json({ error: 'Failed to seed FTS documentation' });
  }
});

// =============================================================================
// AI ASSISTANT CHAT (for in-app help)
// =============================================================================

// Chat endpoint for in-app AI assistant
router.post('/assistant/chat', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Try to use RAG with queryIndex (which works better than chatEngine)
    const llamaReady = await ensureLlamaIndexReady();
    let response: string;
    let sources: Array<{ title: string; score?: number }> = [];

    if (llamaReady) {
      // Use LlamaIndex query engine with system context
      const assistantContext = `You are the LogNog AI Assistant. Help the user with their question about LogNog - a self-hosted log management platform.
Be concise and practical. When suggesting DSL queries, explain what they do.

User question: ${message}`;

      const result = await llamaQueryIndex({
        query: assistantContext,
        topK: 3,
        useReasoning: false, // use fast model for assistant
      });
      response = result.response;
      sources = result.sourceNodes.map(node => ({
        title: node.metadata?.title as string || 'Unknown',
        score: node.score,
      }));
    } else {
      // Fallback to direct generation
      const systemPrompt = `You are the LogNog AI Assistant, a helpful guide for LogNog - a self-hosted log management platform.
Help users write DSL queries, explain features, troubleshoot issues, and guide setup.
Be concise and practical.`;

      const genResult = await generateText(
        `${systemPrompt}\n\nUser: ${message}\n\nAssistant:`,
        { useReasoning: false }
      );
      response = genResult.response;
    }

    return res.json({
      response,
      sources,
      source: llamaReady ? 'llamaindex' : 'direct',
    });
  } catch (error) {
    console.error('Error in assistant chat:', error);
    return res.status(500).json({ error: 'Failed to process message' });
  }
});

// =============================================================================
// NOGCHAT - INTELLIGENT ASSISTANT WITH DATA INSIGHTS
// =============================================================================

// NogChat system prompt - expert on LogNog, helpful for Splunk users
const NOGCHAT_SYSTEM_PROMPT = `You are NogChat, the intelligent assistant for LogNog - a self-hosted Splunk alternative.

YOUR EXPERTISE:
- LogNog DSL query language (similar to Splunk SPL)
- Log ingestion from syslog, HTTP, OTLP, agents
- Alerts, dashboards, and monitoring best practices
- Helping Splunk users transition to LogNog
- All LogNog features including security, monitoring, and AI capabilities

YOUR PERSONALITY:
- Concise and practical - give actionable answers
- When showing queries, use markdown code blocks with the query
- Explain what queries do in simple terms
- If you don't know something, say so

QUERY FORMATTING:
- Always wrap DSL queries in triple backticks
- Explain each part of complex queries
- Suggest improvements when relevant

SPLUNK TRANSLATION:
When users ask about Splunk equivalents, provide the LogNog equivalent and explain differences.
Key differences:
- LogNog uses "search" instead of implicit search
- Field names use snake_case (hostname, app_name, severity)
- Time ranges are passed separately, not in query
- regex uses ~ operator: message~"pattern"

=== LOGNOG FEATURES ===

## 1. ANOMALY DETECTION (UEBA)
User and Entity Behavior Analytics - learns what "normal" looks like, then alerts on unusual behavior.

How it works:
- Calculates moving averages for metrics (login counts, bytes sent, error rates)
- Tracks patterns by hour of day and day of week
- Flags events that deviate significantly from baseline
- Optional LLM analysis provides risk scores (0-100) and explanations

Location: Go to "Anomaly" in the sidebar
- View Risk Dashboard showing entities with highest risk scores
- Click anomalies to see baseline vs actual value + AI analysis
- Mark anomalies as true/false positive to improve accuracy

Example use cases:
- User normally logs in 9-5 from Seattle, suddenly logs in at 3am from Russia
- Host normally sends 50MB/day, today it sent 5GB (data exfiltration?)
- Service account with 0 failed logins suddenly has 50 in 5 minutes

Similar to: Splunk UBA (User Behavior Analytics), but runs locally with Ollama

## 2. ASSETS & IDENTITIES
Auto-discovered inventory of devices and users from your logs.

Assets = servers, workstations, network devices, applications, databases
Identities = users, service accounts, API keys, email addresses

How to use:
- Go to "Assets" or "Identities" in the sidebar
- Click "Discover" to auto-populate from recent logs
- Edit entries to add criticality scores (1-100), owners, tags
- Use in searches: search host=* | lookup assets by hostname

Why it matters:
- When you see "Failed login from 192.168.1.50 for jsmith" you know:
  - Is that IP a critical server or random workstation?
  - Is jsmith in finance or IT? Privileged admin?
  - When did we first see this IP?

Similar to: Splunk Asset & Identity Framework from Enterprise Security

## 3. COMMON INFORMATION MODEL (CIM) / DATA MODELS
Normalizes field names across different log sources for unified queries.

The problem: Different systems call the same thing different names:
- Windows: AccountName, IpAddress, EventType
- Linux: user, src, action
- AWS: userIdentity.userName, sourceIPAddress, eventName
- Firewall: srcuser, src_ip, act

With CIM, write ONE query using standard names:
- Authentication model: user, src, dest, action, result
- Network model: src_ip, dest_ip, src_port, dest_port, bytes
- Endpoint model: host, process, file_path, action
- Web model: src_ip, uri, method, status, user_agent

How to use:
- Go to "Data Models" in the sidebar
- View built-in models (Authentication, Network, etc.)
- Click "Field Mappings" to set up translations
- Example: Map Windows AccountName → user, then search user=admin works everywhere

Similar to: Splunk Common Information Model, just simplified

## 4. AI AGENT
Conversational AI that searches logs and investigates issues using natural language.

Available Personas:
- Security Analyst: Threat hunting, investigating incidents
- SRE: Troubleshooting outages, performance issues
- Compliance: Audit queries, access reviews

What it can do:
- "Show me failed logins in the last hour" → runs appropriate DSL query
- "Is there anything unusual with the database server?" → checks anomalies
- "Who logged into the VPN from outside the US?" → searches + GeoIP enrichment
- "Create an alert for more than 10 failed SSH logins" → creates alert rule

How to use:
- Go to "AI Agent" in the sidebar
- Select a persona (or use default)
- Type questions in plain English
- Watch the AI think, run searches, and provide answers with evidence

Similar to: Splunk AI Assistant, but runs locally with Ollama

## 5. SYNTHETIC MONITORING
Proactive uptime testing - automated tests that regularly check if services are up.

Test Types:
- HTTP: Is this URL responding with 200 OK?
- API: Does this endpoint return valid JSON with expected fields?
- TCP: Can we connect to this database port?
- Browser: Full page render test (coming soon)

Assertions you can add:
- Status code equals 200
- Response time under 500ms
- Body contains "healthy"
- JSON path data.status equals "ok"

How to use:
- Go to "Synthetic" in the sidebar
- Click "New Test"
- Fill in: Name, Type (HTTP/TCP/API), URL, Schedule (every 5 min), Assertions
- Save and watch dashboard for results
- View history for uptime percentages and trends

Similar to: Splunk Synthetic Monitoring (formerly Rigor), but built-in and free

## 6. INDEX MANAGEMENT & DATA SOURCES
How logs are organized and how to customize where they go.

HOW INDEXES WORK:
- Logs are grouped into indexes (like folders in Splunk)
- Default index is 'main' if not specified
- Each ingestion source has a default: agent='agent', supabase='supabase', vercel='vercel', http='http'
- View all your indexes: Go to Data Sources in the sidebar → Active Sources tab

HOW TO SPECIFY CUSTOM INDEX (when sending logs):
- HTTP API: Add X-Index header to your request
  Example: curl -H "X-Index: my-custom-app" -H "X-API-Key: <key>" -d '[{"message":"test"}]' /api/ingest/http
- Index name rules: lowercase, alphanumeric with hyphens/underscores, max 32 characters
- Once logs are ingested, their index cannot be changed

WHERE TO SEE YOUR INDEXES:
- Go to Data Sources in the sidebar
- Active Sources tab shows all indexes with log counts
- Each index shows: sources (app_names), log count, error count, last seen
- Click an index to filter and see which sources are sending to it

HOW TO NORMALIZE FIELDS ACROSS SOURCES (CIM):
- Different sources use different field names for the same thing
- Go to Data Models in the sidebar to set up field mappings
- Example: Map Windows 'AccountName' AND Linux 'user' → standard CIM field 'user'
- Then search user=admin works across all sources

COMMON QUESTIONS:
- "How do I rename an index?" → You can't rename after ingestion. Set the index when sending logs using X-Index header.
- "How do I see where my logs are coming from?" → Data Sources → Active Sources shows all sources by index.
- "How do I organize logs from my app?" → Use X-Index header to send to a custom index like "my-app-name".
- "How do I make field names consistent?" → Use Data Models (CIM) to create field mappings.

=== QUICK NAVIGATION ===
| Feature | Sidebar Location |
|---------|------------------|
| Anomaly Detection | Anomaly |
| Assets | Assets |
| Identities | Identities |
| Data Models (CIM) | Data Models |
| AI Agent | AI Agent |
| Synthetic Monitoring | Synthetic |
| Data Sources / Indexes | Data Sources |

All features run locally - no cloud dependencies. AI uses OpenRouter (cloud) or Ollama (local) depending on configuration.`;

// Execute a DSL query and return results for insights
async function executeInsightQuery(query: string): Promise<{ results: Record<string, unknown>[]; error?: string }> {
  try {
    const result = await executeDSLQuery(query, { earliest: '-24h', latest: 'now' });
    return { results: result.results.slice(0, 20) }; // Limit for context
  } catch (error) {
    return { results: [], error: String(error) };
  }
}

// NogChat endpoint with data insights capability and hybrid RAG
router.post('/nogchat', async (req: Request, res: Response) => {
  try {
    const {
      message,
      requestInsights,
      history,
      useHybridSearch = true,
      useReranking = false,
      includeCitations = true,
    } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Check if Ollama is actually available (for embeddings and generation)
    const ollamaAvailable = await isOllamaAvailable();
    const llamaReady = ollamaAvailable && await ensureLlamaIndexReady();
    let response: string;
    let executedQuery: string | undefined;
    let responseType: 'text' | 'query' | 'insight' = 'text';
    let citations: CitedSource[] = [];
    let searchStats: {
      vectorMatches: number;
      textMatches: number;
      hybridMatches: number;
      reranked: boolean;
      totalTimeMs: number;
    } | undefined;

    // Build conversation context from history
    const historyContext = (history || [])
      .slice(-4)
      .map((msg: { role: string; content: string }) => `${msg.role}: ${msg.content}`)
      .join('\n');

    // Check if user wants data insights
    if (requestInsights) {
      // First, ask AI to generate a query for insights
      const queryGenPrompt = `${NOGCHAT_SYSTEM_PROMPT}

The user wants to analyze their log data. Generate a LogNog DSL query to help answer their question.
Only respond with the DSL query, nothing else. Make it useful for getting insights.

User question: ${message}

DSL Query:`;

      let insightQuery = 'search * | stats count by hostname | sort desc count | limit 10';

      if (llamaReady) {
        const queryResult = await llamaQueryIndex({
          query: queryGenPrompt,
          topK: 2,
          useReasoning: false,
        });
        // Extract query from response
        const queryMatch = queryResult.response.match(/```(?:\w+)?\n?([\s\S]*?)```/) ||
                          queryResult.response.match(/^(search\s+[\s\S]+)$/m);
        if (queryMatch) {
          insightQuery = queryMatch[1].trim();
        } else if (queryResult.response.trim().startsWith('search')) {
          insightQuery = queryResult.response.trim().split('\n')[0];
        }
      }

      // Execute the query
      const { results, error } = await executeInsightQuery(insightQuery);
      executedQuery = insightQuery;
      responseType = 'insight';

      // Now ask AI to interpret the results
      const interpretPrompt = `${NOGCHAT_SYSTEM_PROMPT}

The user asked: "${message}"

I ran this query: ${insightQuery}

Results (${results.length} rows):
${JSON.stringify(results.slice(0, 10), null, 2)}
${error ? `\nError: ${error}` : ''}

Provide a helpful analysis of these results. What patterns do you see? What should the user know?
If the results are empty, suggest a different approach.`;

      if (llamaReady) {
        const analysisResult = await llamaQueryIndex({
          query: interpretPrompt,
          topK: 2,
          useReasoning: false,
        });
        response = analysisResult.response;
      } else {
        const genResult = await generateText(interpretPrompt, { useReasoning: false });
        response = genResult.response;
      }
    } else {
      // Regular chat - use hybrid RAG for documentation
      let sourceResults: HybridSearchResult[] = [];

      if (useHybridSearch) {
        try {
          // Perform hybrid search (vector + full-text)
          // FTS works even without Ollama, vector search will gracefully return []
          const hybridResult: HybridSearchResponse = await hybridSearch(message, {
            topK: 10,
            vectorWeight: llamaReady ? 0.7 : 0,  // Skip vector weighting if Ollama unavailable
            textWeight: llamaReady ? 0.3 : 1.0,  // Use full text weight as fallback
          });

          sourceResults = hybridResult.results;
          searchStats = {
            vectorMatches: hybridResult.stats.vectorMatches,
            textMatches: hybridResult.stats.textMatches,
            hybridMatches: hybridResult.stats.hybridMatches,
            reranked: false,
            totalTimeMs: hybridResult.stats.totalTimeMs,
          };

          // Optional: Re-rank results with LLM (requires Ollama)
          if (useReranking && sourceResults.length > 0 && llamaReady) {
            const rerankStart = Date.now();
            const rerankResult = await rerankWithLLM(message, sourceResults, { topK: 5 });
            sourceResults = rerankResult.results;
            if (searchStats) {
              searchStats.reranked = rerankResult.reranked;
              searchStats.totalTimeMs += Date.now() - rerankStart;
            }
          }

          // Format citations
          if (includeCitations && sourceResults.length > 0) {
            citations = formatCitations(sourceResults, message, {
              excerptLength: 200,
              highlightTag: 'mark',
            });
          }
        } catch (hybridError) {
          console.warn('Hybrid search failed, falling back to standard query:', hybridError);
        }
      }

      // Build context from retrieved sources
      const sourceContext = sourceResults.length > 0
        ? `\n\nRelevant documentation:\n${sourceResults.slice(0, 5).map(s =>
            `- ${s.title}: ${s.content.substring(0, 300)}...`
          ).join('\n')}`
        : '';

      const chatPrompt = `${NOGCHAT_SYSTEM_PROMPT}
${sourceContext}
${historyContext ? `\nRecent conversation:\n${historyContext}\n` : ''}
User: ${message}

Provide a helpful, concise response. If suggesting queries, wrap them in code blocks.
${citations.length > 0 ? 'Reference the documentation sources in your answer when relevant.' : ''}`;

      if (llamaReady) {
        const result = await llamaQueryIndex({
          query: chatPrompt,
          topK: 4,
          useReasoning: false,
        });
        response = result.response;

        // Check if response contains a query
        if (response.includes('```') || response.includes('search ')) {
          responseType = 'query';
        }
      } else {
        // Try generateText which has Ollama/OpenRouter fallback
        try {
          const genResult = await generateText(chatPrompt, { useReasoning: false });
          response = genResult.response;
        } catch (genError) {
          // Final fallback: return citations without AI response
          console.warn('AI generation unavailable, returning citations only:', genError);
          if (citations.length > 0) {
            response = `I found ${citations.length} relevant documentation sources for your question. Please see the citations panel for details.`;
          } else {
            response = 'AI services are currently unavailable. Please try again later or check that Ollama is running.';
          }
        }
      }
    }

    // Build response with optional citations
    const responseBody: {
      response: string;
      type: 'text' | 'query' | 'insight';
      executedQuery?: string;
      citations?: CitedSource[];
      searchStats?: typeof searchStats;
    } = {
      response,
      type: responseType,
      executedQuery,
    };

    if (includeCitations && citations.length > 0) {
      responseBody.citations = citations;
    }

    if (searchStats) {
      responseBody.searchStats = searchStats;
    }

    return res.json(responseBody);
  } catch (error) {
    console.error('Error in NogChat:', error);
    return res.status(500).json({ error: 'Failed to process message' });
  }
});

// =============================================================================
// AI AGENT FRAMEWORK
// =============================================================================

import { executeAgent, streamAgent } from '../services/ai-agents/agent-executor.js';
import { AGENT_PERSONAS, getPersona } from '../services/ai-agents/personas.js';
import { AGENT_TOOLS } from '../services/ai-agents/tools.js';
import {
  getAgentConversations,
  getAgentConversation,
  deleteAgentConversation,
} from '../db/sqlite.js';

// Get available agent personas
router.get('/agents/personas', (_req: Request, res: Response) => {
  return res.json({
    personas: AGENT_PERSONAS.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      icon: p.icon,
      tools: p.tools,
      examples: p.examples,
    })),
  });
});

// Get available tools
router.get('/agents/tools', (_req: Request, res: Response) => {
  return res.json({
    tools: AGENT_TOOLS.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  });
});

// Get persona details
router.get('/agents/personas/:id', (req: Request, res: Response) => {
  const persona = getPersona(req.params.id);
  if (!persona) {
    return res.status(404).json({ error: 'Persona not found' });
  }
  return res.json(persona);
});

// List agent conversations
router.get('/agents/conversations', (req: Request, res: Response) => {
  try {
    const { persona_id, limit } = req.query;
    const conversations = getAgentConversations({
      persona_id: persona_id as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    return res.json({ conversations });
  } catch (error) {
    console.error('Error listing conversations:', error);
    return res.status(500).json({ error: 'Failed to list conversations' });
  }
});

// Get conversation with messages
router.get('/agents/conversations/:id', (req: Request, res: Response) => {
  try {
    const conversation = getAgentConversation(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    return res.json(conversation);
  } catch (error) {
    console.error('Error getting conversation:', error);
    return res.status(500).json({ error: 'Failed to get conversation' });
  }
});

// Delete conversation
router.delete('/agents/conversations/:id', (req: Request, res: Response) => {
  try {
    const deleted = deleteAgentConversation(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    return res.json({ message: 'Conversation deleted' });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// Chat with agent
router.post('/agents/chat', async (req: Request, res: Response) => {
  try {
    const { message, conversation_id, persona_id } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const response = await executeAgent(message, conversation_id, persona_id);

    return res.json({
      message: response.message,
      toolCalls: response.toolCalls,
      conversationId: response.conversationId,
      messageId: response.messageId,
    });
  } catch (error) {
    console.error('Error in agent chat:', error);
    return res.status(500).json({ error: 'Failed to process agent chat' });
  }
});

// Stream agent response (Server-Sent Events)
router.get('/agents/chat/stream', async (req: Request, res: Response) => {
  try {
    const { message, conversation_id, persona_id } = req.query;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const stream = streamAgent(
      message as string,
      conversation_id as string | undefined,
      persona_id as string | undefined
    );

    for await (const event of stream) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Error in agent stream:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', data: { message: 'Stream failed' } })}\n\n`);
    res.end();
  }
});

// ============================================================================
// AI Error Diagnosis Endpoint
// ============================================================================

interface ErrorDiagnosisRequest {
  log: {
    timestamp?: string;
    severity?: number;
    hostname?: string;
    app_name?: string;
    message?: string;
    [key: string]: unknown;
  };
  context?: {
    before: Array<{ timestamp?: string; message?: string; severity?: number }>;
    after: Array<{ timestamp?: string; message?: string; severity?: number }>;
  };
}

interface ErrorDiagnosisResponse {
  diagnosis: {
    summary: string;
    root_cause: string;
    suggested_fixes: string[];
    related_patterns: string[];
    follow_up_questions: string[];
    severity_assessment: string;
    confidence: number;
  };
  provider: string;
  model: string;
}

router.post('/diagnose-error', async (req: Request, res: Response) => {
  try {
    const { log, context } = req.body as ErrorDiagnosisRequest;

    if (!log || !log.message) {
      return res.status(400).json({ error: 'Log with message is required' });
    }

    const startTime = Date.now();

    // Build context from surrounding logs
    const contextLogs = context
      ? [
          ...context.before.map(l => `[${l.timestamp || 'unknown'}] [severity:${l.severity}] ${l.message}`).slice(-5),
          `>>> ERROR: [${log.timestamp || 'unknown'}] [severity:${log.severity}] ${log.message}`,
          ...context.after.map(l => `[${l.timestamp || 'unknown'}] [severity:${l.severity}] ${l.message}`).slice(0, 5),
        ].join('\n')
      : `[${log.timestamp || 'unknown'}] [severity:${log.severity}] ${log.message}`;

    // Build the diagnosis prompt
    const prompt = `You are an expert log analyst and SRE. Analyze this error log and provide a diagnosis.

ERROR LOG:
Timestamp: ${log.timestamp || 'unknown'}
Severity: ${log.severity !== undefined ? ['Emergency', 'Alert', 'Critical', 'Error', 'Warning', 'Notice', 'Info', 'Debug'][log.severity] || log.severity : 'unknown'}
Hostname: ${log.hostname || 'unknown'}
Application: ${log.app_name || 'unknown'}
Message: ${log.message}

${context ? `\nCONTEXT (surrounding logs):\n${contextLogs}` : ''}

${log.structured_data ? `\nSTRUCTURED DATA:\n${JSON.stringify(log.structured_data, null, 2)}` : ''}

Provide a diagnosis in the following JSON format:
{
  "summary": "One sentence summary of the error",
  "root_cause": "Detailed explanation of the likely root cause",
  "suggested_fixes": ["Fix 1", "Fix 2", "Fix 3"],
  "related_patterns": ["Pattern that might be related", "Another pattern to investigate"],
  "follow_up_questions": ["Question to investigate", "Another question"],
  "severity_assessment": "Assessment of the actual severity and impact",
  "confidence": 0.8
}

Respond ONLY with valid JSON, no additional text.`;

    let diagnosisText = '';
    let provider: 'ollama' | 'openrouter' | 'none' | 'unknown' = 'none';
    let model = '';

    // Try OpenRouter first
    if (getOpenRouterApiKey()) {
      try {
        const response = await fetch(OPENROUTER_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getOpenRouterApiKey()}`,
            'HTTP-Referer': 'https://lognog.local',
            'X-Title': 'LogNog Error Diagnosis',
          },
          body: JSON.stringify({
            model: getOpenRouterModel(),
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 2000,
          }),
        });

        if (response.ok) {
          const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
          diagnosisText = data.choices?.[0]?.message?.content || '';
          provider = 'openrouter';
          model = getOpenRouterModel();
        }
      } catch (err) {
        console.error('OpenRouter error diagnosis failed:', err);
      }
    }

    // Fallback to Ollama
    if (!diagnosisText && await isOllamaAvailable()) {
      try {
        const response = await fetch(`${getOllamaUrl()}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: getOllamaReasoningModel(),
            prompt: prompt,
            stream: false,
            options: {
              temperature: 0.3,
              num_predict: 2000,
            },
          }),
        });

        if (response.ok) {
          const data = await response.json() as { response?: string };
          diagnosisText = data.response || '';
          provider = 'ollama';
          model = getOllamaReasoningModel();
        }
      } catch (err) {
        console.error('Ollama error diagnosis failed:', err);
      }
    }

    if (!diagnosisText) {
      // Return a fallback diagnosis when no AI is available
      logAIRequest({
        provider: 'none',
        model: 'none',
        duration_ms: 0,
        success: false,
        error: 'No AI provider available',
        endpoint: 'error_diagnosis',
      });
      return res.json({
        diagnosis: {
          summary: 'AI analysis unavailable - manual review recommended',
          root_cause: 'Unable to analyze: No AI provider is configured or available. Please check your AI settings.',
          suggested_fixes: [
            'Review the error message manually',
            'Check application logs for related errors',
            'Search for similar errors in your log history',
          ],
          related_patterns: ['Check for similar errors in the same timeframe'],
          follow_up_questions: [
            'When did this error first occur?',
            'Is this error recurring?',
            'Are there related errors from the same host or application?',
          ],
          severity_assessment: 'Unable to assess automatically - please review based on error context',
          confidence: 0,
        },
        provider: 'none',
        model: 'none',
      });
    }

    // Parse the JSON response
    let diagnosis;
    try {
      // Try to extract JSON from the response
      const jsonMatch = diagnosisText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        diagnosis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseErr) {
      console.error('Failed to parse diagnosis JSON:', parseErr);
      // Create a structured response from raw text
      diagnosis = {
        summary: 'Analysis completed - see details below',
        root_cause: diagnosisText,
        suggested_fixes: ['Review the AI analysis above'],
        related_patterns: [],
        follow_up_questions: [],
        severity_assessment: 'See analysis',
        confidence: 0.5,
      };
    }

    logAIRequest({
      provider,
      model,
      duration_ms: Date.now() - startTime,
      success: true,
      endpoint: 'error_diagnosis',
    });

    res.json({
      diagnosis,
      provider,
      model,
    } as ErrorDiagnosisResponse);

  } catch (error) {
    console.error('Error in diagnose-error endpoint:', error);
    logAIRequest({
      provider: 'unknown',
      model: 'unknown',
      duration_ms: 0,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      endpoint: 'error_diagnosis',
    });
    res.status(500).json({ error: 'Failed to diagnose error' });
  }
});

export default router;
