# Director's Palette Integration Guide

Integration guide for sending Director's Palette analytics to LogNog.

---

## Overview

Director's Palette can send generation events, user analytics, and application logs to LogNog for centralized monitoring, dashboards, and alerting.

**What LogNog Provides:**
- Real-time log search with Splunk-like query language
- Custom dashboards for revenue, usage, and user analytics
- Alerts (email, webhook) for anomalies
- Data retention with automatic TTL cleanup
- No per-GB pricing (self-hosted)

---

## Quick Start

### Step 1: Get Your API Key

1. Log into LogNog at `https://your-lognog-server`
2. Go to **Settings** (gear icon)
3. Scroll to **API Keys** section
4. Click **Create API Key**
5. Name it: `Directors Palette Production`
6. Copy the key (shown once!)

### Step 2: Send Events

```javascript
// utils/lognog.ts
const LOGNOG_URL = 'https://your-lognog-server/api/ingest/http';
const LOGNOG_API_KEY = process.env.LOGNOG_API_KEY;

export async function logToLogNog(events: object | object[]) {
  const payload = Array.isArray(events) ? events : [events];

  try {
    await fetch(LOGNOG_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': LOGNOG_API_KEY,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // Non-blocking - don't fail the main operation
    console.error('LogNog logging failed:', err);
  }
}
```

### Step 3: Log Generation Events

After each generation completes:

```javascript
import { logToLogNog } from '@/utils/lognog';

// In your generation completion handler
await logToLogNog({
  timestamp: new Date().toISOString(),
  event_type: 'generation',
  app: 'directors-palette',

  // User info
  user_id: user.id,
  user_email: user.email,

  // Generation details
  model_id: selectedModel.id,
  model_name: selectedModel.name,
  generation_type: 'image', // or 'video', 'character_sheet'

  // Business metrics
  cost_cents: model.costCents,
  credits_used: creditsCharged,

  // Technical details
  prediction_id: replicateResponse.id,
  status: 'completed', // or 'failed'
  duration_ms: endTime - startTime,

  // Optional metadata
  prompt_length: prompt.length,
  reference_images: referenceImages?.length || 0,
  resolution: '1024x1024',
});
```

---

## Event Types to Log

### 1. Generation Events (Required)

```javascript
{
  timestamp: "2024-01-15T10:30:00Z",
  event_type: "generation",
  app: "directors-palette",
  user_id: "uuid",
  user_email: "user@example.com",
  model_id: "nano-banana-pro",
  model_name: "Nano Banana Pro",
  generation_type: "image",
  cost_cents: 20,
  credits_used: 2,
  prediction_id: "replicate-abc123",
  status: "completed",
  duration_ms: 4500,
  prompt_length: 150,
  reference_images: 2,
  resolution: "1024x1024"
}
```

### 2. Credit Events (Recommended)

```javascript
{
  timestamp: "2024-01-15T10:29:00Z",
  event_type: "credit_purchase",
  app: "directors-palette",
  user_id: "uuid",
  user_email: "user@example.com",
  package_name: "100 Credits",
  amount_cents: 999,
  credits_purchased: 100,
  payment_provider: "stripe",
  transaction_id: "ch_xxx"
}
```

### 3. Auth Events (Recommended)

```javascript
{
  timestamp: "2024-01-15T10:00:00Z",
  event_type: "auth",
  app: "directors-palette",
  action: "login", // or 'signup', 'logout', 'password_reset'
  user_id: "uuid",
  user_email: "user@example.com",
  ip_address: "1.2.3.4",
  user_agent: "Mozilla/5.0..."
}
```

### 4. Error Events (Recommended)

```javascript
{
  timestamp: "2024-01-15T10:35:00Z",
  event_type: "error",
  app: "directors-palette",
  severity: "error",
  user_id: "uuid",
  error_type: "generation_failed",
  error_message: "Model timeout after 30s",
  model_id: "some-model",
  prediction_id: "replicate-xyz",
  stack_trace: "..."
}
```

---

## Example Queries in LogNog

Once data is flowing, you can query it:

### Revenue Today
```
search app=directors-palette event_type=generation
  | stats sum(cost_cents) as revenue_cents
```

### Top Users by Spend
```
search app=directors-palette event_type=generation
  | stats sum(cost_cents) as total_spend by user_email
  | sort desc total_spend
  | limit 10
```

### Generations by Model
```
search app=directors-palette event_type=generation status=completed
  | stats count by model_name
```

### Failed Generations
```
search app=directors-palette event_type=generation status=failed
  | table timestamp, user_email, model_name, error_message
```

### Average Generation Time by Model
```
search app=directors-palette event_type=generation status=completed
  | stats avg(duration_ms) as avg_ms by model_name
```

### Daily Active Users
```
search app=directors-palette event_type=generation
  | bin span=1d timestamp
  | stats dc(user_id) as unique_users by timestamp
```

### Credit Purchase Revenue
```
search app=directors-palette event_type=credit_purchase
  | stats sum(amount_cents) as total_revenue, count as purchases
```

---

## Deployment Options

### Option A: Direct Internet Access

If LogNog is accessible from the internet:

```
Director's Palette (Vercel)
        ↓ HTTPS
LogNog Server (your-domain.com:443)
```

**Pros:** Simple setup
**Cons:** Requires exposing LogNog to internet

**Security:** Use HTTPS + API key authentication (already built-in)

### Option B: VPN/Private Network

If LogNog is behind a firewall:

```
Director's Palette (Vercel)
        ↓ HTTPS
Cloudflare Tunnel / Tailscale / WireGuard
        ↓
LogNog Server (internal network)
```

**Options:**
- **Cloudflare Tunnel** (free) - Expose only the ingest endpoint
- **Tailscale** - Add Vercel edge function to your tailnet
- **API Gateway** - Use AWS API Gateway as a proxy

### Option C: Batch Export (Simplest)

Don't expose LogNog at all - export periodically:

```javascript
// Scheduled function (e.g., Vercel cron, Supabase scheduled function)
// Runs every hour, exports last hour's data

const events = await supabase
  .from('generation_events')
  .select('*')
  .gte('created_at', oneHourAgo);

// POST to LogNog when you're connected to your network
// Or download as JSON and import manually
```

---

## Supabase Log Drains (Bonus)

You can ALSO enable Supabase's built-in Log Drains to capture:
- Postgres query logs
- Auth events (managed by Supabase)
- Edge function logs
- Storage events

**Setup:**
1. Go to Supabase Dashboard → Project Settings → Log Drains
2. Add HTTP destination: `https://your-lognog/api/ingest/supabase`
3. Add header: `X-API-Key: your-lognog-key`

This gives you Supabase's internal logs in addition to your custom events.

---

## Vercel Log Drains (Bonus)

Capture Vercel deployment and function logs:

**Setup:**
1. Go to Vercel Dashboard → Project → Settings → Log Drains
2. Add custom HTTP: `https://your-lognog/api/ingest/vercel`
3. Add header: `X-API-Key: your-lognog-key`

---

## Data Retention

LogNog automatically manages data:

| Setting | Default | Notes |
|---------|---------|-------|
| **TTL** | 90 days | Auto-deletes older data |
| **Partitioning** | Monthly | Efficient storage |
| **Compression** | ClickHouse native | ~10x compression |

To adjust retention, modify `clickhouse/init/01-schema.sql`:
```sql
TTL toDateTime(timestamp) + INTERVAL 365 DAY  -- Keep 1 year
```

---

## Dashboard Ideas

Once data is flowing, create dashboards for:

### Revenue Dashboard
- Total revenue (stat)
- Revenue by day (line chart)
- Revenue by model (pie chart)
- Top paying users (table)

### Usage Dashboard
- Total generations (stat)
- Generations per hour (line chart)
- Model popularity (bar chart)
- Failed vs successful (pie chart)

### User Dashboard
- Daily active users (line chart)
- New signups (stat)
- User leaderboard (table)
- Credit balance distribution (bar chart)

---

## Alerting

Set up alerts in LogNog for:

### High Error Rate
```
search app=directors-palette event_type=generation status=failed
  | stats count as failures
```
Alert if failures > 10 in 15 minutes

### Low Revenue
```
search app=directors-palette event_type=credit_purchase
  | stats sum(amount_cents) as revenue
```
Alert if revenue < expected daily amount

### Model Timeout Spike
```
search app=directors-palette event_type=generation duration_ms>30000
  | stats count as slow_generations
```
Alert if slow_generations > 5 in 10 minutes

---

## Summary

| What | How |
|------|-----|
| **Send custom events** | `POST /api/ingest/http` with JSON |
| **Supabase internal logs** | Enable Log Drains to `/api/ingest/supabase` |
| **Vercel logs** | Enable Log Drains to `/api/ingest/vercel` |
| **Authentication** | API key in `X-API-Key` header |
| **Retention** | 90 days default, configurable |
| **Querying** | Splunk-like DSL in LogNog UI |

---

## Contact

For LogNog issues: Check the [LogNog Documentation](../README.md)

For Director's Palette integration: Contact your team lead
