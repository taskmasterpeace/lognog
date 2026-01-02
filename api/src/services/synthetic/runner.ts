/**
 * Synthetic Test Runner
 *
 * Executes HTTP, TCP, and API tests with assertions.
 * Browser tests (Playwright) are optional and require playwright to be installed.
 */

import {
  getSyntheticTestById,
  addSyntheticResult,
  type SyntheticTest,
  type SyntheticTestConfig,
  type SyntheticStatus,
} from '../../db/sqlite.js';
import * as net from 'net';

export interface TestRunResult {
  status: SyntheticStatus;
  response_time_ms: number;
  status_code?: number;
  error_message?: string;
  response_body?: string;
  assertions_passed: number;
  assertions_failed: number;
  metadata: Record<string, unknown>;
}

interface AssertionResult {
  passed: boolean;
  message: string;
}

// Parse JSON config from test
function parseConfig(test: SyntheticTest): SyntheticTestConfig {
  try {
    return JSON.parse(test.config) as SyntheticTestConfig;
  } catch {
    return {};
  }
}

// Run assertions on response
function runAssertions(
  config: SyntheticTestConfig,
  statusCode: number,
  responseTimeMs: number,
  responseBody: string,
  headers: Record<string, string>
): { passed: number; failed: number; results: AssertionResult[] } {
  const results: AssertionResult[] = [];
  let passed = 0;
  let failed = 0;

  if (!config.assertions || config.assertions.length === 0) {
    return { passed: 0, failed: 0, results };
  }

  for (const assertion of config.assertions) {
    let result: AssertionResult = { passed: false, message: '' };

    try {
      switch (assertion.type) {
        case 'status': {
          const expected = Number(assertion.value);
          if (assertion.operator === 'equals') {
            result.passed = statusCode === expected;
            result.message = `Status code ${statusCode} ${result.passed ? '==' : '!='} ${expected}`;
          } else if (assertion.operator === 'lessThan') {
            result.passed = statusCode < expected;
            result.message = `Status code ${statusCode} ${result.passed ? '<' : '>='} ${expected}`;
          } else if (assertion.operator === 'greaterThan') {
            result.passed = statusCode > expected;
            result.message = `Status code ${statusCode} ${result.passed ? '>' : '<='} ${expected}`;
          }
          break;
        }

        case 'responseTime': {
          const maxMs = Number(assertion.value);
          if (assertion.operator === 'lessThan') {
            result.passed = responseTimeMs < maxMs;
            result.message = `Response time ${responseTimeMs}ms ${result.passed ? '<' : '>='} ${maxMs}ms`;
          }
          break;
        }

        case 'bodyContains': {
          const searchText = String(assertion.value);
          if (assertion.operator === 'contains') {
            result.passed = responseBody.includes(searchText);
            result.message = `Body ${result.passed ? 'contains' : 'does not contain'} "${searchText.slice(0, 50)}"`;
          } else if (assertion.operator === 'notEquals') {
            result.passed = !responseBody.includes(searchText);
            result.message = `Body ${result.passed ? 'does not contain' : 'contains'} "${searchText.slice(0, 50)}"`;
          }
          break;
        }

        case 'headerContains': {
          const headerName = assertion.target.toLowerCase();
          const headerValue = headers[headerName] || '';
          const searchValue = String(assertion.value);
          if (assertion.operator === 'contains') {
            result.passed = headerValue.includes(searchValue);
            result.message = `Header ${assertion.target} ${result.passed ? 'contains' : 'does not contain'} "${searchValue}"`;
          } else if (assertion.operator === 'equals') {
            result.passed = headerValue === searchValue;
            result.message = `Header ${assertion.target} ${result.passed ? '==' : '!='} "${searchValue}"`;
          }
          break;
        }

        case 'jsonPath': {
          try {
            const json = JSON.parse(responseBody);
            const pathParts = assertion.target.split('.');
            let value: unknown = json;
            for (const part of pathParts) {
              if (value && typeof value === 'object') {
                value = (value as Record<string, unknown>)[part];
              } else {
                value = undefined;
              }
            }
            const expected = assertion.value;
            if (assertion.operator === 'equals') {
              result.passed = String(value) === String(expected);
              result.message = `JSON path ${assertion.target} = "${value}" ${result.passed ? '==' : '!='} "${expected}"`;
            } else if (assertion.operator === 'contains') {
              result.passed = String(value).includes(String(expected));
              result.message = `JSON path ${assertion.target} ${result.passed ? 'contains' : 'does not contain'} "${expected}"`;
            }
          } catch {
            result.passed = false;
            result.message = `Failed to parse JSON for path ${assertion.target}`;
          }
          break;
        }
      }
    } catch (error) {
      result.passed = false;
      result.message = `Assertion error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }

    if (result.passed) {
      passed++;
    } else {
      failed++;
    }
    results.push(result);
  }

  return { passed, failed, results };
}

// Run HTTP/API test
async function runHttpTest(
  config: SyntheticTestConfig,
  timeoutMs: number
): Promise<TestRunResult> {
  if (!config.url) {
    return {
      status: 'error',
      response_time_ms: 0,
      error_message: 'No URL configured',
      assertions_passed: 0,
      assertions_failed: 0,
      metadata: {},
    };
  }

  const startTime = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(config.url, {
      method: config.method || 'GET',
      headers: config.headers || {},
      body: config.body || undefined,
      redirect: config.followRedirects !== false ? 'follow' : 'manual',
      signal: controller.signal,
    });

    const responseTimeMs = Date.now() - startTime;
    const responseBody = await response.text();

    // Convert headers to plain object
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    // Run assertions
    const assertions = runAssertions(
      config,
      response.status,
      responseTimeMs,
      responseBody,
      headers
    );

    // Determine status
    let status: SyntheticStatus = 'success';
    if (response.status >= 400) {
      status = 'failure';
    }
    if (assertions.failed > 0) {
      status = 'failure';
    }

    return {
      status,
      response_time_ms: responseTimeMs,
      status_code: response.status,
      response_body: responseBody.slice(0, 10240), // Truncate
      assertions_passed: assertions.passed,
      assertions_failed: assertions.failed,
      metadata: {
        headers,
        url: response.url,
        redirected: response.redirected,
        assertion_results: assertions.results,
      },
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;

    if (error instanceof Error && error.name === 'AbortError') {
      return {
        status: 'timeout',
        response_time_ms: responseTimeMs,
        error_message: `Request timed out after ${timeoutMs}ms`,
        assertions_passed: 0,
        assertions_failed: 0,
        metadata: {},
      };
    }

    return {
      status: 'error',
      response_time_ms: responseTimeMs,
      error_message: error instanceof Error ? error.message : 'Unknown error',
      assertions_passed: 0,
      assertions_failed: 0,
      metadata: {},
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Run TCP connectivity test
async function runTcpTest(
  config: SyntheticTestConfig,
  timeoutMs: number
): Promise<TestRunResult> {
  if (!config.host || !config.port) {
    return {
      status: 'error',
      response_time_ms: 0,
      error_message: 'No host/port configured',
      assertions_passed: 0,
      assertions_failed: 0,
      metadata: {},
    };
  }

  const startTime = Date.now();

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
      }
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve({
        status: 'timeout',
        response_time_ms: Date.now() - startTime,
        error_message: `Connection timed out after ${timeoutMs}ms`,
        assertions_passed: 0,
        assertions_failed: 0,
        metadata: { host: config.host, port: config.port },
      });
    }, timeoutMs);

    socket.connect(config.port!, config.host!, () => {
      clearTimeout(timeout);
      const responseTimeMs = Date.now() - startTime;
      cleanup();
      resolve({
        status: 'success',
        response_time_ms: responseTimeMs,
        assertions_passed: 0,
        assertions_failed: 0,
        metadata: { host: config.host, port: config.port },
      });
    });

    socket.on('error', (error) => {
      clearTimeout(timeout);
      const responseTimeMs = Date.now() - startTime;
      cleanup();
      resolve({
        status: 'failure',
        response_time_ms: responseTimeMs,
        error_message: error.message,
        assertions_passed: 0,
        assertions_failed: 0,
        metadata: { host: config.host, port: config.port },
      });
    });
  });
}

// Main test runner
export async function runTest(testId: string): Promise<TestRunResult> {
  const test = getSyntheticTestById(testId);

  if (!test) {
    return {
      status: 'error',
      response_time_ms: 0,
      error_message: 'Test not found',
      assertions_passed: 0,
      assertions_failed: 0,
      metadata: {},
    };
  }

  const config = parseConfig(test);
  let result: TestRunResult;

  switch (test.test_type) {
    case 'http':
    case 'api':
      result = await runHttpTest(config, test.timeout_ms);
      break;

    case 'tcp':
      result = await runTcpTest(config, test.timeout_ms);
      break;

    case 'browser':
      // Browser tests require Playwright - skip for now
      result = {
        status: 'error',
        response_time_ms: 0,
        error_message: 'Browser tests not yet implemented',
        assertions_passed: 0,
        assertions_failed: 0,
        metadata: {},
      };
      break;

    default:
      result = {
        status: 'error',
        response_time_ms: 0,
        error_message: `Unknown test type: ${test.test_type}`,
        assertions_passed: 0,
        assertions_failed: 0,
        metadata: {},
      };
  }

  // Store result in database
  addSyntheticResult({
    test_id: testId,
    status: result.status,
    response_time_ms: result.response_time_ms,
    status_code: result.status_code,
    error_message: result.error_message,
    response_body: result.response_body,
    assertions_passed: result.assertions_passed,
    assertions_failed: result.assertions_failed,
    metadata: result.metadata,
  });

  return result;
}

// Run all enabled tests
export async function runAllEnabledTests(): Promise<Map<string, TestRunResult>> {
  const { getSyntheticTests } = await import('../../db/sqlite.js');
  const tests = getSyntheticTests({ enabled: true });
  const results = new Map<string, TestRunResult>();

  // Run tests in parallel with concurrency limit
  const CONCURRENCY = 5;
  const chunks: SyntheticTest[][] = [];

  for (let i = 0; i < tests.length; i += CONCURRENCY) {
    chunks.push(tests.slice(i, i + CONCURRENCY));
  }

  for (const chunk of chunks) {
    const chunkResults = await Promise.all(
      chunk.map(async (test) => {
        const result = await runTest(test.id);
        return { id: test.id, result };
      })
    );

    for (const { id, result } of chunkResults) {
      results.set(id, result);
    }
  }

  return results;
}
