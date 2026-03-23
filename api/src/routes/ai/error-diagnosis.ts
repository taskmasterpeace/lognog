import { Router, Request, Response } from 'express';
import { getOpenRouterApiKey, getOpenRouterModel, OPENROUTER_URL, isOllamaAvailable, getOllamaUrl, getOllamaReasoningModel } from './shared.js';
import { logAIRequest } from '../../services/internal-logger.js';

const router = Router();

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
