import { describe, it, expect } from 'vitest';
import { parseAndCompile } from './index';

describe('Compiler', () => {
  it('compiles simple search to SQL', () => {
    const result = parseAndCompile('search host=router');

    expect(result.sql).toContain('SELECT');
    expect(result.sql).toContain('FROM lognog.logs');
    expect(result.sql).toContain("hostname = 'router'");
  });

  it('compiles wildcard search', () => {
    const result = parseAndCompile('search *');

    expect(result.sql).toContain('SELECT');
    expect(result.sql).toContain('FROM lognog.logs');
    expect(result.sql).toContain('ORDER BY timestamp DESC');
    expect(result.sql).toContain('LIMIT');
  });

  it('compiles severity comparison', () => {
    const result = parseAndCompile('search severity>=warning');

    expect(result.sql).toContain('severity >= 4');
  });

  it('compiles contains operator', () => {
    const result = parseAndCompile('search message~"error"');

    expect(result.sql).toContain("positionCaseInsensitive(message, 'error') > 0");
  });

  it('compiles wildcard pattern', () => {
    const result = parseAndCompile('search hostname~"router*"');

    expect(result.sql).toContain("hostname LIKE 'router%'");
  });

  it('compiles stats with count', () => {
    const result = parseAndCompile('search * | stats count by hostname');

    expect(result.sql).toContain('count()');
    expect(result.sql).toContain('GROUP BY hostname');
  });

  it('compiles stats with multiple aggregations', () => {
    const result = parseAndCompile('search * | stats count sum(bytes) avg(latency) by hostname');

    expect(result.sql).toContain('count()');
    expect(result.sql).toContain('sum(bytes)');
    expect(result.sql).toContain('avg(latency)');
    expect(result.sql).toContain('GROUP BY hostname');
  });

  it('compiles distinct count', () => {
    const result = parseAndCompile('search * | stats dc(hostname)');

    expect(result.sql).toContain('uniq(hostname)');
  });

  it('compiles sort', () => {
    const result = parseAndCompile('search * | sort desc timestamp');

    expect(result.sql).toContain('ORDER BY timestamp DESC');
  });

  it('compiles limit', () => {
    const result = parseAndCompile('search * | limit 50');

    expect(result.sql).toContain('LIMIT 50');
  });

  it('compiles field mapping', () => {
    // 'host' should map to 'hostname'
    const result = parseAndCompile('search host=router');

    expect(result.sql).toContain('hostname');
    expect(result.sql).not.toContain('host =');
  });

  it('compiles complex query', () => {
    const result = parseAndCompile(`
      search host=router severity>=warning
      | stats count by app_name
      | sort desc
      | limit 10
    `);

    expect(result.sql).toContain("hostname = 'router'");
    expect(result.sql).toContain('severity >= 4');
    expect(result.sql).toContain('count()');
    expect(result.sql).toContain('GROUP BY app_name');
    expect(result.sql).toContain('LIMIT 10');
  });

  it('compiles table selection', () => {
    const result = parseAndCompile('search * | table timestamp hostname message');

    expect(result.sql).toContain('SELECT timestamp, hostname, message');
  });

  it('generates valid SQL for empty query', () => {
    const result = parseAndCompile('');

    expect(result.sql).toContain('SELECT');
    expect(result.sql).toContain('FROM lognog.logs');
  });

  // OR/AND Logic Tests
  it('compiles simple OR condition', () => {
    const result = parseAndCompile('search host=web1 OR host=web2');

    expect(result.sql).toContain('WHERE');
    expect(result.sql).toContain("hostname = 'web1'");
    expect(result.sql).toContain("hostname = 'web2'");
    expect(result.sql).toContain(' OR ');
    expect(result.sql).toMatch(/\(hostname = 'web1' OR hostname = 'web2'\)/);
  });

  it('compiles simple AND condition', () => {
    const result = parseAndCompile('search host=web1 AND severity=error');

    expect(result.sql).toContain('WHERE');
    expect(result.sql).toContain("hostname = 'web1'");
    expect(result.sql).toContain("severity = 'error'");
    expect(result.sql).toContain(' AND ');
  });

  it('compiles implicit AND condition', () => {
    const result = parseAndCompile('search host=web1 severity=error');

    expect(result.sql).toContain('WHERE');
    expect(result.sql).toContain("hostname = 'web1'");
    expect(result.sql).toContain("severity = 'error'");
    expect(result.sql).toContain(' AND ');
  });

  it('compiles OR with AND groups maintaining precedence', () => {
    const result = parseAndCompile('search host=web1 severity=error OR host=web2 severity=warning');

    expect(result.sql).toContain('WHERE');
    expect(result.sql).toContain(' OR ');
    expect(result.sql).toContain(' AND ');
    // Should have proper parentheses for OR
    expect(result.sql).toMatch(/\(/);
  });

  it('compiles parenthesized OR with AND', () => {
    const result = parseAndCompile('search (host=web1 OR host=web2) AND severity=error');

    expect(result.sql).toContain('WHERE');
    expect(result.sql).toContain(' OR ');
    expect(result.sql).toContain(' AND ');
    // Should have nested parentheses
    expect(result.sql).toMatch(/\(.*\(.*OR.*\).*AND.*\)/);
  });

  it('compiles multiple OR terms', () => {
    const result = parseAndCompile('search severity=error OR severity=warning OR severity=critical');

    expect(result.sql).toContain('WHERE');
    expect(result.sql).toContain("severity = 'error'");
    expect(result.sql).toContain("severity = 'warning'");
    expect(result.sql).toContain("severity = 'critical'");
    // Count OR occurrences - should be 2 (for 3 terms)
    const orCount = (result.sql.match(/ OR /g) || []).length;
    expect(orCount).toBe(2);
  });

  it('compiles complex mixed OR/AND with proper parentheses', () => {
    const result = parseAndCompile('search (host=web1 OR host=web2) AND (severity=error OR severity=critical)');

    expect(result.sql).toContain('WHERE');
    // Should have OR conditions
    expect(result.sql).toContain(' OR ');
    // Should have AND between the groups
    expect(result.sql).toContain(' AND ');
    // Verify parentheses structure
    const openParens = (result.sql.match(/\(/g) || []).length;
    const closeParens = (result.sql.match(/\)/g) || []).length;
    expect(openParens).toBeGreaterThan(0);
    expect(openParens).toBe(closeParens);
  });

  it('compiles OR in filter stage', () => {
    const result = parseAndCompile('search * | filter host=web1 OR host=web2');

    expect(result.sql).toContain('WHERE');
    expect(result.sql).toContain(' OR ');
    expect(result.sql).toContain("hostname = 'web1'");
    expect(result.sql).toContain("hostname = 'web2'");
  });

  it('compiles chained search and filter with OR', () => {
    const result = parseAndCompile('search host=web1 OR host=web2 | filter severity=error OR severity=warning');

    expect(result.sql).toContain('WHERE');
    // Should have multiple OR conditions joined with AND (between search and filter)
    const orCount = (result.sql.match(/ OR /g) || []).length;
    expect(orCount).toBeGreaterThan(1);
  });

  // New aggregation functions tests
  it('compiles median aggregation', () => {
    const result = parseAndCompile('search * | stats median(latency)');

    expect(result.sql).toContain('median(latency)');
  });

  it('compiles mode aggregation', () => {
    const result = parseAndCompile('search * | stats mode(status_code)');

    expect(result.sql).toContain('topK(1)(status_code)[1]');
  });

  it('compiles stddev aggregation', () => {
    const result = parseAndCompile('search * | stats stddev(response_time)');

    expect(result.sql).toContain('stddevPop(response_time)');
  });

  it('compiles variance aggregation', () => {
    const result = parseAndCompile('search * | stats variance(bytes)');

    expect(result.sql).toContain('varPop(bytes)');
  });

  it('compiles range aggregation', () => {
    const result = parseAndCompile('search * | stats range(temperature)');

    expect(result.sql).toContain('max(temperature) - min(temperature)');
  });

  it('compiles percentile aggregations', () => {
    const result = parseAndCompile('search * | stats p50(latency) p90(latency) p95(latency) p99(latency)');

    expect(result.sql).toContain('quantile(0.5)(latency)');
    expect(result.sql).toContain('quantile(0.9)(latency)');
    expect(result.sql).toContain('quantile(0.95)(latency)');
    expect(result.sql).toContain('quantile(0.99)(latency)');
  });

  it('compiles first aggregation', () => {
    const result = parseAndCompile('search * | stats first(hostname) by app_name');

    expect(result.sql).toContain('any(hostname)');
    expect(result.sql).toContain('GROUP BY app_name');
  });

  it('compiles last aggregation', () => {
    const result = parseAndCompile('search * | stats last(hostname) by app_name');

    expect(result.sql).toContain('anyLast(hostname)');
    expect(result.sql).toContain('GROUP BY app_name');
  });

  it('compiles list aggregation', () => {
    const result = parseAndCompile('search * | stats list(hostname)');

    expect(result.sql).toContain('groupArray(hostname)');
  });

  it('compiles multiple new aggregations together', () => {
    const result = parseAndCompile('search * | stats median(latency) stddev(latency) p95(latency) by hostname');

    expect(result.sql).toContain('median(latency)');
    expect(result.sql).toContain('stddevPop(latency)');
    expect(result.sql).toContain('quantile(0.95)(latency)');
    expect(result.sql).toContain('GROUP BY hostname');
  });

  it('compiles aggregations with custom aliases', () => {
    const result = parseAndCompile('search * | stats median(latency) as med_latency, p99(latency) as p99_latency');

    expect(result.sql).toContain('median(latency) AS med_latency');
    expect(result.sql).toContain('quantile(0.99)(latency) AS p99_latency');
  });

  // New command tests
  it('compiles top command', () => {
    const result = parseAndCompile('search * | top 10 hostname');

    expect(result.sql).toContain('count()');
    expect(result.sql).toContain('GROUP BY hostname');
    expect(result.sql).toContain('ORDER BY count DESC');
    expect(result.sql).toContain('LIMIT 10');
  });

  it('compiles rare command', () => {
    const result = parseAndCompile('search * | rare 5 hostname');

    expect(result.sql).toContain('count()');
    expect(result.sql).toContain('GROUP BY hostname');
    expect(result.sql).toContain('ORDER BY count ASC');
    expect(result.sql).toContain('LIMIT 5');
  });

  it('compiles bin command with time field', () => {
    const result = parseAndCompile('search * | bin span=1h timestamp');

    expect(result.sql).toContain('toStartOfHour(timestamp)');
    expect(result.sql).toContain('time_bucket');
  });

  it('compiles bin command with 5 minute intervals', () => {
    const result = parseAndCompile('search * | bin span=5m timestamp');

    expect(result.sql).toContain('toStartOfFiveMinutes(timestamp)');
    expect(result.sql).toContain('time_bucket');
  });

  it('compiles bin command with numeric field', () => {
    const result = parseAndCompile('search * | bin span=100 bytes');

    expect(result.sql).toContain('floor(bytes');
    expect(result.sql).toContain('bytes_bucket');
  });

  it('compiles timechart command', () => {
    const result = parseAndCompile('search * | timechart span=1h count');

    expect(result.sql).toContain('toStartOfHour(timestamp)');
    expect(result.sql).toContain('time_bucket');
    expect(result.sql).toContain('count()');
    expect(result.sql).toContain('GROUP BY');
    expect(result.sql).toContain('ORDER BY');
  });

  it('compiles timechart with aggregation and split-by', () => {
    const result = parseAndCompile('search * | timechart span=1h count by hostname');

    expect(result.sql).toContain('toStartOfHour(timestamp)');
    expect(result.sql).toContain('time_bucket');
    expect(result.sql).toContain('count()');
    expect(result.sql).toContain('GROUP BY');
    expect(result.sql).toContain('hostname');
  });

  it('compiles timechart with multiple aggregations', () => {
    const result = parseAndCompile('search * | timechart span=5m count avg(latency) max(latency)');

    expect(result.sql).toContain('toStartOfFiveMinutes(timestamp)');
    expect(result.sql).toContain('count()');
    expect(result.sql).toContain('avg(latency)');
    expect(result.sql).toContain('max(latency)');
  });

  it('compiles rex command with named groups', () => {
    const result = parseAndCompile('search * | rex field=message "user=(?P<username>\\w+)"');

    expect(result.sql).toContain('extract');
    expect(result.sql).toContain('message');
    expect(result.sql).toContain('username');
  });

  it('compiles rex command with default field', () => {
    const result = parseAndCompile('search * | rex "error code: (?P<error_code>\\d+)"');

    expect(result.sql).toContain('extract');
    expect(result.sql).toContain('message');
  });

  it('compiles complex query with new commands', () => {
    const result = parseAndCompile(`
      search severity>=warning
      | timechart span=1h count by hostname
      | sort desc count
      | limit 20
    `);

    expect(result.sql).toContain('severity >= 4');
    expect(result.sql).toContain('toStartOfHour(timestamp)');
    expect(result.sql).toContain('time_bucket');
    expect(result.sql).toContain('count()');
    expect(result.sql).toContain('GROUP BY');
    expect(result.sql).toContain('hostname');
    expect(result.sql).toContain('LIMIT 20');
  });
});
