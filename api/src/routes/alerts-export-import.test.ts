/**
 * Tests for alert export/import functionality
 *
 * Tests the roundtrip of exporting alerts and re-importing them,
 * as well as edge cases and validation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { Router, Request, Response } from 'express';

// Mock database module
const mockAlerts: Map<string, Record<string, unknown>> = new Map();
let alertIdCounter = 1;

// Reset mock state before each test
function resetMockDatabase() {
  mockAlerts.clear();
  alertIdCounter = 1;
}

// Mock functions that simulate database operations
function mockGetAlerts() {
  return Array.from(mockAlerts.values()).map(alert => ({
    ...alert,
    actions: typeof alert.actions === 'string' ? alert.actions : JSON.stringify(alert.actions || []),
  }));
}

function mockGetAlert(id: string) {
  const alert = mockAlerts.get(id);
  if (!alert) return null;
  return {
    ...alert,
    actions: typeof alert.actions === 'string' ? alert.actions : JSON.stringify(alert.actions || []),
  };
}

function mockCreateAlert(name: string, search_query: string, options: Record<string, unknown> = {}) {
  const id = `alert-${alertIdCounter++}`;
  const now = new Date().toISOString();
  const alert = {
    id,
    name,
    search_query,
    description: options.description || null,
    trigger_type: options.trigger_type || 'number_of_results',
    trigger_condition: options.trigger_condition || 'greater_than',
    trigger_threshold: options.trigger_threshold ?? 0,
    schedule_type: options.schedule_type || 'cron',
    cron_expression: options.cron_expression || '*/5 * * * *',
    time_range: options.time_range || '-5m',
    actions: JSON.stringify(options.actions || []),
    throttle_enabled: options.throttle_enabled ? 1 : 0,
    throttle_window_seconds: options.throttle_window_seconds || 300,
    severity: options.severity || 'medium',
    enabled: options.enabled ? 1 : 0,
    last_run: null,
    last_triggered: null,
    trigger_count: 0,
    created_at: now,
    updated_at: now,
  };
  mockAlerts.set(id, alert);
  return alert;
}

// Valid enum values for validation
const VALID_TRIGGER_TYPES = ['number_of_results', 'number_of_hosts', 'custom_condition'];
const VALID_TRIGGER_CONDITIONS = ['greater_than', 'less_than', 'equal_to', 'not_equal_to', 'drops_by', 'rises_by'];
const VALID_SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'];
const VALID_SCHEDULE_TYPES = ['cron', 'realtime'];

// Validation function
function validateAlertTemplate(template: Record<string, unknown>, index?: number): string[] {
  const errors: string[] = [];
  const prefix = index !== undefined ? `Alert ${index + 1}: ` : '';

  if (!template.name || typeof template.name !== 'string' || !template.name.trim()) {
    errors.push(`${prefix}name is required`);
  }
  if (!template.search_query || typeof template.search_query !== 'string' || !template.search_query.trim()) {
    errors.push(`${prefix}search_query is required`);
  }

  if (template.trigger_type !== undefined && !VALID_TRIGGER_TYPES.includes(template.trigger_type as string)) {
    errors.push(`${prefix}trigger_type must be one of: ${VALID_TRIGGER_TYPES.join(', ')}`);
  }
  if (template.trigger_condition !== undefined && !VALID_TRIGGER_CONDITIONS.includes(template.trigger_condition as string)) {
    errors.push(`${prefix}trigger_condition must be one of: ${VALID_TRIGGER_CONDITIONS.join(', ')}`);
  }
  if (template.severity !== undefined && !VALID_SEVERITIES.includes(template.severity as string)) {
    errors.push(`${prefix}severity must be one of: ${VALID_SEVERITIES.join(', ')}`);
  }
  if (template.schedule_type !== undefined && !VALID_SCHEDULE_TYPES.includes(template.schedule_type as string)) {
    errors.push(`${prefix}schedule_type must be one of: ${VALID_SCHEDULE_TYPES.join(', ')}`);
  }

  // Validate actions
  if (template.actions !== undefined) {
    if (!Array.isArray(template.actions)) {
      errors.push(`${prefix}actions must be an array`);
    } else {
      template.actions.forEach((action: Record<string, unknown>, actionIndex: number) => {
        if (!action.type || !['email', 'webhook', 'log', 'script'].includes(action.type as string)) {
          errors.push(`${prefix}action ${actionIndex + 1}: type must be one of: email, webhook, log, script`);
        } else if (!action.config || typeof action.config !== 'object') {
          errors.push(`${prefix}action ${actionIndex + 1}: config is required`);
        } else {
          const config = action.config as Record<string, unknown>;
          if (action.type === 'email' && (!config.to || typeof config.to !== 'string' || !(config.to as string).trim())) {
            errors.push(`${prefix}action ${actionIndex + 1}: email action requires 'to' in config`);
          }
          if (action.type === 'webhook' && (!config.url || typeof config.url !== 'string' || !(config.url as string).trim())) {
            errors.push(`${prefix}action ${actionIndex + 1}: webhook action requires 'url' in config`);
          }
        }
      });
    }
  }

  return errors;
}

// Generate unique name for imported alert
function generateUniqueName(baseName: string, existingNames: Set<string>): string {
  let name = baseName;
  if (existingNames.has(name)) {
    name = `${baseName} (imported)`;
    let counter = 2;
    while (existingNames.has(name)) {
      name = `${baseName} (imported ${counter})`;
      counter++;
    }
  }
  return name;
}

// Create test router
function createTestRouter(): Express {
  const app = express();
  app.use(express.json());

  const router = Router();

  // Export single alert
  router.post('/:id/export', (req: Request, res: Response) => {
    try {
      const alert = mockGetAlert(req.params.id);
      if (!alert) {
        return res.status(404).json({ error: 'Alert not found' });
      }

      const exportData = {
        name: alert.name,
        description: alert.description,
        search_query: alert.search_query,
        trigger_type: alert.trigger_type,
        trigger_condition: alert.trigger_condition,
        trigger_threshold: alert.trigger_threshold,
        schedule_type: alert.schedule_type,
        cron_expression: alert.cron_expression,
        time_range: alert.time_range,
        actions: JSON.parse(alert.actions as string || '[]'),
        throttle_enabled: alert.throttle_enabled,
        throttle_window_seconds: alert.throttle_window_seconds,
        severity: alert.severity,
        enabled: alert.enabled,
        exported_at: new Date().toISOString(),
        version: '1.0',
      };

      return res.json(exportData);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to export alert' });
    }
  });

  // Export all alerts
  router.post('/export-all', (_req: Request, res: Response) => {
    try {
      const alerts = mockGetAlerts();

      const exportedAlerts = alerts.map(alert => ({
        name: alert.name,
        description: alert.description,
        search_query: alert.search_query,
        trigger_type: alert.trigger_type,
        trigger_condition: alert.trigger_condition,
        trigger_threshold: alert.trigger_threshold,
        schedule_type: alert.schedule_type,
        cron_expression: alert.cron_expression,
        time_range: alert.time_range,
        actions: JSON.parse(alert.actions as string || '[]'),
        throttle_enabled: alert.throttle_enabled,
        throttle_window_seconds: alert.throttle_window_seconds,
        severity: alert.severity,
        enabled: alert.enabled,
      }));

      const exportData = {
        alerts: exportedAlerts,
        count: exportedAlerts.length,
        exported_at: new Date().toISOString(),
        version: '1.0',
      };

      return res.json(exportData);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to export alerts' });
    }
  });

  // Import alerts
  router.post('/import', (req: Request, res: Response) => {
    try {
      const { templates, template } = req.body;

      let alertTemplates: Record<string, unknown>[];
      if (templates) {
        alertTemplates = Array.isArray(templates) ? templates : [templates];
      } else if (template) {
        alertTemplates = Array.isArray(template) ? template : [template];
      } else if (req.body.alerts) {
        alertTemplates = Array.isArray(req.body.alerts) ? req.body.alerts : [req.body.alerts];
      } else if (Array.isArray(req.body)) {
        alertTemplates = req.body;
      } else if (req.body.name || req.body.search_query) {
        alertTemplates = [req.body];
      } else {
        return res.status(400).json({
          error: 'Invalid request format. Provide templates array, template object, alerts array, or alert template directly.'
        });
      }

      if (alertTemplates.length === 0) {
        return res.status(400).json({ error: 'No alert templates provided' });
      }

      // Validate all templates first
      const allErrors: string[] = [];
      alertTemplates.forEach((tmpl, index) => {
        const errors = validateAlertTemplate(tmpl, alertTemplates.length > 1 ? index : undefined);
        allErrors.push(...errors);
      });

      if (allErrors.length > 0) {
        return res.status(400).json({
          error: 'Validation failed',
          details: allErrors
        });
      }

      // Get existing alert names for duplicate handling
      const existingAlerts = mockGetAlerts();
      const existingNames = new Set(existingAlerts.map(a => a.name as string));
      const usedNames = new Set(existingNames);

      // Create alerts
      const createdAlerts: Array<Record<string, unknown>> = [];
      for (const tmpl of alertTemplates) {
        const name = generateUniqueName(tmpl.name as string, usedNames);
        usedNames.add(name);

        const alert = mockCreateAlert(name, tmpl.search_query as string, {
          description: tmpl.description as string | undefined,
          trigger_type: tmpl.trigger_type || undefined,
          trigger_condition: tmpl.trigger_condition || undefined,
          trigger_threshold: tmpl.trigger_threshold as number | undefined,
          schedule_type: tmpl.schedule_type || undefined,
          cron_expression: tmpl.cron_expression as string | undefined,
          time_range: tmpl.time_range as string | undefined,
          actions: tmpl.actions || [],
          throttle_enabled: tmpl.throttle_enabled === 1 || tmpl.throttle_enabled === true,
          throttle_window_seconds: tmpl.throttle_window_seconds as number | undefined,
          severity: tmpl.severity || undefined,
          enabled: tmpl.enabled === 1 || tmpl.enabled === true,
        });

        createdAlerts.push({
          ...alert,
          actions: JSON.parse(alert.actions as string || '[]'),
        });
      }

      return res.status(201).json({
        imported: createdAlerts,
        count: createdAlerts.length,
      });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to import alerts' });
    }
  });

  app.use('/api/alerts', router);
  return app;
}

describe('Alert Export/Import', () => {
  let app: Express;

  beforeEach(() => {
    resetMockDatabase();
    app = createTestRouter();
  });

  describe('Export Single Alert', () => {
    it('should export a single alert with all configuration fields', async () => {
      // Create an alert first
      mockCreateAlert('Test Alert', 'search severity<=3', {
        description: 'Test description',
        trigger_type: 'number_of_results',
        trigger_condition: 'greater_than',
        trigger_threshold: 10,
        schedule_type: 'cron',
        cron_expression: '*/5 * * * *',
        time_range: '-15m',
        severity: 'high',
        throttle_enabled: true,
        throttle_window_seconds: 600,
        enabled: true,
        actions: [
          { type: 'email', config: { to: 'test@example.com', subject: 'Alert!' } }
        ],
      });

      const response = await request(app)
        .post('/api/alerts/alert-1/export');

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Test Alert');
      expect(response.body.description).toBe('Test description');
      expect(response.body.search_query).toBe('search severity<=3');
      expect(response.body.trigger_type).toBe('number_of_results');
      expect(response.body.trigger_condition).toBe('greater_than');
      expect(response.body.trigger_threshold).toBe(10);
      expect(response.body.schedule_type).toBe('cron');
      expect(response.body.cron_expression).toBe('*/5 * * * *');
      expect(response.body.time_range).toBe('-15m');
      expect(response.body.severity).toBe('high');
      expect(response.body.throttle_enabled).toBe(1);
      expect(response.body.throttle_window_seconds).toBe(600);
      expect(response.body.enabled).toBe(1);
      expect(response.body.actions).toEqual([
        { type: 'email', config: { to: 'test@example.com', subject: 'Alert!' } }
      ]);
      expect(response.body.exported_at).toBeDefined();
      expect(response.body.version).toBe('1.0');
    });

    it('should exclude runtime data (id, last_run, trigger_count, etc)', async () => {
      mockCreateAlert('Runtime Test', 'search *', { enabled: true });

      const response = await request(app)
        .post('/api/alerts/alert-1/export');

      expect(response.status).toBe(200);
      expect(response.body.id).toBeUndefined();
      expect(response.body.last_run).toBeUndefined();
      expect(response.body.last_triggered).toBeUndefined();
      expect(response.body.trigger_count).toBeUndefined();
      expect(response.body.created_at).toBeUndefined();
      expect(response.body.updated_at).toBeUndefined();
    });

    it('should return 404 for non-existent alert', async () => {
      const response = await request(app)
        .post('/api/alerts/non-existent/export');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Alert not found');
    });
  });

  describe('Export All Alerts', () => {
    it('should export all alerts as an array', async () => {
      mockCreateAlert('Alert One', 'search error', { severity: 'high' });
      mockCreateAlert('Alert Two', 'search warning', { severity: 'medium' });
      mockCreateAlert('Alert Three', 'search info', { severity: 'low' });

      const response = await request(app)
        .post('/api/alerts/export-all');

      expect(response.status).toBe(200);
      expect(response.body.alerts).toHaveLength(3);
      expect(response.body.count).toBe(3);
      expect(response.body.exported_at).toBeDefined();
      expect(response.body.version).toBe('1.0');
    });

    it('should handle empty alerts list gracefully', async () => {
      const response = await request(app)
        .post('/api/alerts/export-all');

      expect(response.status).toBe(200);
      expect(response.body.alerts).toHaveLength(0);
      expect(response.body.count).toBe(0);
    });
  });

  describe('Import Alerts', () => {
    it('should import a single alert template', async () => {
      const template = {
        name: 'Imported Alert',
        search_query: 'search severity<=3',
        trigger_type: 'number_of_results',
        trigger_condition: 'greater_than',
        trigger_threshold: 5,
        severity: 'critical',
      };

      const response = await request(app)
        .post('/api/alerts/import')
        .send({ template });

      expect(response.status).toBe(201);
      expect(response.body.imported).toHaveLength(1);
      expect(response.body.count).toBe(1);
      expect(response.body.imported[0].name).toBe('Imported Alert');
      expect(response.body.imported[0].search_query).toBe('search severity<=3');
    });

    it('should import multiple alert templates', async () => {
      const templates = [
        { name: 'Alert 1', search_query: 'search error' },
        { name: 'Alert 2', search_query: 'search warning' },
        { name: 'Alert 3', search_query: 'search info' },
      ];

      const response = await request(app)
        .post('/api/alerts/import')
        .send({ templates });

      expect(response.status).toBe(201);
      expect(response.body.imported).toHaveLength(3);
      expect(response.body.count).toBe(3);
    });

    it('should accept bulk export format (alerts array)', async () => {
      const exportFormat = {
        alerts: [
          { name: 'Bulk Alert 1', search_query: 'search *' },
          { name: 'Bulk Alert 2', search_query: 'search error' },
        ],
        count: 2,
        exported_at: new Date().toISOString(),
        version: '1.0',
      };

      const response = await request(app)
        .post('/api/alerts/import')
        .send(exportFormat);

      expect(response.status).toBe(201);
      expect(response.body.imported).toHaveLength(2);
    });

    it('should accept direct array format', async () => {
      const templates = [
        { name: 'Direct 1', search_query: 'search a' },
        { name: 'Direct 2', search_query: 'search b' },
      ];

      const response = await request(app)
        .post('/api/alerts/import')
        .send(templates);

      expect(response.status).toBe(201);
      expect(response.body.imported).toHaveLength(2);
    });

    it('should accept single object format', async () => {
      const response = await request(app)
        .post('/api/alerts/import')
        .send({ name: 'Single Alert', search_query: 'search test' });

      expect(response.status).toBe(201);
      expect(response.body.imported).toHaveLength(1);
      expect(response.body.imported[0].name).toBe('Single Alert');
    });
  });

  describe('Export/Import Roundtrip', () => {
    it('should preserve all fields when exporting and re-importing a single alert', async () => {
      // Create original alert with all fields
      const originalConfig = {
        description: 'Full configuration test',
        trigger_type: 'number_of_hosts',
        trigger_condition: 'less_than',
        trigger_threshold: 3,
        schedule_type: 'cron',
        cron_expression: '0 */6 * * *',
        time_range: '-1h',
        severity: 'critical',
        throttle_enabled: true,
        throttle_window_seconds: 1800,
        enabled: true,
        actions: [
          { type: 'email', config: { to: 'admin@example.com', subject: 'Critical Alert', body: 'Check system' } },
          { type: 'webhook', config: { url: 'https://api.example.com/webhook', method: 'POST' } },
        ],
      };

      mockCreateAlert('Roundtrip Test', 'search host=* | stats count by host', originalConfig);

      // Export the alert
      const exportResponse = await request(app)
        .post('/api/alerts/alert-1/export');

      expect(exportResponse.status).toBe(200);

      // Clear database and import the exported alert
      resetMockDatabase();

      const importResponse = await request(app)
        .post('/api/alerts/import')
        .send(exportResponse.body);

      expect(importResponse.status).toBe(201);

      const imported = importResponse.body.imported[0];

      // Verify all fields are preserved
      expect(imported.name).toBe('Roundtrip Test');
      expect(imported.search_query).toBe('search host=* | stats count by host');
      expect(imported.description).toBe('Full configuration test');
      expect(imported.trigger_type).toBe('number_of_hosts');
      expect(imported.trigger_condition).toBe('less_than');
      expect(imported.trigger_threshold).toBe(3);
      expect(imported.schedule_type).toBe('cron');
      expect(imported.cron_expression).toBe('0 */6 * * *');
      expect(imported.time_range).toBe('-1h');
      expect(imported.severity).toBe('critical');
      expect(imported.throttle_enabled).toBe(1);
      expect(imported.throttle_window_seconds).toBe(1800);
      expect(imported.enabled).toBe(1);
      expect(imported.actions).toHaveLength(2);
      expect(imported.actions[0]).toEqual({
        type: 'email',
        config: { to: 'admin@example.com', subject: 'Critical Alert', body: 'Check system' }
      });
      expect(imported.actions[1]).toEqual({
        type: 'webhook',
        config: { url: 'https://api.example.com/webhook', method: 'POST' }
      });
    });

    it('should preserve all alerts when exporting all and re-importing', async () => {
      // Create multiple alerts
      mockCreateAlert('Alert A', 'search severity=1', { severity: 'critical', enabled: true });
      mockCreateAlert('Alert B', 'search severity=2', { severity: 'high', enabled: true });
      mockCreateAlert('Alert C', 'search severity=3', { severity: 'medium', enabled: false });

      // Export all
      const exportResponse = await request(app)
        .post('/api/alerts/export-all');

      expect(exportResponse.status).toBe(200);
      expect(exportResponse.body.count).toBe(3);

      // Clear database and import
      resetMockDatabase();

      const importResponse = await request(app)
        .post('/api/alerts/import')
        .send(exportResponse.body);

      expect(importResponse.status).toBe(201);
      expect(importResponse.body.count).toBe(3);

      const imported = importResponse.body.imported;
      expect(imported.map((a: Record<string, unknown>) => a.name)).toContain('Alert A');
      expect(imported.map((a: Record<string, unknown>) => a.name)).toContain('Alert B');
      expect(imported.map((a: Record<string, unknown>) => a.name)).toContain('Alert C');
    });
  });

  describe('Duplicate Name Handling', () => {
    it('should add (imported) suffix when name already exists', async () => {
      // Create existing alert
      mockCreateAlert('My Alert', 'search original', {});

      // Import alert with same name
      const response = await request(app)
        .post('/api/alerts/import')
        .send({ name: 'My Alert', search_query: 'search imported' });

      expect(response.status).toBe(201);
      expect(response.body.imported[0].name).toBe('My Alert (imported)');
    });

    it('should increment suffix for multiple duplicates', async () => {
      // Create existing alerts
      mockCreateAlert('Duplicate', 'search 1', {});
      mockCreateAlert('Duplicate (imported)', 'search 2', {});

      // Import alert with same name
      const response = await request(app)
        .post('/api/alerts/import')
        .send({ name: 'Duplicate', search_query: 'search 3' });

      expect(response.status).toBe(201);
      expect(response.body.imported[0].name).toBe('Duplicate (imported 2)');
    });

    it('should handle multiple imports with same name in one request', async () => {
      const templates = [
        { name: 'Same Name', search_query: 'search 1' },
        { name: 'Same Name', search_query: 'search 2' },
        { name: 'Same Name', search_query: 'search 3' },
      ];

      const response = await request(app)
        .post('/api/alerts/import')
        .send({ templates });

      expect(response.status).toBe(201);
      const names = response.body.imported.map((a: Record<string, unknown>) => a.name);
      expect(names).toContain('Same Name');
      expect(names).toContain('Same Name (imported)');
      expect(names).toContain('Same Name (imported 2)');
    });
  });

  describe('Validation Errors', () => {
    it('should reject import with missing name', async () => {
      const response = await request(app)
        .post('/api/alerts/import')
        .send({ search_query: 'search *' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toContain('name is required');
    });

    it('should reject import with missing search_query', async () => {
      const response = await request(app)
        .post('/api/alerts/import')
        .send({ name: 'Test Alert' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toContain('search_query is required');
    });

    it('should reject import with invalid trigger_type', async () => {
      const response = await request(app)
        .post('/api/alerts/import')
        .send({
          name: 'Test',
          search_query: 'search *',
          trigger_type: 'invalid_type',
        });

      expect(response.status).toBe(400);
      expect(response.body.details[0]).toContain('trigger_type must be one of');
    });

    it('should reject import with invalid trigger_condition', async () => {
      const response = await request(app)
        .post('/api/alerts/import')
        .send({
          name: 'Test',
          search_query: 'search *',
          trigger_condition: 'invalid_condition',
        });

      expect(response.status).toBe(400);
      expect(response.body.details[0]).toContain('trigger_condition must be one of');
    });

    it('should reject import with invalid severity', async () => {
      const response = await request(app)
        .post('/api/alerts/import')
        .send({
          name: 'Test',
          search_query: 'search *',
          severity: 'super_critical',
        });

      expect(response.status).toBe(400);
      expect(response.body.details[0]).toContain('severity must be one of');
    });

    it('should reject import with invalid schedule_type', async () => {
      const response = await request(app)
        .post('/api/alerts/import')
        .send({
          name: 'Test',
          search_query: 'search *',
          schedule_type: 'hourly',
        });

      expect(response.status).toBe(400);
      expect(response.body.details[0]).toContain('schedule_type must be one of');
    });

    it('should reject email action without to field', async () => {
      const response = await request(app)
        .post('/api/alerts/import')
        .send({
          name: 'Test',
          search_query: 'search *',
          actions: [{ type: 'email', config: { subject: 'Test' } }],
        });

      expect(response.status).toBe(400);
      expect(response.body.details[0]).toContain("email action requires 'to'");
    });

    it('should reject webhook action without url field', async () => {
      const response = await request(app)
        .post('/api/alerts/import')
        .send({
          name: 'Test',
          search_query: 'search *',
          actions: [{ type: 'webhook', config: { method: 'POST' } }],
        });

      expect(response.status).toBe(400);
      expect(response.body.details[0]).toContain("webhook action requires 'url'");
    });

    it('should validate all alerts and report all errors', async () => {
      const templates = [
        { name: '', search_query: 'valid' },
        { name: 'valid', search_query: '' },
        { name: 'valid2', search_query: 'valid', severity: 'invalid' },
      ];

      const response = await request(app)
        .post('/api/alerts/import')
        .send({ templates });

      expect(response.status).toBe(400);
      expect(response.body.details.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty templates array gracefully', async () => {
      const response = await request(app)
        .post('/api/alerts/import')
        .send({ templates: [] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No alert templates provided');
    });

    it('should handle invalid request format', async () => {
      const response = await request(app)
        .post('/api/alerts/import')
        .send({ invalid: 'data' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid request format');
    });

    it('should handle alert with empty actions array', async () => {
      const response = await request(app)
        .post('/api/alerts/import')
        .send({
          name: 'No Actions Alert',
          search_query: 'search *',
          actions: [],
        });

      expect(response.status).toBe(201);
      expect(response.body.imported[0].actions).toEqual([]);
    });

    it('should handle alert with log action (no special config needed)', async () => {
      const response = await request(app)
        .post('/api/alerts/import')
        .send({
          name: 'Log Action Alert',
          search_query: 'search *',
          actions: [{ type: 'log', config: {} }],
        });

      expect(response.status).toBe(201);
      expect(response.body.imported[0].actions[0].type).toBe('log');
    });

    it('should preserve boolean enabled field in roundtrip', async () => {
      // Test with enabled: false
      mockCreateAlert('Disabled Alert', 'search *', { enabled: false });

      const exportRes = await request(app).post('/api/alerts/alert-1/export');

      resetMockDatabase();

      const importRes = await request(app)
        .post('/api/alerts/import')
        .send(exportRes.body);

      expect(importRes.body.imported[0].enabled).toBe(0);
    });

    it('should preserve throttle settings in roundtrip', async () => {
      mockCreateAlert('Throttled Alert', 'search *', {
        throttle_enabled: true,
        throttle_window_seconds: 3600,
      });

      const exportRes = await request(app).post('/api/alerts/alert-1/export');

      resetMockDatabase();

      const importRes = await request(app)
        .post('/api/alerts/import')
        .send(exportRes.body);

      expect(importRes.body.imported[0].throttle_enabled).toBe(1);
      expect(importRes.body.imported[0].throttle_window_seconds).toBe(3600);
    });

    it('should handle alerts with null description', async () => {
      mockCreateAlert('No Description', 'search *', {});

      const exportRes = await request(app).post('/api/alerts/alert-1/export');

      expect(exportRes.body.description).toBeNull();

      resetMockDatabase();

      const importRes = await request(app)
        .post('/api/alerts/import')
        .send(exportRes.body);

      expect(importRes.status).toBe(201);
    });

    it('should handle alerts with complex webhook actions', async () => {
      const complexAction = {
        type: 'webhook',
        config: {
          url: 'https://api.example.com/alerts',
          method: 'POST',
          headers: { 'Authorization': 'Bearer token', 'Content-Type': 'application/json' },
          payload: '{"alert": "{{alert_name}}", "host": "{{hostname}}"}'
        }
      };

      mockCreateAlert('Complex Webhook', 'search *', {
        actions: [complexAction],
      });

      const exportRes = await request(app).post('/api/alerts/alert-1/export');

      expect(exportRes.body.actions[0].config.headers).toBeDefined();
      expect(exportRes.body.actions[0].config.payload).toBeDefined();

      resetMockDatabase();

      const importRes = await request(app)
        .post('/api/alerts/import')
        .send(exportRes.body);

      expect(importRes.status).toBe(201);
      expect(importRes.body.imported[0].actions[0].config.headers).toEqual({
        'Authorization': 'Bearer token',
        'Content-Type': 'application/json'
      });
    });
  });
});
