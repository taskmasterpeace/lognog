import { describe, it, expect } from 'vitest';
import { parseAndCompile } from './index';

describe('Compiler', () => {
  it('compiles simple search to SQL', () => {
    const result = parseAndCompile('search host=router');

    expect(result.sql).toContain('SELECT');
    expect(result.sql).toContain('FROM spunk.logs');
    expect(result.sql).toContain("hostname = 'router'");
  });

  it('compiles wildcard search', () => {
    const result = parseAndCompile('search *');

    expect(result.sql).toContain('SELECT');
    expect(result.sql).toContain('FROM spunk.logs');
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
    expect(result.sql).toContain('FROM spunk.logs');
  });
});
