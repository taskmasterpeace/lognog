# Knowledge Management API

This document describes the Knowledge Management API endpoints available at `/knowledge`.

## Field Extractions

Field extractions allow you to define patterns (grok or regex) to extract structured fields from unstructured log data based on source type.

### Endpoints

- **GET /knowledge/field-extractions** - List all field extractions
  - Query params: `source_type` (optional) - Filter by source type
- **POST /knowledge/field-extractions** - Create new extraction
  - Body: `{ name, source_type, field_name, pattern, pattern_type, priority?, enabled? }`
- **PUT /knowledge/field-extractions/:id** - Update extraction
  - Body: Any of `{ name, source_type, field_name, pattern, pattern_type, priority, enabled }`
- **DELETE /knowledge/field-extractions/:id** - Delete extraction
- **POST /knowledge/field-extractions/:id/test** - Test extraction against sample log line
  - Body: `{ log_line }`

### Example

```json
POST /knowledge/field-extractions
{
  "name": "Apache Access Log",
  "source_type": "apache:access",
  "field_name": "request_info",
  "pattern": "%{COMBINEDAPACHELOG}",
  "pattern_type": "grok",
  "priority": 100,
  "enabled": true
}
```

**Testing Example:**
```json
POST /knowledge/field-extractions/:id/test
{
  "log_line": "127.0.0.1 - - [10/Oct/2000:13:55:36 -0700] \"GET /apache_pb.gif HTTP/1.0\" 200 2326"
}

Response:
{
  "success": true,
  "extracted_fields": {
    "clientip": "127.0.0.1",
    "ident": "-",
    "auth": "-",
    "timestamp": "10/Oct/2000:13:55:36 -0700",
    "verb": "GET",
    "request": "/apache_pb.gif",
    "httpversion": "1.0",
    "response": "200",
    "bytes": "2326"
  },
  "field_name": "request_info",
  "pattern_type": "grok"
}
```

## Event Types

Event types allow you to categorize and identify events based on search criteria with priority ordering.

### Endpoints

- **GET /knowledge/event-types** - List all event types (ordered by priority)
- **POST /knowledge/event-types** - Create new event type
  - Body: `{ name, search_string, description?, priority?, enabled? }`
- **PUT /knowledge/event-types/:id** - Update event type
  - Body: Any of `{ name, search_string, description, priority, enabled }`
- **DELETE /knowledge/event-types/:id** - Delete event type

### Example

```json
POST /knowledge/event-types
{
  "name": "Failed SSH Login",
  "search_string": "app=sshd message~\"Failed password\"",
  "description": "Identifies failed SSH login attempts",
  "priority": 80,
  "enabled": true
}
```

## Tags

Tags allow you to label specific field values for categorization and enrichment. Tags are associated with a field and value pair.

### Endpoints

- **GET /knowledge/tags** - List all tags
  - Query params: `field` (optional) - Filter by field name
- **GET /knowledge/tags/by-value** - Get tags by field and value
  - Query params: `field` and `value` (required)
- **POST /knowledge/tags** - Create new tag
  - Body: `{ tag_name, field, value }`
- **DELETE /knowledge/tags/:id** - Delete tag

### Example

```json
POST /knowledge/tags
{
  "tag_name": "security",
  "field": "app_name",
  "value": "sshd"
}
```

**Querying tags by value:**
```
GET /knowledge/tags/by-value?field=app_name&value=sshd

Response:
[
  {
    "id": "uuid",
    "tag_name": "security",
    "field": "app_name",
    "value": "sshd",
    "created_at": "2025-01-15T10:30:00Z"
  }
]
```

## Lookups

Lookups allow you to enrich events with additional data from lookup tables. Supports both manual (in-database) and CSV file-based lookups.

### Endpoints

- **GET /knowledge/lookups** - List all lookups
- **GET /knowledge/lookups/by-name/:name** - Get lookup by name
- **POST /knowledge/lookups** - Create lookup
  - Body: `{ name, type, key_field, output_fields, data?, file_path? }`
- **PUT /knowledge/lookups/:id** - Update lookup
  - Body: Any of `{ name, type, key_field, output_fields, data, file_path }`
- **DELETE /knowledge/lookups/:id** - Delete lookup
- **GET /knowledge/lookups/:id/search?key=<key>** - Search lookup by key

### Example

```json
POST /knowledge/lookups
{
  "name": "IP to Location",
  "type": "manual",
  "key_field": "ip_address",
  "output_fields": ["location", "datacenter", "region"],
  "data": [
    {
      "ip_address": "192.168.1.1",
      "location": "Office - New York",
      "datacenter": "NYC-DC1",
      "region": "us-east"
    },
    {
      "ip_address": "192.168.1.2",
      "location": "Office - San Francisco",
      "datacenter": "SFO-DC1",
      "region": "us-west"
    }
  ]
}
```

**Searching a lookup:**
```
GET /knowledge/lookups/:id/search?key=192.168.1.1

Response:
{
  "key": "192.168.1.1",
  "found": true,
  "data": {
    "location": "Office - New York",
    "datacenter": "NYC-DC1",
    "region": "us-east"
  }
}
```

**CSV Lookup Example:**
```json
POST /knowledge/lookups
{
  "name": "User Directory",
  "type": "csv",
  "key_field": "username",
  "output_fields": ["full_name", "department", "email"],
  "file_path": "/lookups/users.csv"
}
```

## Workflow Actions

Workflow actions define custom actions that can be triggered from search results for specific fields (e.g., open external tools, create tickets, execute scripts).

### Endpoints

- **GET /knowledge/workflow-actions** - List all workflow actions
  - Query params: `field` (optional) - Filter by field name
- **POST /knowledge/workflow-actions** - Create workflow action
  - Body: `{ name, label, field, action_type, action_value, enabled? }`
- **PUT /knowledge/workflow-actions/:id** - Update workflow action
  - Body: Any of `{ name, label, field, action_type, action_value, enabled }`
- **DELETE /knowledge/workflow-actions/:id** - Delete workflow action

### Example

```json
POST /knowledge/workflow-actions
{
  "name": "Search IP in VirusTotal",
  "label": "Check VirusTotal",
  "field": "source_ip",
  "action_type": "link",
  "action_value": "https://www.virustotal.com/gui/ip-address/$source_ip$",
  "enabled": true
}
```

**Action Types:**
- `link` - Open a URL (with field value substitution using `$field_name$`)
- `search` - Run a new search query
- `script` - Execute a custom script

**Additional Examples:**
```json
// Search action
{
  "name": "Find Related Events",
  "label": "Search by User",
  "field": "username",
  "action_type": "search",
  "action_value": "search user=$username$ | stats count by hostname",
  "enabled": true
}

// Script action
{
  "name": "Block IP",
  "label": "Add to Firewall",
  "field": "source_ip",
  "action_type": "script",
  "action_value": "/scripts/block-ip.sh $source_ip$",
  "enabled": true
}
```

## Database Schema

All knowledge objects are stored in SQLite with the following tables:

### field_extractions
```sql
CREATE TABLE field_extractions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL,        -- e.g., "apache:access", "syslog"
  field_name TEXT NOT NULL,         -- Field to extract
  pattern TEXT NOT NULL,            -- Grok pattern or regex
  pattern_type TEXT NOT NULL,       -- 'grok' or 'regex'
  priority INTEGER DEFAULT 100,     -- Lower = higher priority
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### event_types
```sql
CREATE TABLE event_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  search_string TEXT NOT NULL,      -- DSL query to match events
  description TEXT,
  priority INTEGER DEFAULT 100,     -- Lower = higher priority
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### tags
```sql
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  tag_name TEXT NOT NULL,           -- Tag label (e.g., "security")
  field TEXT NOT NULL,              -- Field to tag (e.g., "app_name")
  value TEXT NOT NULL,              -- Field value (e.g., "sshd")
  created_at TEXT DEFAULT (datetime('now'))
);
```

### lookups
```sql
CREATE TABLE lookups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,               -- 'csv' or 'manual'
  key_field TEXT NOT NULL,          -- Field used for lookups
  output_fields TEXT NOT NULL,      -- JSON array of output fields
  data TEXT,                        -- JSON data (for manual lookups)
  file_path TEXT,                   -- CSV file path (for CSV lookups)
  created_at TEXT DEFAULT (datetime('now'))
);
```

### workflow_actions
```sql
CREATE TABLE workflow_actions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  label TEXT NOT NULL,              -- Display label in UI
  field TEXT NOT NULL,              -- Field this action applies to
  action_type TEXT NOT NULL,        -- 'link', 'search', or 'script'
  action_value TEXT NOT NULL,       -- URL template, query, or script path
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
```

## Implementation Details

### Field Extraction Testing

The `/field-extractions/:id/test` endpoint uses the `grok-js` library for grok patterns and native JavaScript RegExp for regex patterns. This allows users to validate their patterns against sample log lines before deploying them.

**Grok Pattern Support:**
- Full grok syntax with named captures
- Built-in patterns (e.g., `%{COMBINEDAPACHELOG}`)
- Custom pattern definitions

**Regex Pattern Support:**
- JavaScript RegExp syntax
- Named capture groups using `(?<name>...)` syntax
- Standard numbered captures

### Lookup Search

The lookup search endpoint supports:
- **Manual lookups**: Searches through JSON data stored in the database
- **CSV lookups**: Returns 501 Not Implemented (to be added in future)

Key matching is case-sensitive and exact-match only. The search returns only the specified output fields.

### Priority Ordering

Both field extractions and event types use priority values:
- Lower numbers = higher priority
- Default priority is 100
- Allows controlling the order of pattern matching and event classification

### Error Handling

All endpoints include comprehensive error handling:
- **400 Bad Request** - Missing required fields or invalid data types
- **404 Not Found** - Resource not found
- **409 Conflict** - Duplicate entries (for unique constraints)
- **500 Internal Server Error** - Server errors
- **501 Not Implemented** - Feature not yet implemented (CSV lookup search)

## Usage Notes

1. **Field Extractions**: Apply patterns based on source type for targeted extraction
2. **Event Types**: Use DSL queries to categorize events; higher priority types are evaluated first
3. **Tags**: Tag field values for quick categorization and filtering
4. **Lookups**: Enrich events with external data; use manual lookups for small datasets, CSV for larger ones
5. **Workflow Actions**: Create contextual actions for specific fields to enhance operational workflows

## Future Enhancements

- CSV file upload and parsing for CSV lookups
- Bulk import/export of knowledge objects
- Validation and testing for all knowledge object types
- Pattern library and templates
- Knowledge object versioning and audit trail
