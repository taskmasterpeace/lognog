# Field Extraction Guide

> **Parse Any Log Format** - Transform unstructured logs into queryable fields

Field extraction is the foundation of log analytics. It parses your raw log messages and extracts meaningful data points that you can search, filter, and aggregate.

## Table of Contents

- [Overview](#overview)
- [Extraction Types](#extraction-types)
  - [Grok Patterns](#grok-patterns)
  - [Regular Expressions](#regular-expressions)
  - [JSON Parsing](#json-parsing)
- [Built-in Patterns](#built-in-patterns)
- [Creating Extractions](#creating-extractions)
- [Testing and Debugging](#testing-and-debugging)
- [Best Practices](#best-practices)
- [Examples](#examples)

---

## Overview

When logs arrive in LogNog, they contain a raw message field. Field extraction parses this message and creates structured fields:

**Before extraction:**
```
Dec 11 10:15:32 router kernel: [UFW BLOCK] IN=eth0 SRC=192.168.1.100 DST=10.0.0.1 PROTO=TCP DPT=22
```

**After extraction:**
```json
{
  "action": "BLOCK",
  "interface": "eth0",
  "source_ip": "192.168.1.100",
  "dest_ip": "10.0.0.1",
  "protocol": "TCP",
  "dest_port": 22
}
```

Now you can query: `search source_ip=192.168.1.100 dest_port=22`

---

## Extraction Types

### Grok Patterns

Grok is a friendly pattern matching syntax using named patterns. Think of it as "regex with training wheels."

**Common Grok Patterns:**

| Pattern | Matches | Example |
|---------|---------|---------|
| `%{IP}` | IPv4/IPv6 addresses | `192.168.1.1` |
| `%{HOSTNAME}` | Hostnames | `server01.local` |
| `%{NUMBER}` | Any number | `42`, `3.14` |
| `%{WORD}` | Single word | `ERROR` |
| `%{GREEDYDATA}` | Everything remaining | `any text here...` |
| `%{TIMESTAMP_ISO8601}` | ISO timestamps | `2025-12-11T10:15:32Z` |
| `%{LOGLEVEL}` | Log levels | `INFO`, `WARN`, `ERROR` |
| `%{MAC}` | MAC addresses | `00:1A:2B:3C:4D:5E` |
| `%{URI}` | Full URIs | `https://example.com/path` |
| `%{UUID}` | UUIDs | `550e8400-e29b-41d4-a716-446655440000` |
| `%{HTTPDATE}` | HTTP date format | `10/Oct/2000:13:55:36 -0700` |

**Named capture:** `%{PATTERN:field_name}` captures the match as a field.

**Example - Apache Access Log:**
```
%{IPORHOST:client_ip} - %{USER:user} \[%{HTTPDATE:timestamp}\] "%{WORD:method} %{NOTSPACE:path} HTTP/%{NUMBER:version}" %{NUMBER:status} %{NUMBER:bytes}
```

### Regular Expressions

For more control, use standard regex with named capture groups.

**Syntax:** `(?P<field_name>pattern)` or `(?<field_name>pattern)`

**Example - Extract user from SSH log:**
```regex
Failed password for (?P<user>\S+) from (?P<ip>\d+\.\d+\.\d+\.\d+)
```

### JSON Parsing

LogNog automatically parses JSON log messages. If your logs are JSON-formatted:

```json
{"level":"info","msg":"User logged in","user":"john","timestamp":"2025-12-11T10:00:00Z"}
```

Fields are automatically extracted:
- `json_level` = "info"
- `json_msg` = "User logged in"
- `user` (available in structured_data)

---

## Built-in Patterns

LogNog includes 10 pre-configured extraction patterns:

| Pattern Name | Source Type | Description |
|--------------|-------------|-------------|
| Apache Combined Log | `apache` | Apache combined access log format |
| Apache Common Log | `apache` | Apache common access log format |
| Nginx Access Log | `nginx` | Nginx access log format |
| Syslog | `syslog` | Standard syslog format |
| Error Log | `error` | Timestamp and level extraction |
| HTTP Status Code | `http` | HTTP status codes (100-599) |
| IPv4 Address | `network` | IPv4 addresses |
| JSON Line | `json` | JSON-formatted logs |
| Key-Value Pairs | `kv` | `key=value` format |
| Stack Traces | `exception` | Java, Python, JavaScript traces |

---

## Creating Extractions

### Via API

```bash
curl -X POST http://localhost:4000/api/knowledge/field-extractions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "name": "ssh_auth_events",
    "pattern": "Failed password for (?P<user>\\S+) from (?P<ip>\\S+)",
    "type": "regex",
    "source_type": "syslog",
    "priority": 5,
    "enabled": true
  }'
```

### Via UI

1. Go to **Knowledge > Field Extractions**
2. Click **+ New Extraction**
3. Choose extraction type (Grok or Regex)
4. Enter the pattern
5. Test with sample log lines
6. Save

---

## Testing and Debugging

### Test an Extraction

```bash
curl -X POST http://localhost:4000/api/knowledge/field-extractions/test \
  -H "Content-Type: application/json" \
  -d '{
    "pattern": "%{IP:client_ip} - %{WORD:method} %{NOTSPACE:path}",
    "type": "grok",
    "sample": "192.168.1.1 - GET /api/users"
  }'
```

**Response:**
```json
{
  "success": true,
  "fields": {
    "client_ip": "192.168.1.1",
    "method": "GET",
    "path": "/api/users"
  }
}
```

### Debug Tips

1. **Start simple** - Get basic fields working first, then add complexity
2. **Use sample logs** - Test with real log lines from your systems
3. **Check escaping** - Backslashes need double-escaping in JSON: `\\d` not `\d`
4. **Verify field names** - Use lowercase, underscores, no spaces

---

## Best Practices

### Naming Conventions

- Use `snake_case` for field names: `client_ip`, `response_time`
- Prefix vendor-specific fields: `nginx_upstream_time`, `aws_request_id`
- Use consistent names across extractions: always `src_ip` or always `source_ip`

### Performance

- **Be specific** - Avoid `.*` when possible; use `\S+` or `[^"]+`
- **Order patterns** - Put most common patterns first (lower priority number)
- **Use source_type** - Limit which logs the pattern applies to

### Common Patterns

**IP Address:**
```
(?P<ip>\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})
```

**Timestamp (ISO 8601):**
```
(?P<timestamp>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))
```

**HTTP Status:**
```
(?P<status>[1-5]\d{2})
```

**Email:**
```
(?P<email>[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})
```

---

## Examples

### Firewall Log (UFW)

**Log:**
```
[UFW BLOCK] IN=eth0 SRC=192.168.1.100 DST=10.0.0.1 PROTO=TCP DPT=22
```

**Pattern (Grok):**
```
\[UFW %{WORD:action}\] IN=%{WORD:interface} SRC=%{IP:src_ip} DST=%{IP:dst_ip} PROTO=%{WORD:protocol} DPT=%{NUMBER:dst_port}
```

### Nginx Access Log

**Log:**
```
192.168.1.1 - - [11/Dec/2025:10:30:00 +0000] "GET /api/users HTTP/1.1" 200 1234 "-" "curl/7.68.0" 0.045
```

**Pattern (Grok):**
```
%{IP:client_ip} - - \[%{HTTPDATE:timestamp}\] "%{WORD:method} %{NOTSPACE:path} HTTP/%{NUMBER:version}" %{NUMBER:status} %{NUMBER:bytes} "%{DATA:referer}" "%{DATA:user_agent}" %{NUMBER:response_time}
```

### Application JSON Log

**Log:**
```json
{"level":"error","msg":"Database connection failed","service":"api","error":"ECONNREFUSED","host":"db01"}
```

**Extraction:** Automatic (JSON logs are parsed automatically)

**Result:**
- `json_level` = "error"
- `json_msg` = "Database connection failed"
- `structured_data.service` = "api"
- `structured_data.error` = "ECONNREFUSED"

### SSH Authentication

**Log:**
```
Dec 11 10:15:32 server sshd[12345]: Failed password for invalid user admin from 192.168.1.100 port 22
```

**Pattern (Regex):**
```
Failed password for (?:invalid user )?(?P<user>\S+) from (?P<src_ip>\S+) port (?P<src_port>\d+)
```

---

## Related Documentation

- [Knowledge Management](./KNOWLEDGE_MANAGEMENT.md) - Full knowledge objects guide
- [DSL Reference](./DSL_REFERENCE.md) - Query extracted fields
- [Use Cases](./USE_CASES.md) - Real-world extraction examples
