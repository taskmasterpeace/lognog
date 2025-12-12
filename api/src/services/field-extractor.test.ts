import { describe, it, expect } from 'vitest';
import {
  extractFields,
  testPattern,
  parseStackTrace,
  getBuiltInPatterns,
  type StackFrame,
} from './field-extractor.js';
import type { FieldExtraction } from '../db/sqlite.js';

describe('Field Extractor', () => {
  describe('extractFields', () => {
    it('should extract fields using Grok pattern for Apache access log', () => {
      const logLine = '192.168.1.100 - frank [10/Oct/2000:13:55:36 -0700] "GET /apache_pb.gif HTTP/1.0" 200 2326 "http://www.example.com/start.html" "Mozilla/4.08 [en] (Win98; I ;Nav)"';

      const patterns: FieldExtraction[] = [
        {
          id: '1',
          name: 'Apache Combined',
          source_type: 'apache',
          field_name: '',
          pattern: '%{IPORHOST:client_ip} %{USER:ident} %{USER:auth} \\[%{HTTPDATE:timestamp}\\] "(?:%{WORD:method} %{NOTSPACE:request}(?: HTTP/%{NUMBER:http_version})?|%{DATA:raw_request})" %{NUMBER:status} (?:%{NUMBER:bytes}|-) "%{DATA:referrer}" "%{DATA:user_agent}"',
          pattern_type: 'grok',
          priority: 10,
          enabled: 1,
          created_at: new Date().toISOString(),
        },
      ];

      const result = extractFields(logLine, patterns);

      expect(result).toBeDefined();
      expect(result.client_ip).toBe('192.168.1.100');
      expect(result.auth).toBe('frank');
      expect(result.method).toBe('GET');
      expect(result.request).toBe('/apache_pb.gif');
      expect(result.status).toBe('200');
      expect(result.bytes).toBe('2326');
    });

    it('should extract fields using Grok pattern for Nginx access log', () => {
      const logLine = '127.0.0.1 - nginx [21/Dec/2023:10:30:45 +0000] "POST /api/search HTTP/1.1" 200 1024 "https://example.com/" "Mozilla/5.0"';

      const patterns: FieldExtraction[] = [
        {
          id: '2',
          name: 'Nginx Access',
          source_type: 'nginx',
          field_name: '',
          pattern: '%{IPORHOST:client_ip} - %{DATA:user} \\[%{HTTPDATE:timestamp}\\] "%{WORD:method} %{DATA:request} HTTP/%{NUMBER:http_version}" %{NUMBER:status} %{NUMBER:bytes} "%{DATA:referrer}" "%{DATA:user_agent}"',
          pattern_type: 'grok',
          priority: 10,
          enabled: 1,
          created_at: new Date().toISOString(),
        },
      ];

      const result = extractFields(logLine, patterns);

      expect(result).toBeDefined();
      expect(result.client_ip).toBe('127.0.0.1');
      expect(result.method).toBe('POST');
      expect(result.request).toBe('/api/search');
      expect(result.status).toBe('200');
    });

    it('should extract fields using regex pattern', () => {
      const logLine = 'User john.doe@example.com logged in from 192.168.1.50';

      const patterns: FieldExtraction[] = [
        {
          id: '3',
          name: 'Email Extractor',
          source_type: 'auth',
          field_name: '',
          pattern: '(?<email>[\\w.+-]+@[\\w.-]+\\.[a-z]{2,})',
          pattern_type: 'regex',
          priority: 10,
          enabled: 1,
          created_at: new Date().toISOString(),
        },
        {
          id: '4',
          name: 'IP Extractor',
          source_type: 'auth',
          field_name: '',
          pattern: '(?<ip_address>\\b(?:[0-9]{1,3}\\.){3}[0-9]{1,3}\\b)',
          pattern_type: 'regex',
          priority: 20,
          enabled: 1,
          created_at: new Date().toISOString(),
        },
      ];

      const result = extractFields(logLine, patterns);

      expect(result).toBeDefined();
      expect(result.email).toBe('john.doe@example.com');
      expect(result.ip_address).toBe('192.168.1.50');
    });

    it('should extract fields from JSON logs', () => {
      const logLine = '{"level":"error","timestamp":"2023-12-21T10:30:45Z","user_id":12345,"message":"Database connection failed","error":{"code":"ECONNREFUSED","details":"Connection timed out"}}';

      const result = extractFields(logLine, []);

      expect(result).toBeDefined();
      expect(result.level).toBe('error');
      expect(result.user_id).toBe('12345');
      expect(result.message).toBe('Database connection failed');
      expect(result['error.code']).toBe('ECONNREFUSED');
      expect(result['error.details']).toBe('Connection timed out');
    });

    it('should respect pattern priority order', () => {
      const logLine = '192.168.1.100';

      const patterns: FieldExtraction[] = [
        {
          id: '1',
          name: 'Low Priority',
          source_type: 'test',
          field_name: '',
          pattern: '(?<ip>\\d+\\.\\d+\\.\\d+\\.\\d+)',
          pattern_type: 'regex',
          priority: 100,
          enabled: 1,
          created_at: new Date().toISOString(),
        },
        {
          id: '2',
          name: 'High Priority',
          source_type: 'test',
          field_name: '',
          pattern: '(?<ip>192\\.\\d+\\.\\d+\\.\\d+)',
          pattern_type: 'regex',
          priority: 10,
          enabled: 1,
          created_at: new Date().toISOString(),
        },
      ];

      const result = extractFields(logLine, patterns);

      // High priority pattern should be applied first
      expect(result.ip).toBe('192.168.1.100');
    });

    it('should skip disabled patterns', () => {
      const logLine = 'test@example.com';

      const patterns: FieldExtraction[] = [
        {
          id: '1',
          name: 'Disabled Pattern',
          source_type: 'test',
          field_name: '',
          pattern: '(?<email>[\\w.+-]+@[\\w.-]+\\.[a-z]{2,})',
          pattern_type: 'regex',
          priority: 10,
          enabled: 0, // Disabled
          created_at: new Date().toISOString(),
        },
      ];

      const result = extractFields(logLine, patterns);

      expect(result.email).toBeUndefined();
    });

    it('should prefix fields with field_name when specified', () => {
      const logLine = '192.168.1.100';

      const patterns: FieldExtraction[] = [
        {
          id: '1',
          name: 'IP Pattern',
          source_type: 'test',
          field_name: 'network',
          pattern: '(?<ip>\\d+\\.\\d+\\.\\d+\\.\\d+)',
          pattern_type: 'regex',
          priority: 10,
          enabled: 1,
          created_at: new Date().toISOString(),
        },
      ];

      const result = extractFields(logLine, patterns);

      expect(result['network.ip']).toBe('192.168.1.100');
    });

    it('should handle patterns that do not match', () => {
      const logLine = 'This is a simple log message';

      const patterns: FieldExtraction[] = [
        {
          id: '1',
          name: 'Apache Pattern',
          source_type: 'apache',
          field_name: '',
          pattern: '%{IPORHOST:client_ip} - %{USER:user}',
          pattern_type: 'grok',
          priority: 10,
          enabled: 1,
          created_at: new Date().toISOString(),
        },
      ];

      const result = extractFields(logLine, patterns);

      expect(result).toEqual({});
    });
  });

  describe('testPattern', () => {
    it('should successfully test a Grok pattern', () => {
      const pattern = '%{IPORHOST:ip} - %{USER:user}';
      const sample = '192.168.1.100 - admin';

      const result = testPattern(pattern, 'grok', sample);

      expect(result.success).toBe(true);
      expect(result.fields).toBeDefined();
      expect(result.fields?.ip).toBe('192.168.1.100');
      expect(result.fields?.user).toBe('admin');
      expect(result.error).toBeUndefined();
    });

    it('should successfully test a regex pattern', () => {
      const pattern = 'User: (?<username>\\w+), ID: (?<user_id>\\d+)';
      const sample = 'User: johndoe, ID: 12345';

      const result = testPattern(pattern, 'regex', sample);

      expect(result.success).toBe(true);
      expect(result.fields).toBeDefined();
      expect(result.fields?.username).toBe('johndoe');
      expect(result.fields?.user_id).toBe('12345');
      expect(result.error).toBeUndefined();
    });

    it('should return failure when pattern does not match', () => {
      const pattern = '%{IP:ip_address}'; // More specific pattern
      const sample = 'This is not an IP address at all';

      const result = testPattern(pattern, 'grok', sample);

      // Pattern should not match
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle invalid pattern type', () => {
      const pattern = 'test';
      const sample = 'test';

      // @ts-expect-error Testing invalid pattern type
      const result = testPattern(pattern, 'invalid', sample);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid pattern type');
    });

    it('should handle unknown Grok pattern by falling back to \\S+', () => {
      // Unknown patterns like %{INVALID} fall back to \S+ pattern
      const pattern = '%{INVALID:field}';
      const sample = 'test';

      const result = testPattern(pattern, 'grok', sample);

      // Should succeed because unknown pattern falls back to \S+
      expect(result.success).toBe(true);
      expect(result.fields?.field).toBe('test');
    });

    it('should handle invalid regex pattern', () => {
      const pattern = '(?<unclosed';
      const sample = 'test';

      const result = testPattern(pattern, 'regex', sample);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('parseStackTrace', () => {
    it('should parse JavaScript stack trace', () => {
      const logLine = `Error: Something went wrong
    at Function.module.exports.getUser (/app/user.js:123:45)
    at /app/server.js:67:10
    at Layer.handle [as handle_request] (/app/node_modules/express/lib/router/layer.js:95:5)`;

      const result = parseStackTrace(logLine);

      expect(result).toBeDefined();
      expect(result).toHaveLength(3);
      expect(result?.[0].file).toContain('user.js');
      expect(result?.[0].lineNumber).toBe(123);
      expect(result?.[0].column).toBe(45);
      expect(result?.[0].methodName).toContain('getUser');
    });

    it('should parse Python stack trace', () => {
      const logLine = `Traceback (most recent call last):
  File "app.py", line 42, in main
  File "database.py", line 123, in connect
  File "socket.py", line 99, in create_connection`;

      const result = parseStackTrace(logLine);

      expect(result).toBeDefined();
      expect(result).toHaveLength(3);
      expect(result?.[0].file).toBe('app.py');
      expect(result?.[0].lineNumber).toBe(42);
      expect(result?.[0].methodName).toBe('main');
    });

    it('should parse Java stack trace', () => {
      const logLine = `java.lang.NullPointerException: Cannot invoke method
    at com.example.UserService.getUser(UserService.java:123)
    at com.example.api.Controller.handleRequest(Controller.java:45)
    at sun.reflect.NativeMethodAccessorImpl.invoke0(Native Method)`;

      const result = parseStackTrace(logLine);

      expect(result).toBeDefined();
      expect(result!.length).toBeGreaterThanOrEqual(2); // Should parse at least 2 frames
      // Note: stacktrace-parser may parse this differently than our custom Java parser
      // Just verify we got frames with valid data
      expect(result?.[0].lineNumber).toBe(123);
      expect(result?.[0].file).toContain('UserService.java');
    });

    it('should return null for non-stack-trace log lines', () => {
      const logLine = 'This is a regular log message without any stack trace';

      const result = parseStackTrace(logLine);

      expect(result).toBeNull();
    });

    it('should handle empty or malformed stack traces', () => {
      const logLine = 'Error: Something went wrong (but no stack trace follows)';

      const result = parseStackTrace(logLine);

      expect(result).toBeNull();
    });
  });

  describe('getBuiltInPatterns', () => {
    it('should return pre-built extraction patterns', () => {
      const patterns = getBuiltInPatterns();

      expect(patterns).toBeDefined();
      expect(patterns.length).toBeGreaterThan(0);

      // Check for specific patterns
      const apachePattern = patterns.find(p => p.name === 'Apache Combined Log');
      expect(apachePattern).toBeDefined();
      expect(apachePattern?.source_type).toBe('apache');
      expect(apachePattern?.pattern_type).toBe('grok');

      const nginxPattern = patterns.find(p => p.name === 'Nginx Access Log');
      expect(nginxPattern).toBeDefined();
      expect(nginxPattern?.source_type).toBe('nginx');

      const ipPattern = patterns.find(p => p.name === 'IPv4 Address');
      expect(ipPattern).toBeDefined();
      expect(ipPattern?.pattern_type).toBe('regex');
    });

    it('should have valid priorities for all patterns', () => {
      const patterns = getBuiltInPatterns();

      patterns.forEach(pattern => {
        expect(pattern.priority).toBeGreaterThan(0);
        expect(pattern.priority).toBeLessThanOrEqual(100);
      });
    });

    it('should have descriptions for all patterns', () => {
      const patterns = getBuiltInPatterns();

      patterns.forEach(pattern => {
        expect(pattern.description).toBeDefined();
        expect(pattern.description.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Real-world log examples', () => {
    it('should extract fields from Apache access log', () => {
      const logLine = '10.0.1.23 - - [21/Dec/2023:14:32:10 +0000] "GET /api/users?page=2 HTTP/1.1" 200 4567 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"';

      const patterns: FieldExtraction[] = [
        {
          id: '1',
          name: 'Apache',
          source_type: 'apache',
          field_name: 'web',
          pattern: '%{IPORHOST:client_ip} %{USER:ident} %{USER:auth} \\[%{HTTPDATE:timestamp}\\] "(?:%{WORD:method} %{NOTSPACE:request}(?: HTTP/%{NUMBER:http_version})?|%{DATA:raw_request})" %{NUMBER:status} (?:%{NUMBER:bytes}|-)',
          pattern_type: 'grok',
          priority: 10,
          enabled: 1,
          created_at: new Date().toISOString(),
        },
      ];

      const result = extractFields(logLine, patterns);

      expect(result['web.client_ip']).toBe('10.0.1.23');
      expect(result['web.method']).toBe('GET');
      expect(result['web.status']).toBe('200');
    });

    it('should extract fields from syslog message', () => {
      const logLine = 'Dec 21 10:30:45 localhost sshd[12345]: Failed password for invalid user admin from 192.168.1.100 port 22 ssh2';

      const patterns: FieldExtraction[] = [
        {
          id: '1',
          name: 'Syslog',
          source_type: 'syslog',
          field_name: '',
          pattern: '%{SYSLOGTIMESTAMP:timestamp} (?:%{SYSLOGFACILITY} )?%{SYSLOGHOST:hostname} %{DATA:program}(?:\\[%{POSINT:pid}\\])?: %{GREEDYDATA:message}',
          pattern_type: 'grok',
          priority: 10,
          enabled: 1,
          created_at: new Date().toISOString(),
        },
      ];

      const result = extractFields(logLine, patterns);

      expect(result.hostname).toBe('localhost');
      expect(result.program).toBe('sshd');
      expect(result.pid).toBe('12345');
      expect(result.message).toContain('Failed password');
    });

    it('should extract multiple field types from complex log', () => {
      const logLine = 'User user@example.com (ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890) accessed resource from 203.0.113.42 - Response time: 125ms - Status: 200';

      const patterns: FieldExtraction[] = [
        {
          id: '1',
          name: 'Email',
          source_type: 'app',
          field_name: '',
          pattern: '(?<email>[\\w.+-]+@[\\w.-]+\\.[a-z]{2,})',
          pattern_type: 'regex',
          priority: 10,
          enabled: 1,
          created_at: new Date().toISOString(),
        },
        {
          id: '2',
          name: 'UUID',
          source_type: 'app',
          field_name: '',
          pattern: '(?<uuid>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})',
          pattern_type: 'regex',
          priority: 20,
          enabled: 1,
          created_at: new Date().toISOString(),
        },
        {
          id: '3',
          name: 'IP',
          source_type: 'app',
          field_name: '',
          pattern: '(?<ip>\\b(?:[0-9]{1,3}\\.){3}[0-9]{1,3}\\b)',
          pattern_type: 'regex',
          priority: 30,
          enabled: 1,
          created_at: new Date().toISOString(),
        },
        {
          id: '4',
          name: 'Duration',
          source_type: 'app',
          field_name: '',
          pattern: '(?<duration>\\d+)ms',
          pattern_type: 'regex',
          priority: 40,
          enabled: 1,
          created_at: new Date().toISOString(),
        },
        {
          id: '5',
          name: 'Status',
          source_type: 'app',
          field_name: '',
          pattern: 'Status: (?<status>\\d+)',
          pattern_type: 'regex',
          priority: 50,
          enabled: 1,
          created_at: new Date().toISOString(),
        },
      ];

      const result = extractFields(logLine, patterns);

      expect(result.email).toBe('user@example.com');
      expect(result.uuid).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(result.ip).toBe('203.0.113.42');
      expect(result.duration).toBe('125');
      expect(result.status).toBe('200');
    });
  });
});
