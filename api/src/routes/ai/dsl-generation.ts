import { Router, Request, Response } from 'express';
import { isAnyAIAvailable, generateText } from './shared.js';
import {
  DSL_COMMANDS,
  DSL_COMPARISON_OPERATORS,
  DSL_LOGICAL_OPERATORS,
  DSL_AGGREGATION_FUNCTIONS,
  DSL_CORE_FIELDS,
  DSL_COMMON_PATTERNS,
} from '../../data/dsl-reference.js';

const router = Router();

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

export default router;
