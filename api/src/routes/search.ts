import { Router, Request, Response } from 'express';
import { parseToAST, validateQuery, ParseError } from '../dsl/index.js';
import { executeDSLQuery, getFields, getFieldValues, getBackendInfo, discoverStructuredDataFields, DiscoveredField } from '../db/backend.js';
import {
  getSavedSearches,
  getSavedSearch,
  createSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,
  getUserPinnedFields,
  setFieldPinned,
  reorderPinnedFields,
} from '../db/sqlite.js';
import { translateNaturalLanguage, getSuggestedQueries } from '../services/ai-search.js';
import { applyFieldExtraction } from '../services/field-extractor.js';
import { optionalAuth, rateLimit } from '../auth/middleware.js';

const router = Router();

// Execute a DSL query (rate limited: 120/min for CPU-intensive parsing)
router.post('/query', rateLimit(120, 60000), async (req: Request, res: Response) => {
  try {
    const { query, earliest, latest, extract_fields = false, source_type } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Prevent DoS via excessively long queries
    if (query.length > 50000) {
      return res.status(400).json({ error: 'Query exceeds maximum length (50KB)' });
    }

    // Measure execution time
    const startTime = performance.now();

    // Execute query using backend abstraction (handles both ClickHouse and SQLite)
    const { sql, results: rawResults } = await executeDSLQuery(query, {
      earliest,
      latest,
    });

    // Apply field extraction if requested
    let results = rawResults;
    if (extract_fields) {
      results = await applyFieldExtraction(results, source_type);
    }

    // Calculate execution time
    const executionTime = Math.round(performance.now() - startTime);

    return res.json({
      query,
      sql,
      results,
      count: results.length,
      fields_extracted: extract_fields,
      backend: getBackendInfo().backend,
      executionTime,
    });
  } catch (error) {
    if (error instanceof ParseError) {
      return res.status(400).json({
        error: 'Parse error',
        message: error.message,
        line: error.line,
        column: error.column,
      });
    }

    console.error('Query error:', error);
    return res.status(500).json({
      error: 'Query execution failed',
      message: String(error),
    });
  }
});

// Parse query to AST (for debugging/inspection)
router.post('/parse', (req: Request, res: Response) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required' });
    }

    const ast = parseToAST(query);

    return res.json({
      query,
      ast,
      backend: getBackendInfo().backend,
    });
  } catch (error) {
    if (error instanceof ParseError) {
      return res.status(400).json({
        error: 'Parse error',
        message: error.message,
        line: error.line,
        column: error.column,
      });
    }

    return res.status(500).json({
      error: 'Parse failed',
      message: String(error),
    });
  }
});

// AI-powered natural language search
router.post('/ai', async (req: Request, res: Response) => {
  try {
    const { question, execute = true } = req.body;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Question is required' });
    }

    // Translate natural language to DSL
    const translation = translateNaturalLanguage(question);

    const response: {
      question: string;
      query: string;
      confidence: number;
      explanation: string;
      results?: unknown[];
      sql?: string;
      error?: string;
      backend?: string;
    } = {
      question,
      query: translation.query,
      confidence: translation.confidence,
      explanation: translation.explanation,
      backend: getBackendInfo().backend,
    };

    // Optionally execute the query
    if (execute) {
      try {
        const { sql, results } = await executeDSLQuery(translation.query, {
          earliest: translation.timeRange?.earliest,
          latest: translation.timeRange?.latest,
        });
        response.results = results;
        response.sql = sql;
      } catch (execError) {
        response.error = `Query execution failed: ${String(execError)}`;
      }
    }

    return res.json(response);
  } catch (error) {
    console.error('AI search error:', error);
    return res.status(500).json({
      error: 'AI search failed',
      message: String(error),
    });
  }
});

// Get AI search suggestions
router.get('/ai/suggestions', (_req: Request, res: Response) => {
  const suggestions = getSuggestedQueries();
  return res.json({ suggestions });
});

// Validate a query
router.post('/validate', (req: Request, res: Response) => {
  const { query } = req.body;

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Query is required' });
  }

  const result = validateQuery(query);
  return res.json(result);
});

// Get field suggestions (core fields only)
router.get('/fields', async (_req: Request, res: Response) => {
  try {
    const fields = await getFields();
    return res.json(fields);
  } catch (error) {
    console.error('Error fetching fields:', error);
    return res.status(500).json({ error: 'Failed to fetch fields' });
  }
});

// Discover all available fields (core + custom from structured_data)
router.get('/fields/discover', async (req: Request, res: Response) => {
  try {
    const { earliest, latest, limit, index } = req.query;

    // Core fields that always exist in the schema
    const coreFields = [
      { name: 'timestamp', type: 'datetime', source: 'core' as const },
      { name: 'hostname', type: 'string', source: 'core' as const },
      { name: 'app_name', type: 'string', source: 'core' as const },
      { name: 'severity', type: 'number', source: 'core' as const },
      { name: 'message', type: 'string', source: 'core' as const },
      { name: 'index_name', type: 'string', source: 'core' as const },
      { name: 'facility', type: 'number', source: 'core' as const },
      { name: 'source_ip', type: 'string', source: 'core' as const },
      { name: 'protocol', type: 'string', source: 'core' as const },
    ];

    // Discover custom fields from structured_data
    const discoveredFields = await discoverStructuredDataFields({
      earliest: earliest as string | undefined,
      latest: latest as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      index: index as string | undefined,
    });

    // Map discovered fields to include source
    const customFields = discoveredFields.map((f: DiscoveredField) => ({
      name: f.name,
      type: f.type,
      source: 'discovered' as const,
      occurrences: f.occurrences,
      sampleValues: f.sampleValues,
    }));

    return res.json({
      core: coreFields,
      discovered: customFields,
      backend: getBackendInfo().backend,
    });
  } catch (error) {
    console.error('Error discovering fields:', error);
    return res.status(500).json({ error: 'Failed to discover fields' });
  }
});

// Get user's pinned field preferences
router.get('/fields/preferences', optionalAuth, (req: Request, res: Response) => {
  try {
    if (!req.user) {
      // For anonymous users, return default pinned fields
      return res.json({
        pinned: ['severity', 'hostname', 'app_name', 'index_name'],
        authenticated: false,
      });
    }

    const pinned = getUserPinnedFields(req.user.id);
    // If user has no preferences, return defaults
    if (pinned.length === 0) {
      return res.json({
        pinned: ['severity', 'hostname', 'app_name', 'index_name'],
        authenticated: true,
        hasCustomPreferences: false,
      });
    }

    return res.json({
      pinned,
      authenticated: true,
      hasCustomPreferences: true,
    });
  } catch (error) {
    console.error('Error fetching field preferences:', error);
    return res.status(500).json({ error: 'Failed to fetch field preferences' });
  }
});

// Pin or unpin a field
router.post('/fields/pin', optionalAuth, (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Log in to save field preferences',
      });
    }

    const { field, pinned } = req.body;
    if (!field || typeof pinned !== 'boolean') {
      return res.status(400).json({ error: 'field and pinned (boolean) are required' });
    }

    const preference = setFieldPinned(req.user.id, field, pinned);
    return res.json({ success: true, preference });
  } catch (error) {
    console.error('Error setting field pin status:', error);
    return res.status(500).json({ error: 'Failed to update field preference' });
  }
});

// Reorder pinned fields
router.post('/fields/reorder', optionalAuth, (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Log in to save field preferences',
      });
    }

    const { fields } = req.body;
    if (!Array.isArray(fields) || fields.length === 0) {
      return res.status(400).json({ error: 'fields array is required' });
    }

    reorderPinnedFields(req.user.id, fields);
    const updatedPinned = getUserPinnedFields(req.user.id);
    return res.json({ success: true, pinned: updatedPinned });
  } catch (error) {
    console.error('Error reordering pinned fields:', error);
    return res.status(500).json({ error: 'Failed to reorder fields' });
  }
});

// Get unique values for a field (for autocomplete)
router.get('/fields/:field/values', async (req: Request, res: Response) => {
  try {
    const { field } = req.params;
    const { limit = '100' } = req.query;

    const values = await getFieldValues(field, parseInt(limit as string, 10));
    return res.json(values);
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid field') {
      return res.status(400).json({ error: 'Invalid field' });
    }
    console.error('Error fetching field values:', error);
    return res.status(500).json({ error: 'Failed to fetch field values' });
  }
});

// Get backend info
router.get('/backend', (_req: Request, res: Response) => {
  return res.json(getBackendInfo());
});

// Saved Searches CRUD

router.get('/saved', (_req: Request, res: Response) => {
  try {
    const searches = getSavedSearches();
    return res.json(searches);
  } catch (error) {
    console.error('Error fetching saved searches:', error);
    return res.status(500).json({ error: 'Failed to fetch saved searches' });
  }
});

router.get('/saved/:id', (req: Request, res: Response) => {
  try {
    const search = getSavedSearch(req.params.id);
    if (!search) {
      return res.status(404).json({ error: 'Saved search not found' });
    }
    return res.json(search);
  } catch (error) {
    console.error('Error fetching saved search:', error);
    return res.status(500).json({ error: 'Failed to fetch saved search' });
  }
});

router.post('/saved', (req: Request, res: Response) => {
  try {
    const { name, query, description } = req.body;

    if (!name || !query) {
      return res.status(400).json({ error: 'Name and query are required' });
    }

    const search = createSavedSearch(name, query, description);
    return res.status(201).json(search);
  } catch (error) {
    console.error('Error creating saved search:', error);
    return res.status(500).json({ error: 'Failed to create saved search' });
  }
});

router.put('/saved/:id', (req: Request, res: Response) => {
  try {
    const { name, query, description } = req.body;

    if (!name || !query) {
      return res.status(400).json({ error: 'Name and query are required' });
    }

    const search = updateSavedSearch(req.params.id, { name, query, description });
    if (!search) {
      return res.status(404).json({ error: 'Saved search not found' });
    }

    return res.json(search);
  } catch (error) {
    console.error('Error updating saved search:', error);
    return res.status(500).json({ error: 'Failed to update saved search' });
  }
});

router.delete('/saved/:id', (req: Request, res: Response) => {
  try {
    const deleted = deleteSavedSearch(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Saved search not found' });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting saved search:', error);
    return res.status(500).json({ error: 'Failed to delete saved search' });
  }
});

export default router;
