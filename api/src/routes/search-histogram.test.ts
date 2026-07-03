import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { Express, Request, Response, NextFunction } from 'express';
import request from 'supertest';

/**
 * Focused tests for the /search/query histogram builder (#41-1 SQL injection,
 * #41-2 custom-field mapping + non-fatal histogram).
 *
 * We mock the DB backend so we can (a) capture the exact histogram SQL string
 * that gets handed to executeRawQuery and assert it is safe/well-formed, and
 * (b) force the histogram to fail and prove the main search still returns 200.
 */

// Bypass auth + rate limiting: authenticate/optionalAuth become pass-throughs.
vi.mock('../auth/middleware.js', () => ({
  authenticate: (_req: Request, _res: Response, next: NextFunction) => next(),
  optionalAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
  rateLimit: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

// Capture histogram SQL and control whether it succeeds or throws.
const executeRawQuery = vi.fn();
const executeDSLQuery = vi.fn();

vi.mock('../db/backend.js', () => ({
  executeDSLQuery: (...args: unknown[]) => executeDSLQuery(...args),
  executeRawQuery: (...args: unknown[]) => executeRawQuery(...args),
  getFields: vi.fn(),
  getFieldValues: vi.fn(),
  getBackendInfo: () => ({ backend: 'clickhouse' }),
  discoverStructuredDataFields: vi.fn(),
  isLiteMode: () => false, // exercise the ClickHouse path
  getLogById: vi.fn(),
}));

// Field extraction is not relevant here.
vi.mock('../services/field-extractor.js', () => ({
  applyFieldExtraction: vi.fn(async (r: unknown) => r),
}));

let app: Express;

beforeEach(async () => {
  vi.clearAllMocks();
  executeDSLQuery.mockResolvedValue({ sql: 'SELECT 1', results: [{ id: 1 }] });
  executeRawQuery.mockResolvedValue([{ bucket: '2026-07-03 00:00:00', count: 3 }]);

  const searchRouter = (await import('./search.js')).default as unknown as express.RequestHandler;
  app = express();
  app.use(express.json());
  app.use('/search', searchRouter);
});

function histogramSql(): string {
  // The histogram is the only executeRawQuery call in this flow.
  expect(executeRawQuery).toHaveBeenCalled();
  return String(executeRawQuery.mock.calls[0][0]);
}

describe('#41-1 histogram builder escapes DSL string values', () => {
  it('a value containing a single quote cannot break out of the SQL literal', async () => {
    const res = await request(app)
      .post('/search/query')
      .send({ query: `search message="x' OR 1=1"` });

    expect(res.status).toBe(200);
    const sql = histogramSql();
    // The injected quote must be doubled (escaped), not left raw.
    expect(sql).toContain("x'' OR 1=1");
    // The raw, un-escaped injection string must NOT appear.
    expect(sql).not.toContain("'x' OR 1=1'");
  });

  it('escapes quotes for the contains (~) operator too', async () => {
    const res = await request(app)
      .post('/search/query')
      .send({ query: `search message~"a'b"` });

    expect(res.status).toBe(200);
    const sql = histogramSql();
    expect(sql).toContain("ILIKE '%a''b%'");
  });
});

describe('#41-2 histogram builder maps custom fields via structured_data', () => {
  it('a non-column field becomes JSONExtractString, not a bare identifier', async () => {
    const res = await request(app)
      .post('/search/query')
      .send({ query: 'search request_id=abc123' });

    expect(res.status).toBe(200);
    const sql = histogramSql();
    expect(sql).toContain("JSONExtractString(structured_data, 'request_id')");
    // The old broken forms must NOT appear.
    expect(sql).not.toContain("structured_data['request_id']");
    expect(sql).not.toMatch(/WHERE request_id =/);
  });

  it('a known column (hostname) stays a bare column reference', async () => {
    const res = await request(app)
      .post('/search/query')
      .send({ query: 'search host=router' });

    expect(res.status).toBe(200);
    const sql = histogramSql();
    expect(sql).toContain("hostname = 'router'");
  });
});

describe('#41-2 histogram failure is non-fatal to the main search', () => {
  it('returns 200 with results even when the histogram query throws', async () => {
    executeRawQuery.mockRejectedValueOnce(new Error('ClickHouse: Unknown identifier'));

    const res = await request(app)
      .post('/search/query')
      .send({ query: 'search custom_field=boom' });

    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([{ id: 1 }]);
    // Histogram omitted (not present or empty) but the search succeeded.
    expect(res.body.histogram).toBeUndefined();
  });
});
