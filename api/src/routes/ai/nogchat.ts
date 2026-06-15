import { Router, Request, Response } from 'express';
import { isOllamaAvailable, generateText } from './shared.js';
import { ensureLlamaIndexReady, llamaQueryIndex } from './llamaindex.js';
import { executeDSLQuery } from '../../db/backend.js';
import { hybridSearch, HybridSearchResponse, HybridSearchResult } from '../../services/hybrid-search.js';
import { rerankWithLLM } from '../../services/reranker.js';
import { formatCitations, CitedSource, getCitationStats } from '../../services/citations.js';

const router = Router();

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

export default router;
