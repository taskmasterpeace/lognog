/**
 * DSL Reference API Routes
 *
 * Provides endpoints for LLMs and users to learn the LogNog query language.
 *
 * Endpoints:
 *   GET /api/dsl/reference         - Full DSL reference (JSON or markdown)
 *   GET /api/dsl/commands          - Just commands
 *   GET /api/dsl/functions         - Just functions (aggregation + eval)
 *   GET /api/dsl/fields            - Available fields
 *   GET /api/dsl/patterns          - Common query patterns
 */

import { Router, Request, Response } from 'express';
import {
  DSL_COMMANDS,
  DSL_COMPARISON_OPERATORS,
  DSL_LOGICAL_OPERATORS,
  DSL_AGGREGATION_FUNCTIONS,
  DSL_EVAL_FUNCTIONS,
  DSL_CORE_FIELDS,
  DSL_SEVERITY_LEVELS,
  DSL_TIME_SPANS,
  DSL_COMMON_PATTERNS,
  generateDSLMarkdown,
  getDSLReferenceJSON,
} from '../data/dsl-reference.js';

const router = Router();

/**
 * GET /api/dsl/reference
 *
 * Full DSL reference documentation.
 * Query params:
 *   - format: 'json' (default) or 'markdown'
 */
router.get('/reference', (_req: Request, res: Response) => {
  const format = _req.query.format?.toString().toLowerCase() || 'json';

  if (format === 'markdown' || format === 'md') {
    res.setHeader('Content-Type', 'text/markdown');
    return res.send(generateDSLMarkdown());
  }

  // Default: JSON
  return res.json(getDSLReferenceJSON());
});

/**
 * GET /api/dsl/commands
 *
 * List of all available commands with syntax and examples.
 */
router.get('/commands', (_req: Request, res: Response) => {
  return res.json({
    count: DSL_COMMANDS.length,
    commands: DSL_COMMANDS,
  });
});

/**
 * GET /api/dsl/operators
 *
 * List of all operators (comparison and logical).
 */
router.get('/operators', (_req: Request, res: Response) => {
  return res.json({
    comparison: DSL_COMPARISON_OPERATORS,
    logical: DSL_LOGICAL_OPERATORS,
  });
});

/**
 * GET /api/dsl/functions
 *
 * List of all functions (aggregation and eval).
 * Query params:
 *   - type: 'aggregation', 'eval', or 'all' (default)
 */
router.get('/functions', (_req: Request, res: Response) => {
  const type = _req.query.type?.toString().toLowerCase();

  if (type === 'aggregation' || type === 'agg') {
    return res.json({
      count: DSL_AGGREGATION_FUNCTIONS.length,
      functions: DSL_AGGREGATION_FUNCTIONS,
    });
  }

  if (type === 'eval') {
    return res.json({
      count: DSL_EVAL_FUNCTIONS.length,
      functions: DSL_EVAL_FUNCTIONS,
    });
  }

  // Default: all functions
  return res.json({
    aggregation: {
      count: DSL_AGGREGATION_FUNCTIONS.length,
      functions: DSL_AGGREGATION_FUNCTIONS,
    },
    eval: {
      count: DSL_EVAL_FUNCTIONS.length,
      functions: DSL_EVAL_FUNCTIONS,
    },
  });
});

/**
 * GET /api/dsl/fields
 *
 * Available fields with their types and aliases.
 */
router.get('/fields', (_req: Request, res: Response) => {
  return res.json({
    count: DSL_CORE_FIELDS.length,
    fields: DSL_CORE_FIELDS,
    severityLevels: DSL_SEVERITY_LEVELS,
    timeSpans: DSL_TIME_SPANS,
  });
});

/**
 * GET /api/dsl/patterns
 *
 * Common query patterns and examples.
 */
router.get('/patterns', (_req: Request, res: Response) => {
  return res.json({
    count: DSL_COMMON_PATTERNS.length,
    patterns: DSL_COMMON_PATTERNS,
  });
});

/**
 * GET /api/dsl/quick
 *
 * Quick reference for LLMs - condensed version with just the essentials.
 */
router.get('/quick', (_req: Request, res: Response) => {
  const quickRef = `# LogNog DSL Quick Reference

## Commands
${DSL_COMMANDS.map(c => `- ${c.name}: ${c.syntax}`).join('\n')}

## Operators
Comparison: = != < <= > >= ~
Logical: AND OR NOT
Grouping: (condition1 OR condition2)

## Aggregation Functions
${DSL_AGGREGATION_FUNCTIONS.map(f => f.name).join(', ')}

## Eval Functions
${DSL_EVAL_FUNCTIONS.map(f => f.name).join(', ')}

## Fields
${DSL_CORE_FIELDS.map(f => `${f.name} (${f.type})${f.aliases ? ` [aliases: ${f.aliases.join(', ')}]` : ''}`).join('\n')}

## Severity (0-7)
0=emergency, 1=alert, 2=critical, 3=error, 4=warning, 5=notice, 6=info, 7=debug

## Time Spans
${DSL_TIME_SPANS.map(t => t.value).join(', ')}

## Examples
${DSL_COMMON_PATTERNS.slice(0, 5).map(p => `${p.name}: ${p.query}`).join('\n')}
`;

  const format = _req.query.format?.toString().toLowerCase();
  if (format === 'json') {
    return res.json({
      commands: DSL_COMMANDS.map(c => ({ name: c.name, syntax: c.syntax })),
      operators: {
        comparison: DSL_COMPARISON_OPERATORS.map(o => o.symbol),
        logical: DSL_LOGICAL_OPERATORS.map(o => o.symbol),
      },
      aggregationFunctions: DSL_AGGREGATION_FUNCTIONS.map(f => f.name),
      evalFunctions: DSL_EVAL_FUNCTIONS.map(f => f.name),
      fields: DSL_CORE_FIELDS.map(f => f.name),
      severityRange: '0-7 (0=emergency, 7=debug)',
      timeSpans: DSL_TIME_SPANS.map(t => t.value),
    });
  }

  res.setHeader('Content-Type', 'text/plain');
  return res.send(quickRef);
});

export default router;
