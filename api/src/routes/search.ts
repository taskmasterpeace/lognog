import { Router, Request, Response } from 'express';
import { parseToAST, validateQuery, ParseError } from '../dsl/index.js';
import { executeDSLQuery, getFields, getFieldValues, getBackendInfo } from '../db/backend.js';
import {
  getSavedSearches,
  getSavedSearch,
  createSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,
} from '../db/sqlite.js';
import { translateNaturalLanguage, getSuggestedQueries } from '../services/ai-search.js';
import { applyFieldExtraction } from '../services/field-extractor.js';

const router = Router();

// Execute a DSL query
router.post('/query', async (req: Request, res: Response) => {
  try {
    const { query, earliest, latest, extract_fields = false, source_type } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required' });
    }

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

    return res.json({
      query,
      sql,
      results,
      count: results.length,
      fields_extracted: extract_fields,
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

// Get field suggestions
router.get('/fields', async (_req: Request, res: Response) => {
  try {
    const fields = await getFields();
    return res.json(fields);
  } catch (error) {
    console.error('Error fetching fields:', error);
    return res.status(500).json({ error: 'Failed to fetch fields' });
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

    const search = updateSavedSearch(req.params.id, name, query, description);
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

// Bulk export saved searches
router.post('/saved/export', (req: Request, res: Response) => {
  try {
    const { ids } = req.body;

    // Get all saved searches or filter by IDs
    let searches = getSavedSearches();

    if (ids && Array.isArray(ids) && ids.length > 0) {
      // Filter to only requested IDs
      const idSet = new Set(ids);
      searches = searches.filter(s => idSet.has(s.id));
    }

    // Export each search
    const exports = searches.map(search => ({
      name: search.name,
      query: search.query,
      description: search.description,
      exported_at: new Date().toISOString(),
      version: '1.0',
    }));

    const exportData = {
      type: 'saved_searches',
      count: exports.length,
      exported_at: new Date().toISOString(),
      version: '1.0',
      searches: exports,
    };

    return res.json(exportData);
  } catch (error) {
    console.error('Error exporting saved searches:', error);
    return res.status(500).json({ error: 'Failed to export saved searches' });
  }
});

// Export saved search as template
router.post('/saved/:id/export', (req: Request, res: Response) => {
  try {
    const search = getSavedSearch(req.params.id);
    if (!search) {
      return res.status(404).json({ error: 'Saved search not found' });
    }

    const exportData = {
      name: search.name,
      query: search.query,
      description: search.description,
      exported_at: new Date().toISOString(),
      version: '1.0',
    };

    return res.json(exportData);
  } catch (error) {
    console.error('Error exporting saved search:', error);
    return res.status(500).json({ error: 'Failed to export saved search' });
  }
});

// Import saved search from template
router.post('/saved/import', (req: Request, res: Response) => {
  try {
    const { template, name } = req.body;

    if (!template || typeof template !== 'object') {
      return res.status(400).json({ error: 'Invalid template format: template object is required' });
    }

    if (!template.name || typeof template.name !== 'string') {
      return res.status(400).json({ error: 'Invalid template format: name is required' });
    }

    if (!template.query || typeof template.query !== 'string') {
      return res.status(400).json({ error: 'Invalid template format: query is required' });
    }

    // Use name override if provided, otherwise use template name
    const searchName = name || template.name;
    const searchQuery = template.query;
    const searchDescription = template.description || null;

    const search = createSavedSearch(searchName, searchQuery, searchDescription);
    return res.status(201).json(search);
  } catch (error) {
    console.error('Error importing saved search:', error);
    return res.status(500).json({ error: 'Failed to import saved search' });
  }
});

export default router;
