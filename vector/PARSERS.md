# Vector Log Parsers Documentation

This document describes the log parsing pipeline in the Vector configuration for LogNog.

## Overview

The Vector configuration includes a multi-stage parsing pipeline that automatically detects and parses various log formats:

```
Syslog Sources → merge_syslog → parse_json → parse_web_access → parse_kv → parse_stacktrace → parse_docker → final_route → ClickHouse
```

Each transform attempts to parse the log message, and if successful, adds structured fields to the event.

## Parsers

### 1. JSON Structured Logs (`parse_json`)

**Purpose**: Parse application logs that contain JSON in the message field.

**Common Sources**: Node.js, Python, Go, Java microservices

**Fields Extracted**:
- `log_type` = "json"
- `json_level` - Log level from JSON (info, error, warn, etc.)
- `json_msg` - Message field
- `json_message` - Alternative message field
- `json_timestamp` - Timestamp from JSON
- `json_logger` - Logger/component name
- `json_service` - Service name
- `json_data` - Full JSON object as string

**Behavior**:
- Updates `app_name` to service/logger if found
- Only triggers if message is valid JSON

**Example Input**:
```
<14>{"level":"info","msg":"User logged in","service":"auth-service","user":"john.doe","timestamp":"2025-12-11T10:30:00Z"}
```

**Example Output Fields**:
```
log_type: "json"
json_level: "info"
json_msg: "User logged in"
json_service: "auth-service"
app_name: "auth-service"
```

---

### 2. Apache/Nginx Access Logs (`parse_web_access`)

**Purpose**: Parse HTTP access logs in Common or Combined log format.

**Common Sources**: Apache, Nginx, HAProxy access logs

**Fields Extracted**:
- `log_type` = "web_access"
- `client_ip` - Client IP address
- `http_ident` - RFC 1413 identity
- `http_user` - Authenticated username
- `http_method` - HTTP method (GET, POST, etc.)
- `http_path` - Request path
- `http_version` - HTTP version (HTTP/1.1, HTTP/2)
- `http_status` - Response status code (200, 404, 500)
- `http_bytes` - Response size in bytes
- `http_referrer` - Referrer URL
- `http_user_agent` - User agent string
- `http_response_time` - Response time in seconds (if present)

**Behavior**:
- Sets `index_name` = "web"
- Overrides `source_ip` with client IP
- Updates `user` field if authenticated

**Supported Formats**:

**Common Log Format**:
```
192.168.1.100 - - [11/Dec/2025:10:32:00 -0700] "GET /index.html HTTP/1.1" 200 1234
```

**Combined Log Format**:
```
192.168.1.100 - - [11/Dec/2025:10:32:00 -0700] "GET /api/users HTTP/1.1" 200 1234 "http://example.com" "Mozilla/5.0"
```

**Nginx with response time**:
```
10.0.0.50 - admin [11/Dec/2025:10:33:00 -0700] "POST /api/orders HTTP/1.1" 201 567 "-" "curl/7.68.0" request_time=0.234
```

---

### 3. Key-Value Pairs (`parse_kv`)

**Purpose**: Parse logs with `key=value` format, common in network devices and security appliances.

**Common Sources**: Firewalls, routers, IDS/IPS systems, load balancers

**Fields Extracted**:
- `log_type` = "keyvalue"
- `kv_data` - Full parsed key-value pairs as JSON
- Common fields automatically mapped:
  - `host` → `hostname`
  - `user` → `user`
  - `src`, `src_ip` → `source_ip`
  - `dst`, `dst_ip` → `dest_ip`
  - `sport`, `src_port` → `source_port`
  - `dport`, `dst_port` → `dest_port`
  - `proto`, `protocol` → `protocol`
  - `action` → `action`

**Behavior**:
- Only triggers if at least 2 key=value pairs are detected
- Handles quoted values: `key="value with spaces"`
- Space-delimited by default

**Example Input**:
```
<14>action=ALLOW src=192.168.1.50 dst=8.8.8.8 sport=54321 dport=53 proto=UDP bytes=128
```

**Example Output Fields**:
```
log_type: "keyvalue"
source_ip: "192.168.1.50"
dest_ip: "8.8.8.8"
source_port: 54321
dest_port: 53
protocol: "UDP"
action: "ALLOW"
kv_data: {"action":"ALLOW","src":"192.168.1.50",...}
```

---

### 4. Stack Trace Detection (`parse_stacktrace`)

**Purpose**: Detect and parse exception stack traces from multiple languages.

**Supported Languages**: Java, Python, JavaScript/Node.js, .NET

**Fields Extracted**:
- `log_type` = "stacktrace"
- `stacktrace_language` - Language (java, python, javascript)
- `exception_type` - Exception class name
- `exception_message` - Exception message
- `exception_file` - Source file (if available)
- `exception_line` - Line number (if available)

**Behavior**:
- Sets `severity` = 3 (error level)
- Sets `index_name` = "errors"
- Detects multi-line stack traces

**Detection Patterns**:

**Java**:
```
java.lang.NullPointerException: Cannot invoke method on null object
    at com.example.UserService.getUser(UserService.java:42)
```

**Python**:
```
Traceback (most recent call last):
  File "/app/main.py", line 123, in process_data
AttributeError: NoneType object has no attribute get_value
```

**JavaScript**:
```
TypeError: Cannot read property 'name' of undefined
    at UserController.getName (/app/controllers/user.js:45:12)
```

**Example Output Fields**:
```
log_type: "stacktrace"
stacktrace_language: "java"
exception_type: "NullPointerException"
exception_message: "Cannot invoke method on null object"
exception_file: "UserService.java"
exception_line: 42
severity: 3
index_name: "errors"
```

---

### 5. Docker Container Labels (`parse_docker`)

**Purpose**: Extract Docker container metadata from logs.

**Common Sources**: Dockerized applications, Docker Compose services

**Fields Extracted**:
- `docker_enabled` - Boolean, true if Docker metadata found
- `docker_container_id` - Container ID (12-char hex)
- `docker_container_name` - Container name
- `docker_image_name` - Image name
- `docker_compose_project` - Compose project name
- `docker_compose_service` - Compose service name
- `docker_compose_instance` - Service instance number

**Detection Methods**:

1. **Hostname Pattern**: Detects 12-character hex hostnames (container IDs)
   ```
   hostname: "a1b2c3d4e5f6" → docker_container_id: "a1b2c3d4e5f6"
   ```

2. **Docker Compose Pattern**: Detects `project_service_instance` format
   ```
   app_name: "spunk_api_1" →
     docker_compose_project: "spunk"
     docker_compose_service: "api"
     docker_compose_instance: 1
   ```

3. **Structured Data**: Parses Docker metadata from syslog structured data
   ```json
   {"container_name": "web-server", "container_id": "abc123", "image_name": "nginx:latest"}
   ```

**Example Output Fields**:
```
docker_enabled: true
docker_compose_project: "spunk"
docker_compose_service: "api"
docker_compose_instance: 1
```

---

## Parser Pipeline Flow

The parsers are chained together, and each parser:

1. Receives the event from the previous parser
2. Attempts to detect its specific log format
3. If matched, extracts fields and sets `log_type`
4. If not matched, passes the event unchanged to the next parser
5. Previous parsers' fields are preserved (non-destructive)

This means a single log can have fields from multiple parsers. For example:
- A JSON log from a Docker container will have both `json_*` and `docker_*` fields
- A web access log with key-value parameters will have both `http_*` and `kv_*` fields

## Default Fallback

If no parser matches, the log retains:
- `log_type` = "syslog" (default)
- All standard syslog fields (hostname, severity, facility, message)
- Basic IP extraction from merge_syslog transform

## Testing Parsers

### Send Test Messages

**Linux/macOS**:
```bash
bash test-log-parsers.sh
```

**Windows**:
```batch
test-log-parsers.bat
```

### Query Parsed Logs

**Connect to ClickHouse**:
```bash
docker exec -it spunk-clickhouse clickhouse-client --user spunk --password spunk123 --database spunk
```

**View log types**:
```sql
SELECT log_type, count() as count
FROM logs
GROUP BY log_type
ORDER BY count DESC;
```

**View JSON logs**:
```sql
SELECT timestamp, json_level, json_service, json_msg
FROM logs
WHERE log_type = 'json'
ORDER BY timestamp DESC
LIMIT 10;
```

**View web access logs**:
```sql
SELECT timestamp, client_ip, http_method, http_path, http_status, http_bytes
FROM logs
WHERE log_type = 'web_access'
ORDER BY timestamp DESC
LIMIT 10;
```

**View stack traces**:
```sql
SELECT timestamp, stacktrace_language, exception_type, exception_message, exception_file
FROM logs
WHERE log_type = 'stacktrace'
ORDER BY timestamp DESC
LIMIT 10;
```

**View Docker logs**:
```sql
SELECT timestamp, docker_compose_service, hostname, message
FROM logs
WHERE docker_enabled = true
ORDER BY timestamp DESC
LIMIT 10;
```

## Performance Considerations

- **Parsing Overhead**: Each parser adds ~1-5ms per log event
- **Regex Complexity**: Complex regexes can impact throughput
- **Field Count**: More extracted fields = larger storage requirements
- **Batching**: Vector batches 10,000 events before sending to ClickHouse

**Typical Performance**:
- Simple logs (syslog only): ~50,000 logs/sec
- With all parsers: ~10,000-20,000 logs/sec
- JSON parsing: ~30,000 logs/sec

## Adding Custom Parsers

To add a new parser:

1. Create a new transform in `vector.toml`:
```toml
[transforms.parse_custom]
type = "remap"
inputs = ["previous_parser"]
source = '''
# Your VRL parsing logic here
'''
```

2. Add to the pipeline by updating the `inputs` of the next parser

3. Set `log_type` to identify the format

4. Extract fields following naming conventions

5. Validate with `docker exec spunk-vector vector validate`

## Field Naming Conventions

- **Prefix by type**: `http_*`, `json_*`, `docker_*`, `exception_*`
- **Use underscores**: `source_ip` not `sourceIP`
- **Be descriptive**: `http_response_time` not `rt`
- **Lowercase**: All field names lowercase
- **No special chars**: Only alphanumeric and underscores

## Troubleshooting

### Parser not working

1. **Check logs are reaching Vector**:
   ```bash
   docker logs spunk-vector
   ```

2. **Enable console sink** (uncomment in vector.toml):
   ```bash
   docker logs spunk-vector | grep "console"
   ```

3. **Verify regex patterns**:
   - Use https://regex101.com/ to test
   - Check for escaping issues

4. **Validate configuration**:
   ```bash
   docker exec spunk-vector vector validate
   ```

### Performance issues

1. **Disable unused parsers**: Comment out parsers you don't need
2. **Simplify regexes**: Use more specific patterns
3. **Increase batch size**: Adjust `batch.max_events` in sink
4. **Monitor Vector metrics**: http://localhost:8686/metrics

### Missing fields

1. **Check parser order**: Ensure parsers don't override each other
2. **Verify field names**: Case-sensitive, check for typos
3. **Check ClickHouse schema**: Ensure fields exist in table
4. **Enable skip_unknown_fields**: Already enabled in sink config
