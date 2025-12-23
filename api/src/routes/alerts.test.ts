/**
 * Tests for alerts API routes, specifically bulk enable/disable functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import alertsRouter from './alerts.js';
import * as sqlite from '../db/sqlite.js';

// Mock the sqlite module
vi.mock('../db/sqlite.js', async () => {
  const actual = await vi.importActual<typeof sqlite>('../db/sqlite.js');
  return {
    ...actual,
    getAlerts: vi.fn(),
    getAlert: vi.fn(),
    createAlert: vi.fn(),
    updateAlert: vi.fn(),
    deleteAlert: vi.fn(),
    bulkUpdateAlertsEnabled: vi.fn(),
    getAlertHistory: vi.fn(),
    getAlertHistoryEntry: vi.fn(),
    acknowledgeAlertHistory: vi.fn(),
  };
});

// Mock the alerts service
vi.mock('../services/alerts.js', () => ({
  evaluateAlert: vi.fn(),
  testAlert: vi.fn(),
  evaluateAllAlerts: vi.fn(),
}));

// Helper to create test app
function createTestApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/alerts', alertsRouter);
  return app;
}

// Sample alerts for testing
const sampleAlerts: sqlite.Alert[] = [
  {
    id: 'alert-1',
    name: 'Test Alert 1',
    description: 'Test alert description 1',
    search_query: 'error',
    trigger_type: 'number_of_results',
    trigger_condition: 'greater_than',
    trigger_threshold: 10,
    schedule_type: 'cron',
    cron_expression: '*/5 * * * *',
    time_range: '-5m',
    actions: '[]',
    throttle_enabled: 0,
    throttle_window_seconds: 300,
    severity: 'medium',
    enabled: 0,
    trigger_count: 0,
    created_at: '2025-12-23T10:00:00Z',
    updated_at: '2025-12-23T10:00:00Z',
  },
  {
    id: 'alert-2',
    name: 'Test Alert 2',
    description: 'Test alert description 2',
    search_query: 'warning',
    trigger_type: 'number_of_results',
    trigger_condition: 'greater_than',
    trigger_threshold: 5,
    schedule_type: 'cron',
    cron_expression: '*/10 * * * *',
    time_range: '-10m',
    actions: '[]',
    throttle_enabled: 0,
    throttle_window_seconds: 300,
    severity: 'low',
    enabled: 0,
    trigger_count: 0,
    created_at: '2025-12-23T10:00:00Z',
    updated_at: '2025-12-23T10:00:00Z',
  },
  {
    id: 'alert-3',
    name: 'Test Alert 3',
    description: 'Test alert description 3',
    search_query: 'critical',
    trigger_type: 'number_of_results',
    trigger_condition: 'greater_than',
    trigger_threshold: 0,
    schedule_type: 'cron',
    cron_expression: '* * * * *',
    time_range: '-1m',
    actions: '[]',
    throttle_enabled: 0,
    throttle_window_seconds: 300,
    severity: 'high',
    enabled: 1,
    trigger_count: 5,
    created_at: '2025-12-23T10:00:00Z',
    updated_at: '2025-12-23T10:00:00Z',
  },
];

describe('Alerts Bulk Operations API', () => {
  let app: Express;

  beforeEach(() => {
    app = createTestApp();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/alerts/bulk/enable', () => {
    it('should enable multiple alerts with valid IDs', async () => {
      const idsToEnable = ['alert-1', 'alert-2'];
      const enabledAlerts = sampleAlerts
        .filter(a => idsToEnable.includes(a.id))
        .map(a => ({ ...a, enabled: 1 }));

      vi.mocked(sqlite.bulkUpdateAlertsEnabled).mockReturnValue(enabledAlerts);

      const response = await request(app)
        .post('/api/alerts/bulk/enable')
        .send({ ids: idsToEnable });

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0].enabled).toBe(1);
      expect(response.body[1].enabled).toBe(1);
      expect(sqlite.bulkUpdateAlertsEnabled).toHaveBeenCalledWith(idsToEnable, true);
    });

    it('should return 400 when ids array is missing', async () => {
      const response = await request(app)
        .post('/api/alerts/bulk/enable')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('ids array is required and must not be empty');
      expect(sqlite.bulkUpdateAlertsEnabled).not.toHaveBeenCalled();
    });

    it('should return 400 when ids is not an array', async () => {
      const response = await request(app)
        .post('/api/alerts/bulk/enable')
        .send({ ids: 'not-an-array' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('ids array is required and must not be empty');
      expect(sqlite.bulkUpdateAlertsEnabled).not.toHaveBeenCalled();
    });

    it('should return 400 when ids array is empty', async () => {
      const response = await request(app)
        .post('/api/alerts/bulk/enable')
        .send({ ids: [] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('ids array is required and must not be empty');
      expect(sqlite.bulkUpdateAlertsEnabled).not.toHaveBeenCalled();
    });

    it('should handle mix of valid and invalid IDs (only return existing alerts)', async () => {
      const mixedIds = ['alert-1', 'non-existent-id', 'alert-2', 'another-fake-id'];
      const existingAlerts = sampleAlerts
        .filter(a => ['alert-1', 'alert-2'].includes(a.id))
        .map(a => ({ ...a, enabled: 1 }));

      vi.mocked(sqlite.bulkUpdateAlertsEnabled).mockReturnValue(existingAlerts);

      const response = await request(app)
        .post('/api/alerts/bulk/enable')
        .send({ ids: mixedIds });

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(sqlite.bulkUpdateAlertsEnabled).toHaveBeenCalledWith(mixedIds, true);
    });

    it('should return empty array when all IDs are invalid', async () => {
      vi.mocked(sqlite.bulkUpdateAlertsEnabled).mockReturnValue([]);

      const response = await request(app)
        .post('/api/alerts/bulk/enable')
        .send({ ids: ['fake-id-1', 'fake-id-2'] });

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(0);
    });

    it('should parse actions JSON for returned alerts', async () => {
      const alertWithActions = {
        ...sampleAlerts[0],
        enabled: 1,
        actions: '[{"type":"email","config":{"to":"test@example.com"}}]',
      };

      vi.mocked(sqlite.bulkUpdateAlertsEnabled).mockReturnValue([alertWithActions]);

      const response = await request(app)
        .post('/api/alerts/bulk/enable')
        .send({ ids: ['alert-1'] });

      expect(response.status).toBe(200);
      expect(response.body[0].actions).toEqual([{ type: 'email', config: { to: 'test@example.com' } }]);
    });

    it('should handle single alert enable', async () => {
      const enabledAlert = { ...sampleAlerts[0], enabled: 1 };
      vi.mocked(sqlite.bulkUpdateAlertsEnabled).mockReturnValue([enabledAlert]);

      const response = await request(app)
        .post('/api/alerts/bulk/enable')
        .send({ ids: ['alert-1'] });

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe('alert-1');
      expect(response.body[0].enabled).toBe(1);
    });
  });

  describe('POST /api/alerts/bulk/disable', () => {
    it('should disable multiple alerts with valid IDs', async () => {
      const idsToDisable = ['alert-1', 'alert-3'];
      const disabledAlerts = sampleAlerts
        .filter(a => idsToDisable.includes(a.id))
        .map(a => ({ ...a, enabled: 0 }));

      vi.mocked(sqlite.bulkUpdateAlertsEnabled).mockReturnValue(disabledAlerts);

      const response = await request(app)
        .post('/api/alerts/bulk/disable')
        .send({ ids: idsToDisable });

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0].enabled).toBe(0);
      expect(response.body[1].enabled).toBe(0);
      expect(sqlite.bulkUpdateAlertsEnabled).toHaveBeenCalledWith(idsToDisable, false);
    });

    it('should return 400 when ids array is missing', async () => {
      const response = await request(app)
        .post('/api/alerts/bulk/disable')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('ids array is required and must not be empty');
      expect(sqlite.bulkUpdateAlertsEnabled).not.toHaveBeenCalled();
    });

    it('should return 400 when ids is not an array', async () => {
      const response = await request(app)
        .post('/api/alerts/bulk/disable')
        .send({ ids: 'not-an-array' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('ids array is required and must not be empty');
      expect(sqlite.bulkUpdateAlertsEnabled).not.toHaveBeenCalled();
    });

    it('should return 400 when ids array is empty', async () => {
      const response = await request(app)
        .post('/api/alerts/bulk/disable')
        .send({ ids: [] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('ids array is required and must not be empty');
      expect(sqlite.bulkUpdateAlertsEnabled).not.toHaveBeenCalled();
    });

    it('should handle mix of valid and invalid IDs (only return existing alerts)', async () => {
      const mixedIds = ['alert-3', 'non-existent-id', 'invalid-alert'];
      const existingAlerts = [{ ...sampleAlerts[2], enabled: 0 }];

      vi.mocked(sqlite.bulkUpdateAlertsEnabled).mockReturnValue(existingAlerts);

      const response = await request(app)
        .post('/api/alerts/bulk/disable')
        .send({ ids: mixedIds });

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe('alert-3');
      expect(sqlite.bulkUpdateAlertsEnabled).toHaveBeenCalledWith(mixedIds, false);
    });

    it('should return empty array when all IDs are invalid', async () => {
      vi.mocked(sqlite.bulkUpdateAlertsEnabled).mockReturnValue([]);

      const response = await request(app)
        .post('/api/alerts/bulk/disable')
        .send({ ids: ['fake-id-1', 'fake-id-2'] });

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(0);
    });

    it('should parse actions JSON for returned alerts', async () => {
      const alertWithActions = {
        ...sampleAlerts[2],
        enabled: 0,
        actions: '[{"type":"webhook","config":{"url":"https://example.com/hook"}}]',
      };

      vi.mocked(sqlite.bulkUpdateAlertsEnabled).mockReturnValue([alertWithActions]);

      const response = await request(app)
        .post('/api/alerts/bulk/disable')
        .send({ ids: ['alert-3'] });

      expect(response.status).toBe(200);
      expect(response.body[0].actions).toEqual([{ type: 'webhook', config: { url: 'https://example.com/hook' } }]);
    });

    it('should handle single alert disable', async () => {
      const disabledAlert = { ...sampleAlerts[2], enabled: 0 };
      vi.mocked(sqlite.bulkUpdateAlertsEnabled).mockReturnValue([disabledAlert]);

      const response = await request(app)
        .post('/api/alerts/bulk/disable')
        .send({ ids: ['alert-3'] });

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe('alert-3');
      expect(response.body[0].enabled).toBe(0);
    });
  });

  describe('Error handling', () => {
    it('should return 500 when bulkUpdateAlertsEnabled throws for enable', async () => {
      vi.mocked(sqlite.bulkUpdateAlertsEnabled).mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app)
        .post('/api/alerts/bulk/enable')
        .send({ ids: ['alert-1'] });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to bulk enable alerts');
    });

    it('should return 500 when bulkUpdateAlertsEnabled throws for disable', async () => {
      vi.mocked(sqlite.bulkUpdateAlertsEnabled).mockImplementation(() => {
        throw new Error('Database error');
      });

      const response = await request(app)
        .post('/api/alerts/bulk/disable')
        .send({ ids: ['alert-1'] });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to bulk disable alerts');
    });
  });

  describe('Bulk operation with null ids field', () => {
    it('should return 400 when ids is null for enable', async () => {
      const response = await request(app)
        .post('/api/alerts/bulk/enable')
        .send({ ids: null });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('ids array is required and must not be empty');
    });

    it('should return 400 when ids is null for disable', async () => {
      const response = await request(app)
        .post('/api/alerts/bulk/disable')
        .send({ ids: null });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('ids array is required and must not be empty');
    });
  });
});
