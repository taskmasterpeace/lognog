import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { Router } from 'express';
import { authenticateIngestion } from '../auth/middleware.js';
import * as auth from '../auth/auth.js';

// Mock the auth module
vi.mock('../auth/auth.js', async () => {
  const actual = await vi.importActual<typeof auth>('../auth/auth.js');
  return {
    ...actual,
    validateApiKey: vi.fn(),
    getUserById: vi.fn(),
    logAuthEvent: vi.fn(),
  };
});

// Mock the insertLogs function
const mockInsertLogs = async () => {};

// Create a minimal test router
function createTestRouter(): Express {
  const app = express();
  app.use(express.json());

  const router = Router();

  // OTLP endpoint with authentication
  router.post('/otlp/v1/logs', authenticateIngestion, async (req, res) => {
    try {
      const body = req.body;

      if (!body.resourceLogs || !Array.isArray(body.resourceLogs)) {
        return res.status(400).json({
          error: 'Invalid OTLP format',
          message: 'Expected resourceLogs array',
        });
      }

      // Simplified ingestion for testing
      await mockInsertLogs();

      res.status(200).json({ accepted: 1 });
    } catch (error) {
      res.status(500).json({
        error: 'OTLP ingestion failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  app.use('/api/ingest', router);
  return app;
}

// Sample OTLP payload
const validOtlpPayload = {
  resourceLogs: [
    {
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: 'test-service' } },
          { key: 'host.name', value: { stringValue: 'test-host' } },
        ],
      },
      scopeLogs: [
        {
          scope: { name: 'test-scope' },
          logRecords: [
            {
              timeUnixNano: '1234567890000000000',
              severityNumber: 9,
              severityText: 'INFO',
              body: { stringValue: 'Test log message' },
              attributes: [
                { key: 'test.attr', value: { stringValue: 'test-value' } },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe('OTLP Authentication', () => {
  let app: Express;
  let originalEnv: string | undefined;

  beforeEach(() => {
    app = createTestRouter();
    originalEnv = process.env.OTLP_REQUIRE_AUTH;
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment variable
    if (originalEnv !== undefined) {
      process.env.OTLP_REQUIRE_AUTH = originalEnv;
    } else {
      delete process.env.OTLP_REQUIRE_AUTH;
    }
  });

  describe('When OTLP_REQUIRE_AUTH is true (default)', () => {
    beforeEach(() => {
      process.env.OTLP_REQUIRE_AUTH = 'true';
    });

    it('should reject request without authentication', async () => {
      const response = await request(app)
        .post('/api/ingest/otlp/v1/logs')
        .send(validOtlpPayload);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication required');
    });

    it('should reject request with invalid API key format', async () => {
      const response = await request(app)
        .post('/api/ingest/otlp/v1/logs')
        .set('Authorization', 'Invalid format')
        .send(validOtlpPayload);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid authorization format');
    });

    it('should accept request with valid Bearer token in Authorization header', async () => {
      // Setup mocks
      vi.mocked(auth.validateApiKey).mockResolvedValue({
        userId: 'test-user-id',
        permissions: ['write'],
      });

      vi.mocked(auth.getUserById).mockReturnValue({
        id: 'test-user-id',
        username: 'test-user',
        email: 'test@example.com',
        role: 'user' as const,
        is_active: true,
        last_login: null,
        created_at: new Date().toISOString(),
      });

      const response = await request(app)
        .post('/api/ingest/otlp/v1/logs')
        .set('Authorization', 'Bearer valid-api-key')
        .send(validOtlpPayload);

      expect(response.status).toBe(200);
      expect(response.body.accepted).toBe(1);
      expect(auth.validateApiKey).toHaveBeenCalledWith('valid-api-key');
    });

    it('should accept request with valid API key in X-API-Key header', async () => {
      vi.mocked(auth.validateApiKey).mockResolvedValue({
        userId: 'test-user-id',
        permissions: ['write'],
      });

      vi.mocked(auth.getUserById).mockReturnValue({
        id: 'test-user-id',
        username: 'test-user',
        email: 'test@example.com',
        role: 'user' as const,
        is_active: true,
        last_login: null,
        created_at: new Date().toISOString(),
      });

      const response = await request(app)
        .post('/api/ingest/otlp/v1/logs')
        .set('X-API-Key', 'valid-api-key')
        .send(validOtlpPayload);

      expect(response.status).toBe(200);
      expect(response.body.accepted).toBe(1);
      expect(auth.validateApiKey).toHaveBeenCalledWith('valid-api-key');
    });

    it('should reject request when API key lacks write permission', async () => {
      vi.mocked(auth.validateApiKey).mockResolvedValue({
        userId: 'test-user-id',
        permissions: ['read'],
      });

      vi.mocked(auth.getUserById).mockReturnValue({
        id: 'test-user-id',
        username: 'test-user',
        email: 'test@example.com',
        role: 'readonly' as const,
        is_active: true,
        last_login: null,
        created_at: new Date().toISOString(),
      });

      const response = await request(app)
        .post('/api/ingest/otlp/v1/logs')
        .set('Authorization', 'Bearer read-only-key')
        .send(validOtlpPayload);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('API key requires write permission for ingestion');
    });

    it('should accept request when API key has wildcard permission', async () => {
      vi.mocked(auth.validateApiKey).mockResolvedValue({
        userId: 'admin-user-id',
        permissions: ['*'],
      });

      vi.mocked(auth.getUserById).mockReturnValue({
        id: 'admin-user-id',
        username: 'admin',
        email: 'admin@example.com',
        role: 'admin' as const,
        is_active: true,
        last_login: null,
        created_at: new Date().toISOString(),
      });

      const response = await request(app)
        .post('/api/ingest/otlp/v1/logs')
        .set('Authorization', 'Bearer admin-key')
        .send(validOtlpPayload);

      expect(response.status).toBe(200);
      expect(response.body.accepted).toBe(1);
    });

    it('should reject request when user account is disabled', async () => {
      vi.mocked(auth.validateApiKey).mockResolvedValue({
        userId: 'disabled-user-id',
        permissions: ['write'],
      });

      vi.mocked(auth.getUserById).mockReturnValue({
        id: 'disabled-user-id',
        username: 'disabled-user',
        email: 'disabled@example.com',
        role: 'user' as const,
        is_active: false,
        last_login: null,
        created_at: new Date().toISOString(),
      });

      const response = await request(app)
        .post('/api/ingest/otlp/v1/logs')
        .set('Authorization', 'Bearer disabled-user-key')
        .send(validOtlpPayload);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('User account is disabled');
    });

    it('should reject request with invalid API key', async () => {
      vi.mocked(auth.validateApiKey).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/ingest/otlp/v1/logs')
        .set('Authorization', 'Bearer invalid-key')
        .send(validOtlpPayload);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid API key');
    });
  });

  describe('When OTLP_REQUIRE_AUTH is false', () => {
    beforeEach(() => {
      process.env.OTLP_REQUIRE_AUTH = 'false';
    });

    it('should accept request without authentication', async () => {
      const response = await request(app)
        .post('/api/ingest/otlp/v1/logs')
        .send(validOtlpPayload);

      expect(response.status).toBe(200);
      expect(response.body.accepted).toBe(1);
    });

    it('should still validate authentication if provided', async () => {
      vi.mocked(auth.validateApiKey).mockResolvedValue({
        userId: 'test-user-id',
        permissions: ['write'],
      });

      vi.mocked(auth.getUserById).mockReturnValue({
        id: 'test-user-id',
        username: 'test-user',
        email: 'test@example.com',
        role: 'user' as const,
        is_active: true,
        last_login: null,
        created_at: new Date().toISOString(),
      });

      const response = await request(app)
        .post('/api/ingest/otlp/v1/logs')
        .set('Authorization', 'Bearer valid-api-key')
        .send(validOtlpPayload);

      expect(response.status).toBe(200);
      expect(response.body.accepted).toBe(1);
      expect(auth.validateApiKey).toHaveBeenCalledWith('valid-api-key');
    });

    it('should accept request even with invalid API key when auth not required', async () => {
      vi.mocked(auth.validateApiKey).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/ingest/otlp/v1/logs')
        .set('Authorization', 'Bearer invalid-key')
        .send(validOtlpPayload);

      // Should succeed even with invalid key when auth is not required
      expect(response.status).toBe(200);
      expect(response.body.accepted).toBe(1);
    });
  });

  describe('OTLP payload validation', () => {
    beforeEach(() => {
      process.env.OTLP_REQUIRE_AUTH = 'false';
    });

    it('should reject invalid OTLP format (missing resourceLogs)', async () => {
      const response = await request(app)
        .post('/api/ingest/otlp/v1/logs')
        .send({ invalid: 'payload' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid OTLP format');
    });

    it('should accept valid OTLP format', async () => {
      const response = await request(app)
        .post('/api/ingest/otlp/v1/logs')
        .send(validOtlpPayload);

      expect(response.status).toBe(200);
      expect(response.body.accepted).toBe(1);
    });
  });
});
