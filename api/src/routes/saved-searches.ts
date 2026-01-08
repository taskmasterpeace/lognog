import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  getSavedSearches,
  getSavedSearch,
  createSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,
  updateSavedSearchCache,
  updateSavedSearchError,
  clearSavedSearchCache,
  getSavedSearchTags,
  duplicateSavedSearch,
  SavedSearchFilters,
} from '../db/sqlite.js';
import { executeDSLQuery } from '../db/backend.js';
import { createAlert } from '../db/sqlite.js';
import { createDashboardPanel, getDashboard } from '../db/sqlite.js';
import { getSQLiteDB } from '../db/sqlite.js';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, optionalAuth } from '../auth/middleware.js';
import { reseedSavedSearches } from '../data/seed-templates.js';

const router = Router();

// Validation schemas
const createSchema = z.object({
  name: z.string().min(1).max(200),
  query: z.string().min(1).max(50000),
  description: z.string().max(2000).optional(),
  time_range: z.string().optional(),
  schedule: z.string().optional(),
  schedule_enabled: z.boolean().optional(),
  cache_ttl_seconds: z.number().min(60).max(86400 * 7).optional(), // 1 min to 7 days
  is_shared: z.boolean().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  query: z.string().min(1).max(50000).optional(),
  description: z.string().max(2000).optional(),
  time_range: z.string().optional(),
  schedule: z.string().optional(),
  schedule_enabled: z.boolean().optional(),
  cache_ttl_seconds: z.number().min(60).max(86400 * 7).optional(),
  is_shared: z.boolean().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

const runSchema = z.object({
  force_refresh: z.boolean().optional(),
  earliest: z.string().optional(),
  latest: z.string().optional(),
});

const createAlertSchema = z.object({
  trigger_type: z.enum(['number_of_results', 'number_of_hosts', 'custom_condition']).optional(),
  trigger_condition: z.enum(['greater_than', 'less_than', 'equal_to', 'not_equal_to', 'drops_by', 'rises_by']).optional(),
  trigger_threshold: z.number().optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']).optional(),
  cron_expression: z.string().optional(),
  actions: z.array(z.object({
    type: z.enum(['email', 'webhook', 'log', 'script', 'apprise', 'show_on_login']),
    config: z.record(z.unknown()),
  })).optional(),
});

const createPanelSchema = z.object({
  dashboard_id: z.string().uuid(),
  visualization: z.string().optional(),
  title: z.string().optional(),
  position: z.object({
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  }).optional(),
});

const createReportSchema = z.object({
  schedule: z.string().min(1),
  recipients: z.string().min(1),
  format: z.enum(['html', 'csv']).optional(),
});

// Helper: Check if cache is valid
function isCacheValid(search: { cached_at?: string; cache_ttl_seconds: number }): boolean {
  if (!search.cached_at) return false;
  const cachedTime = new Date(search.cached_at).getTime();
  const now = Date.now();
  const ttlMs = search.cache_ttl_seconds * 1000;
  return (now - cachedTime) < ttlMs;
}

// Helper: Parse time range to milliseconds
function parseTimeRange(timeRange: string): number {
  const match = timeRange.match(/^-?(\d+)(s|m|h|d)$/);
  if (!match) return 24 * 60 * 60 * 1000; // Default 24h

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 24 * 60 * 60 * 1000;
  }
}

// GET /saved-searches - List all saved searches with filters
router.get('/', optionalAuth, (req: Request, res: Response) => {
  try {
    const filters: SavedSearchFilters = {};

    if (req.query.owner_id) {
      filters.owner_id = req.query.owner_id as string;
    }
    if (req.query.owner === 'mine' && req.user) {
      filters.owner_id = req.user.id;
    }
    if (req.query.shared === 'true') {
      filters.is_shared = true;
    }
    if (req.query.scheduled === 'true') {
      filters.schedule_enabled = true;
    }
    if (req.query.search) {
      filters.search = req.query.search as string;
    }
    if (req.query.tags) {
      const tagsParam = req.query.tags as string;
      filters.tags = tagsParam.split(',').map(t => t.trim()).filter(Boolean);
    }

    const searches = getSavedSearches(filters);

    // Parse JSON fields and add computed properties
    const enrichedSearches = searches.map(s => ({
      ...s,
      tags: JSON.parse(s.tags || '[]'),
      is_cache_valid: isCacheValid(s),
      cache_expires_at: s.cached_at
        ? new Date(new Date(s.cached_at).getTime() + s.cache_ttl_seconds * 1000).toISOString()
        : null,
    }));

    return res.json({
      searches: enrichedSearches,
      total: enrichedSearches.length,
    });
  } catch (error) {
    console.error('Error fetching saved searches:', error);
    return res.status(500).json({ error: 'Failed to fetch saved searches' });
  }
});

// GET /saved-searches/tags - Get all unique tags
router.get('/tags', optionalAuth, (_req: Request, res: Response) => {
  try {
    const tags = getSavedSearchTags();
    return res.json({ tags });
  } catch (error) {
    console.error('Error fetching tags:', error);
    return res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// POST /saved-searches/reseed - Delete and reseed template-based saved searches
router.post('/reseed', authenticate, (req: Request, res: Response) => {
  try {
    const result = reseedSavedSearches();
    return res.json({
      message: 'Saved searches reseeded successfully',
      deleted: result.deleted,
      created: result.created,
    });
  } catch (error) {
    console.error('Error reseeding saved searches:', error);
    return res.status(500).json({ error: 'Failed to reseed saved searches' });
  }
});

// GET /saved-searches/:id - Get single saved search
router.get('/:id', optionalAuth, (req: Request, res: Response) => {
  try {
    const search = getSavedSearch(req.params.id);
    if (!search) {
      return res.status(404).json({ error: 'Saved search not found' });
    }

    return res.json({
      ...search,
      tags: JSON.parse(search.tags || '[]'),
      previous_versions: JSON.parse(search.previous_versions || '[]'),
      is_cache_valid: isCacheValid(search),
      cache_expires_at: search.cached_at
        ? new Date(new Date(search.cached_at).getTime() + search.cache_ttl_seconds * 1000).toISOString()
        : null,
    });
  } catch (error) {
    console.error('Error fetching saved search:', error);
    return res.status(500).json({ error: 'Failed to fetch saved search' });
  }
});

// POST /saved-searches - Create new saved search
router.post('/', authenticate, (req: Request, res: Response) => {
  try {
    const data = createSchema.parse(req.body);

    const search = createSavedSearch(data.name, data.query, {
      description: data.description,
      owner_id: req.user?.id,
      is_shared: data.is_shared,
      time_range: data.time_range,
      schedule: data.schedule,
      schedule_enabled: data.schedule_enabled,
      cache_ttl_seconds: data.cache_ttl_seconds,
      tags: data.tags,
    });

    return res.status(201).json({
      ...search,
      tags: JSON.parse(search.tags || '[]'),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating saved search:', error);
    return res.status(500).json({ error: 'Failed to create saved search' });
  }
});

// PUT /saved-searches/:id - Update saved search
router.put('/:id', authenticate, (req: Request, res: Response) => {
  try {
    const existing = getSavedSearch(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Saved search not found' });
    }

    const data = updateSchema.parse(req.body);
    const search = updateSavedSearch(req.params.id, data);

    if (!search) {
      return res.status(404).json({ error: 'Saved search not found' });
    }

    return res.json({
      ...search,
      tags: JSON.parse(search.tags || '[]'),
      previous_versions: JSON.parse(search.previous_versions || '[]'),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error updating saved search:', error);
    return res.status(500).json({ error: 'Failed to update saved search' });
  }
});

// DELETE /saved-searches/:id - Delete saved search
router.delete('/:id', authenticate, (req: Request, res: Response) => {
  try {
    const success = deleteSavedSearch(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Saved search not found' });
    }
    return res.json({ message: 'Saved search deleted' });
  } catch (error) {
    console.error('Error deleting saved search:', error);
    return res.status(500).json({ error: 'Failed to delete saved search' });
  }
});

// POST /saved-searches/:id/run - Execute search and cache results
router.post('/:id/run', authenticate, async (req: Request, res: Response) => {
  try {
    const search = getSavedSearch(req.params.id);
    if (!search) {
      return res.status(404).json({ error: 'Saved search not found' });
    }

    const options = runSchema.parse(req.body || {});

    // Check if we can use cached results
    if (!options.force_refresh && isCacheValid(search) && search.cached_results) {
      const cachedResults = JSON.parse(search.cached_results);
      return res.json({
        results: cachedResults,
        sql: search.cached_sql,
        count: search.cached_count,
        cached: true,
        cached_at: search.cached_at,
        execution_time_ms: 0,
      });
    }

    // Calculate time range
    const timeRangeMs = parseTimeRange(search.time_range);
    const earliest = options.earliest || new Date(Date.now() - timeRangeMs).toISOString();
    const latest = options.latest || new Date().toISOString();

    // Execute the query
    const startTime = performance.now();

    try {
      const { sql, results } = await executeDSLQuery(search.query, { earliest, latest });
      const executionTimeMs = Math.round(performance.now() - startTime);

      // Update cache
      updateSavedSearchCache(req.params.id, results, sql, executionTimeMs);

      return res.json({
        results,
        sql,
        count: results.length,
        cached: false,
        execution_time_ms: executionTimeMs,
      });
    } catch (queryError) {
      // Record the error
      updateSavedSearchError(req.params.id, String(queryError));
      throw queryError;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error running saved search:', error);
    return res.status(500).json({ error: 'Failed to run saved search', message: String(error) });
  }
});

// GET /saved-searches/:id/results - Get cached results (loadjob equivalent)
router.get('/:id/results', optionalAuth, (req: Request, res: Response) => {
  try {
    const search = getSavedSearch(req.params.id);
    if (!search) {
      return res.status(404).json({ error: 'Saved search not found' });
    }

    if (!search.cached_results) {
      return res.status(404).json({
        error: 'No cached results',
        message: 'Run the search first to cache results',
      });
    }

    const results = JSON.parse(search.cached_results);
    const cacheValid = isCacheValid(search);

    return res.json({
      results,
      sql: search.cached_sql,
      count: search.cached_count,
      cached_at: search.cached_at,
      cache_valid: cacheValid,
      expires_at: new Date(new Date(search.cached_at!).getTime() + search.cache_ttl_seconds * 1000).toISOString(),
    });
  } catch (error) {
    console.error('Error fetching cached results:', error);
    return res.status(500).json({ error: 'Failed to fetch cached results' });
  }
});

// POST /saved-searches/:id/clear-cache - Clear cached results
router.post('/:id/clear-cache', authenticate, (req: Request, res: Response) => {
  try {
    const search = getSavedSearch(req.params.id);
    if (!search) {
      return res.status(404).json({ error: 'Saved search not found' });
    }

    clearSavedSearchCache(req.params.id);
    return res.json({ message: 'Cache cleared' });
  } catch (error) {
    console.error('Error clearing cache:', error);
    return res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// POST /saved-searches/:id/duplicate - Duplicate a saved search
router.post('/:id/duplicate', authenticate, (req: Request, res: Response) => {
  try {
    const newSearch = duplicateSavedSearch(req.params.id, req.user?.id);
    if (!newSearch) {
      return res.status(404).json({ error: 'Saved search not found' });
    }

    return res.status(201).json({
      ...newSearch,
      tags: JSON.parse(newSearch.tags || '[]'),
    });
  } catch (error) {
    console.error('Error duplicating saved search:', error);
    return res.status(500).json({ error: 'Failed to duplicate saved search' });
  }
});

// POST /saved-searches/:id/create-alert - Create alert from saved search
router.post('/:id/create-alert', authenticate, (req: Request, res: Response) => {
  try {
    const search = getSavedSearch(req.params.id);
    if (!search) {
      return res.status(404).json({ error: 'Saved search not found' });
    }

    const data = createAlertSchema.parse(req.body || {});

    const alert = createAlert(`Alert: ${search.name}`, search.query, {
      description: `Created from saved search: ${search.name}`,
      trigger_type: data.trigger_type || 'number_of_results',
      trigger_condition: data.trigger_condition || 'greater_than',
      trigger_threshold: data.trigger_threshold ?? 0,
      severity: data.severity || 'medium',
      cron_expression: data.cron_expression || search.schedule || '*/5 * * * *',
      time_range: search.time_range,
      actions: data.actions || [],
      enabled: true,
    });

    return res.status(201).json({
      alert_id: alert.id,
      name: alert.name,
      message: `Alert created from saved search "${search.name}"`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating alert from saved search:', error);
    return res.status(500).json({ error: 'Failed to create alert' });
  }
});

// POST /saved-searches/:id/create-panel - Create dashboard panel from saved search
router.post('/:id/create-panel', authenticate, (req: Request, res: Response) => {
  try {
    const search = getSavedSearch(req.params.id);
    if (!search) {
      return res.status(404).json({ error: 'Saved search not found' });
    }

    const data = createPanelSchema.parse(req.body);

    // Verify dashboard exists
    const dashboard = getDashboard(data.dashboard_id);
    if (!dashboard) {
      return res.status(404).json({ error: 'Dashboard not found' });
    }

    const panel = createDashboardPanel(
      data.dashboard_id,
      data.title || search.name,
      search.query,
      data.visualization || 'table',
      {},
      {
        x: data.position?.x ?? 0,
        y: data.position?.y ?? 0,
        width: data.position?.width ?? 6,
        height: data.position?.height ?? 4,
      }
    );

    return res.status(201).json({
      panel_id: panel.id,
      dashboard_id: data.dashboard_id,
      message: `Panel created from saved search "${search.name}"`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating panel from saved search:', error);
    return res.status(500).json({ error: 'Failed to create panel' });
  }
});

// POST /saved-searches/:id/create-report - Create scheduled report from saved search
router.post('/:id/create-report', authenticate, (req: Request, res: Response) => {
  try {
    const search = getSavedSearch(req.params.id);
    if (!search) {
      return res.status(404).json({ error: 'Saved search not found' });
    }

    const data = createReportSchema.parse(req.body);

    const database = getSQLiteDB();
    const id = uuidv4();

    database.prepare(`
      INSERT INTO scheduled_reports (id, name, query, schedule, recipients, format)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      `Report: ${search.name}`,
      search.query,
      data.schedule,
      data.recipients,
      data.format || 'html'
    );

    return res.status(201).json({
      report_id: id,
      name: `Report: ${search.name}`,
      message: `Report created from saved search "${search.name}"`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating report from saved search:', error);
    return res.status(500).json({ error: 'Failed to create report' });
  }
});

export default router;
