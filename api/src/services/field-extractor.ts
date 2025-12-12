import StackTraceParser from 'stacktrace-parser';
import { getFieldExtractions, type FieldExtraction } from '../db/sqlite.js';

// Pre-built regex patterns (pure JavaScript - no native dependencies)
// Named capture groups provide field extraction
const BUILT_IN_REGEX_PATTERNS: Record<string, RegExp> = {
  // Apache/Nginx Combined Log Format
  APACHE_COMBINED: /^(?<client_ip>\S+) (?<ident>\S+) (?<auth>\S+) \[(?<timestamp>[^\]]+)\] "(?<method>\w+) (?<request>\S+) HTTP\/(?<http_version>[\d.]+)" (?<status>\d+) (?<bytes>\d+|-) "(?<referrer>[^"]*)" "(?<user_agent>[^"]*)"/,

  // Apache Common Log Format
  APACHE_COMMON: /^(?<client_ip>\S+) (?<ident>\S+) (?<auth>\S+) \[(?<timestamp>[^\]]+)\] "(?<method>\w+) (?<request>\S+) HTTP\/(?<http_version>[\d.]+)" (?<status>\d+) (?<bytes>\d+|-)/,

  // Nginx Access Log
  NGINX_ACCESS: /^(?<client_ip>\S+) - (?<user>\S+) \[(?<timestamp>[^\]]+)\] "(?<method>\w+) (?<request>\S+) HTTP\/(?<http_version>[\d.]+)" (?<status>\d+) (?<bytes>\d+) "(?<referrer>[^"]*)" "(?<user_agent>[^"]*)"/,

  // Syslog (RFC3164)
  SYSLOG_RFC3164: /^(?<timestamp>\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(?<hostname>\S+)\s+(?<program>[^\[:]+)(?:\[(?<pid>\d+)\])?\s*:\s*(?<message>.+)$/,

  // Syslog (RFC5424)
  SYSLOG_RFC5424: /^<(?<pri>\d+)>(?<version>\d+)\s+(?<timestamp>\S+)\s+(?<hostname>\S+)\s+(?<app_name>\S+)\s+(?<procid>\S+)\s+(?<msgid>\S+)\s+(?<structured_data>-|\[[^\]]+\])\s*(?<message>.*)$/,

  // Error Log with timestamp and level
  ERROR_LOG: /^\[(?<timestamp>[^\]]+)\]\s*(?<level>DEBUG|INFO|WARN|WARNING|ERROR|CRITICAL|FATAL):\s*(?<message>.+)$/i,

  // JSON-style Key-Value pairs
  KEY_VALUE: /(?<key>\w+)=(?<value>"[^"]*"|\S+)/g,

  // IP Address extraction
  IP_ADDRESS: /(?<ip>\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b)/g,

  // HTTP Status Code
  HTTP_STATUS: /\b(?<status>[1-5]\d{2})\b/,

  // UUID
  UUID: /(?<uuid>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi,

  // Email Address
  EMAIL: /(?<email>\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b)/g,

  // Duration in milliseconds
  DURATION_MS: /(?<duration>\d+(?:\.\d+)?)\s*ms\b/gi,

  // Duration in seconds
  DURATION_S: /(?<duration>\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?\b/gi,

  // URL extraction
  URL: /(?<url>https?:\/\/[^\s<>"{}|\\^`\[\]]+)/gi,

  // Docker container ID
  DOCKER_CONTAINER: /(?<container_id>[a-f0-9]{64}|[a-f0-9]{12})\b/gi,

  // Kubernetes pod name
  K8S_POD: /(?<pod_name>[a-z0-9-]+-[a-z0-9]{5,10})\b/gi,
};

// Grok-like pattern definitions that map to regex
// This allows users to write Grok-style patterns that get converted to regex
const GROK_TO_REGEX: Record<string, string> = {
  '%{WORD}': '\\w+',
  '%{NOTSPACE}': '\\S+',
  '%{DATA}': '.*?',
  '%{GREEDYDATA}': '.*',
  '%{NUMBER}': '-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)',
  '%{POSINT}': '\\d+',
  '%{INT}': '-?\\d+',
  '%{IP}': '(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)',
  '%{IPORHOST}': '(?:(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)|[a-zA-Z0-9.-]+)',
  '%{USER}': '[a-zA-Z0-9._-]+',
  '%{USERNAME}': '[a-zA-Z0-9._-]+',
  '%{HOSTNAME}': '[a-zA-Z0-9.-]+',
  '%{HOSTPORT}': '[a-zA-Z0-9.-]+:\\d+',
  '%{PATH}': '(?:/[^\\s]+)+',
  '%{URIPATH}': '(?:/[^\\s?#]*)',
  '%{URIPARAM}': '\\?[^\\s]*',
  '%{URI}': 'https?://[^\\s<>"{}|\\\\^`\\[\\]]+',
  '%{HTTPDATE}': '\\d{2}/\\w{3}/\\d{4}:\\d{2}:\\d{2}:\\d{2}\\s+[+-]\\d{4}',
  '%{TIMESTAMP_ISO8601}': '\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:?\\d{2})?',
  '%{SYSLOGTIMESTAMP}': '\\w{3}\\s+\\d{1,2}\\s+\\d{2}:\\d{2}:\\d{2}',
  '%{SYSLOGFACILITY}': '<\\d+>',
  '%{SYSLOGHOST}': '[a-zA-Z0-9._-]+',
  '%{LOGLEVEL}': '(?:DEBUG|INFO|WARN(?:ING)?|ERROR|CRITICAL|FATAL|TRACE)',
  '%{QS}': '"[^"]*"',
  '%{UUID}': '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
  '%{MAC}': '(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}',
  '%{BASE16NUM}': '(?:0[xX])?[0-9a-fA-F]+',
};

// Stack trace frame interface
export interface StackFrame {
  file: string;
  lineNumber: number | null;
  column: number | null;
  methodName: string;
}

/**
 * Convert a Grok-style pattern to JavaScript regex
 * Supports patterns like %{WORD:fieldname} or %{IP}
 */
function grokToRegex(grokPattern: string): string {
  let regexPattern = grokPattern;

  // First, handle patterns with field names: %{PATTERN:field_name}
  const patternWithField = /%\{(\w+):(\w+)\}/g;
  regexPattern = regexPattern.replace(patternWithField, (_match, patternName, fieldName) => {
    const regex = GROK_TO_REGEX[`%{${patternName}}`] || '\\S+';
    return `(?<${fieldName}>${regex})`;
  });

  // Then handle patterns without field names: %{PATTERN}
  const patternWithoutField = /%\{(\w+)\}/g;
  regexPattern = regexPattern.replace(patternWithoutField, (_match, patternName) => {
    return GROK_TO_REGEX[`%{${patternName}}`] || '\\S+';
  });

  return regexPattern;
}

/**
 * Extract fields from a log line using a Grok-style pattern
 * Converts Grok pattern to regex and executes it
 */
function extractWithGrok(pattern: string, logLine: string): Record<string, string> | null {
  try {
    const regexPattern = grokToRegex(pattern);
    const regex = new RegExp(regexPattern);
    const match = logLine.match(regex);

    if (!match || !match.groups) {
      return null;
    }

    // Convert all values to strings and remove null/undefined values
    const extracted: Record<string, string> = {};
    for (const [key, value] of Object.entries(match.groups)) {
      if (value !== null && value !== undefined) {
        extracted[key] = String(value);
      }
    }

    return Object.keys(extracted).length > 0 ? extracted : null;
  } catch (error) {
    console.error('Grok extraction error:', error);
    return null;
  }
}

/**
 * Extract fields from a log line using a regex pattern
 */
function extractWithRegex(pattern: string, logLine: string): Record<string, string> | null {
  try {
    const regex = new RegExp(pattern);
    const match = logLine.match(regex);

    if (!match) {
      return null;
    }

    // Extract named groups if available
    if (match.groups) {
      const extracted: Record<string, string> = {};
      for (const [key, value] of Object.entries(match.groups)) {
        if (value !== undefined) {
          extracted[key] = value;
        }
      }
      return Object.keys(extracted).length > 0 ? extracted : null;
    }

    // Fallback to indexed groups (group1, group2, etc.)
    const extracted: Record<string, string> = {};
    for (let i = 1; i < match.length; i++) {
      if (match[i] !== undefined) {
        extracted[`group${i}`] = match[i];
      }
    }

    return Object.keys(extracted).length > 0 ? extracted : null;
  } catch (error) {
    console.error('Regex extraction error:', error);
    return null;
  }
}

/**
 * Try to parse a log line as JSON and extract fields
 */
function extractFromJson(logLine: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(logLine);

    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    // Flatten nested objects with dot notation
    const flattened: Record<string, string> = {};

    function flatten(obj: Record<string, unknown>, prefix = ''): void {
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;

        if (value === null || value === undefined) {
          continue;
        } else if (typeof value === 'object' && !Array.isArray(value)) {
          flatten(value as Record<string, unknown>, fullKey);
        } else if (Array.isArray(value)) {
          flattened[fullKey] = JSON.stringify(value);
        } else {
          flattened[fullKey] = String(value);
        }
      }
    }

    flatten(parsed);
    return Object.keys(flattened).length > 0 ? flattened : null;
  } catch {
    return null;
  }
}

/**
 * Apply built-in patterns to extract common fields
 */
function extractBuiltInFields(logLine: string): Record<string, string> {
  const extracted: Record<string, string> = {};

  // Try common log formats
  for (const [patternName, regex] of Object.entries(BUILT_IN_REGEX_PATTERNS)) {
    // Skip patterns that need global flag (they're for multiple matches)
    if (regex.global) continue;

    const match = logLine.match(regex);
    if (match && match.groups) {
      for (const [key, value] of Object.entries(match.groups)) {
        if (value !== undefined) {
          extracted[`${patternName.toLowerCase()}.${key}`] = value;
        }
      }
      // If we matched a full log format, don't try others
      if (['APACHE_COMBINED', 'APACHE_COMMON', 'NGINX_ACCESS', 'SYSLOG_RFC3164', 'SYSLOG_RFC5424'].includes(patternName)) {
        break;
      }
    }
  }

  // Extract all IP addresses
  const ipMatches = logLine.matchAll(BUILT_IN_REGEX_PATTERNS.IP_ADDRESS);
  const ips: string[] = [];
  for (const match of ipMatches) {
    if (match.groups?.ip) {
      ips.push(match.groups.ip);
    }
  }
  if (ips.length > 0) {
    extracted['ip_addresses'] = ips.join(',');
    if (ips.length >= 1) extracted['source_ip'] = ips[0];
    if (ips.length >= 2) extracted['dest_ip'] = ips[1];
  }

  // Extract all URLs
  const urlMatches = logLine.matchAll(BUILT_IN_REGEX_PATTERNS.URL);
  const urls: string[] = [];
  for (const match of urlMatches) {
    if (match.groups?.url) {
      urls.push(match.groups.url);
    }
  }
  if (urls.length > 0) {
    extracted['urls'] = urls.join(',');
  }

  // Extract all UUIDs
  const uuidMatches = logLine.matchAll(BUILT_IN_REGEX_PATTERNS.UUID);
  const uuids: string[] = [];
  for (const match of uuidMatches) {
    if (match.groups?.uuid) {
      uuids.push(match.groups.uuid);
    }
  }
  if (uuids.length > 0) {
    extracted['uuids'] = uuids.join(',');
  }

  // Extract emails
  const emailMatches = logLine.matchAll(BUILT_IN_REGEX_PATTERNS.EMAIL);
  const emails: string[] = [];
  for (const match of emailMatches) {
    if (match.groups?.email) {
      emails.push(match.groups.email);
    }
  }
  if (emails.length > 0) {
    extracted['emails'] = emails.join(',');
  }

  return extracted;
}

/**
 * Extract fields from a log line using configured extraction patterns
 *
 * @param logLine - The log line to extract fields from
 * @param patterns - Array of field extraction patterns to try
 * @returns Extracted fields as key-value pairs
 */
export function extractFields(
  logLine: string,
  patterns: FieldExtraction[]
): Record<string, string> {
  const extracted: Record<string, string> = {};

  // Try JSON parsing first if the line looks like JSON
  if (logLine.trim().startsWith('{')) {
    const jsonFields = extractFromJson(logLine);
    if (jsonFields) {
      Object.assign(extracted, jsonFields);
    }
  }

  // Apply built-in patterns
  const builtInFields = extractBuiltInFields(logLine);
  Object.assign(extracted, builtInFields);

  // Apply user-configured patterns in priority order (lower number = higher priority)
  const sortedPatterns = [...patterns].sort((a, b) => a.priority - b.priority);

  for (const pattern of sortedPatterns) {
    if (!pattern.enabled) {
      continue;
    }

    let fields: Record<string, string> | null = null;

    if (pattern.pattern_type === 'grok') {
      fields = extractWithGrok(pattern.pattern, logLine);
    } else if (pattern.pattern_type === 'regex') {
      fields = extractWithRegex(pattern.pattern, logLine);
    }

    if (fields) {
      // Add extracted fields, prefixing with field_name if specified
      for (const [key, value] of Object.entries(fields)) {
        const fieldKey = pattern.field_name ? `${pattern.field_name}.${key}` : key;

        // Don't overwrite already extracted fields (priority matters)
        if (!(fieldKey in extracted)) {
          extracted[fieldKey] = value;
        }
      }
    }
  }

  return extracted;
}

/**
 * Test a pattern against a sample log line
 *
 * @param pattern - The pattern to test
 * @param patternType - Type of pattern ('grok' or 'regex')
 * @param sample - Sample log line to test against
 * @returns Test result with success status and extracted fields or error
 */
export function testPattern(
  pattern: string,
  patternType: 'grok' | 'regex',
  sample: string
): { success: boolean; fields?: Record<string, string>; error?: string } {
  try {
    let fields: Record<string, string> | null = null;

    if (patternType === 'grok') {
      fields = extractWithGrok(pattern, sample);
    } else if (patternType === 'regex') {
      fields = extractWithRegex(pattern, sample);
    } else {
      return {
        success: false,
        error: `Invalid pattern type: ${patternType}. Must be 'grok' or 'regex'`,
      };
    }

    if (fields === null) {
      return {
        success: false,
        error: 'Pattern did not match the sample log line',
      };
    }

    return {
      success: true,
      fields,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Parse a stack trace from a log line
 *
 * @param logLine - The log line containing a stack trace
 * @returns Array of stack frames or null if not a stack trace
 */
export function parseStackTrace(logLine: string): StackFrame[] | null {
  try {
    // Try to detect stack trace patterns
    const hasStackTrace =
      logLine.includes('    at ') || // JavaScript/Node.js
      logLine.includes('\tat ') || // Java
      logLine.includes('File "') || // Python
      logLine.includes('Traceback') || // Python
      /\w+\.\w+\([^)]+:\d+:\d+\)/.test(logLine); // Generic pattern

    if (!hasStackTrace) {
      return null;
    }

    // Use stacktrace-parser for JavaScript/Node.js stack traces
    try {
      const frames = StackTraceParser.parse(logLine);
      if (frames && frames.length > 0) {
        return frames.map(frame => ({
          file: frame.file || '',
          lineNumber: frame.lineNumber || null,
          column: frame.column || null,
          methodName: frame.methodName || '',
        }));
      }
    } catch {
      // Not a JavaScript stack trace, continue
    }

    // Parse Python stack traces
    const pythonFrames = parsePythonStackTrace(logLine);
    if (pythonFrames && pythonFrames.length > 0) {
      return pythonFrames;
    }

    // Parse Java stack traces
    const javaFrames = parseJavaStackTrace(logLine);
    if (javaFrames && javaFrames.length > 0) {
      return javaFrames;
    }

    return null;
  } catch (error) {
    console.error('Stack trace parsing error:', error);
    return null;
  }
}

/**
 * Parse Python stack trace
 */
function parsePythonStackTrace(text: string): StackFrame[] | null {
  const frames: StackFrame[] = [];

  // Python format: File "filename.py", line 123, in method_name
  const pythonPattern = /File "([^"]+)", line (\d+)(?:, in (.+))?/g;
  let match;

  while ((match = pythonPattern.exec(text)) !== null) {
    frames.push({
      file: match[1],
      lineNumber: parseInt(match[2], 10),
      column: null,
      methodName: match[3] || '',
    });
  }

  return frames.length > 0 ? frames : null;
}

/**
 * Parse Java stack trace
 */
function parseJavaStackTrace(text: string): StackFrame[] | null {
  const frames: StackFrame[] = [];

  // Java format: at com.example.ClassName.methodName(FileName.java:123)
  const javaPattern = /at\s+([\w.$]+)\(([\w.]+):(\d+)\)/g;
  let match;

  while ((match = javaPattern.exec(text)) !== null) {
    frames.push({
      file: match[2],
      lineNumber: parseInt(match[3], 10),
      column: null,
      methodName: match[1],
    });
  }

  return frames.length > 0 ? frames : null;
}

/**
 * Apply field extraction to search results
 *
 * @param results - Array of search results (log records)
 * @param sourceType - Source type to filter extraction patterns (optional)
 * @returns Results with extracted fields added
 */
export async function applyFieldExtraction(
  results: Record<string, unknown>[],
  sourceType?: string
): Promise<Record<string, unknown>[]> {
  if (results.length === 0) {
    return results;
  }

  // Get field extraction patterns
  const patterns = getFieldExtractions(sourceType);

  // Apply field extraction to each result
  return results.map(result => {
    // Get the raw message field
    const message = result.message || result.raw_message || result.msg;

    if (typeof message !== 'string') {
      return result;
    }

    // Extract fields
    const extracted = extractFields(message, patterns);

    // Merge extracted fields with the result
    // Prefix extracted fields to avoid collision with existing fields
    const extractedFields: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(extracted)) {
      extractedFields[`extracted.${key}`] = value;
    }

    return {
      ...result,
      ...extractedFields,
    };
  });
}

/**
 * Get pre-built extraction patterns for common log formats
 * These can be seeded into the database
 */
export function getBuiltInPatterns(): Array<{
  name: string;
  source_type: string;
  field_name: string;
  pattern: string;
  pattern_type: 'grok' | 'regex';
  priority: number;
  description: string;
}> {
  return [
    {
      name: 'Apache Combined Log',
      source_type: 'apache',
      field_name: 'apache',
      pattern: '%{IPORHOST:client_ip} %{USER:ident} %{USER:auth} \\[%{HTTPDATE:timestamp}\\] "%{WORD:method} %{NOTSPACE:request} HTTP/%{NUMBER:http_version}" %{NUMBER:status} %{NUMBER:bytes} "%{DATA:referrer}" "%{DATA:user_agent}"',
      pattern_type: 'grok',
      priority: 10,
      description: 'Extracts fields from Apache combined access log format',
    },
    {
      name: 'Apache Common Log',
      source_type: 'apache',
      field_name: 'apache',
      pattern: '%{IPORHOST:client_ip} %{USER:ident} %{USER:auth} \\[%{HTTPDATE:timestamp}\\] "%{WORD:method} %{NOTSPACE:request} HTTP/%{NUMBER:http_version}" %{NUMBER:status} %{NUMBER:bytes}',
      pattern_type: 'grok',
      priority: 20,
      description: 'Extracts fields from Apache common access log format',
    },
    {
      name: 'Nginx Access Log',
      source_type: 'nginx',
      field_name: 'nginx',
      pattern: '%{IPORHOST:client_ip} - %{DATA:user} \\[%{HTTPDATE:timestamp}\\] "%{WORD:method} %{DATA:request} HTTP/%{NUMBER:http_version}" %{NUMBER:status} %{NUMBER:bytes} "%{DATA:referrer}" "%{DATA:user_agent}"',
      pattern_type: 'grok',
      priority: 10,
      description: 'Extracts fields from Nginx access log format',
    },
    {
      name: 'Syslog',
      source_type: 'syslog',
      field_name: 'syslog',
      pattern: '%{SYSLOGTIMESTAMP:timestamp} %{SYSLOGHOST:hostname} %{DATA:program}(?:\\[%{POSINT:pid}\\])?: %{GREEDYDATA:message}',
      pattern_type: 'grok',
      priority: 10,
      description: 'Extracts fields from standard syslog format',
    },
    {
      name: 'Error Log',
      source_type: 'error',
      field_name: 'error',
      pattern: '\\[%{TIMESTAMP_ISO8601:timestamp}\\] %{LOGLEVEL:level}: %{GREEDYDATA:message}',
      pattern_type: 'grok',
      priority: 10,
      description: 'Extracts timestamp and level from common error log format',
    },
    {
      name: 'HTTP Status Code',
      source_type: 'http',
      field_name: 'http',
      pattern: '(?<http_status>\\b[1-5]\\d{2}\\b)',
      pattern_type: 'regex',
      priority: 50,
      description: 'Extracts HTTP status codes (100-599)',
    },
    {
      name: 'IPv4 Address',
      source_type: 'network',
      field_name: 'network',
      pattern: '(?<ip_address>\\b(?:[0-9]{1,3}\\.){3}[0-9]{1,3}\\b)',
      pattern_type: 'regex',
      priority: 50,
      description: 'Extracts IPv4 addresses',
    },
    {
      name: 'Email Address',
      source_type: 'email',
      field_name: 'email',
      pattern: '(?<email_address>\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b)',
      pattern_type: 'regex',
      priority: 50,
      description: 'Extracts email addresses',
    },
    {
      name: 'UUID',
      source_type: 'uuid',
      field_name: 'id',
      pattern: '(?<uuid>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})',
      pattern_type: 'regex',
      priority: 60,
      description: 'Extracts UUID identifiers',
    },
    {
      name: 'Duration (ms)',
      source_type: 'performance',
      field_name: 'perf',
      pattern: '(?<duration_ms>\\d+)\\s*ms\\b',
      pattern_type: 'regex',
      priority: 70,
      description: 'Extracts duration in milliseconds',
    },
  ];
}
