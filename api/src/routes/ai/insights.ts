import { Router, Request, Response } from 'express';
import {
  isAnyAIAvailable,
  isOllamaAvailable,
  generateText,
  getOllamaUrl,
  getOllamaModel,
  getOllamaReasoningModel,
  getOllamaEmbedModel,
  getOpenRouterApiKey,
  getOpenRouterModel,
} from './shared.js';

const router = Router();

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

export default router;
