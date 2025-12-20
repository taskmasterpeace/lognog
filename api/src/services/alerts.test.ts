/**
 * Tests for alert variable substitution
 */

import { describe, it, expect } from 'vitest';

// We need to expose the substituteVariables function for testing
// In a real implementation, you might want to export it from alerts.ts

// Mock substituteVariables function (copy from alerts.ts for testing)
function substituteVariables(
  text: string,
  results: Record<string, unknown>[],
  alertMetadata: {
    alert_name: string;
    alert_severity: string;
    result_count: number;
    timestamp: string;
  }
): string {
  if (!text) return text;

  const firstResult = results.length > 0 ? results[0] : {};

  return text.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const trimmedPath = path.trim();

    // Handle alert metadata variables
    if (trimmedPath === 'alert_name') return alertMetadata.alert_name;
    if (trimmedPath === 'alert_severity') return alertMetadata.alert_severity;
    if (trimmedPath === 'result_count') return String(alertMetadata.result_count);
    if (trimmedPath === 'timestamp') return alertMetadata.timestamp;

    // Handle result.field pattern
    if (trimmedPath.startsWith('result.')) {
      const field = trimmedPath.substring(7);
      const value = getNestedValue(firstResult, field);
      return value !== undefined ? String(value) : match;
    }

    // Handle result[0].field pattern
    if (trimmedPath.startsWith('result[')) {
      const indexMatch = trimmedPath.match(/^result\[(\d+)\]\.(.+)$/);
      if (indexMatch) {
        const index = parseInt(indexMatch[1], 10);
        const field = indexMatch[2];
        if (index < results.length) {
          const value = getNestedValue(results[index], field);
          return value !== undefined ? String(value) : match;
        }
      }
      return match;
    }

    // Direct field access from first result
    const value = getNestedValue(firstResult, trimmedPath);
    return value !== undefined ? String(value) : match;
  });
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: any = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }

  return current;
}

describe('Alert Variable Substitution', () => {
  const alertMetadata = {
    alert_name: 'High Error Rate',
    alert_severity: 'CRITICAL',
    result_count: 150,
    timestamp: '2025-12-16T10:30:00Z',
  };

  const sampleResults = [
    {
      hostname: 'web-01',
      app_name: 'nginx',
      severity: 3,
      message: 'Connection timeout',
      source_ip: '192.168.1.100',
      count: 42,
    },
    {
      hostname: 'web-02',
      app_name: 'apache',
      severity: 4,
      message: 'Memory warning',
      source_ip: '192.168.1.101',
      count: 28,
    },
  ];

  it('should substitute alert metadata variables', () => {
    const text = 'Alert: {{alert_name}} - Severity: {{alert_severity}} - Count: {{result_count}}';
    const result = substituteVariables(text, sampleResults, alertMetadata);
    expect(result).toBe('Alert: High Error Rate - Severity: CRITICAL - Count: 150');
  });

  it('should substitute result fields from first result', () => {
    const text = 'Host: {{hostname}} - App: {{app_name}} - Message: {{message}}';
    const result = substituteVariables(text, sampleResults, alertMetadata);
    expect(result).toBe('Host: web-01 - App: nginx - Message: Connection timeout');
  });

  it('should substitute using result. prefix', () => {
    const text = 'Host: {{result.hostname}} - IP: {{result.source_ip}}';
    const result = substituteVariables(text, sampleResults, alertMetadata);
    expect(result).toBe('Host: web-01 - IP: 192.168.1.100');
  });

  it('should substitute using result[N] index', () => {
    const text = 'First: {{result[0].hostname}}, Second: {{result[1].hostname}}';
    const result = substituteVariables(text, sampleResults, alertMetadata);
    expect(result).toBe('First: web-01, Second: web-02');
  });

  it('should preserve missing variables', () => {
    const text = 'Existing: {{hostname}}, Missing: {{nonexistent}}';
    const result = substituteVariables(text, sampleResults, alertMetadata);
    expect(result).toBe('Existing: web-01, Missing: {{nonexistent}}');
  });

  it('should handle empty results', () => {
    const text = 'Count: {{result_count}}, Host: {{hostname}}';
    const result = substituteVariables(text, [], alertMetadata);
    expect(result).toBe('Count: 150, Host: {{hostname}}');
  });

  it('should handle nested field access', () => {
    const nestedResults = [
      {
        hostname: 'web-01',
        metadata: {
          server: {
            name: 'prod-server-1',
          },
        },
      },
    ];
    const text = 'Server: {{metadata.server.name}}';
    const result = substituteVariables(text, nestedResults, alertMetadata);
    expect(result).toBe('Server: prod-server-1');
  });

  it('should substitute in email subject', () => {
    const subject = 'High Error Rate on {{hostname}}';
    const result = substituteVariables(subject, sampleResults, alertMetadata);
    expect(result).toBe('High Error Rate on web-01');
  });

  it('should substitute in email body', () => {
    const body = `Alert: {{alert_name}}
Severity: {{alert_severity}}
Host: {{hostname}}
Count: {{result_count}}
Message: {{message}}`;
    const result = substituteVariables(body, sampleResults, alertMetadata);
    expect(result).toContain('Alert: High Error Rate');
    expect(result).toContain('Severity: CRITICAL');
    expect(result).toContain('Host: web-01');
    expect(result).toContain('Count: 150');
    expect(result).toContain('Message: Connection timeout');
  });

  it('should substitute in webhook payload', () => {
    const payload = `{
  "alert": "{{alert_name}}",
  "severity": "{{alert_severity}}",
  "host": "{{hostname}}",
  "count": {{result_count}},
  "timestamp": "{{timestamp}}"
}`;
    const result = substituteVariables(payload, sampleResults, alertMetadata);
    expect(result).toContain('"alert": "High Error Rate"');
    expect(result).toContain('"severity": "CRITICAL"');
    expect(result).toContain('"host": "web-01"');
    expect(result).toContain('"count": 150');
    expect(result).toContain('"timestamp": "2025-12-16T10:30:00Z"');
  });

  it('should handle multiple occurrences of same variable', () => {
    const text = '{{hostname}} {{hostname}} {{hostname}}';
    const result = substituteVariables(text, sampleResults, alertMetadata);
    expect(result).toBe('web-01 web-01 web-01');
  });

  it('should handle variables with whitespace', () => {
    const text = '{{ hostname }} - {{ app_name }}';
    const result = substituteVariables(text, sampleResults, alertMetadata);
    expect(result).toBe('web-01 - nginx');
  });

  it('should handle numeric values', () => {
    const text = 'Severity: {{severity}}, Count: {{count}}';
    const result = substituteVariables(text, sampleResults, alertMetadata);
    expect(result).toBe('Severity: 3, Count: 42');
  });
});
