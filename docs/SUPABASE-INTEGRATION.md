# Supabase Log Drains Integration

LogNog supports ingesting logs from Supabase projects using the Log Drains feature. This allows you to collect and analyze logs from all Supabase services in one place.

## Overview

Supabase Log Drains exports logs from:
- **PostgreSQL Database**: Queries, errors, slow queries, connections
- **Auth (GoTrue)**: Login attempts, signups, token management, OAuth
- **Storage**: File uploads, downloads, access control
- **Realtime**: WebSocket connections, channel subscriptions
- **Edge Functions (Deno)**: Function invocations, console output, errors

## Prerequisites

1. **Supabase Plan**: Log Drains require Supabase Team or Enterprise plan
2. **LogNog API Key**: Create an API key with write permissions in LogNog Settings
3. **Network Access**: LogNog must be accessible from the internet (or use a tunnel)

## Setup Instructions

### 1. Create LogNog API Key

1. Log into LogNog web UI
2. Go to **Settings → API Keys**
3. Click **Create API Key**
4. Set permissions to include `write`
5. Copy the generated API key

### 2. Configure Supabase Log Drain

1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to **Settings → Log Drains**
4. Click **Add destination**
5. Select **HTTP / Generic HTTP endpoint**

### 3. Configure the Endpoint

**Endpoint URL:**
```
https://your-lognog-server.com/api/ingest/supabase
```

**HTTP Method:** POST (default)

**Headers:**
```
X-API-Key: your-lognog-api-key
Content-Type: application/json
```

**Optional:** Enable gzip compression if your server supports it (LogNog does)

### 4. Save and Test

Click **Save** and Supabase will start sending logs to LogNog.

## Log Format

Supabase sends logs as batched JSON arrays (up to 250 logs per request):

```json
[
  {
    "id": "log_123abc",
    "timestamp": 1705312345000,
    "event_message": "duration: 15.234 ms  statement: SELECT * FROM users WHERE id = $1",
    "metadata": {
      "project": "your-project-ref",
      "parsed": {
        "user_name": "authenticator",
        "database_name": "postgres",
        "error_severity": "LOG",
        "session_id": "abc123",
        "command_tag": "SELECT"
      }
    }
  }
]
```

## Querying Supabase Logs

### Basic Queries

```
# All Supabase logs
search index=supabase

# PostgreSQL logs only
search index=supabase app_name=supabase-postgres

# Auth service logs
search index=supabase app_name=supabase-auth

# Edge Function logs
search index=supabase app_name=supabase-edge-functions
```

### Database Monitoring

```
# Slow queries (> 1 second)
search index=supabase app_name=supabase-postgres message~"duration"
  | rex field=message "duration: (?P<duration>[\d.]+) ms"
  | where duration > 1000
  | table timestamp, db_user, duration, message

# Database errors
search index=supabase app_name=supabase-postgres error_severity=ERROR
  | stats count by db_name, db_user
  | sort desc count

# Connection activity
search index=supabase app_name=supabase-postgres message~"connection"
  | timechart span=1h count
```

### Authentication Monitoring

```
# Failed login attempts
search index=supabase app_name=supabase-auth http_status>=400
  | stats count by http_path, http_status

# Login success rate
search index=supabase app_name=supabase-auth http_path="/auth/v1/token"
  | eval success=if(http_status<400, 1, 0)
  | stats sum(success) as successes, count as total
  | eval success_rate=(successes/total)*100

# OAuth provider usage
search index=supabase app_name=supabase-auth http_path~"/authorize"
  | stats count by http_path
```

### Edge Function Monitoring

```
# Function invocation counts
search index=supabase app_name=supabase-edge-functions
  | stats count by function_id
  | sort desc count

# Function errors
search index=supabase app_name=supabase-edge-functions severity<=3
  | table timestamp, function_id, message

# Cold starts
search index=supabase app_name=supabase-edge-functions message~"cold start"
  | timechart span=1h count by function_id
```

## Available Fields

### Common Fields

| Field | Description |
|-------|-------------|
| `timestamp` | Log timestamp (ISO 8601) |
| `hostname` | Supabase project reference |
| `app_name` | Service name (supabase-postgres, supabase-auth, etc.) |
| `message` | Log message content |
| `severity` | Syslog severity (0-7) |
| `supabase_component` | Component identifier |
| `supabase_project` | Project reference |

### PostgreSQL Fields

| Field | Description |
|-------|-------------|
| `db_user` | PostgreSQL username |
| `db_name` | Database name |
| `db_pid` | Process ID |
| `db_session_id` | Session identifier |
| `db_command` | SQL command type (SELECT, INSERT, etc.) |
| `db_application` | Client application name |
| `sql_state` | PostgreSQL error state code |

### Edge Function Fields

| Field | Description |
|-------|-------------|
| `function_id` | Function identifier |
| `execution_id` | Unique execution ID |
| `deployment_id` | Deployment version ID |
| `function_version` | Function version string |

### HTTP Request Fields

| Field | Description |
|-------|-------------|
| `http_method` | HTTP method (GET, POST, etc.) |
| `http_path` | Request path |
| `http_status` | Response status code |

## Creating Alerts

### Database Error Alert

```
# Alert: High database error rate
search index=supabase app_name=supabase-postgres error_severity=ERROR
  | stats count as errors
  | where errors > 10
```

### Authentication Failure Alert

```
# Alert: Too many failed logins
search index=supabase app_name=supabase-auth http_status=401
  | stats count as failures
  | where failures > 50
```

### Edge Function Error Alert

```
# Alert: Function errors
search index=supabase app_name=supabase-edge-functions severity<=3
  | stats count by function_id
  | where count > 5
```

## Dashboard Examples

### Supabase Overview Dashboard

Create a dashboard with these panels:

1. **Log Volume** (timechart)
   ```
   search index=supabase | timechart span=1h count by app_name
   ```

2. **Error Rate** (stat card)
   ```
   search index=supabase severity<=3 | stats count
   ```

3. **Top Database Users** (bar chart)
   ```
   search index=supabase app_name=supabase-postgres | stats count by db_user
   ```

4. **Auth Activity** (timechart)
   ```
   search index=supabase app_name=supabase-auth | timechart span=1h count
   ```

5. **Function Invocations** (pie chart)
   ```
   search index=supabase app_name=supabase-edge-functions | stats count by function_id
   ```

## Troubleshooting

### Logs Not Arriving

1. **Check API Key**: Ensure the API key has write permissions
2. **Check URL**: Verify the endpoint URL is correct and accessible
3. **Check Headers**: Ensure `X-API-Key` header is set correctly
4. **Check Supabase Plan**: Log Drains require Team or Enterprise plan
5. **Check Network**: Ensure LogNog is accessible from the internet

### Missing Fields

Some fields may not be present in all log types:
- Database fields only appear in PostgreSQL logs
- Function fields only appear in Edge Function logs
- HTTP fields only appear in API-related logs

### High Volume

If you're receiving too many logs:
1. Consider filtering by severity in your queries
2. Set up retention policies in LogNog
3. Create focused dashboards for specific services

## Security Considerations

1. **API Key Security**: Store your LogNog API key securely
2. **HTTPS**: Always use HTTPS for the endpoint URL
3. **Network Isolation**: Consider using a VPN or private network
4. **Audit Logs**: LogNog logs all ingestion events for auditing

## Future Enhancements

Supabase has noted that Log Drain requests are currently unsigned but will be signed in the future. LogNog will support signature verification when available.
