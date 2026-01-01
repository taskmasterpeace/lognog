# Database Log Templates - LogNog Phase 4 Implementation

## Overview

LogNog now includes pre-built source templates for common database log formats. These templates help users quickly onboard MySQL, PostgreSQL, and MongoDB logs with pre-configured field extraction patterns and setup instructions.

## Available Templates

### 1. MySQL Error Log Template

**Template ID:** `mysql-error`
**Source Type:** `mysql_error`
**Category:** `database`

Captures MySQL server error logs including startup, shutdown, and error events.

**Extracted Fields:**
- `timestamp` - ISO 8601 timestamp
- `thread_id` - MySQL thread ID
- `level` - Log level (Warning, Error, Note)
- `error_code` - MySQL error code (MY-XXXXX)
- `subsystem` - MySQL subsystem (Server, InnoDB, etc.)

**Sample Log:**
```
2025-01-15T10:23:45.123456Z 0 [Warning] [MY-010055] [Server] IP address '192.168.1.100' could not be resolved.
```

**Example Query:**
```
search source_type=mysql_error level=Error | stats count by error_code | sort desc
```

### 2. MySQL Slow Query Log Template

**Template ID:** `mysql-slow`
**Source Type:** `mysql_slow`
**Category:** `database`

Analyzes MySQL slow query logs for performance optimization.

**Extracted Fields:**
- `query_time` - Total query execution time in seconds
- `lock_time` - Time spent waiting for locks
- `rows_sent` - Number of rows returned
- `rows_examined` - Number of rows examined
- `database` - Database name
- `user` - MySQL user

**Sample Log:**
```
# Time: 2025-01-15T10:23:45.123456Z
# User@Host: appuser[appuser] @ localhost []
# Query_time: 5.123456  Lock_time: 0.000123  Rows_sent: 1000  Rows_examined: 1000000
use mydb;
SELECT * FROM large_table WHERE status = "pending";
```

**Example Query:**
```
search source_type=mysql_slow | stats avg(query_time) p95(query_time) max(query_time) by database | sort desc p95
```

### 3. PostgreSQL Log Template

**Template ID:** `postgresql`
**Source Type:** `postgresql`
**Category:** `database`

Handles PostgreSQL server logs including queries, errors, and connections.

**Extracted Fields:**
- `timestamp` - Log timestamp
- `pid` - Process ID
- `user` - Database user
- `database` - Database name
- `level` - Log level (LOG, ERROR, WARNING, FATAL, PANIC, DEBUG)
- `duration` - Query duration in milliseconds
- `statement` - SQL statement

**Sample Log:**
```
2025-01-15 10:23:45.123 UTC [12345] appuser@mydb LOG:  duration: 1523.456 ms  statement: SELECT * FROM users WHERE status = $1
```

**Example Query:**
```
search source_type=postgresql level=ERROR | stats count by database | sort desc
```

### 4. MongoDB Log Template

**Template ID:** `mongodb`
**Source Type:** `mongodb`
**Category:** `database`

Processes MongoDB server logs in JSON format (MongoDB 4.4+).

**Extracted Fields:**
- `timestamp` - Timestamp from JSON ($.t.$date)
- `severity` - F=Fatal, E=Error, W=Warning, I=Info, D=Debug
- `component` - MongoDB component (COMMAND, QUERY, NETWORK, etc.)
- `context` - Context/connection ID
- `message` - Log message
- `duration_ms` - Operation duration in milliseconds

**Sample Log:**
```json
{"t":{"$date":"2025-01-15T10:23:45.123+00:00"},"s":"I","c":"COMMAND","ctx":"conn123","msg":"Slow query","attr":{"durationMillis":1523,"command":"find","ns":"mydb.users"}}
```

**Example Query:**
```
search source_type=mongodb severity=E | stats count by component | sort desc
```

## API Endpoints

### Get All Templates
```bash
GET /templates
GET /templates?category=database
```

Returns all available templates, optionally filtered by category.

**Response:**
```json
[
  {
    "id": "mysql-error",
    "name": "MySQL Error Log",
    "source_type": "mysql_error",
    "category": "database",
    "description": "MySQL server error log...",
    "field_extractions": [...],
    "sample_log": "...",
    "sample_query": "..."
  }
]
```

### Get Templates by Category
```bash
GET /templates/by-category
```

Returns templates grouped by category (database, security, web, system, application).

### Get Single Template
```bash
GET /templates/:id
```

Returns detailed information about a specific template.

### Test Template
```bash
POST /templates/:id/test
Content-Type: application/json

{
  "log_line": "2025-01-15T10:23:45.123456Z 0 [Warning] [MY-010055] [Server] Test message"
}
```

**Response:**
```json
{
  "valid": true,
  "errors": [],
  "warnings": [],
  "extracted_fields": {
    "timestamp": "2025-01-15T10:23:45.123456Z",
    "thread_id": "0",
    "level": "Warning",
    "error_code": "010055",
    "subsystem": "Server"
  }
}
```

### Create Custom Template
```bash
POST /templates
Content-Type: application/json

{
  "name": "Custom Database Log",
  "source_type": "custom_db",
  "category": "database",
  "description": "My custom database log format",
  "field_extractions": [...]
}
```

### Get Template Statistics
```bash
GET /templates/stats
```

Returns statistics about available templates:
```json
{
  "total": 10,
  "by_category": {
    "database": 4,
    "security": 2,
    "web": 3,
    "system": 1,
    "application": 0
  },
  "built_in": 9,
  "custom": 1
}
```

## Setup Instructions

### MySQL Error Log

1. **Enable Error Logging** in `my.cnf` or `my.ini`:
```ini
[mysqld]
log_error = /var/log/mysql/error.log
log_error_verbosity = 3  # 1=errors, 2=errors+warnings, 3=all
```

2. **Configure LogNog In Agent**:
```yaml
file_inputs:
  - path: /var/log/mysql/error.log
    source_type: mysql_error
```

3. **Alternative: Syslog**:
```ini
[mysqld]
log_syslog=ON
log_syslog_tag=mysql
```

### MySQL Slow Query Log

1. **Enable Slow Query Logging** in `my.cnf`:
```ini
[mysqld]
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 1        # Queries taking > 1 second
log_queries_not_using_indexes = 1
log_slow_admin_statements = 1
```

2. **Verify Configuration**:
```sql
SHOW VARIABLES LIKE 'slow_query%';
SHOW VARIABLES LIKE 'long_query_time';
```

3. **Configure LogNog In Agent** (with multiline support):
```yaml
file_inputs:
  - path: /var/log/mysql/slow.log
    source_type: mysql_slow
    multiline:
      pattern: '^# Time:'
      negate: true
      match: after
```

### PostgreSQL

**Option 1: Syslog (Recommended)**

In `postgresql.conf`:
```
log_destination = 'syslog'
syslog_facility = 'LOCAL0'
syslog_ident = 'postgres'
```

Configure rsyslog to forward to LogNog:
```
local0.* @lognog-server:514
```

**Option 2: File-based**

In `postgresql.conf`:
```
logging_collector = on
log_directory = '/var/log/postgresql'
log_filename = 'postgresql-%Y-%m-%d.log'
log_statement = 'all'           # or 'ddl', 'mod'
log_min_duration_statement = 1000  # Log queries > 1s
log_line_prefix = '%t [%p] %u@%d '
```

Configure agent:
```yaml
file_inputs:
  - path: /var/log/postgresql/postgresql-*.log
    source_type: postgresql
```

### MongoDB

MongoDB 4.4+ outputs structured JSON logs by default.

**Configuration** (`mongod.conf`):
```yaml
systemLog:
  destination: file
  path: /var/log/mongodb/mongod.log
  logAppend: true
  verbosity: 0  # 0-5, higher = more verbose
```

**Increase Log Verbosity** (optional):
```javascript
db.setLogLevel(1, "command")
db.setLogLevel(1, "query")
```

**Configure Agent**:
```yaml
file_inputs:
  - path: /var/log/mongodb/mongod.log
    source_type: mongodb
```

## Alert Templates

Each database template includes pre-configured alert templates:

### MySQL Error Alerts
1. **MySQL Critical Error** - Triggered on any Error level log
2. **MySQL Connection Errors** - Triggered when 10+ connection errors occur

### MySQL Slow Query Alerts
1. **MySQL Slow Query Detected** - Triggered when query_time > 10 seconds

### PostgreSQL Alerts
1. **PostgreSQL Fatal Error** - Triggered on FATAL or PANIC level logs
2. **PostgreSQL Slow Query** - Triggered when duration > 5000ms occurs 5+ times

### MongoDB Alerts
1. **MongoDB Error Detected** - Triggered on Error or Fatal severity logs
2. **MongoDB Slow Query** - Triggered when duration_ms > 5000 occurs 5+ times

## Sample Dashboards

You can create dashboards using these queries:

### MySQL Performance Dashboard
```
# Panel 1: Error Count by Error Code
search source_type=mysql_error level=Error | stats count by error_code | sort desc | limit 10

# Panel 2: Slow Query Performance
search source_type=mysql_slow | stats avg(query_time) p95(query_time) max(query_time) by database

# Panel 3: Top Slow Queries
search source_type=mysql_slow | stats max(query_time) by database | sort desc
```

### PostgreSQL Monitoring Dashboard
```
# Panel 1: Error Distribution
search source_type=postgresql level=ERROR | stats count by database

# Panel 2: Query Performance
search source_type=postgresql duration>0 | stats avg(duration) p95(duration) by database

# Panel 3: Connection Activity
search source_type=postgresql message~"connection" | stats count by level
```

### MongoDB Operations Dashboard
```
# Panel 1: Error Rate
search source_type=mongodb severity=E OR severity=F | stats count by component

# Panel 2: Slow Operations
search source_type=mongodb duration_ms>1000 | stats avg(duration_ms) p95(duration_ms) by component

# Panel 3: Operation Volume
search source_type=mongodb | stats count by component
```

## Field Extraction Patterns

Templates use three types of field extraction patterns:

### 1. Regex Patterns
Standard regular expressions with a single capture group:
```json
{
  "field_name": "error_code",
  "pattern": "\\[MY-(\\d+)\\]",
  "pattern_type": "regex",
  "description": "MySQL error code"
}
```

### 2. Grok Patterns
Grok-style patterns (currently treated as regex):
```json
{
  "field_name": "user",
  "pattern": "user=(\\w+)",
  "pattern_type": "grok",
  "description": "Database user"
}
```

### 3. JSON Path
For JSON-formatted logs (like MongoDB):
```json
{
  "field_name": "severity",
  "pattern": "$.s",
  "pattern_type": "json_path",
  "description": "F=Fatal, E=Error, W=Warning, I=Info, D=Debug"
}
```

## Implementation Details

### Files Created/Modified

| File | Purpose |
|------|---------|
| `api/src/data/builtin-templates.ts` | Built-in template definitions |
| `api/src/routes/templates.ts` | Template API endpoints |
| `api/src/services/templates.ts` | Template business logic |
| `api/src/db/sqlite.ts` | Database schema (already existed) |
| `api/src/index.ts` | Register routes and seed templates |

### Database Schema

The `source_templates` table in SQLite stores all templates:

```sql
CREATE TABLE source_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  description TEXT,
  setup_instructions TEXT,
  agent_config_example TEXT,
  syslog_config_example TEXT,
  field_extractions TEXT,  -- JSON
  default_index TEXT DEFAULT 'main',
  default_severity INTEGER DEFAULT 6,
  sample_log TEXT,
  sample_query TEXT,
  icon TEXT,
  dashboard_widgets TEXT,  -- JSON
  alert_templates TEXT,    -- JSON
  enabled INTEGER DEFAULT 1,
  built_in INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

### Seeding Process

Built-in templates are seeded automatically on server startup:

1. Server starts
2. `seedBuiltinTemplates()` is called
3. For each template, check if `source_type` already exists
4. If not, create the template with `built_in = 1`
5. Skip existing templates (idempotent)

Built-in templates cannot be modified or deleted through the API.

## Testing

### Test Template Extraction
```bash
curl -X POST http://localhost:4000/templates/mysql-error/test \
  -H "Content-Type: application/json" \
  -d '{
    "log_line": "2025-01-15T10:23:45.123456Z 0 [Error] [MY-013236] [Server] The designated data directory /var/lib/mysql/ is unusable."
  }'
```

### List All Database Templates
```bash
curl http://localhost:4000/templates?category=database | jq
```

### Get Template Details
```bash
curl http://localhost:4000/templates/mysql-slow | jq
```

## Next Steps

Future enhancements for the template system:

1. **UI Components** - Create a visual template browser and setup wizard in the LogNog UI
2. **Template Marketplace** - Allow users to share custom templates
3. **Auto-Detection** - Automatically suggest templates based on log format analysis
4. **Template Versioning** - Track template versions and allow updates
5. **Additional Templates** - Add more database types (Redis, Cassandra, Oracle, SQL Server)
6. **Field Transformations** - Add post-extraction field transformations (type conversion, parsing)
7. **Multi-line Support** - Enhanced multi-line pattern support in templates
8. **Validation Tools** - CLI tools to validate custom templates

## References

- [Implementation Roadmap](./IMPLEMENTATION-ROADMAP.md) - Full implementation plan
- [LogNog Agent Documentation](../agent/README.md) - Agent configuration
- [DSL Reference](./DSL_REFERENCE.md) - Query language documentation
- [LogNog Guide](./LOGNOG-GUIDE.md) - Complete user guide with API reference
