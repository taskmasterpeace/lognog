# Directors Palette v2 → LogNog Integration Guide

## Endpoint & Auth

```
POST https://analytics.machinekinglabs.com/api/ingest/nextjs
X-API-Key: lnog_f6ca89cdb6e84bed845422f306a49467
Content-Type: application/json
```

---

## Developer API Questions Answered

### 1. Query/Search API

**YES** - Full REST API:

```bash
POST /api/search/query
Content-Type: application/json
X-API-Key: lnog_your_key

{
  "query": "search index=nextjs http_status>=400 | stats count by http_route",
  "earliest": "-1h",
  "latest": "now"
}
```

### 2. Query Syntax (Splunk-like DSL)

```bash
# Basic search
search index=nextjs http_status=200

# Filters
search index=nextjs severity<=3
| filter app_name~"api"

# Aggregations
search index=nextjs
| stats count, avg(api_duration_ms), p95(api_duration_ms) by http_route
| sort desc count

# Time bucketing
search index=nextjs
| timechart span=5m count by http_status
```

**Operators**: `=`, `!=`, `>`, `<`, `>=`, `<=`, `~` (contains), `!~` (not contains)

### 3. Response Format

```json
{
  "query": "search index=nextjs...",
  "results": [
    {
      "timestamp": "2025-12-31T06:23:26.283",
      "hostname": "nextjs",
      "app_name": "nextjs-api",
      "severity": 6,
      "message": "POST /api/generate 200 (1523ms)",
      "structured_data": {
        "http_route": "/api/generate",
        "http_status": 200,
        "api_duration_ms": 1523,
        "user_email": "john@example.com"
      }
    }
  ],
  "count": 100,
  "executionTime": 23
}
```

### 4. Real-time / Live Tail

**YES** - WebSocket:
```
ws://logs.machinekinglabs.com/api/ws/tail
```

### 5. Stats Functions

`count`, `sum`, `avg`, `min`, `max`, `dc` (distinct), `values`, `list`, `earliest`, `latest`, `p50`, `p90`, `p95`, `p99`, `median`, `mode`, `stddev`, `variance`, `range`

### 6. Time Ranges

```bash
earliest=-1h latest=now
earliest=-7d latest=-1d
earliest=2025-12-31T00:00:00Z latest=2025-12-31T23:59:59Z
```

### 7. Index Management

```bash
search index=nextjs ...    # Specific index
search index=* ...         # All indexes
```

### 8. Authentication

```
X-API-Key: lnog_your_key
```

---

## CRITICAL: Richer Logging Schema

### The Problem

Current logs are **useless** because they lack context:

```json
// ❌ BAD - What does this tell us?
{ "type": "business", "event": "credit_deduction", "amount": 20 }
```

### The Solution

Include **business context** in every log:

```json
// ✅ GOOD - Now we can analyze this!
{
  "type": "business",
  "event": "credit_deduction",
  "user_id": "d3a01f94-...",
  "user_email": "john@example.com",
  "credits_deducted": 20,
  "credits_before": 100,
  "credits_after": 80,
  "reason": "image_generation",
  "model": "flux-schnell",
  "generation_id": "gen_abc123"
}
```

---

## Updated Logger Class

```typescript
// lib/lognog.ts
class LogNogLogger {
  private endpoint = process.env.LOGNOG_ENDPOINT || '';
  private apiKey = process.env.LOGNOG_API_KEY || '';
  private queue: any[] = [];

  constructor() {
    if (typeof window !== 'undefined' && this.endpoint) {
      setInterval(() => this.flush(), 5000);
    }
  }

  private enqueue(event: any) {
    if (!this.endpoint) return;
    this.queue.push({
      timestamp: Date.now(),
      environment: process.env.NODE_ENV || 'development',
      ...event,
    });
    if (this.queue.length >= 100) this.flush();
  }

  // API call logging
  api(data: {
    route: string;
    method: string;
    statusCode: number;
    durationMs: number;
    // User context (REQUIRED)
    userId?: string;
    userEmail?: string;
    // Integration details
    integration?: 'replicate' | 'supabase' | 'stripe';
    integrationLatencyMs?: number;
    model?: string;
    // Request context
    requestId?: string;
    // Business context
    creditsUsed?: number;
    // Error details
    error?: string;
    errorCode?: string;
  }) {
    this.enqueue({
      type: 'api',
      ...data,
    });
  }

  // Integration logging (Replicate, Supabase, Stripe)
  integration(data: {
    integration: 'replicate' | 'supabase' | 'stripe';
    success: boolean;
    latencyMs: number;
    // Replicate specific
    model?: string;
    promptLength?: number;
    promptPreview?: string;  // First 50 chars
    predictionId?: string;
    outputUrl?: string;
    // Cost tracking
    estimatedCost?: number;
    // Error
    error?: string;
    errorCode?: string;
  }) {
    this.enqueue({
      type: 'integration',
      ...data,
    });
  }

  // Business events (credits, generations, etc.)
  business(data: {
    event: 'credit_deduction' | 'generation_completed' | 'user_signup' | 'subscription_created' | string;
    // User context (REQUIRED)
    userId: string;
    userEmail: string;
    // Credit tracking
    creditsDeducted?: number;
    creditsBefore?: number;
    creditsAfter?: number;
    // Context
    reason?: string;
    model?: string;
    generationId?: string;
    // Metadata
    metadata?: Record<string, any>;
  }) {
    this.enqueue({
      type: 'business',
      ...data,
    });
  }

  // Error logging
  error(data: {
    message: string;
    stack?: string;
    // Location
    component?: string;
    page?: string;
    // User context
    userId?: string;
    userEmail?: string;
    // Request context
    requestId?: string;
    // Error details
    errorCode?: string;
    model?: string;
    retryCount?: number;
  }) {
    this.enqueue({
      type: 'error',
      ...data,
    });
  }

  // User actions (client-side)
  action(data: {
    name: string;
    component: string;
    page: string;
    userId?: string;
    metadata?: Record<string, any>;
  }) {
    this.enqueue({
      type: 'action',
      ...data,
    });
  }

  async flush() {
    if (!this.queue.length || !this.endpoint) return;
    const batch = this.queue.splice(0, 100);
    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey
        },
        body: JSON.stringify(batch),
      });
    } catch (e) {
      this.queue.unshift(...batch);
      console.error('[LogNog] Flush failed:', e);
    }
  }
}

export const logger = new LogNogLogger();
```

---

## Example: Full Generation Flow

```typescript
// app/api/generation/image/route.ts
import { logger } from '@/lib/lognog';

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  // Get user from session
  const session = await getSession();
  const user = session?.user;

  try {
    const { prompt, model } = await req.json();

    // 1. Log Replicate call
    const replicateStart = Date.now();
    const result = await replicate.run(model, { input: { prompt } });
    const replicateLatency = Date.now() - replicateStart;

    logger.integration({
      integration: 'replicate',
      success: true,
      latencyMs: replicateLatency,
      model: model,
      promptLength: prompt.length,
      promptPreview: prompt.substring(0, 50),
      predictionId: result.id,
      outputUrl: result.output?.[0],
      estimatedCost: 0.003,
    });

    // 2. Deduct credits
    const creditsBefore = user.credits;
    const creditsToDeduct = 20;
    await deductCredits(user.id, creditsToDeduct);

    logger.business({
      event: 'credit_deduction',
      userId: user.id,
      userEmail: user.email,
      creditsDeducted: creditsToDeduct,
      creditsBefore: creditsBefore,
      creditsAfter: creditsBefore - creditsToDeduct,
      reason: 'image_generation',
      model: model,
      generationId: result.id,
    });

    // 3. Log API completion
    logger.api({
      route: '/api/generation/image',
      method: 'POST',
      statusCode: 200,
      durationMs: Date.now() - startTime,
      userId: user.id,
      userEmail: user.email,
      requestId: requestId,
      integration: 'replicate',
      integrationLatencyMs: replicateLatency,
      model: model,
      creditsUsed: creditsToDeduct,
    });

    await logger.flush(); // REQUIRED for serverless
    return Response.json({ success: true, output: result.output });

  } catch (error: any) {
    logger.error({
      message: error.message,
      stack: error.stack,
      component: 'GenerateAPI',
      page: '/api/generation/image',
      userId: user?.id,
      userEmail: user?.email,
      requestId: requestId,
      errorCode: error.code || 'UNKNOWN',
    });

    logger.api({
      route: '/api/generation/image',
      method: 'POST',
      statusCode: 500,
      durationMs: Date.now() - startTime,
      userId: user?.id,
      userEmail: user?.email,
      requestId: requestId,
      error: error.message,
      errorCode: error.code,
    });

    await logger.flush();
    return Response.json({ error: error.message }, { status: 500 });
  }
}
```

---

## Queries You Can Run After

Once logging is implemented with this schema:

```bash
# Credits used by user (last 24h)
search index=nextjs event=credit_deduction earliest=-24h
| stats sum(creditsDeducted) as total_credits by userEmail
| sort desc total_credits

# Slow Replicate calls (>5s)
search index=nextjs integration=replicate latencyMs>5000
| table timestamp, model, latencyMs, userEmail

# Error rate by model
search index=nextjs type=error model=*
| stats count by model
| sort desc count

# Generation cost by model
search index=nextjs integration=replicate
| stats sum(estimatedCost) as cost, count by model
| sort desc cost

# Users with most errors
search index=nextjs type=error userEmail=*
| stats count by userEmail
| sort desc count
| head 10

# Average latency by model
search index=nextjs integration=replicate success=true
| stats avg(latencyMs), p95(latencyMs) by model
```

---

## Environment Variables

```env
LOGNOG_ENDPOINT=https://analytics.machinekinglabs.com/api/ingest/nextjs
LOGNOG_API_KEY=lnog_f6ca89cdb6e84bed845422f306a49467
```

---

## Testing

```bash
curl -X POST https://analytics.machinekinglabs.com/api/ingest/nextjs \
  -H "Content-Type: application/json" \
  -H "X-API-Key: lnog_f6ca89cdb6e84bed845422f306a49467" \
  -d '[{
    "timestamp": 1735640000000,
    "type": "integration",
    "integration": "replicate",
    "success": true,
    "latencyMs": 3500,
    "model": "flux-schnell",
    "userEmail": "test@example.com"
  }]'
```

Check logs: https://logs.machinekinglabs.com → Search → `search index=nextjs`
