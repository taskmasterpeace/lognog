# LogNog — Integration Guide for AI Coding Agents

**You are an AI coding agent (e.g. Claude Code). Your job: instrument this project to send its logs to LogNog correctly.** This guide is self-contained — everything you need to configure logging is below. Follow it top to bottom.

LogNog is a self-hosted log platform (a friendlier Splunk). It ingests structured JSON log events over HTTP, stores them in ClickHouse, and lets a human search them with a Splunk-like query language, build dashboards, and get alerts. "The right logs" means **structured, severity-tagged events with useful fields** — not `console.log` spam. This guide tells you exactly what to send.

- **Fetch the latest version of this guide:** `GET https://logs.machinekinglabs.com/api/ingest/guide` (returns this markdown).
- **Fetch the machine-readable contract:** `GET https://logs.machinekinglabs.com/api/ingest/schema` (returns JSON).
- **Want to READ logs and manage alerts programmatically** (not just send logs)? See [Read & act — the Agent API](#read--act--the-agent-api). Same API key.

---

## TL;DR — self-configure in 4 steps

1. **Get an API key.** A human creates one in LogNog under **Settings → API Keys** (or the **Add Data Source** wizard) and gives it to you. It looks like `lnog_xxxxxxxx_xxxxxxxxxxxxxxxx`. **That is the only thing you need to provision.** You do NOT create or request access to an "index" — see [Indexes](#indexes).
2. **Set env vars** (see [Configuration](#configuration)): `LOGNOG_URL`, `LOGNOG_API_KEY`, `LOGNOG_APP_NAME`, and optionally `LOGNOG_INDEX`.
3. **Drop in the client** ([TypeScript](#drop-in-client--typescript) or [Python](#drop-in-client--python)) and wire it into app startup, request handling, and error paths per [What to log](#what-to-log).
4. **Verify** ([Verify it works](#verify-it-works)): send one test event, then confirm it appears.

---

## Configuration

Set these environment variables (add to `.env.local` / `.env` and your deploy platform):

| Variable | Required | Example | Notes |
|---|---|---|---|
| `LOGNOG_URL` | yes | `https://logs.machinekinglabs.com` | Base URL. The client appends `/api/ingest/http`. Do NOT include the path. |
| `LOGNOG_API_KEY` | yes | `lnog_ab12cd34_...` | The key a human gave you. Server-side only — never expose to the browser. |
| `LOGNOG_APP_NAME` | recommended | `my-app` | Identifies this app in searches (`app_name=my-app`). Use a stable kebab-case name. |
| `LOGNOG_INDEX` | optional | `my-app` | Groups this app's logs. Omit to use the default. Auto-created. See [Indexes](#indexes). |

> **Security:** the API key authenticates ingestion. Keep it in server-side env only. If you have a browser/client that needs to log, send those events to your own server route and forward them (never ship the key to the client).

---

## The ingest contract

**Endpoint:** `POST {LOGNOG_URL}/api/ingest/http`

**Headers:**

| Header | Required | Value |
|---|---|---|
| `Content-Type` | yes | `application/json` |
| `X-API-Key` | yes | your `LOGNOG_API_KEY` |
| `X-Index` | no | an index name to group logs (e.g. `my-app`). Omitted → default index `http`. |
| `X-App-Name` | no | default `app_name` for events that don't set one |

**Body:** a **JSON array** of log-event objects (send in batches; 1–500 per request is ideal). Each event:

| Field | Type | Required | Description |
|---|---|---|---|
| `message` | string | **yes** | The human-readable log line. Keep it specific. |
| `timestamp` | string (ISO-8601) | no | Event time, e.g. `2026-07-03T14:30:00.000Z`. Defaults to arrival time if omitted. |
| `level` | string | no | `debug` \| `info` \| `notice` \| `warning` \| `error` \| `critical`. Mapped to a numeric severity (see below). Prefer this over `severity`. |
| `severity` | number | no | Syslog severity 0–7 (0=emergency … 7=debug). Use if you don't send `level`. |
| `app_name` | string | no | Overrides `X-App-Name` per event. |
| `hostname` | string | no | Host/instance the event came from. |
| `source` | string | no | Logical source/component (e.g. `auth`, `checkout`, `worker`). |
| *(any other keys)* | string/number/bool | no | **Custom structured fields** — stored and searchable (e.g. `user_id`, `route`, `status_code`, `duration_ms`, `error_code`). This is what makes logs useful. |

**Severity / level mapping** (send `level`; the server maps it):

| `level` | severity | Use for |
|---|---|---|
| `debug` | 7 | verbose diagnostics (off in prod) |
| `info` | 6 | normal events (requests, lifecycle, business events) |
| `notice` | 5 | notable-but-normal |
| `warning` | 4 | recoverable problems, degraded paths |
| `error` | 3 | failed operations, caught exceptions |
| `critical` | 2 | outages, data loss, unrecoverable |

Searching by severity later uses numbers: `search severity<=3` = errors and worse.

**Response:** `200` with `{ "accepted": <n> }` on success. `401` = bad/missing key. `403` = key not allowed to write that index. `400` = malformed body.

**Minimal curl (send a test event):**

```bash
curl -X POST "$LOGNOG_URL/api/ingest/http" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $LOGNOG_API_KEY" \
  -H "X-Index: $LOGNOG_APP_NAME" \
  -d '[{"timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","level":"info","app_name":"'"$LOGNOG_APP_NAME"'","source":"setup","message":"LogNog integration test","test":true}]'
```

---

## Indexes

**You never pre-declare or "request access to" an index.** An index is just a label that groups logs. It is **created automatically** the first time a log arrives:

- Omit `X-Index` → logs land in the default index `http`.
- Set `X-Index: my-app` → logs are grouped under `my-app`, searchable as `search index=my-app`.

The source appears on its own under **Data Sources** in the LogNog UI once the first event is received. Convention: set `X-Index` to your app name (same as `LOGNOG_APP_NAME`).

---

## Drop-in client — TypeScript

Save as `lib/lognog.ts`. Non-blocking, batched, fail-safe (logging must never crash or slow the app). Server-side only.

```ts
// lib/lognog.ts — minimal, batched, fire-and-forget LogNog client.
type Level = 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical';

interface LogEvent {
  message: string;
  level?: Level;
  timestamp?: string;
  source?: string;
  [key: string]: unknown; // custom structured fields
}

const URL = (process.env.LOGNOG_URL || '').replace(/\/+$/, '');
const KEY = process.env.LOGNOG_API_KEY || '';
const APP = process.env.LOGNOG_APP_NAME || 'app';
const INDEX = process.env.LOGNOG_INDEX || APP;
const ENABLED = Boolean(URL && KEY);

let queue: LogEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_MS = 5000;
const MAX_BATCH = 50;

async function flush(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!ENABLED || queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  try {
    await fetch(`${URL}/api/ingest/http`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': KEY, 'X-Index': INDEX, 'X-App-Name': APP },
      body: JSON.stringify(batch.map((e) => ({ app_name: APP, timestamp: new Date().toISOString(), ...e }))),
    });
  } catch {
    /* never throw from logging; drop on failure */
  }
}

export function log(event: LogEvent): void {
  if (!ENABLED) return;
  queue.push(event);
  if (queue.length >= MAX_BATCH) { void flush(); return; }
  if (!timer) timer = setTimeout(() => void flush(), FLUSH_MS);
}

// Convenience helpers
export const logger = {
  debug: (message: string, f: Record<string, unknown> = {}) => log({ level: 'debug', message, ...f }),
  info: (message: string, f: Record<string, unknown> = {}) => log({ level: 'info', message, ...f }),
  warn: (message: string, f: Record<string, unknown> = {}) => log({ level: 'warning', message, ...f }),
  error: (message: string, f: Record<string, unknown> = {}) => log({ level: 'error', message, ...f }),
  critical: (message: string, f: Record<string, unknown> = {}) => log({ level: 'critical', message, ...f }),
};

// Flush on shutdown so buffered events aren't lost.
if (typeof process !== 'undefined') {
  process.on('beforeExit', () => void flush());
  process.on('SIGTERM', () => void flush());
}
```

**Usage:**

```ts
import { logger } from './lib/lognog';

logger.info('Server started', { port: 3000, source: 'boot' });
logger.info('User signed up', { source: 'auth', user_id: 'u_123', plan: 'pro' });
logger.error('Checkout failed', { source: 'checkout', user_id: 'u_123', error_code: 'card_declined', amount_cents: 4999 });
```

**Next.js API route pattern** (forward browser events safely — key stays server-side):

```ts
// app/api/log/route.ts
import { logger } from '@/lib/lognog';
export async function POST(req: Request) {
  const { message, level = 'info', ...fields } = await req.json();
  logger[level as 'info']?.(String(message).slice(0, 2000), { ...fields, source: 'client' });
  return Response.json({ ok: true });
}
```

---

## Drop-in client — Python

Save as `lognog.py`. Background-thread flush, fail-safe.

```python
# lognog.py — minimal, batched, fire-and-forget LogNog client.
import atexit, json, os, threading, time, urllib.request
from datetime import datetime, timezone

_URL = os.environ.get("LOGNOG_URL", "").rstrip("/")
_KEY = os.environ.get("LOGNOG_API_KEY", "")
_APP = os.environ.get("LOGNOG_APP_NAME", "app")
_INDEX = os.environ.get("LOGNOG_INDEX", _APP)
_ENABLED = bool(_URL and _KEY)

_queue, _lock = [], threading.Lock()

def _flush():
    with _lock:
        if not _queue:
            return
        batch, _queue[:] = list(_queue), []
    if not _ENABLED:
        return
    body = json.dumps([{"app_name": _APP, "timestamp": datetime.now(timezone.utc).isoformat(), **e} for e in batch]).encode()
    req = urllib.request.Request(f"{_URL}/api/ingest/http", data=body, method="POST",
        headers={"Content-Type": "application/json", "X-API-Key": _KEY, "X-Index": _INDEX, "X-App-Name": _APP})
    try:
        urllib.request.urlopen(req, timeout=5).read()
    except Exception:
        pass  # never raise from logging

def log(message, level="info", **fields):
    if not _ENABLED:
        return
    with _lock:
        _queue.append({"message": message, "level": level, **fields})
        due = len(_queue) >= 50
    if due:
        threading.Thread(target=_flush, daemon=True).start()

def _loop():
    while True:
        time.sleep(5); _flush()

if _ENABLED:
    threading.Thread(target=_loop, daemon=True).start()
    atexit.register(_flush)
```

**Usage:** `from lognog import log` then `log("User signed up", level="info", source="auth", user_id="u_123")`.

---

## What to log

Send **structured events**, not raw strings. Every event should answer: *what happened, to whom/what, and with what outcome.* Attach fields, not string-concatenated values.

**Do log** (with the right level):
- **App lifecycle** (`info`): server start/stop, migrations run, config loaded, background job started/finished.
- **Requests** (`info`): one event per meaningful request — `source`, `route`, `method`, `status_code`, `duration_ms`, `user_id`.
- **Business events** (`info`): signups, logins, purchases, feature usage — with IDs and amounts as fields (`user_id`, `plan`, `amount_cents`, `feature`).
- **Warnings** (`warning`): retries, rate-limit hits, deprecated-path usage, fallbacks, slow queries.
- **Errors** (`error`): caught exceptions and failed operations — include `error_code`/`error_name`, a short `error_message`, `source`, and relevant IDs. Put the stack in a `stack` field (truncate to ~2KB).
- **Critical** (`critical`): outages, data corruption, payment/webhook failures that need a human now.

**Don't log:**
- Secrets, tokens, passwords, full card numbers, or raw PII. Mask/omit them (`user_id` is fine; email/SSN is not unless intended and consented).
- High-cardinality debug noise in production (`debug` should be off in prod).
- Giant blobs. Truncate `message` to ~2KB and large fields.

**Field naming:** snake_case, stable names, primitive values. Good: `user_id`, `status_code`, `duration_ms`, `error_code`, `route`, `plan`. This lets a human write `search app_name=my-app status_code>=500 | stats count by route`.

---

## Verify it works

1. **Send a test event** (the curl above, or `logger.info('LogNog integration test', { source: 'setup', test: true })`). A `200` with `{"accepted":1}` means the key + endpoint are correct.
2. **Confirm in the UI:** open LogNog → **Search**, run:
   ```
   search app_name=my-app
   ```
   (or `search index=my-app`). Your event should appear within a few seconds.
3. **Confirm the source registered:** **Data Sources** now lists your app/index with a recent "Last Seen".
4. **Sanity queries** to prove the fields are structured:
   ```
   search app_name=my-app | stats count by level
   search app_name=my-app severity<=3 | stats count by source | sort -count
   ```

If nothing shows: check `LOGNOG_URL` has no trailing `/api/...` path, the key is valid (a `401` means it's wrong), the body is a JSON **array**, and events were flushed (the clients flush on interval/shutdown — call `flush()` in short-lived scripts).

---

## Read & act — the Agent API

Everything above is about *sending* logs. LogNog also has an **Agent API** so a program or AI agent can **read** logs (search, check status) and **act** (create and manage alerts) — with the same API key, no browser login, no CSRF token.

**Base:** `{LOGNOG_URL}/api/agent` · **Auth:** `X-API-Key: <key>` (or `Authorization: ApiKey <key>`).

**Permissions** (set on the key when it's created): a `read` key can search/check; a `write` key can also create/manage alerts. A read-only key gets `403` on write endpoints.

**Start here — the API describes itself:**
```bash
curl -H "X-API-Key: $KEY" "$LOGNOG_URL/api/agent"
# -> { name, you: { permissions, allowed_indexes }, endpoints: {...}, dsl, docs }
```

### Read
| Endpoint | Does | Needs |
|---|---|---|
| `POST /api/agent/search` | Run a DSL query. Body `{ query, earliest?, latest?, limit? }` → `{ count, fields, results }`. | read |
| `GET /api/agent/summary` | Health snapshot: 24h event/error totals, per-index counts, alert status (incl. which alerts are failing). | read |
| `GET /api/agent/indexes` | Indexes/sources with recent counts. | read |
| `GET /api/agent/fields` | The core searchable fields. | read |
| `GET /api/agent/alerts` | List alerts with health (`last_status`, `last_error`, `trigger_count`). | read |
| `GET /api/agent/alerts/:id` | One alert. | read |
| `POST /api/agent/alerts/test` | Preview whether a query+condition would fire, without saving. Body `{ search_query, trigger_condition?, trigger_threshold?, time_range? }`. | read |

```bash
# Search
curl -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"query":"search severity<=3 | stats count by app_name | sort -count"}' \
  "$LOGNOG_URL/api/agent/search"

# Check overall health
curl -H "X-API-Key: $KEY" "$LOGNOG_URL/api/agent/summary"
```

### Act — create and manage alerts
| Endpoint | Does | Needs |
|---|---|---|
| `POST /api/agent/alerts` | Create an alert. | write |
| `PATCH /api/agent/alerts/:id` | Update fields (threshold, enabled, query, schedule, …). | write |
| `POST /api/agent/alerts/:id/evaluate` | Evaluate the alert now. | write |
| `DELETE /api/agent/alerts/:id` | Delete it. | write |

**Create-alert body** (only `name` + `search_query` are required):
```json
{
  "name": "HYH error spike",
  "description": "created by an agent",
  "search_query": "search app_name=hey-youre-hired severity<=3 | stats count",
  "trigger_type": "number_of_results",
  "trigger_condition": "greater_than",
  "trigger_threshold": 50,
  "cron_expression": "*/5 * * * *",
  "time_range": "-5m",
  "severity": "high",
  "enabled": true,
  "actions": [{ "type": "apprise", "config": { "channel": "ops" } }]
}
```
- `trigger_type` accepts `number_of_results` (also `threshold`/`results_count`), `number_of_hosts`, `custom_condition`, `no_data`.
- `trigger_condition`: `greater_than` | `less_than` | `equal_to` | `not_equal_to`. `trigger_threshold` is the number to compare.
- Tip: call `POST /api/agent/alerts/test` first to see it would fire before you save it.

```bash
curl -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"name":"Error spike","search_query":"search severity<=3 | stats count","trigger_condition":"greater_than","trigger_threshold":50,"cron_expression":"*/5 * * * *","time_range":"-5m","severity":"high"}' \
  "$LOGNOG_URL/api/agent/alerts"
```

> **Reachability:** the Agent API lives under `/api/agent`. On a self-hosted box an agent on the same network hits it directly. To reach it from *outside* through Cloudflare Access, add `/api/agent` to the Access **bypass** policy (same as `/api/ingest`) — otherwise external calls get the Cloudflare login page.

---

## Machine-readable contracts

- `GET {LOGNOG_URL}/api/ingest/schema` — the **ingest** contract (endpoint, headers, event fields, level→severity map).
- `GET {LOGNOG_URL}/api/agent` — the **Agent API** self-describes (endpoints + your key's permissions). Parse either to configure programmatically without scraping this doc.

---

*This guide is served live at `{LOGNOG_URL}/api/ingest/guide`. LogNog brand: chocolate/cream, warm. Questions a human can answer live in the in-app "Ask LogNog" help bot.*
