import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getSQLiteDB } from '../db/sqlite.js';
import { executeDSLQuery } from '../db/backend.js';
import { renderHtml } from '../services/report-renderer.js';
import { triggerReport } from '../services/scheduler.js';
import { rateLimit, authenticate, denyReadonly } from '../auth/middleware.js';
import { getReportTemplates, getTemplateById, getTemplatesByCategory, getTemplateCategories } from '../data/report-templates.js';
import { getAvailableReportTokens } from '../services/template-engine.js';

const router = Router();

// #35/#36: require auth on all report routes; block writes for read-only roles.
// Reports are user-usable (authenticate, not admin) per spec.
router.use(authenticate);
router.use(denyReadonly);

interface ScheduledReport {
  id: string;
  name: string;
  description?: string;
  query: string;
  schedule: string;
  recipients: string;
  format: string;
  attachment_format?: string;
  subject_template?: string;
  message_template?: string;
  send_condition?: string;
  condition_threshold?: number;
  compare_offset?: string;
  enabled: number;
  last_run: string | null;
  last_result_count?: number;
  app_scope?: string;
  created_at: string;
  updated_at?: string;
}

// ==================== Report Templates ====================

// Get all report templates
router.get('/templates', (_req: Request, res: Response) => {
  try {
    const templates = getReportTemplates();
    return res.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    return res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Get templates grouped by category
router.get('/templates/by-category', (_req: Request, res: Response) => {
  try {
    const byCategory = getTemplatesByCategory();
    return res.json(byCategory);
  } catch (error) {
    console.error('Error fetching templates:', error);
    return res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// Get template categories
router.get('/templates/categories', (_req: Request, res: Response) => {
  try {
    const categories = getTemplateCategories();
    return res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    return res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Get a specific template
router.get('/templates/:id', (req: Request, res: Response) => {
  try {
    const template = getTemplateById(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    return res.json(template);
  } catch (error) {
    console.error('Error fetching template:', error);
    return res.status(500).json({ error: 'Failed to fetch template' });
  }
});

// Create a report from a template
router.post('/from-template/:templateId', (req: Request, res: Response) => {
  try {
    const template = getTemplateById(req.params.templateId);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Allow overrides from request body
    const {
      name = template.name,
      description = template.description,
      recipients,
      schedule = template.schedule,
      app_scope = req.body.app_scope || 'default',
      ...overrides
    } = req.body;

    if (!recipients) {
      return res.status(400).json({ error: 'recipients is required' });
    }

    const db = getSQLiteDB();
    const id = uuidv4();

    db.prepare(`
      INSERT INTO scheduled_reports (
        id, name, description, query, schedule, recipients, format,
        attachment_format, subject_template, message_template,
        send_condition, condition_threshold, compare_offset, app_scope
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name,
      description,
      overrides.query || template.query,
      schedule,
      recipients,
      overrides.format || template.format,
      overrides.attachment_format || template.attachment_format,
      overrides.subject_template || template.subject_template || null,
      overrides.message_template || template.message_template || null,
      overrides.send_condition || template.send_condition,
      overrides.condition_threshold ?? template.condition_threshold ?? null,
      overrides.compare_offset || template.compare_offset || null,
      app_scope
    );

    const report = db.prepare('SELECT * FROM scheduled_reports WHERE id = ?').get(id);
    return res.status(201).json({
      report,
      template_id: template.id,
      message: `Report created from template "${template.name}"`,
    });
  } catch (error) {
    console.error('Error creating report from template:', error);
    return res.status(500).json({ error: 'Failed to create report from template' });
  }
});

// ==================== Token Documentation ====================

// Get available report tokens for UI token picker
router.get('/tokens', (_req: Request, res: Response) => {
  try {
    const tokens = getAvailableReportTokens();
    return res.json(tokens);
  } catch (error) {
    console.error('Error fetching tokens:', error);
    return res.status(500).json({ error: 'Failed to fetch tokens' });
  }
});

// ==================== Scheduled Reports CRUD ====================

// Get all scheduled reports (optionally filtered by app_scope)
router.get('/', (req: Request, res: Response) => {
  try {
    const db = getSQLiteDB();
    const appScope = req.query.app_scope as string | undefined;

    let reports: ScheduledReport[];
    if (appScope && appScope !== 'all') {
      reports = db.prepare('SELECT * FROM scheduled_reports WHERE app_scope = ? ORDER BY created_at DESC').all(appScope) as ScheduledReport[];
    } else {
      reports = db.prepare('SELECT * FROM scheduled_reports ORDER BY created_at DESC').all() as ScheduledReport[];
    }
    return res.json(reports);
  } catch (error) {
    console.error('Error fetching reports:', error);
    return res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// Create a scheduled report
router.post('/', (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      query,
      schedule,
      recipients,
      format = 'html',
      attachment_format = 'none',
      subject_template,
      message_template,
      send_condition = 'always',
      condition_threshold,
      compare_offset,
      app_scope = 'default'
    } = req.body;

    if (!name || !query || !schedule || !recipients) {
      return res.status(400).json({ error: 'Name, query, schedule, and recipients are required' });
    }

    const db = getSQLiteDB();
    const id = uuidv4();
    db.prepare(`
      INSERT INTO scheduled_reports (
        id, name, description, query, schedule, recipients, format,
        attachment_format, subject_template, message_template,
        send_condition, condition_threshold, compare_offset, app_scope
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, name, description || null, query, schedule, recipients, format,
      attachment_format, subject_template || null, message_template || null,
      send_condition, condition_threshold ?? null, compare_offset || null, app_scope
    );

    const report = db.prepare('SELECT * FROM scheduled_reports WHERE id = ?').get(id);
    return res.status(201).json(report);
  } catch (error) {
    console.error('Error creating report:', error);
    return res.status(500).json({ error: 'Failed to create report' });
  }
});

// Update a scheduled report
router.put('/:id', (req: Request, res: Response) => {
  try {
    const {
      name, description, query, schedule, recipients, format,
      attachment_format, subject_template, message_template,
      send_condition, condition_threshold, compare_offset,
      enabled, app_scope
    } = req.body;
    const db = getSQLiteDB();

    const fields: string[] = [];
    const values: unknown[] = [];

    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (query !== undefined) { fields.push('query = ?'); values.push(query); }
    if (schedule !== undefined) { fields.push('schedule = ?'); values.push(schedule); }
    if (recipients !== undefined) { fields.push('recipients = ?'); values.push(recipients); }
    if (format !== undefined) { fields.push('format = ?'); values.push(format); }
    if (attachment_format !== undefined) { fields.push('attachment_format = ?'); values.push(attachment_format); }
    if (subject_template !== undefined) { fields.push('subject_template = ?'); values.push(subject_template); }
    if (message_template !== undefined) { fields.push('message_template = ?'); values.push(message_template); }
    if (send_condition !== undefined) { fields.push('send_condition = ?'); values.push(send_condition); }
    if (condition_threshold !== undefined) { fields.push('condition_threshold = ?'); values.push(condition_threshold); }
    if (compare_offset !== undefined) { fields.push('compare_offset = ?'); values.push(compare_offset); }
    if (enabled !== undefined) { fields.push('enabled = ?'); values.push(enabled ? 1 : 0); }
    if (app_scope !== undefined) { fields.push('app_scope = ?'); values.push(app_scope); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Always update updated_at
    fields.push("updated_at = datetime('now')");

    values.push(req.params.id);
    db.prepare(`UPDATE scheduled_reports SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    const report = db.prepare('SELECT * FROM scheduled_reports WHERE id = ?').get(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    return res.json(report);
  } catch (error) {
    console.error('Error updating report:', error);
    return res.status(500).json({ error: 'Failed to update report' });
  }
});

// Trigger a scheduled report manually (rate limited: 10/min - CPU intensive)
router.post('/:id/trigger', rateLimit(10, 60000), async (req: Request, res: Response) => {
  try {
    await triggerReport(req.params.id);
    return res.json({ message: 'Report triggered successfully' });
  } catch (error) {
    console.error('Error triggering report:', error);
    return res.status(500).json({ error: String(error) });
  }
});

// Delete a scheduled report
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getSQLiteDB();
    const result = db.prepare('DELETE FROM scheduled_reports WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting report:', error);
    return res.status(500).json({ error: 'Failed to delete report' });
  }
});

// Relative ranges as the UI time picker emits them (`-15m`, `-24h`, `-7d`,
// `-1w`; `m` is MINUTES, matching the DSL compiler) or an ISO date/time.
const RELATIVE_RANGE = /^-(\d+)([mhdw])$/i;
const ISO_RANGE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z?)?$/;

function relativeRangeToMs(range: string): number | null {
  const match = range.match(RELATIVE_RANGE);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unitMs: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
  return value * unitMs[match[2].toLowerCase()];
}

// Generate a one-off report (run query and return HTML/JSON). Goes through
// the shared DSL executor so index scoping, Lite/SQLite mode and time-range
// semantics are identical to Search.
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { query, format = 'html', title = 'LogNog Report', timeRange } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required' });
    }

    let earliest: string | undefined;
    let earliestIso: string | undefined;
    if (timeRange) {
      if (typeof timeRange !== 'string' || !(RELATIVE_RANGE.test(timeRange) || ISO_RANGE.test(timeRange))) {
        return res.status(400).json({
          error: 'Invalid timeRange format. Use relative format (-15m, -24h, -7d, -1w) or ISO timestamp (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ)',
        });
      }
      earliest = timeRange;
      const relativeMs = relativeRangeToMs(timeRange);
      earliestIso = relativeMs !== null
        ? new Date(Date.now() - relativeMs).toISOString()
        : new Date(timeRange).toISOString();
    }

    const startedAt = performance.now();
    const { results } = await executeDSLQuery(query, {
      earliest,
      latest: earliest ? 'now' : undefined,
      allowedIndexes: req.allowedIndexes ?? undefined,
    });
    const executionTimeMs = Math.round(performance.now() - startedAt);

    if (format === 'json') {
      return res.json({
        title,
        generatedAt: new Date().toISOString(),
        query,
        results,
        count: results.length,
      });
    }

    const html = renderHtml({
      report: { id: `adhoc-${uuidv4()}`, name: String(title), query },
      results: results as Record<string, unknown>[],
      executionTimeMs,
      earliest: earliestIso ?? new Date(0).toISOString(),
      latest: new Date().toISOString(),
      baseUrl: process.env.BASE_URL,
    });

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="${String(title).replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.html"`);
    return res.send(html);
  } catch (error) {
    console.error('Error generating report:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate report' });
  }
});

export default router;
