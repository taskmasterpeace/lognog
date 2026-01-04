# App Onboarding Guide

This guide provides standardized instructions for integrating any application with LogNog. All apps should follow this pattern for consistent log ingestion and querying.

## Quick Start

```bash
# Test your integration with curl
curl -X POST https://logs.machinekinglabs.com/api/ingest/http \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -H "X-App-Name: your-app-name" \
  -H "X-Index: your-app-name" \
  -d '[{"level": "info", "message": "Hello from my app!"}]'
```

Expected response:
```json
{"accepted":1,"index":"your-app-name"}
```

## Standard Endpoint

All apps use the same endpoint:

```
POST https://logs.machinekinglabs.com/api/ingest/http
```

This is the **universal endpoint** for all application integrations. Do NOT use `/api/ingest/nextjs` or other specialized endpoints.

## Required Headers

| Header | Required | Description | Example |
|--------|----------|-------------|---------|
| `X-API-Key` | Yes | Your LogNog API key | `lnog_abc123...` |
| `X-App-Name` | Yes | Unique app identifier (kebab-case) | `hey-youre-hired` |
| `X-Index` | Yes | Index for querying (use same as app name) | `hey-youre-hired` |
| `Content-Type` | Yes | Must be `application/json` | `application/json` |

### Naming Convention

Use **kebab-case** for both `X-App-Name` and `X-Index`:
- `hey-youre-hired` (not `HeyYoureHired` or `hey_youre_hired`)
- `directors-palette` (not `DirectorsPalette`)
- `my-awesome-app` (not `myAwesomeApp`)

## Payload Format

Send logs as a JSON array:

```json
[
  {
    "timestamp": "2024-01-15T10:30:00.000Z",
    "level": "info",
    "message": "User logged in successfully",
    "userId": "user_123",
    "action": "login"
  },
  {
    "timestamp": "2024-01-15T10:30:05.000Z",
    "level": "error",
    "message": "Payment processing failed",
    "userId": "user_456",
    "errorCode": "CARD_DECLINED"
  }
]
```

### Field Mappings

LogNog automatically maps common field names:

| Your Field | LogNog Field | Notes |
|------------|--------------|-------|
| `timestamp`, `time`, `@timestamp`, `date` | `timestamp` | Auto-detected, ISO-8601 or Unix ms |
| `level`, `severity`, `loglevel`, `log_level` | `severity` | Mapped to syslog levels (see below) |
| `message`, `msg`, `log`, `text`, `body` | `message` | Primary log text |
| `hostname`, `host`, `source`, `server` | `hostname` | Source machine/service name |
| Everything else | `structured_data` | Stored as searchable JSON |

### Severity Mapping

| Your Level | Syslog Severity | Numeric |
|------------|-----------------|---------|
| `emergency`, `emerg` | Emergency | 0 |
| `alert` | Alert | 1 |
| `critical`, `crit`, `fatal` | Critical | 2 |
| `error`, `err` | Error | 3 |
| `warning`, `warn` | Warning | 4 |
| `notice` | Notice | 5 |
| `info`, `information` | Info | 6 |
| `debug`, `trace` | Debug | 7 |

## Create an API Key

1. Log into LogNog UI at https://logs.machinekinglabs.com
2. Go to **Settings** → **API Keys**
3. Click **Create API Key**
4. Give it a descriptive name (e.g., "Hey You're Hired Production")
5. Copy the key immediately (it won't be shown again)

Store the API key securely:
- Use environment variables (recommended)
- Never commit API keys to source control
- Rotate keys periodically

## Code Examples

### Node.js / TypeScript (Recommended)

```typescript
// lib/lognog.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

class LogNogClient {
  private buffer: LogEntry[] = [];
  private flushTimeout: NodeJS.Timeout | null = null;
  private isFlushing = false;

  // IMPORTANT: Use getters for lazy loading!
  // Environment variables may not be available at module load time
  private get url() {
    return process.env.LOGNOG_URL || 'https://logs.machinekinglabs.com';
  }

  private get apiKey() {
    return process.env.LOGNOG_API_KEY || '';
  }

  private get appName() {
    return process.env.LOGNOG_APP_NAME || 'my-app';
  }

  private get index() {
    return process.env.LOGNOG_INDEX || this.appName;
  }

  // Log a message (batched automatically)
  log(level: LogLevel, message: string, context: Record<string, unknown> = {}) {
    if (!this.apiKey) {
      console.warn('[LogNog] No API key configured');
      return;
    }

    this.buffer.push({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    });

    // Flush when buffer is full OR schedule flush
    if (this.buffer.length >= 50) {
      this.flush();
    } else if (!this.flushTimeout) {
      this.flushTimeout = setTimeout(() => this.flush(), 5000);
    }
  }

  // Convenience methods
  debug(message: string, context?: Record<string, unknown>) {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>) {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>) {
    this.log('error', message, context);
  }

  // Force flush - IMPORTANT for scripts and shutdown
  async forceFlush(): Promise<void> {
    await this.flush();
  }

  private async flush(): Promise<void> {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    if (this.buffer.length === 0 || this.isFlushing) return;

    this.isFlushing = true;
    const logs = [...this.buffer];
    this.buffer = [];

    try {
      const response = await fetch(`${this.url}/api/ingest/http`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'X-App-Name': this.appName,
          'X-Index': this.index,
        },
        body: JSON.stringify(logs),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`[LogNog] Error ${response.status}: ${text}`);
        // Put logs back in buffer for retry
        this.buffer.unshift(...logs);
      } else {
        const result = await response.json();
        console.log(`[LogNog] Sent ${logs.length} logs:`, result);
      }
    } catch (error) {
      console.error('[LogNog] Connection error:', error);
      // Put logs back in buffer for retry
      this.buffer.unshift(...logs);
    } finally {
      this.isFlushing = false;
    }
  }
}

// Singleton instance
export const lognog = new LogNogClient();

// Export flush for scripts
export const flushLogs = () => lognog.forceFlush();
```

**Usage:**

```typescript
import { lognog, flushLogs } from './lib/lognog';

// In your application code
lognog.info('User signed up', { userId: 'user_123', plan: 'pro' });
lognog.error('Payment failed', { userId: 'user_456', errorCode: 'CARD_DECLINED' });
lognog.warn('Rate limit approaching', { endpoint: '/api/search', usage: 85 });

// IMPORTANT: In scripts, force flush before exit
await flushLogs();
```

**Environment variables (.env.local):**

```bash
LOGNOG_URL=https://logs.machinekinglabs.com
LOGNOG_API_KEY=lnog_your_key_here
LOGNOG_APP_NAME=hey-youre-hired
LOGNOG_INDEX=hey-youre-hired
```

### Python

```python
# lognog.py
import os
import json
import threading
import atexit
from typing import Any
from datetime import datetime
import requests

class LogNogClient:
    def __init__(self):
        self._buffer: list[dict] = []
        self._lock = threading.Lock()
        self._timer: threading.Timer | None = None
        # Register flush on exit
        atexit.register(self.force_flush)

    @property
    def url(self) -> str:
        return os.getenv('LOGNOG_URL', 'https://logs.machinekinglabs.com')

    @property
    def api_key(self) -> str:
        return os.getenv('LOGNOG_API_KEY', '')

    @property
    def app_name(self) -> str:
        return os.getenv('LOGNOG_APP_NAME', 'my-app')

    @property
    def index(self) -> str:
        return os.getenv('LOGNOG_INDEX', self.app_name)

    def log(self, level: str, message: str, **context: Any) -> None:
        if not self.api_key:
            print('[LogNog] No API key configured')
            return

        entry = {
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'level': level,
            'message': message,
            **context
        }

        with self._lock:
            self._buffer.append(entry)
            if len(self._buffer) >= 50:
                self._flush_now()
            else:
                self._schedule_flush()

    def debug(self, message: str, **context: Any) -> None:
        self.log('debug', message, **context)

    def info(self, message: str, **context: Any) -> None:
        self.log('info', message, **context)

    def warn(self, message: str, **context: Any) -> None:
        self.log('warn', message, **context)

    def error(self, message: str, **context: Any) -> None:
        self.log('error', message, **context)

    def force_flush(self) -> None:
        """Force immediate flush - call before script exit."""
        self._flush_now()

    def _schedule_flush(self) -> None:
        if self._timer is None:
            self._timer = threading.Timer(5.0, self._flush_now)
            self._timer.daemon = True
            self._timer.start()

    def _flush_now(self) -> None:
        if self._timer:
            self._timer.cancel()
            self._timer = None

        with self._lock:
            if not self._buffer:
                return
            logs = self._buffer.copy()
            self._buffer.clear()

        try:
            response = requests.post(
                f'{self.url}/api/ingest/http',
                headers={
                    'Content-Type': 'application/json',
                    'X-API-Key': self.api_key,
                    'X-App-Name': self.app_name,
                    'X-Index': self.index,
                },
                json=logs,
                timeout=10
            )
            if response.ok:
                result = response.json()
                print(f'[LogNog] Sent {len(logs)} logs:', result)
            else:
                print(f'[LogNog] Error {response.status_code}: {response.text}')
        except requests.RequestException as e:
            print(f'[LogNog] Connection error: {e}')

# Singleton
lognog = LogNogClient()
```

**Usage:**

```python
from lognog import lognog

lognog.info('User signed up', user_id='user_123', plan='pro')
lognog.error('Payment failed', user_id='user_456', error_code='CARD_DECLINED')

# Force flush before script exits
lognog.force_flush()
```

### curl (Testing)

```bash
# Set your API key
export LOGNOG_API_KEY="lnog_your_key_here"

# Send test log
curl -X POST https://logs.machinekinglabs.com/api/ingest/http \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $LOGNOG_API_KEY" \
  -H "X-App-Name: hey-youre-hired" \
  -H "X-Index: hey-youre-hired" \
  -d '[{"level": "info", "message": "Test log from curl", "test": true}]'

# Expected response:
# {"accepted":1,"index":"hey-youre-hired"}
```

## Testing Your Integration

### Step 1: Test with curl

```bash
export LOGNOG_API_KEY="lnog_your_key_here"

curl -X POST https://logs.machinekinglabs.com/api/ingest/http \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $LOGNOG_API_KEY" \
  -H "X-App-Name: my-app" \
  -H "X-Index: my-app" \
  -d '[{"level": "info", "message": "Integration test!"}]'
```

You should see:
```json
{"accepted":1,"index":"my-app"}
```

### Step 2: Verify in LogNog UI

Go to https://logs.machinekinglabs.com/search and run:

```
search index=my-app
```

### Step 3: Test from your app

```typescript
// test-lognog.ts
import 'dotenv/config';  // IMPORTANT: Load env vars first!
import { lognog, flushLogs } from './lib/lognog';

async function main() {
  lognog.info('Test log 1', { test: true });
  lognog.warn('Test log 2', { test: true });
  lognog.error('Test log 3', { test: true });

  // CRITICAL: Flush before exit
  await flushLogs();
  console.log('Done!');
}

main();
```

## Common Queries

```
# All logs from your app
search index=hey-youre-hired

# Errors only (severity 3 or lower)
search index=hey-youre-hired severity<=3

# Last hour
search index=hey-youre-hired earliest=-1h

# Search by user
search index=hey-youre-hired userId="user_123"

# Count by level
search index=hey-youre-hired | stats count by level

# Time chart
search index=hey-youre-hired | timechart span=1h count
```

## Best Practices

### 1. Use Lazy Loading for Environment Variables

**Wrong** - API key read at module load time:
```typescript
// BAD: This runs before dotenv.config()!
const API_KEY = process.env.LOGNOG_API_KEY;
```

**Right** - Use getters for lazy evaluation:
```typescript
// GOOD: Read when actually needed
private get apiKey() {
  return process.env.LOGNOG_API_KEY || '';
}
```

### 2. Always Call forceFlush() in Scripts

Logs are batched, so they won't send until the buffer fills or timer fires:

```typescript
// WRONG - logs may not send before exit
lognog.info('Starting job');
doWork();
lognog.info('Job complete');
// Script exits, logs lost!

// RIGHT - force flush before exit
lognog.info('Starting job');
doWork();
lognog.info('Job complete');
await flushLogs();  // Ensures logs are sent
```

### 3. Include Useful Context

```typescript
// Minimal - hard to debug
lognog.error('Payment failed');

// Better - full context
lognog.error('Payment failed', {
  userId: user.id,
  orderId: order.id,
  amount: order.total,
  errorCode: error.code,
  errorMessage: error.message,
  paymentMethod: 'stripe',
});
```

### 4. Use Consistent Field Names

Pick a convention and stick to it:
- `userId` not sometimes `user_id` or `userID`
- `orderId` not sometimes `order_id` or `orderID`

### 5. Handle Errors Gracefully

```typescript
try {
  await sendLogs(buffer);
} catch (error) {
  console.error('Failed to send logs:', error);
  // Logs are kept in buffer for retry
}
```

## Troubleshooting

### Logs Not Appearing

1. **Check API key** - Is `LOGNOG_API_KEY` set in your environment?
2. **Check endpoint** - Must be `/api/ingest/http`
3. **Check flush** - Did you call `forceFlush()` before script exit?
4. **Check response** - Should return `{"accepted":N,"index":"..."}`
5. **Check env loading** - Is dotenv loaded BEFORE importing lognog?

### 401 Unauthorized

```json
{"error":"Authentication required","message":"Provide API key..."}
```

- API key is missing or invalid
- Check `X-API-Key` header is included
- Verify key exists in LogNog Settings → API Keys

### Environment Variables Not Loading

```typescript
// WRONG ORDER
import { lognog } from './lib/lognog';  // Reads env vars here!
import 'dotenv/config';                  // Too late!

// RIGHT ORDER
import 'dotenv/config';                  // Load env vars first
import { lognog } from './lib/lognog';  // Now they're available
```

Or use lazy getters (recommended - see code examples above).

### Logs Lost on Script Exit

Always flush before exit:
```typescript
await flushLogs();
process.exit(0);
```

## Current Integrations

| App | X-App-Name | X-Index | Status |
|-----|------------|---------|--------|
| Hey You're Hired | `hey-youre-hired` | `hey-youre-hired` | Live |
| Directors Palette | `directors-palette` | `directors-palette` | Pending |

---

## LogNog Internal Logs

LogNog logs its own operations to ClickHouse for self-monitoring and debugging. These logs are automatically ingested with:
- **Index**: `lognog-internal`
- **App Name**: `lognog-internal`
- **Hostname**: `lognog-api`

### Event Types

| Type | Description | When Logged |
|------|-------------|-------------|
| `api_call` | HTTP request/response | Mutations (POST/PUT/DELETE), errors, slow requests (>1s) |
| `query` | DSL query execution | Every search query with timing and row count |
| `error` | Errors and exceptions | All unhandled errors |
| `ingest` | Log ingestion batches | Every ingest with count, source, index, and timing |
| `ai_request` | AI provider calls | Ollama/OpenRouter usage |

### Querying Internal Logs

```
# All internal logs
search app_name="lognog-internal"

# API errors
search app_name="lognog-internal" severity<=3

# Slow requests (logged automatically >1s)
search app_name="lognog-internal" type="api_call" | filter message~"SLOW"

# Ingestion stats
search app_name="lognog-internal" type="ingest" | table timestamp message

# Ingestion by app
search app_name="lognog-internal" type="ingest" | stats sum(event_count) by app_name

# Query performance
search app_name="lognog-internal" type="query" | stats avg(execution_time_ms) by path

# AI usage
search app_name="lognog-internal" type="ai_request" | stats count by provider
```

### What's NOT Logged (Noise Reduction)

To keep internal logs useful, LogNog skips:
- Health checks (`/health`, `/api/health`)
- 304 Not Modified responses
- Read-only utility endpoints (`/status`, `/me`, `/preferences`, etc.)
- Successful GET requests (too noisy)
- Query endpoint (has dedicated query logging instead)

Only significant events are logged: mutations, errors, slow requests (>1s), and ingestion stats.

### Example Internal Log Entry

```json
{
  "timestamp": "2024-01-15 10:30:00.000",
  "severity": 6,
  "hostname": "lognog-api",
  "app_name": "lognog-internal",
  "message": {
    "type": "ingest",
    "source_type": "http",
    "event_count": 22,
    "duration_ms": 45,
    "index_name": "hey-youre-hired",
    "app_name": "hey-youre-hired",
    "description": "Ingested 22 events via http to index=hey-youre-hired from app=hey-youre-hired (45ms)"
  }
}
```

### Disabling Internal Logging

Set environment variable:
```bash
LOGNOG_SELF_MONITORING=false
```

---

## Onboarding Checklist

- [ ] Got API key from LogNog admin
- [ ] Added environment variables:
  - [ ] `LOGNOG_URL=https://logs.machinekinglabs.com`
  - [ ] `LOGNOG_API_KEY=lnog_...`
  - [ ] `LOGNOG_APP_NAME=your-app-name`
  - [ ] `LOGNOG_INDEX=your-app-name`
- [ ] Installed lognog client (copy from examples above)
- [ ] Verified lazy loading of env vars (use getters!)
- [ ] Tested with curl command
- [ ] Tested from app with forceFlush()
- [ ] Verified logs appear in LogNog UI
- [ ] Added your app to "Current Integrations" table above
