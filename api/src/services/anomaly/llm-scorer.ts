/**
 * LLM Scorer Service
 *
 * Uses LLMs (Ollama or OpenRouter) to analyze anomalies and provide
 * contextual risk assessments and explanations.
 */

import { executeQuery } from '../../db/clickhouse.js';
import { EntityType } from './baseline-calculator.js';
import { AnomalyEvent } from './detector.js';

// Configuration
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';

export interface LLMAnalysis {
  riskScore: number;           // 0-100
  explanation: string;         // Plain English explanation
  suggestedActions: string[];  // Investigation steps
  relatedThreatTypes: string[];// e.g., ['brute_force', 'data_exfiltration']
  confidence: number;          // 0-1 confidence in analysis
}

export interface AnalysisContext {
  anomaly: AnomalyEvent;
  recentLogs: string[];
  entityHistory?: {
    firstSeen: Date;
    totalEvents: number;
    avgDailyEvents: number;
  };
}

/**
 * Check if Ollama is available
 */
async function isOllamaAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Generate text with Ollama
 */
async function generateWithOllama(prompt: string): Promise<string> {
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: {
        temperature: 0.3, // Lower temperature for more consistent analysis
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.statusText}`);
  }

  const data = await response.json() as { response: string };
  return data.response;
}

/**
 * Generate text with OpenRouter
 */
async function generateWithOpenRouter(prompt: string): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key not configured');
  }

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://lognog.io',
      'X-Title': 'LogNog Anomaly Detection',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter error: ${response.statusText} - ${error}`);
  }

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content || '';
}

/**
 * Unified generate function with fallback
 */
async function generateText(prompt: string): Promise<{ response: string; provider: 'ollama' | 'openrouter' }> {
  const ollamaAvailable = await isOllamaAvailable();

  if (ollamaAvailable) {
    try {
      const response = await generateWithOllama(prompt);
      return { response, provider: 'ollama' };
    } catch (error) {
      console.warn('Ollama generation failed, trying OpenRouter fallback:', error);
    }
  }

  if (OPENROUTER_API_KEY) {
    try {
      const response = await generateWithOpenRouter(prompt);
      return { response, provider: 'openrouter' };
    } catch (error) {
      console.error('OpenRouter fallback failed:', error);
      throw error;
    }
  }

  throw new Error('No AI provider available. Configure Ollama or set OPENROUTER_API_KEY.');
}

/**
 * Build the analysis prompt for an anomaly
 */
function buildAnalysisPrompt(context: AnalysisContext): string {
  const { anomaly, recentLogs, entityHistory } = context;

  const logsSection = recentLogs.length > 0
    ? `Recent logs from this entity:\n${recentLogs.slice(0, 10).map((l, i) => `${i + 1}. ${l.substring(0, 200)}`).join('\n')}`
    : 'No recent logs available.';

  const historySection = entityHistory
    ? `Entity History:
- First seen: ${entityHistory.firstSeen.toISOString()}
- Total events: ${entityHistory.totalEvents}
- Average daily events: ${entityHistory.avgDailyEvents.toFixed(1)}`
    : '';

  return `You are a security analyst reviewing anomalous behavior in a log management system.

ANOMALY DETAILS:
- Entity Type: ${anomaly.entityType}
- Entity ID: ${anomaly.entityId}
- Anomaly Type: ${anomaly.anomalyType}
- Metric: ${anomaly.metricName}
- Observed Value: ${anomaly.observedValue}
- Expected Value: ${anomaly.expectedValue}
- Deviation: ${anomaly.deviationScore.toFixed(2)} standard deviations
- Timestamp: ${anomaly.timestamp.toISOString()}

${historySection}

${logsSection}

Analyze this anomaly and respond in JSON format:
{
  "risk_score": <0-100>,
  "explanation": "<plain English explanation of what this anomaly means>",
  "suggested_actions": ["<action 1>", "<action 2>", "<action 3>"],
  "related_threat_types": ["<threat type if applicable>"],
  "confidence": <0.0-1.0>
}

Consider:
1. Is this behavior suspicious or benign?
2. What could cause this anomaly?
3. What should an analyst investigate next?
4. Are there security implications?

Respond ONLY with the JSON, no other text.`;
}

/**
 * Parse LLM response into structured analysis
 */
function parseAnalysisResponse(response: string): LLMAnalysis {
  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      riskScore: Math.min(100, Math.max(0, Number(parsed.risk_score) || 50)),
      explanation: String(parsed.explanation || 'Unable to analyze anomaly'),
      suggestedActions: Array.isArray(parsed.suggested_actions)
        ? parsed.suggested_actions.map(String)
        : ['Review related logs', 'Check entity activity'],
      relatedThreatTypes: Array.isArray(parsed.related_threat_types)
        ? parsed.related_threat_types.map(String)
        : [],
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
    };
  } catch (error) {
    console.error('Failed to parse LLM response:', error);

    // Return default analysis
    return {
      riskScore: 50,
      explanation: 'Automated analysis unavailable. Manual review recommended.',
      suggestedActions: [
        'Review the anomaly details manually',
        'Check related logs for context',
        'Compare with normal behavior patterns',
      ],
      relatedThreatTypes: [],
      confidence: 0.1,
    };
  }
}

/**
 * Get entity history for context
 */
async function getEntityHistory(
  entityType: EntityType,
  entityId: string
): Promise<{ firstSeen: Date; totalEvents: number; avgDailyEvents: number } | undefined> {
  try {
    const entityField = entityType === 'ip' ? 'toString(source_ip)' :
                        entityType === 'user' ? 'user' :
                        entityType === 'app' ? 'app_name' : 'hostname';

    const query = `
      SELECT
        min(timestamp) as first_seen,
        count() as total_events,
        count() / greatest(1, dateDiff('day', min(timestamp), max(timestamp))) as avg_daily
      FROM lognog.logs
      WHERE ${entityField} = '${entityId}'
    `;

    const results = await executeQuery<{
      first_seen: string;
      total_events: number;
      avg_daily: number;
    }>(query);

    if (results.length === 0 || !results[0].first_seen) {
      return undefined;
    }

    return {
      firstSeen: new Date(results[0].first_seen),
      totalEvents: results[0].total_events,
      avgDailyEvents: results[0].avg_daily,
    };
  } catch (error) {
    console.error('Failed to get entity history:', error);
    return undefined;
  }
}

/**
 * Analyze a single anomaly with LLM
 */
export async function analyzeAnomaly(anomaly: AnomalyEvent): Promise<LLMAnalysis> {
  // Get entity history for context
  const entityHistory = await getEntityHistory(anomaly.entityType, anomaly.entityId);

  const context: AnalysisContext = {
    anomaly,
    recentLogs: anomaly.relatedLogs || [],
    entityHistory,
  };

  const prompt = buildAnalysisPrompt(context);

  try {
    const { response } = await generateText(prompt);
    return parseAnalysisResponse(response);
  } catch (error) {
    console.error('LLM analysis failed:', error);

    // Return basic analysis without LLM
    return {
      riskScore: anomaly.riskScore,
      explanation: `Detected ${anomaly.anomalyType} in ${anomaly.metricName} for ${anomaly.entityType} "${anomaly.entityId}". ` +
                   `Observed value (${anomaly.observedValue}) differs from expected (${anomaly.expectedValue}) ` +
                   `by ${Math.abs(anomaly.deviationScore).toFixed(1)} standard deviations.`,
      suggestedActions: [
        `Review logs for ${anomaly.entityType} "${anomaly.entityId}"`,
        `Check if this behavior is expected`,
        `Compare with peer entity behavior`,
      ],
      relatedThreatTypes: [],
      confidence: 0.3,
    };
  }
}

/**
 * Batch analyze multiple anomalies
 */
export async function batchAnalyzeAnomalies(
  anomalies: AnomalyEvent[],
  maxConcurrent: number = 3
): Promise<Map<string, LLMAnalysis>> {
  const results = new Map<string, LLMAnalysis>();

  // Process in batches to avoid overwhelming the LLM
  for (let i = 0; i < anomalies.length; i += maxConcurrent) {
    const batch = anomalies.slice(i, i + maxConcurrent);

    const analyses = await Promise.all(
      batch.map(async (anomaly) => {
        const analysis = await analyzeAnomaly(anomaly);
        return { id: anomaly.id || `${anomaly.entityId}-${anomaly.timestamp.getTime()}`, analysis };
      })
    );

    for (const { id, analysis } of analyses) {
      results.set(id, analysis);
    }
  }

  return results;
}

/**
 * Update anomaly record with LLM analysis
 */
export async function updateAnomalyWithAnalysis(
  anomalyId: string,
  analysis: LLMAnalysis
): Promise<void> {
  const query = `
    ALTER TABLE lognog.anomalies
    UPDATE
      llm_analysis = '${JSON.stringify({
        explanation: analysis.explanation,
        suggestedActions: analysis.suggestedActions,
        relatedThreatTypes: analysis.relatedThreatTypes,
        confidence: analysis.confidence,
      }).replace(/'/g, "''")}',
      risk_score = ${analysis.riskScore}
    WHERE id = '${anomalyId}'
  `;

  await executeQuery(query);
}

/**
 * Check if LLM is available
 */
export async function isLLMAvailable(): Promise<{ available: boolean; provider: string | null }> {
  const ollamaAvailable = await isOllamaAvailable();

  if (ollamaAvailable) {
    return { available: true, provider: 'ollama' };
  }

  if (OPENROUTER_API_KEY) {
    return { available: true, provider: 'openrouter' };
  }

  return { available: false, provider: null };
}

/**
 * Get threat type explanation
 */
export function getThreatTypeDescription(threatType: string): string {
  const descriptions: Record<string, string> = {
    brute_force: 'Multiple failed authentication attempts, possibly password guessing',
    data_exfiltration: 'Unusual data transfer volumes, potential data theft',
    lateral_movement: 'Account accessing unusual resources, possibly compromised',
    privilege_escalation: 'Attempts to gain higher access levels',
    insider_threat: 'Unusual behavior from trusted internal user',
    credential_stuffing: 'Automated login attempts with known credentials',
    dos_attack: 'Denial of service through resource exhaustion',
    reconnaissance: 'Scanning or probing for vulnerabilities',
    malware_activity: 'Behavior consistent with malicious software',
    policy_violation: 'Activity that violates security policies',
  };

  return descriptions[threatType] || 'Unknown threat type';
}
