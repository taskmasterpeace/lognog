# Internal Logging Settings

LogNog can log its own operational events for self-monitoring and debugging. This feature is **disabled by default** to reduce log noise.

## Overview

When enabled, LogNog logs events to its own database under `index_name='lognog-internal'`. These logs can be queried like any other logs using the DSL.

## Settings

Access via **Settings > System > Internal Logging** (admin only).

| Setting | Description | Default |
|---------|-------------|---------|
| `enabled` | Enable/disable self-monitoring | `false` |
| `level` | Minimum severity level to log | `WARNING` |
| `categories` | Which event categories to log | `auth,alert,system` |

### Severity Levels

Levels follow syslog standard (lower number = more severe):

| Level | Value | Description |
|-------|-------|-------------|
| `DEBUG` | 7 | Verbose debugging info |
| `INFO` | 6 | Routine operations |
| `NOTICE` | 5 | Normal but notable |
| `WARNING` | 4 | Potential issues |
| `ERROR` | 3 | Errors that need attention |
| `CRITICAL` | 2 | Critical failures |

### Categories

| Category | Events Logged |
|----------|---------------|
| `api` | HTTP requests, errors, slow responses |
| `auth` | Logins, logouts, failed attempts, token refreshes |
| `search` | DSL queries, slow queries, query errors |
| `alert` | Alert evaluations, triggers, throttling |
| `report` | Report generation and delivery |
| `ingest` | Log ingestion batches and errors |
| `system` | Startup, shutdown, retention cleanup |
| `ai` | AI provider requests and errors |

## Recommended Configurations

### Minimal (Production)
```json
{
  "enabled": true,
  "level": "WARNING",
  "categories": ["auth", "alert", "system"]
}
```
Only logs important events: failed logins, alert triggers, system errors.

### Standard (Monitoring)
```json
{
  "enabled": true,
  "level": "NOTICE",
  "categories": ["auth", "alert", "system", "ingest"]
}
```
Adds ingestion tracking for monitoring data flow.

### Verbose (Debugging)
```json
{
  "enabled": true,
  "level": "INFO",
  "categories": ["api", "auth", "search", "alert", "ingest", "system", "ai"]
}
```
Full visibility for debugging issues.

## API Endpoints

### Get Current Settings
```bash
GET /api/settings/internal-logging
Authorization: Bearer <admin-token>
```

Response:
```json
{
  "enabled": false,
  "level": "WARNING",
  "categories": ["auth", "alert", "system"],
  "available_levels": ["DEBUG", "INFO", "NOTICE", "WARNING", "ERROR", "CRITICAL"],
  "available_categories": ["api", "auth", "search", "alert", "report", "ingest", "system", "ai"]
}
```

### Update Settings
```bash
PUT /api/settings/internal-logging
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "enabled": true,
  "level": "NOTICE",
  "categories": ["auth", "alert", "system", "ingest"]
}
```

## Environment Variable Override

You can completely disable internal logging via environment variable:

```bash
LOGNOG_SELF_MONITORING=false
```

This takes precedence over the database settings and prevents any internal logs from being written.

## Querying Internal Logs

Once enabled, query internal logs using DSL:

```
# All internal logs
search index_name="lognog-internal"

# Failed logins
search index_name="lognog-internal" action="auth.login_failed"

# Alert triggers
search index_name="lognog-internal" action="alert.triggered"

# Slow queries (>5s)
search index_name="lognog-internal" action="search.slow"

# Errors by category
search index_name="lognog-internal" success=false | stats count by category
```

## Log Entry Structure

Each internal log entry includes:

| Field | Description |
|-------|-------------|
| `action` | Event type (e.g., `auth.login`, `alert.triggered`) |
| `category` | Event category (e.g., `auth`, `alert`) |
| `success` | Boolean - whether operation succeeded |
| `duration_ms` | Operation duration in milliseconds |
| `message` | Human-readable description |
| `user_id` | User who performed the action (if applicable) |

## Performance Considerations

- Internal logs are batched (50 events or 5 seconds)
- Settings are cached for 30 seconds to reduce DB queries
- Disable `api` category if you don't need request logging (highest volume)
- Use higher severity levels in production to reduce volume

## Troubleshooting

**Q: Internal logs aren't appearing**
- Check if `enabled` is `true`
- Verify the event category is in the `categories` list
- Ensure event severity is <= configured level
- Check `LOGNOG_SELF_MONITORING` env var isn't set to `false`

**Q: Too many internal logs**
- Set level to `WARNING` or `ERROR`
- Remove `api` and `search` from categories
- Consider disabling entirely if not needed
