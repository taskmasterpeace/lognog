/**
 * Demo script to showcase Grok pattern field extraction
 * Run with: tsx src/services/field-extractor.demo.ts
 */

import {
  extractFields,
  testPattern,
  parseStackTrace,
  getBuiltInPatterns,
} from './field-extractor.js';
import type { FieldExtraction } from '../db/sqlite.js';

console.log('='.repeat(80));
console.log('Grok Pattern Field Extraction Demo');
console.log('='.repeat(80));

// Example 1: Apache Access Log
console.log('\n[1] Apache Access Log Extraction\n');
const apacheLog = '192.168.1.100 - frank [10/Oct/2000:13:55:36 -0700] "GET /apache_pb.gif HTTP/1.0" 200 2326 "http://www.example.com/start.html" "Mozilla/4.08 [en] (Win98; I ;Nav)"';

const apachePattern: FieldExtraction = {
  id: '1',
  name: 'Apache Combined',
  source_type: 'apache',
  field_name: 'web',
  pattern: '%{IPORHOST:client_ip} %{USER:ident} %{USER:auth} \\[%{HTTPDATE:timestamp}\\] "(?:%{WORD:method} %{NOTSPACE:request}(?: HTTP/%{NUMBER:http_version})?|%{DATA:raw_request})" %{NUMBER:status} (?:%{NUMBER:bytes}|-) "%{DATA:referrer}" "%{DATA:user_agent}"',
  pattern_type: 'grok',
  priority: 10,
  enabled: 1,
  created_at: new Date().toISOString(),
};

console.log('Input:', apacheLog);
console.log('\nExtracted fields:');
const apacheFields = extractFields(apacheLog, [apachePattern]);
console.log(JSON.stringify(apacheFields, null, 2));

// Example 2: Nginx Access Log
console.log('\n' + '='.repeat(80));
console.log('\n[2] Nginx Access Log Extraction\n');
const nginxLog = '127.0.0.1 - nginx [21/Dec/2023:10:30:45 +0000] "POST /api/search HTTP/1.1" 200 1024 "https://example.com/" "Mozilla/5.0"';

const nginxPattern: FieldExtraction = {
  id: '2',
  name: 'Nginx Access',
  source_type: 'nginx',
  field_name: 'web',
  pattern: '%{IPORHOST:client_ip} - %{DATA:user} \\[%{HTTPDATE:timestamp}\\] "%{WORD:method} %{DATA:request} HTTP/%{NUMBER:http_version}" %{NUMBER:status} %{NUMBER:bytes} "%{DATA:referrer}" "%{DATA:user_agent}"',
  pattern_type: 'grok',
  priority: 10,
  enabled: 1,
  created_at: new Date().toISOString(),
};

console.log('Input:', nginxLog);
console.log('\nExtracted fields:');
const nginxFields = extractFields(nginxLog, [nginxPattern]);
console.log(JSON.stringify(nginxFields, null, 2));

// Example 3: Multiple Regex Patterns
console.log('\n' + '='.repeat(80));
console.log('\n[3] Multiple Regex Pattern Extraction\n');
const complexLog = 'User admin@example.com (ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890) accessed /api/users from 203.0.113.42 - Response: 200 in 125ms';

const regexPatterns: FieldExtraction[] = [
  {
    id: '3',
    name: 'Email',
    source_type: 'app',
    field_name: 'user',
    pattern: '(?<email>[\\w.+-]+@[\\w.-]+\\.[a-z]{2,})',
    pattern_type: 'regex',
    priority: 10,
    enabled: 1,
    created_at: new Date().toISOString(),
  },
  {
    id: '4',
    name: 'UUID',
    source_type: 'app',
    field_name: 'id',
    pattern: '(?<uuid>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})',
    pattern_type: 'regex',
    priority: 20,
    enabled: 1,
    created_at: new Date().toISOString(),
  },
  {
    id: '5',
    name: 'IP',
    source_type: 'app',
    field_name: 'network',
    pattern: '(?<ip>\\b(?:[0-9]{1,3}\\.){3}[0-9]{1,3}\\b)',
    pattern_type: 'regex',
    priority: 30,
    enabled: 1,
    created_at: new Date().toISOString(),
  },
  {
    id: '6',
    name: 'Duration',
    source_type: 'app',
    field_name: 'perf',
    pattern: '(?<duration_ms>\\d+)ms',
    pattern_type: 'regex',
    priority: 40,
    enabled: 1,
    created_at: new Date().toISOString(),
  },
  {
    id: '7',
    name: 'Status',
    source_type: 'app',
    field_name: 'http',
    pattern: 'Response: (?<status>\\d+)',
    pattern_type: 'regex',
    priority: 50,
    enabled: 1,
    created_at: new Date().toISOString(),
  },
];

console.log('Input:', complexLog);
console.log('\nExtracted fields:');
const complexFields = extractFields(complexLog, regexPatterns);
console.log(JSON.stringify(complexFields, null, 2));

// Example 4: JSON Log Extraction
console.log('\n' + '='.repeat(80));
console.log('\n[4] JSON Log Extraction\n');
const jsonLog = '{"level":"error","timestamp":"2023-12-21T10:30:45Z","user_id":12345,"message":"Database connection failed","error":{"code":"ECONNREFUSED","details":"Connection timed out"}}';

console.log('Input:', jsonLog);
console.log('\nExtracted fields:');
const jsonFields = extractFields(jsonLog, []);
console.log(JSON.stringify(jsonFields, null, 2));

// Example 5: Stack Trace Parsing
console.log('\n' + '='.repeat(80));
console.log('\n[5] Stack Trace Parsing\n');
const stackTraceLog = `Error: Database connection timeout
    at Function.module.exports.connect (/app/database.js:45:12)
    at /app/server.js:23:5
    at Layer.handle [as handle_request] (/app/node_modules/express/lib/router/layer.js:95:5)`;

console.log('Input:', stackTraceLog);
console.log('\nParsed stack frames:');
const stackFrames = parseStackTrace(stackTraceLog);
if (stackFrames) {
  stackFrames.forEach((frame, i) => {
    console.log(`  [${i}] ${frame.methodName || '(anonymous)'}`);
    console.log(`      File: ${frame.file}`);
    console.log(`      Line: ${frame.lineNumber}, Column: ${frame.column}`);
  });
} else {
  console.log('  No stack trace found');
}

// Example 6: Pattern Testing
console.log('\n' + '='.repeat(80));
console.log('\n[6] Pattern Testing\n');

const testCases = [
  {
    name: 'Valid Grok Pattern',
    pattern: '%{IP:ip_address}',
    patternType: 'grok' as const,
    sample: 'Connection from 192.168.1.100',
  },
  {
    name: 'Valid Regex Pattern',
    pattern: 'Temperature: (?<temp>\\d+)°C',
    patternType: 'regex' as const,
    sample: 'Temperature: 25°C',
  },
  {
    name: 'Invalid Pattern (no match)',
    pattern: '%{EMAIL:email}',
    patternType: 'grok' as const,
    sample: 'This has no email address',
  },
];

testCases.forEach((testCase, i) => {
  console.log(`\nTest ${i + 1}: ${testCase.name}`);
  console.log(`  Pattern: ${testCase.pattern}`);
  console.log(`  Sample: ${testCase.sample}`);

  const result = testPattern(testCase.pattern, testCase.patternType, testCase.sample);

  if (result.success) {
    console.log('  ✓ Success!');
    console.log('  Fields:', JSON.stringify(result.fields));
  } else {
    console.log('  ✗ Failed');
    console.log('  Error:', result.error);
  }
});

// Example 7: Built-in Patterns
console.log('\n' + '='.repeat(80));
console.log('\n[7] Built-in Patterns Available\n');

const builtInPatterns = getBuiltInPatterns();
console.log(`Total built-in patterns: ${builtInPatterns.length}\n`);

builtInPatterns.forEach((pattern, i) => {
  console.log(`${i + 1}. ${pattern.name}`);
  console.log(`   Source Type: ${pattern.source_type}`);
  console.log(`   Type: ${pattern.pattern_type}`);
  console.log(`   Priority: ${pattern.priority}`);
  console.log(`   Description: ${pattern.description}`);
  console.log();
});

console.log('='.repeat(80));
console.log('Demo Complete!');
console.log('='.repeat(80));
