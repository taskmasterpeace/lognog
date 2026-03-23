import { v4 as uuidv4 } from 'uuid';
import { getSQLiteDB } from './sqlite.js';

export type SyntheticTestType = 'http' | 'tcp' | 'browser' | 'api';
export type SyntheticStatus = 'success' | 'failure' | 'timeout' | 'error';

export interface SyntheticTestConfig {
  // HTTP/API config
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'PATCH';
  headers?: Record<string, string>;
  body?: string;
  followRedirects?: boolean;
  // TCP config
  host?: string;
  port?: number;
  // Browser config
  script?: string;  // Playwright script
  // Assertions
  assertions?: Array<{
    type: 'status' | 'responseTime' | 'bodyContains' | 'headerContains' | 'jsonPath';
    operator: 'equals' | 'notEquals' | 'contains' | 'lessThan' | 'greaterThan';
    target: string;
    value: string | number;
  }>;
}

export interface SyntheticTest {
  id: string;
  name: string;
  description?: string;
  test_type: SyntheticTestType;
  config: string;  // JSON string of SyntheticTestConfig
  schedule: string;
  timeout_ms: number;
  enabled: number;
  tags: string;  // JSON array
  last_run?: string;
  last_status?: SyntheticStatus;
  last_response_time_ms?: number;
  consecutive_failures: number;
  alert_after_failures: number;
  created_at: string;
  updated_at: string;
}

export interface SyntheticResult {
  id: string;
  test_id: string;
  timestamp: string;
  status: SyntheticStatus;
  response_time_ms?: number;
  status_code?: number;
  error_message?: string;
  response_body?: string;
  assertions_passed: number;
  assertions_failed: number;
  metadata: string;  // JSON
}

// Get all synthetic tests
export function getSyntheticTests(filters?: {
  test_type?: SyntheticTestType;
  enabled?: boolean;
  tags?: string[];
}): SyntheticTest[] {
  const database = getSQLiteDB();

  let sql = 'SELECT * FROM synthetic_tests WHERE 1=1';
  const params: unknown[] = [];

  if (filters?.test_type) {
    sql += ' AND test_type = ?';
    params.push(filters.test_type);
  }

  if (filters?.enabled !== undefined) {
    sql += ' AND enabled = ?';
    params.push(filters.enabled ? 1 : 0);
  }

  sql += ' ORDER BY name ASC';

  const tests = database.prepare(sql).all(...params) as SyntheticTest[];

  // Filter by tags if specified
  if (filters?.tags && filters.tags.length > 0) {
    return tests.filter(test => {
      const testTags = JSON.parse(test.tags || '[]') as string[];
      return filters.tags!.some(tag => testTags.includes(tag));
    });
  }

  return tests;
}

// Get single synthetic test
export function getSyntheticTestById(id: string): SyntheticTest | null {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM synthetic_tests WHERE id = ?').get(id) as SyntheticTest | null;
}

// Create synthetic test
export function createSyntheticTest(data: {
  name: string;
  description?: string;
  test_type: SyntheticTestType;
  config: SyntheticTestConfig;
  schedule?: string;
  timeout_ms?: number;
  enabled?: boolean;
  tags?: string[];
  alert_after_failures?: number;
}): SyntheticTest {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO synthetic_tests (
      id, name, description, test_type, config, schedule, timeout_ms, enabled, tags, alert_after_failures
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.name,
    data.description || null,
    data.test_type,
    JSON.stringify(data.config),
    data.schedule || '*/5 * * * *',
    data.timeout_ms || 30000,
    data.enabled !== false ? 1 : 0,
    JSON.stringify(data.tags || []),
    data.alert_after_failures || 3
  );

  return getSyntheticTestById(id)!;
}

// Update synthetic test
export function updateSyntheticTest(id: string, data: Partial<{
  name: string;
  description: string;
  test_type: SyntheticTestType;
  config: SyntheticTestConfig;
  schedule: string;
  timeout_ms: number;
  enabled: boolean;
  tags: string[];
  alert_after_failures: number;
}>): SyntheticTest | null {
  const database = getSQLiteDB();
  const existing = getSyntheticTestById(id);
  if (!existing) return null;

  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.name !== undefined) {
    updates.push('name = ?');
    params.push(data.name);
  }
  if (data.description !== undefined) {
    updates.push('description = ?');
    params.push(data.description);
  }
  if (data.test_type !== undefined) {
    updates.push('test_type = ?');
    params.push(data.test_type);
  }
  if (data.config !== undefined) {
    updates.push('config = ?');
    params.push(JSON.stringify(data.config));
  }
  if (data.schedule !== undefined) {
    updates.push('schedule = ?');
    params.push(data.schedule);
  }
  if (data.timeout_ms !== undefined) {
    updates.push('timeout_ms = ?');
    params.push(data.timeout_ms);
  }
  if (data.enabled !== undefined) {
    updates.push('enabled = ?');
    params.push(data.enabled ? 1 : 0);
  }
  if (data.tags !== undefined) {
    updates.push('tags = ?');
    params.push(JSON.stringify(data.tags));
  }
  if (data.alert_after_failures !== undefined) {
    updates.push('alert_after_failures = ?');
    params.push(data.alert_after_failures);
  }

  if (updates.length === 0) return existing;

  updates.push("updated_at = datetime('now')");
  params.push(id);

  database.prepare(`
    UPDATE synthetic_tests SET ${updates.join(', ')} WHERE id = ?
  `).run(...params);

  return getSyntheticTestById(id);
}

// Update test run status
export function updateSyntheticTestStatus(id: string, status: SyntheticStatus, responseTimeMs?: number): void {
  const database = getSQLiteDB();
  const test = getSyntheticTestById(id);
  if (!test) return;

  const consecutiveFailures = status === 'success' ? 0 : test.consecutive_failures + 1;

  database.prepare(`
    UPDATE synthetic_tests
    SET last_run = datetime('now'),
        last_status = ?,
        last_response_time_ms = ?,
        consecutive_failures = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(status, responseTimeMs || null, consecutiveFailures, id);
}

// Delete synthetic test
export function deleteSyntheticTest(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM synthetic_tests WHERE id = ?').run(id);
  return result.changes > 0;
}

// Add synthetic result
export function addSyntheticResult(data: {
  test_id: string;
  status: SyntheticStatus;
  response_time_ms?: number;
  status_code?: number;
  error_message?: string;
  response_body?: string;
  assertions_passed?: number;
  assertions_failed?: number;
  metadata?: Record<string, unknown>;
}): SyntheticResult {
  const database = getSQLiteDB();
  const id = uuidv4();

  // Truncate response body to 10KB for storage
  const truncatedBody = data.response_body?.slice(0, 10240);

  database.prepare(`
    INSERT INTO synthetic_results (
      id, test_id, status, response_time_ms, status_code, error_message,
      response_body, assertions_passed, assertions_failed, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.test_id,
    data.status,
    data.response_time_ms || null,
    data.status_code || null,
    data.error_message || null,
    truncatedBody || null,
    data.assertions_passed || 0,
    data.assertions_failed || 0,
    JSON.stringify(data.metadata || {})
  );

  // Update test status
  updateSyntheticTestStatus(data.test_id, data.status, data.response_time_ms);

  // Cleanup old results (keep last 1000 per test)
  database.prepare(`
    DELETE FROM synthetic_results
    WHERE test_id = ? AND id NOT IN (
      SELECT id FROM synthetic_results WHERE test_id = ?
      ORDER BY timestamp DESC LIMIT 1000
    )
  `).run(data.test_id, data.test_id);

  return database.prepare('SELECT * FROM synthetic_results WHERE id = ?').get(id) as SyntheticResult;
}

// Get synthetic results
export function getSyntheticResults(filters: {
  test_id?: string;
  status?: SyntheticStatus;
  since?: string;  // ISO timestamp
  limit?: number;
}): SyntheticResult[] {
  const database = getSQLiteDB();

  let sql = 'SELECT * FROM synthetic_results WHERE 1=1';
  const params: unknown[] = [];

  if (filters.test_id) {
    sql += ' AND test_id = ?';
    params.push(filters.test_id);
  }
  if (filters.status) {
    sql += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters.since) {
    sql += ' AND timestamp >= ?';
    params.push(filters.since);
  }

  sql += ' ORDER BY timestamp DESC';

  if (filters.limit) {
    sql += ' LIMIT ?';
    params.push(filters.limit);
  }

  return database.prepare(sql).all(...params) as SyntheticResult[];
}

// Get uptime percentage for a test
export function getSyntheticUptime(testId: string, hoursBack: number = 24): {
  uptime_percent: number;
  total_checks: number;
  successful_checks: number;
  failed_checks: number;
  avg_response_time_ms: number;
} {
  const database = getSQLiteDB();
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  const stats = database.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
      SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) as failed,
      AVG(response_time_ms) as avg_response_time
    FROM synthetic_results
    WHERE test_id = ? AND timestamp >= ?
  `).get(testId, since) as {
    total: number;
    successful: number;
    failed: number;
    avg_response_time: number;
  };

  return {
    uptime_percent: stats.total > 0 ? (stats.successful / stats.total) * 100 : 100,
    total_checks: stats.total,
    successful_checks: stats.successful,
    failed_checks: stats.failed,
    avg_response_time_ms: Math.round(stats.avg_response_time || 0),
  };
}

// Get synthetic dashboard stats
export function getSyntheticDashboard(): {
  total_tests: number;
  enabled_tests: number;
  tests_by_type: Record<string, number>;
  tests_by_status: Record<string, number>;
  overall_uptime_24h: number;
  failing_tests: SyntheticTest[];
} {
  const database = getSQLiteDB();

  const totalTests = (database.prepare('SELECT COUNT(*) as count FROM synthetic_tests').get() as { count: number }).count;
  const enabledTests = (database.prepare('SELECT COUNT(*) as count FROM synthetic_tests WHERE enabled = 1').get() as { count: number }).count;

  const byType = database.prepare(`
    SELECT test_type, COUNT(*) as count FROM synthetic_tests GROUP BY test_type
  `).all() as Array<{ test_type: string; count: number }>;

  const tests_by_type: Record<string, number> = {};
  for (const row of byType) {
    tests_by_type[row.test_type] = row.count;
  }

  const byStatus = database.prepare(`
    SELECT last_status, COUNT(*) as count FROM synthetic_tests
    WHERE last_status IS NOT NULL GROUP BY last_status
  `).all() as Array<{ last_status: string; count: number }>;

  const tests_by_status: Record<string, number> = {};
  for (const row of byStatus) {
    tests_by_status[row.last_status] = row.count;
  }

  // Calculate overall uptime from last 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const overallStats = database.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful
    FROM synthetic_results
    WHERE timestamp >= ?
  `).get(since) as { total: number; successful: number };

  const overall_uptime_24h = overallStats.total > 0
    ? (overallStats.successful / overallStats.total) * 100
    : 100;

  // Get currently failing tests
  const failing_tests = database.prepare(`
    SELECT * FROM synthetic_tests
    WHERE enabled = 1 AND last_status != 'success' AND last_status IS NOT NULL
    ORDER BY consecutive_failures DESC
  `).all() as SyntheticTest[];

  return {
    total_tests: totalTests,
    enabled_tests: enabledTests,
    tests_by_type,
    tests_by_status,
    overall_uptime_24h: Math.round(overall_uptime_24h * 100) / 100,
    failing_tests,
  };
}
