# LogNog AI Features Roadmap

> Multiplying productivity through AI-powered log analysis

---

## Current State (Implemented)

### 1. Natural Language to DSL (`/ai/generate-query`)
- Convert plain English to LogNog DSL queries
- Example: "show me errors from the last hour" → `search severity>=error | limit 100`

### 2. LlamaIndex RAG (`/ai/llama/*`)
- Vector-indexed knowledge base
- Query with context retrieval
- Multi-turn chat with memory
- Two models: Fast (DeepSeek) and Reasoning (Qwen3)

### 3. Interview Wizard (`/ai/interview/*`)
- Questionnaire generation for dev teams
- AI-analyzed responses
- Implementation guide generation

### 4. Custom RAG (`/ai/rag/*`)
- SQLite-based embeddings
- Log sample indexing
- Simple similarity search

---

## Phase 1: Query Intelligence (Priority: High)

### 1.1 Query Explanation
**What**: Explain what a DSL query does in plain English
**Why**: Users paste queries they don't understand
**API**: `POST /ai/explain-query`

```json
// Request
{ "query": "search host=web* severity>=warning | stats count by app_name | sort desc count" }

// Response
{
  "summary": "Find warnings and errors from web servers, count by application, show most frequent first",
  "breakdown": [
    { "command": "search host=web* severity>=warning", "explanation": "Filter logs from hosts starting with 'web' that are warnings or worse" },
    { "command": "stats count by app_name", "explanation": "Count how many logs per application" },
    { "command": "sort desc count", "explanation": "Sort by count, highest first" }
  ],
  "docs": [
    { "command": "search", "url": "/docs/query-language#search" },
    { "command": "stats", "url": "/docs/query-language#stats" }
  ]
}
```

### 1.2 Query Suggestions
**What**: Suggest related queries based on current search
**Why**: Users don't know what else to look for
**API**: `POST /ai/suggest-queries`

```json
// Request
{ "query": "search severity>=error", "context": "investigating outage" }

// Response
{
  "suggestions": [
    { "query": "search severity>=error | timechart span=5m count", "reason": "See error rate over time" },
    { "query": "search severity>=error | stats count by hostname", "reason": "Find which host has most errors" },
    { "query": "search severity>=error | rex field=message \"(?P<error_type>\\w+Error)\"", "reason": "Extract error types" }
  ]
}
```

### 1.3 Smart Autocomplete
**What**: AI-powered field and value suggestions
**Why**: Users don't know available fields
**API**: `GET /ai/autocomplete?partial=sev`

---

## Phase 2: Anomaly Detection (Priority: High)

### 2.1 Automatic Anomaly Alerts
**What**: ML detects unusual patterns without manual rules
**Why**: Find issues before users notice

**Implementation**:
1. Baseline normal patterns per host/app
2. Detect deviations (spike in errors, new error types, missing logs)
3. Generate alerts automatically

```json
// Auto-generated anomaly
{
  "type": "anomaly",
  "severity": "warning",
  "title": "Unusual error rate on web-01",
  "description": "Error rate increased 340% compared to baseline",
  "baseline": 12,
  "current": 53,
  "suggested_query": "search hostname=web-01 severity>=error | timechart span=5m count"
}
```

### 2.2 Pattern Recognition
**What**: Identify recurring error patterns
**API**: `POST /ai/analyze-patterns`

```json
// Response
{
  "patterns": [
    {
      "pattern": "Connection timeout to database",
      "count": 47,
      "first_seen": "2025-01-15T10:00:00Z",
      "last_seen": "2025-01-15T10:30:00Z",
      "affected_hosts": ["api-01", "api-02"],
      "suggested_action": "Check database connection pool settings"
    }
  ]
}
```

### 2.3 Missing Log Detection
**What**: Alert when expected logs stop arriving
**Why**: Silence often indicates bigger problems

---

## Phase 3: Investigation Assistant (Priority: Medium)

### 3.1 Root Cause Analysis
**What**: AI traces back to find the source of issues
**API**: `POST /ai/root-cause`

```json
// Request
{ "symptom": "Users reporting slow checkout", "timerange": "last 1 hour" }

// Response
{
  "probable_cause": "Database connection pool exhaustion",
  "confidence": 0.85,
  "evidence": [
    "Connection timeout errors started at 14:23",
    "Database CPU spiked to 95% at 14:20",
    "Checkout service latency increased 400%"
  ],
  "timeline": [...],
  "recommended_actions": [
    "Increase connection pool size",
    "Add database read replicas"
  ]
}
```

### 3.2 Incident Summary
**What**: Generate human-readable incident reports
**API**: `POST /ai/summarize-incident`

### 3.3 Guided Troubleshooting Chat
**What**: Interactive chat for debugging
**API**: `POST /ai/llama/chat` (existing)

---

## Phase 4: Personalization (Priority: Medium)

### 4.1 Environment Learning
**What**: Index user's actual log schema, fields, patterns
**How**: Automatically extract and index:
- Field names and types
- Common values per field
- Typical query patterns
- Alert history

### 4.2 Custom Terminology
**What**: Learn organization's terms
**Example**: "deployment" means `app_name=deploy-service`

### 4.3 Team Knowledge Base
**What**: Index runbooks, postmortems, tribal knowledge
**How**: Feed docs into LlamaIndex

---

## Phase 5: Developer Onboarding (Priority: High)

### 5.1 Enhanced Interview Wizard
**What**: Generate actionable implementation code
**Current**: Generic recommendations
**Goal**: Copy-paste ready code for specific frameworks

**Output should include**:
```javascript
// 1. Install logging library
npm install pino pino-http

// 2. Create logger (src/lib/logger.ts)
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

// 3. Add HTTP logging middleware (src/middleware/logging.ts)
import pinoHttp from 'pino-http';
import { logger } from '../lib/logger';

export const httpLogger = pinoHttp({ logger });

// 4. Log critical events
logger.info({ event: 'payment_success', user_id, amount }, 'Payment processed');
logger.error({ event: 'payment_failure', user_id, error }, 'Payment failed');

// 5. Ship to LogNog (vector.toml addition)
[sources.app_logs]
type = "file"
include = ["/var/log/myapp/*.log"]

[sinks.lognog]
type = "http"
inputs = ["app_logs"]
uri = "http://lognog:4000/api/ingest/http"
```

### 5.2 Framework-Specific Templates
Pre-built logging setups for:
- Next.js / Vercel
- Express.js
- FastAPI / Python
- Spring Boot / Java
- Go services
- Serverless (Lambda, Cloud Functions)

### 5.3 Validation Endpoint
**What**: Verify logs are arriving correctly
**API**: `POST /ai/validate-setup`

```json
// Request
{ "app_name": "my-app", "expected_events": ["startup", "request", "error"] }

// Response
{
  "status": "partial",
  "receiving_logs": true,
  "events_found": ["startup", "request"],
  "events_missing": ["error"],
  "suggestions": ["Add error logging to catch blocks"]
}
```

---

## Implementation Priority

| Phase | Feature | Effort | Impact |
|-------|---------|--------|--------|
| 1.1 | Query Explanation | Low | High |
| 1.2 | Query Suggestions | Medium | High |
| 2.1 | Anomaly Detection | High | Very High |
| 5.1 | Enhanced Interview Output | Medium | High |
| 3.1 | Root Cause Analysis | High | Very High |
| 4.1 | Environment Learning | Medium | Medium |

---

## Sources

- [Splunk AI Assistant for SPL](https://www.splunk.com/en_us/blog/platform/flatten-the-spl-learning-curve-introducing-splunk-ai-assistant-for-spl.html)
- [Building an AI Assistant in Splunk Observability Cloud](https://www.splunk.com/en_us/blog/artificial-intelligence/building-an-ai-assistant-in-splunk-observability-cloud.html)
- [Grafana AI/ML for Observability](https://grafana.com/blog/2024/07/02/identify-anomalies-outlier-detection-forecasting-how-grafana-cloud-uses-ai-ml-to-make-observability-easier/)
