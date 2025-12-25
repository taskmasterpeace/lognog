/**
 * Integration tests for Alerts API Routes
 *
 * Tests the bulk toggle endpoint for enabling/disabling multiple alerts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import {
  createAlert,
  getAlert,
  deleteAlert,
  getAlerts,
} from '../db/sqlite.js';
import alertsRouter from './alerts.js';

// Create a test app with the alerts router
function createTestApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/alerts', alertsRouter);
  return app;
}

describe('Alerts API - Bulk Toggle Endpoint', () => {
  let app: Express;
  let createdAlertIds: string[] = [];

  beforeEach(() => {
    app = createTestApp();
    createdAlertIds = [];
  });

  afterEach(() => {
    // Clean up created alerts
    for (const id of createdAlertIds) {
      try {
        deleteAlert(id);
      } catch {
        // Ignore cleanup errors
      }
    }
    createdAlertIds = [];
  });

  // Helper to create a test alert
  function createTestAlert(name: string, enabled: boolean = true): string {
    const alert = createAlert(name, 'search index=main', {
      description: 'Test alert',
      enabled,
    });
    createdAlertIds.push(alert.id);
    return alert.id;
  }

  describe('POST /api/alerts/bulk/toggle', () => {
    describe('Successful bulk operations', () => {
      it('should bulk enable multiple disabled alerts', async () => {
        // Create disabled alerts
        const id1 = createTestAlert('Alert 1', false);
        const id2 = createTestAlert('Alert 2', false);
        const id3 = createTestAlert('Alert 3', false);

        // Verify they are disabled
        expect(getAlert(id1)?.enabled).toBe(0);
        expect(getAlert(id2)?.enabled).toBe(0);
        expect(getAlert(id3)?.enabled).toBe(0);

        const response = await request(app)
          .post('/api/alerts/bulk/toggle')
          .send({ ids: [id1, id2, id3], enabled: true });

        expect(response.status).toBe(200);
        expect(response.body.success).toHaveLength(3);
        expect(response.body.failed).toHaveLength(0);

        // Verify all IDs are in the success array
        const successIds = response.body.success.map((a: { id: string }) => a.id);
        expect(successIds).toContain(id1);
        expect(successIds).toContain(id2);
        expect(successIds).toContain(id3);

        // Verify they are now enabled
        expect(getAlert(id1)?.enabled).toBe(1);
        expect(getAlert(id2)?.enabled).toBe(1);
        expect(getAlert(id3)?.enabled).toBe(1);
      });

      it('should bulk disable multiple enabled alerts', async () => {
        // Create enabled alerts
        const id1 = createTestAlert('Alert 1', true);
        const id2 = createTestAlert('Alert 2', true);
        const id3 = createTestAlert('Alert 3', true);

        // Verify they are enabled
        expect(getAlert(id1)?.enabled).toBe(1);
        expect(getAlert(id2)?.enabled).toBe(1);
        expect(getAlert(id3)?.enabled).toBe(1);

        const response = await request(app)
          .post('/api/alerts/bulk/toggle')
          .send({ ids: [id1, id2, id3], enabled: false });

        expect(response.status).toBe(200);
        expect(response.body.success).toHaveLength(3);
        expect(response.body.failed).toHaveLength(0);

        // Verify all IDs are in the success array
        const successIds = response.body.success.map((a: { id: string }) => a.id);
        expect(successIds).toContain(id1);
        expect(successIds).toContain(id2);
        expect(successIds).toContain(id3);

        // Verify they are now disabled
        expect(getAlert(id1)?.enabled).toBe(0);
        expect(getAlert(id2)?.enabled).toBe(0);
        expect(getAlert(id3)?.enabled).toBe(0);
      });

      it('should handle single alert in bulk operation', async () => {
        const id = createTestAlert('Single Alert', false);

        const response = await request(app)
          .post('/api/alerts/bulk/toggle')
          .send({ ids: [id], enabled: true });

        expect(response.status).toBe(200);
        expect(response.body.success).toHaveLength(1);
        expect(response.body.failed).toHaveLength(0);
        expect(response.body.success[0].id).toBe(id);
        expect(getAlert(id)?.enabled).toBe(1);
      });

      it('should return parsed actions in success response', async () => {
        const alert = createAlert('Alert with Actions', 'search index=main', {
          enabled: false,
          actions: [{ type: 'email', to: 'test@example.com' }],
        });
        createdAlertIds.push(alert.id);

        const response = await request(app)
          .post('/api/alerts/bulk/toggle')
          .send({ ids: [alert.id], enabled: true });

        expect(response.status).toBe(200);
        expect(response.body.success[0].actions).toEqual([
          { type: 'email', to: 'test@example.com' },
        ]);
      });
    });

    describe('Mixed valid and invalid IDs', () => {
      it('should handle mix of valid and non-existent IDs', async () => {
        const id1 = createTestAlert('Valid Alert 1', false);
        const id2 = createTestAlert('Valid Alert 2', false);
        const nonExistentId = 'non-existent-id-12345';

        const response = await request(app)
          .post('/api/alerts/bulk/toggle')
          .send({ ids: [id1, nonExistentId, id2], enabled: true });

        expect(response.status).toBe(200);

        // Success should contain valid alerts
        expect(response.body.success).toHaveLength(2);
        const successIds = response.body.success.map((a: { id: string }) => a.id);
        expect(successIds).toContain(id1);
        expect(successIds).toContain(id2);

        // Failed should contain non-existent ID
        expect(response.body.failed).toHaveLength(1);
        expect(response.body.failed[0].id).toBe(nonExistentId);
        expect(response.body.failed[0].error).toBe('Alert not found');

        // Valid alerts should be updated
        expect(getAlert(id1)?.enabled).toBe(1);
        expect(getAlert(id2)?.enabled).toBe(1);
      });

      it('should handle all non-existent IDs', async () => {
        const response = await request(app)
          .post('/api/alerts/bulk/toggle')
          .send({
            ids: ['non-existent-1', 'non-existent-2', 'non-existent-3'],
            enabled: true,
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toHaveLength(0);
        expect(response.body.failed).toHaveLength(3);

        for (const failed of response.body.failed) {
          expect(failed.error).toBe('Alert not found');
        }
      });

      it('should preserve already correct states', async () => {
        const alreadyEnabled = createTestAlert('Already Enabled', true);
        const wasDisabled = createTestAlert('Was Disabled', false);

        const response = await request(app)
          .post('/api/alerts/bulk/toggle')
          .send({ ids: [alreadyEnabled, wasDisabled], enabled: true });

        expect(response.status).toBe(200);
        expect(response.body.success).toHaveLength(2);
        expect(response.body.failed).toHaveLength(0);

        // Both should be enabled now
        expect(getAlert(alreadyEnabled)?.enabled).toBe(1);
        expect(getAlert(wasDisabled)?.enabled).toBe(1);
      });
    });

    describe('Input validation', () => {
      it('should return 400 for empty ids array', async () => {
        const response = await request(app)
          .post('/api/alerts/bulk/toggle')
          .send({ ids: [], enabled: true });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('ids must be a non-empty array');
      });

      it('should return 400 for missing ids field', async () => {
        const response = await request(app)
          .post('/api/alerts/bulk/toggle')
          .send({ enabled: true });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('ids must be a non-empty array');
      });

      it('should return 400 for ids as non-array', async () => {
        const response = await request(app)
          .post('/api/alerts/bulk/toggle')
          .send({ ids: 'not-an-array', enabled: true });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('ids must be a non-empty array');
      });

      it('should return 400 for missing enabled field', async () => {
        const id = createTestAlert('Test Alert');

        const response = await request(app)
          .post('/api/alerts/bulk/toggle')
          .send({ ids: [id] });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('enabled must be a boolean');
      });

      it('should return 400 for enabled as non-boolean string', async () => {
        const id = createTestAlert('Test Alert');

        const response = await request(app)
          .post('/api/alerts/bulk/toggle')
          .send({ ids: [id], enabled: 'true' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('enabled must be a boolean');
      });

      it('should return 400 for enabled as number', async () => {
        const id = createTestAlert('Test Alert');

        const response = await request(app)
          .post('/api/alerts/bulk/toggle')
          .send({ ids: [id], enabled: 1 });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('enabled must be a boolean');
      });

      it('should return 400 for enabled as null', async () => {
        const id = createTestAlert('Test Alert');

        const response = await request(app)
          .post('/api/alerts/bulk/toggle')
          .send({ ids: [id], enabled: null });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('enabled must be a boolean');
      });
    });

    describe('Edge cases', () => {
      it('should handle duplicate IDs in request', async () => {
        const id = createTestAlert('Duplicate Test', false);

        const response = await request(app)
          .post('/api/alerts/bulk/toggle')
          .send({ ids: [id, id, id], enabled: true });

        expect(response.status).toBe(200);
        // Should handle gracefully - may have duplicate entries in success
        expect(response.body.success.length).toBeGreaterThanOrEqual(1);
        expect(getAlert(id)?.enabled).toBe(1);
      });

      it('should return correct response structure', async () => {
        const id = createTestAlert('Structure Test', false);

        const response = await request(app)
          .post('/api/alerts/bulk/toggle')
          .send({ ids: [id], enabled: true });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success');
        expect(response.body).toHaveProperty('failed');
        expect(Array.isArray(response.body.success)).toBe(true);
        expect(Array.isArray(response.body.failed)).toBe(true);
      });

      it('should return complete alert objects in success array', async () => {
        const id = createTestAlert('Full Object Test', false);

        const response = await request(app)
          .post('/api/alerts/bulk/toggle')
          .send({ ids: [id], enabled: true });

        expect(response.status).toBe(200);
        expect(response.body.success[0]).toHaveProperty('id');
        expect(response.body.success[0]).toHaveProperty('name');
        expect(response.body.success[0]).toHaveProperty('search_query');
        expect(response.body.success[0]).toHaveProperty('enabled');
        expect(response.body.success[0]).toHaveProperty('severity');
        expect(response.body.success[0]).toHaveProperty('actions');
      });
    });
  });
});
