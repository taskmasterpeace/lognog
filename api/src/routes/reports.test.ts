import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { Express, Request, Response, NextFunction } from 'express';
import request from 'supertest';

/**
 * POST /reports/generate (one-off report) must go through the shared DSL query
 * path so time ranges mean what the UI's time picker means (`-15m` is fifteen
 * minutes, not fifteen months), Lite/SQLite installs work, and the output uses
 * the branded renderer instead of the legacy sky-blue template.
 */

vi.mock('../auth/middleware.js', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: 'u1', username: 'tester', role: 'admin' };
    next();
  },
  denyReadonly: (_req: Request, _res: Response, next: NextFunction) => next(),
  rateLimit: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

const executeDSLQuery = vi.fn();
vi.mock('../db/backend.js', () => ({
  executeDSLQuery: (...args: unknown[]) => executeDSLQuery(...args),
}));

// The scheduler pulls in nodemailer etc.; the generate route never touches it.
vi.mock('../services/scheduler.js', () => ({ triggerReport: vi.fn() }));

let app: Express;

beforeEach(async () => {
  vi.clearAllMocks();
  executeDSLQuery.mockResolvedValue({
    sql: 'SELECT 1',
    results: [{ hostname: 'web-01', count: 7 }],
  });
  const reportsRouter = (await import('./reports.js')).default as unknown as express.RequestHandler;
  app = express();
  app.use(express.json());
  app.use('/reports', reportsRouter);
});

describe('POST /reports/generate', () => {
  it('passes the relative time range to the DSL executor unchanged', async () => {
    const res = await request(app)
      .post('/reports/generate')
      .send({ query: 'search * | stats count by hostname', timeRange: '-15m', title: 'Quick look' });

    expect(res.status).toBe(200);
    expect(executeDSLQuery).toHaveBeenCalledTimes(1);
    const [query, options] = executeDSLQuery.mock.calls[0] as [string, Record<string, unknown>];
    expect(query).toBe('search * | stats count by hostname');
    expect(options.earliest).toBe('-15m');
    expect(options.latest).toBe('now');
  });

  it('renders the branded HTML report', async () => {
    const res = await request(app)
      .post('/reports/generate')
      .send({ query: 'search *', timeRange: '-24h', title: 'Quick look' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('Quick look');
    expect(res.text).toContain('web-01');
    expect(res.text).not.toContain('Spunk');
    expect(res.text).not.toContain('#0ea5e9');
  });

  it('returns JSON when asked', async () => {
    const res = await request(app)
      .post('/reports/generate')
      .send({ query: 'search *', format: 'json' });

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.results[0].hostname).toBe('web-01');
  });

  it('rejects a malformed time range', async () => {
    const res = await request(app)
      .post('/reports/generate')
      .send({ query: 'search *', timeRange: "-1h' OR 1=1" });

    expect(res.status).toBe(400);
    expect(executeDSLQuery).not.toHaveBeenCalled();
  });
});
