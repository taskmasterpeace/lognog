# Field Extraction with Grok Patterns

This document describes the Grok pattern-based field extraction feature in LogNog API.

## Overview

The field extraction service allows you to extract structured fields from unstructured log messages using:
- **Grok patterns** - Powerful pattern matching using pre-defined patterns (similar to Logstash)
- **Regular expressions** - Custom regex patterns for fine-grained control
- **JSON parsing** - Automatic extraction from JSON log lines
- **Stack trace parsing** - Automatic detection and parsing of JavaScript, Python, and Java stack traces

## Features

### 1. Grok Pattern Support

Grok patterns are pre-defined named patterns that make it easy to parse common log formats:

```typescript
// Apache access log extraction
const pattern = '%{IPORHOST:client_ip} - %{USER:user} [%{HTTPDATE:timestamp}] "%{WORD:method} %{NOTSPACE:path} HTTP/%{NUMBER:version}" %{NUMBER:status} %{NUMBER:bytes}';

const logLine = '192.168.1.100 - frank [10/Oct/2000:13:55:36 -0700] "GET /apache_pb.gif HTTP/1.0" 200 2326';

// Extracted fields:
// {
//   "client_ip": "192.168.1.100",
//   "user": "frank",
//   "timestamp": "10/Oct/2000:13:55:36 -0700",
//   "method": "GET",
//   "path": "/apache_pb.gif",
//   "version": "1.0",
//   "status": "200",
//   "bytes": "2326"
// }
```

### 2. Built-in Patterns

The service includes 10 pre-configured patterns for common log types:

| Pattern Name | Source Type | Description |
|--------------|-------------|-------------|
| Apache Combined Log | `apache` | Extracts fields from Apache combined access log format |
| Apache Common Log | `apache` | Extracts fields from Apache common access log format |
| Nginx Access Log | `nginx` | Extracts fields from Nginx access log format |
| Syslog | `syslog` | Extracts fields from standard syslog format |
| Error Log | `error` | Extracts timestamp and level from error logs |
| HTTP Status Code | `http` | Extracts HTTP status codes (100-599) |
| IPv4 Address | `network` | Extracts IPv4 addresses |
| Email Address | `email` | Extracts email addresses |
| UUID | `uuid` | Extracts UUID identifiers |
| Duration (ms) | `performance` | Extracts duration in milliseconds |

### 3. Custom Regex Patterns

For cases where Grok patterns aren't flexible enough:

```typescript
// Extract temperature readings
const pattern = 'Temperature: (?<temp>\\d+)°C';
const logLine = 'Temperature: 25°C in room 101';

// Extracted: { "temp": "25" }
```

### 4. JSON Log Parsing

Automatically detects and parses JSON logs with nested object flattening:

```json
{
  "level": "error",
  "user_id": 12345,
  "error": {
    "code": "ECONNREFUSED",
    "details": "Connection timed out"
  }
}
```

Extracts to:
```json
{
  "level": "error",
  "user_id": "12345",
  "error.code": "ECONNREFUSED",
  "error.details": "Connection timed out"
}
```

### 5. Stack Trace Parsing

Automatically detects and parses stack traces from:
- JavaScript/Node.js
- Python
- Java

```javascript
Error: Database connection timeout
    at Function.module.exports.connect (/app/database.js:45:12)
    at /app/server.js:23:5
```

Parsed to:
```json
[
  {
    "file": "/app/database.js",
    "lineNumber": 45,
    "column": 12,
    "methodName": "Function.module.exports.connect"
  },
  {
    "file": "/app/server.js",
    "lineNumber": 23,
    "column": 5,
    "methodName": ""
  }
]
```

## API Usage

### Field Extraction Service

```typescript
import {
  extractFields,
  testPattern,
  parseStackTrace,
  getBuiltInPatterns,
  applyFieldExtraction
} from './services/field-extractor.js';
```

#### Extract Fields from a Log Line

```typescript
const patterns: FieldExtraction[] = [
  {
    id: '1',
    name: 'Apache Access',
    source_type: 'apache',
    field_name: 'web',
    pattern: '%{IPORHOST:client_ip} - %{USER:user}',
    pattern_type: 'grok',
    priority: 10,
    enabled: 1,
    created_at: new Date().toISOString()
  }
];

const fields = extractFields(logLine, patterns);
// Returns: { "web.client_ip": "192.168.1.100", "web.user": "frank" }
```

#### Test a Pattern

```typescript
const result = testPattern(
  '%{IP:ip_address}',
  'grok',
  'Connection from 192.168.1.100'
);

if (result.success) {
  console.log('Extracted:', result.fields);
  // { "ip_address": "192.168.1.100" }
} else {
  console.log('Error:', result.error);
}
```

#### Apply Field Extraction to Search Results

```typescript
// In search route with extract_fields=true
const results = await executeQuery(sql);

if (extract_fields) {
  results = await applyFieldExtraction(results, source_type);
}
```

### REST API Endpoints

#### Get All Field Extractions

```bash
GET /field-extractions
GET /field-extractions?source_type=apache
```

#### Create Field Extraction

```bash
POST /field-extractions
Content-Type: application/json

{
  "name": "Nginx Access Log",
  "source_type": "nginx",
  "field_name": "web",
  "pattern": "%{IPORHOST:client_ip} - %{USER:user}",
  "pattern_type": "grok",
  "priority": 10,
  "enabled": true
}
```

#### Update Field Extraction

```bash
PUT /field-extractions/:id
Content-Type: application/json

{
  "enabled": false
}
```

#### Delete Field Extraction

```bash
DELETE /field-extractions/:id
```

#### Test a Pattern

```bash
POST /field-extractions/test
Content-Type: application/json

{
  "pattern": "%{IP:ip_address}",
  "pattern_type": "grok",
  "sample": "Connection from 192.168.1.100"
}
```

Response:
```json
{
  "success": true,
  "fields": {
    "ip_address": "192.168.1.100"
  },
  "message": "Pattern matched successfully"
}
```

#### Get Built-in Patterns

```bash
GET /field-extractions/built-in/patterns
```

#### Seed Built-in Patterns

```bash
POST /field-extractions/built-in/seed
Content-Type: application/json

{
  "overwrite": false
}
```

Response:
```json
{
  "success": true,
  "created": [
    "Apache Combined Log",
    "Nginx Access Log",
    "Syslog"
  ],
  "skipped": [],
  "total": 10,
  "message": "Seeded 10 patterns, skipped 0"
}
```

### Search with Field Extraction

```bash
POST /search/query
Content-Type: application/json

{
  "query": "search index=web | limit 100",
  "earliest": "-24h",
  "extract_fields": true,
  "source_type": "apache"
}
```

Response includes extracted fields:
```json
{
  "query": "search index=web | limit 100",
  "sql": "SELECT * FROM spunk.logs WHERE ...",
  "results": [
    {
      "timestamp": "2023-12-21T10:30:45Z",
      "message": "192.168.1.100 - frank [10/Oct/2000:13:55:36 -0700] ...",
      "extracted.web.client_ip": "192.168.1.100",
      "extracted.web.user": "frank",
      "extracted.web.method": "GET",
      "extracted.web.status": "200"
    }
  ],
  "count": 1,
  "fields_extracted": true
}
```

## Pattern Priority

When multiple patterns match the same log line, patterns are applied in priority order (lower number = higher priority). Fields extracted by higher-priority patterns will not be overwritten by lower-priority patterns.

```typescript
const patterns = [
  { priority: 10, pattern: '...' },  // Applied first
  { priority: 20, pattern: '...' },  // Applied second
  { priority: 100, pattern: '...' }  // Applied last
];
```

## Field Naming

Extracted fields can be prefixed with a namespace using the `field_name` property:

```typescript
{
  field_name: 'web',
  // Pattern extracts: client_ip, method, status
  // Results in: web.client_ip, web.method, web.status
}
```

Leave `field_name` empty to extract fields without a prefix.

## Common Grok Patterns

| Pattern | Description | Example |
|---------|-------------|---------|
| `%{IP:name}` | IPv4 address | `192.168.1.100` |
| `%{IPORHOST:name}` | IP or hostname | `192.168.1.100` or `example.com` |
| `%{USER:name}` | Username | `admin`, `-` |
| `%{WORD:name}` | Single word | `GET`, `POST` |
| `%{NUMBER:name}` | Number | `200`, `1024` |
| `%{DATA:name}` | Any data (non-greedy) | `any text` |
| `%{GREEDYDATA:name}` | Any data (greedy) | `rest of line...` |
| `%{HTTPDATE:name}` | HTTP date format | `10/Oct/2000:13:55:36 -0700` |
| `%{TIMESTAMP_ISO8601:name}` | ISO 8601 timestamp | `2023-12-21T10:30:45Z` |
| `%{SYSLOGTIMESTAMP:name}` | Syslog timestamp | `Dec 21 10:30:45` |
| `%{LOGLEVEL:name}` | Log level | `ERROR`, `WARN`, `INFO` |
| `%{EMAIL:name}` | Email address | `user@example.com` |
| `%{URI:name}` | URI/URL | `https://example.com/path` |
| `%{PATH:name}` | File path | `/var/log/app.log` |

## Testing

Run the test suite:
```bash
cd api
npm run test -- src/services/field-extractor.test.ts
```

Run the demo:
```bash
cd api
npx tsx src/services/field-extractor.demo.ts
```

## Performance

- Pattern compilation is cached for repeated use
- Field extraction adds ~1-5ms per log line
- Recommended to enable field extraction only when needed
- Use `source_type` filtering to limit patterns applied

## Best Practices

1. **Start simple** - Test patterns with the `/field-extractions/test` endpoint before saving
2. **Use priorities** - Assign lower priority numbers to more specific patterns
3. **Namespace fields** - Use `field_name` to avoid conflicts
4. **Disable unused patterns** - Set `enabled: false` for patterns not in use
5. **Filter by source_type** - Use source_type in search API to apply only relevant patterns
6. **Validate patterns** - Use the test endpoint to verify patterns match expected logs

## Dependencies

- **grok-js** (v3.3.1) - Grok pattern parsing
- **stacktrace-parser** (v0.1.11) - Stack trace parsing

## References

- [Grok Patterns](https://github.com/elastic/elasticsearch/blob/main/libs/grok/src/main/resources/patterns/)
- [Regular Expressions](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions)
