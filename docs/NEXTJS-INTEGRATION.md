# Next.js Integration

LogNog provides first-class support for Next.js applications with a dedicated ingestion endpoint and TypeScript client library.

## Overview

The Next.js integration captures:
- **API Calls**: Route, method, status, duration, external integrations (Replicate, Supabase, Stripe)
- **User Actions**: Button clicks, form submissions, navigation events
- **Performance Metrics**: Core Web Vitals (LCP, FID, CLS, TTFB)
- **Errors**: Client and server-side errors with stack traces

## Quick Start

### 1. Create API Key

1. Go to LogNog → Settings → API Keys
2. Create new key with `write` permission
3. Copy the API key

### 2. Environment Variables

```env
LOGNOG_ENDPOINT=https://your-lognog-server/api/ingest/nextjs
LOGNOG_API_KEY=lnog_your_key_here
```

### 3. Copy Client Library

```bash
cp -r /path/to/lognog/examples/nextjs-logger/src your-app/lib/lognog
```

### 4. Initialize Logger

```typescript
// lib/lognog.ts
import { NextJsLogger } from './lognog';

export const logger = new NextJsLogger({
  endpoint: process.env.LOGNOG_ENDPOINT!,
  apiKey: process.env.LOGNOG_API_KEY!,
  batchSize: 100,
  batchIntervalMs: 5000,
  sendInDevelopment: false,
  debug: process.env.NODE_ENV === 'development',
});
```

## Usage Examples

### API Route Logging (App Router)

```typescript
// app/api/generate/route.ts
import { logger } from '@/lib/lognog';

export async function POST(req: Request) {
  const start = Date.now();

  try {
    // Call Replicate
    const replicateStart = Date.now();
    const result = await replicate.run("stability-ai/sdxl", { prompt });
    const replicateLatency = Date.now() - replicateStart;

    // Log successful API call
    logger.api({
      route: '/api/generate',
      method: 'POST',
      statusCode: 200,
      durationMs: Date.now() - start,
      integration: 'replicate',
      integrationLatencyMs: replicateLatency,
      userId: session?.user?.id,
    });

    await logger.flush(); // For Vercel Serverless
    return Response.json({ success: true, data: result });

  } catch (error) {
    logger.error({
      message: error.message,
      stack: error.stack,
      component: 'GenerateAPI',
      page: '/api/generate',
    });

    await logger.flush();
    return Response.json({ error: 'Generation failed' }, { status: 500 });
  }
}
```

### User Action Tracking

```typescript
'use client';
import { logger } from '@/lib/lognog';

export function GenerateButton() {
  const handleClick = () => {
    logger.action({
      name: 'generate_clicked',
      component: 'GenerateButton',
      page: window.location.pathname,
      metadata: { variant: 'primary' },
    });
  };

  return <button onClick={handleClick}>Generate</button>;
}
```

### Performance Monitoring (Core Web Vitals)

```typescript
// app/layout.tsx
'use client';
import { useEffect } from 'react';
import { logger } from '@/lib/lognog';

export default function RootLayout({ children }) {
  useEffect(() => {
    import('web-vitals').then(({ onCLS, onFID, onLCP, onTTFB }) => {
      onCLS((m) => logger.performance({ metric: 'CLS', value: m.value, page: location.pathname }));
      onFID((m) => logger.performance({ metric: 'FID', value: m.value, page: location.pathname }));
      onLCP((m) => logger.performance({ metric: 'LCP', value: m.value, page: location.pathname }));
      onTTFB((m) => logger.performance({ metric: 'TTFB', value: m.value, page: location.pathname }));
    });
  }, []);

  return <html>{children}</html>;
}
```

### Error Boundary

```typescript
'use client';
import { Component, ReactNode } from 'react';
import { logger } from '@/lib/lognog';

export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error({
      message: error.message,
      stack: error.stack,
      component: errorInfo.componentStack?.split('\n')[1]?.trim(),
      page: window.location.pathname,
      userAgent: navigator.userAgent,
    });
  }

  render() {
    if (this.state.hasError) return <div>Something went wrong</div>;
    return this.props.children;
  }
}
```

## Querying Logs

### API Performance

```
# Average response time by route
search index=nextjs nextjs_type=api
  | stats avg(api_duration_ms) as avg_ms, p95(api_duration_ms) as p95_ms by http_route
  | sort desc avg_ms

# Slowest API calls
search index=nextjs nextjs_type=api api_duration_ms>1000
  | sort desc api_duration_ms
  | head 20

# Integration performance
search index=nextjs integration_name=*
  | stats avg(integration_latency_ms) as avg_ms by integration_name
```

### Error Analysis

```
# Recent errors
search index=nextjs nextjs_type=error
  | sort desc timestamp
  | head 50
  | table timestamp, error_message, error_component

# Error rate by component
search index=nextjs nextjs_type=error
  | stats count by error_component
  | sort desc count
```

### User Behavior

```
# Most common actions
search index=nextjs nextjs_type=action
  | stats count by action_name, action_component
  | sort desc count
```

### Performance Metrics

```
# Core Web Vitals summary
search index=nextjs nextjs_type=performance
  | stats avg(perf_value), p75(perf_value), p95(perf_value) by perf_metric

# Pages with poor LCP
search index=nextjs nextjs_type=performance perf_metric=LCP perf_value>2500
  | stats count, avg(perf_value) by perf_page
```

## Dashboard Examples

### API Response Time (timechart)
```
search index=nextjs nextjs_type=api
  | timechart span=5m avg(api_duration_ms), p95(api_duration_ms)
```

### Error Rate (stat)
```
search index=nextjs
  | eval is_error=if(nextjs_type="error" OR http_status>=500, 1, 0)
  | stats count, sum(is_error) as errors
  | eval error_rate=round((errors/count)*100, 2)
```

### Top API Routes (table)
```
search index=nextjs nextjs_type=api
  | stats count, avg(api_duration_ms), sum(http_status>=400) as errors by http_route
  | sort desc count
  | head 10
```

## Best Practices

### Security
- Never log sensitive data (passwords, API keys, tokens)
- Hash or mask PII (user IDs, emails)
- Use environment-specific settings

### Performance
- Use batching (default: 100 events or 5 seconds)
- Call `flush()` before serverless functions terminate
- Don't await log calls in UI code (fire and forget)

### Serverless
```typescript
// Always flush before function ends
export async function POST(req: Request) {
  // ... your code
  await logger.flush(); // Ensure logs are sent
  return Response.json(result);
}
```

## Troubleshooting

### Logs not appearing
1. Check API key permissions (needs `write`)
2. Verify endpoint URL
3. Enable debug mode: `new NextJsLogger({ debug: true })`
4. Check browser/server console for errors

### Vercel timeout
- Flush logs before response: `await logger.flush()`
- Use smaller batch sizes for serverless

## Event Schema

```typescript
{
  timestamp: number;           // Unix milliseconds
  type: 'api' | 'action' | 'performance' | 'error';
  environment: 'development' | 'production' | 'preview';
  deployment_id?: string;      // Vercel deployment ID
  user_id?: string;
  session_id?: string;

  // Type-specific data
  api?: { route, method, status_code, duration_ms, integration, ... };
  action?: { name, component, page, metadata };
  performance?: { metric, value, page, device_type };
  error?: { message, stack, component, page, user_agent };
}
```

## Stored Fields

| Field | Description | Example |
|-------|-------------|---------|
| `nextjs_type` | Log type | `api`, `action`, `performance`, `error` |
| `nextjs_environment` | Environment | `production`, `development` |
| `http_route` | API route | `/api/generate` |
| `http_method` | HTTP method | `POST` |
| `http_status` | Status code | `200`, `500` |
| `api_duration_ms` | Request duration | `1523` |
| `integration_name` | External service | `replicate`, `supabase` |
| `integration_latency_ms` | Service latency | `1450` |
| `action_name` | User action | `button_clicked` |
| `action_component` | Component name | `GenerateButton` |
| `perf_metric` | Web Vital | `LCP`, `FID`, `CLS` |
| `perf_value` | Metric value | `1200` |
| `error_message` | Error message | `Failed to connect` |
| `error_component` | Error source | `GenerateAPI` |
