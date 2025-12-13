# Vercel Log Drains Integration

LogNog supports ingesting logs from Vercel projects using the Log Drains feature. This allows you to collect and analyze logs from all Vercel services in one place.

## Overview

Vercel Log Drains exports logs from:
- **Static**: CDN requests for static assets (HTML, CSS, JS, images)
- **Lambda**: Serverless function executions (API routes, SSR)
- **Edge**: Edge function requests (Edge Runtime, Middleware)
- **Build**: Deployment build logs and errors
- **External**: External rewrites and redirects

## Prerequisites

1. **Vercel Plan**: Log Drains require Vercel Pro or Enterprise plan
2. **LogNog API Key**: Create an API key with write permissions in LogNog Settings
3. **Network Access**: LogNog must be accessible from the internet (or use a tunnel like ngrok/Cloudflare Tunnel)

## Setup Instructions

### 1. Create LogNog API Key

1. Log into LogNog web UI
2. Go to **Settings → API Keys**
3. Click **Create API Key**
4. Set name to "Vercel Log Drain"
5. Set permissions to include `write`
6. Copy the generated API key

### 2. Configure Vercel Log Drain

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Navigate to **Settings → Integrations**
4. Scroll down to **Log Drains** section
5. Click **Add Log Drain**

### 3. Configure the Endpoint

**Delivery URL:**
```
https://your-lognog-server.com/api/ingest/vercel
```

**HTTP Method:** POST (default)

**Custom Headers:**
```
X-API-Key: your-lognog-api-key
```

**Log Sources:** Select all sources you want to capture:
- ☑ Static
- ☑ Lambda (Serverless Functions)
- ☑ Edge (Edge Functions)
- ☑ Build
- ☑ External

**Sampling Rate:** 1.0 (100% of logs, or adjust as needed)

**Secret:** (Optional) Leave empty unless you need request signing

### 4. Save and Test

1. Click **Add Log Drain**
2. Vercel will test the endpoint by sending a test log
3. If successful, you'll see a green checkmark
4. Logs will start flowing immediately

## Log Format

Vercel sends logs as NDJSON (newline-delimited JSON). Each line is a separate JSON object:

```json
{
  "id": "req_abc123xyz",
  "timestamp": 1705312345000,
  "type": "request",
  "source": "lambda",
  "deploymentId": "dpl_xyz789",
  "projectId": "prj_abc123",
  "host": "myapp.vercel.app",
  "path": "/api/users/123",
  "method": "GET",
  "statusCode": 200,
  "duration": 123,
  "region": "iad1",
  "lambdaId": "api-users-[id]",
  "coldStart": false,
  "proxy": {
    "timestamp": 1705312345000,
    "path": "/api/users/123",
    "method": "GET",
    "scheme": "https",
    "host": "myapp.vercel.app",
    "statusCode": 200,
    "userAgent": ["Mozilla/5.0..."],
    "referer": "https://myapp.vercel.app/",
    "clientIp": "192.0.2.1",
    "region": "iad1"
  },
  "message": "GET /api/users/123 200 in 123ms"
}
```

### Log Types

#### Static Logs (CDN)
```json
{
  "source": "static",
  "path": "/style.css",
  "statusCode": 200,
  "cache": "HIT"
}
```

#### Lambda Logs (Serverless Functions)
```json
{
  "source": "lambda",
  "lambdaId": "api-users-[id]",
  "path": "/api/users",
  "duration": 145,
  "coldStart": true,
  "message": "User fetched successfully"
}
```

#### Edge Logs (Edge Runtime)
```json
{
  "source": "edge",
  "path": "/_middleware",
  "duration": 12,
  "region": "iad1"
}
```

#### Build Logs
```json
{
  "source": "build",
  "deploymentId": "dpl_xyz",
  "message": "Build completed successfully",
  "level": "info"
}
```

## Querying Vercel Logs

### Basic Queries

```
# All Vercel logs
search index=vercel

# Lambda/serverless function logs only
search index=vercel vercel_source=lambda

# Edge function logs
search index=vercel vercel_source=edge

# Static asset requests
search index=vercel vercel_source=static

# Build logs
search index=vercel vercel_source=build
```

### Performance Monitoring

```
# Average response time by function
search index=vercel vercel_source=lambda
  | stats avg(duration_ms) as avg_ms, p95(duration_ms) as p95_ms by lambda_id
  | sort desc avg_ms

# Slowest requests (> 1 second)
search index=vercel duration_ms>1000
  | sort desc duration_ms
  | head 50
  | table timestamp, vercel_source, lambda_id, http_path, duration_ms, http_status

# Cold start rate
search index=vercel vercel_source=lambda
  | eval is_cold=if(cold_start="true", 1, 0)
  | stats count, sum(is_cold) as cold_starts
  | eval cold_start_rate=(cold_starts/count)*100

# Response time trend
search index=vercel vercel_source=lambda
  | timechart span=5m avg(duration_ms) as avg_ms, p95(duration_ms) as p95_ms
```

### Error Analysis

```
# All errors (4xx and 5xx)
search index=vercel http_status>=400
  | stats count by http_status, http_path
  | sort desc count

# Server errors only (5xx)
search index=vercel http_status>=500
  | table timestamp, vercel_source, lambda_id, http_path, http_status, message

# Error rate by function
search index=vercel vercel_source=lambda
  | eval is_error=if(http_status>=400, 1, 0)
  | stats count, sum(is_error) as errors by lambda_id
  | eval error_rate=(errors/count)*100
  | sort desc error_rate

# Timeout errors
search index=vercel message~"timeout" OR message~"FUNCTION_INVOCATION_TIMEOUT"
  | stats count by lambda_id
  | sort desc count
```

### Traffic Analysis

```
# Requests by region
search index=vercel
  | stats count by region
  | sort desc count

# Top endpoints by traffic
search index=vercel vercel_source=lambda
  | stats count by http_path
  | sort desc count
  | head 20

# HTTP methods distribution
search index=vercel
  | stats count by http_method
  | sort desc count

# Status code distribution
search index=vercel
  | stats count by http_status
  | eval status_group=if(http_status<200, "1xx", if(http_status<300, "2xx", if(http_status<400, "3xx", if(http_status<500, "4xx", "5xx"))))
  | stats count by status_group

# Traffic over time
search index=vercel
  | timechart span=1h count by vercel_source
```

### Cold Start Analysis

```
# Cold starts by function
search index=vercel vercel_source=lambda cold_start=true
  | stats count by lambda_id
  | sort desc count

# Cold start duration impact
search index=vercel vercel_source=lambda
  | stats avg(duration_ms) by cold_start
  | eval cold_start_label=if(cold_start="true", "Cold Start", "Warm Start")

# Cold starts over time
search index=vercel vercel_source=lambda cold_start=true
  | timechart span=1h count by lambda_id
```

### Deployment Tracking

```
# Requests by deployment
search index=vercel
  | stats count by deployment_id
  | sort desc count

# Recent deployments
search index=vercel vercel_source=build
  | sort desc timestamp
  | head 20
  | table timestamp, deployment_id, message

# Compare deployment performance
search index=vercel vercel_source=lambda deployment_id IN ("dpl_old", "dpl_new")
  | stats avg(duration_ms) as avg_ms, p95(duration_ms) as p95_ms by deployment_id
```

## Available Fields

### Common Fields

| Field | Description | Example |
|-------|-------------|---------|
| `timestamp` | Log timestamp (Unix ms) | `1705312345000` |
| `hostname` | Vercel project host | `myapp.vercel.app` |
| `message` | Log message | `GET /api/users 200 in 123ms` |
| `severity` | Syslog severity (0-7) | `6` (Info) |
| `vercel_source` | Log source type | `lambda`, `edge`, `static`, `build` |
| `deployment_id` | Deployment identifier | `dpl_xyz789` |
| `project_id` | Project identifier | `prj_abc123` |

### HTTP Request Fields

| Field | Description | Example |
|-------|-------------|---------|
| `http_method` | HTTP method | `GET`, `POST`, `PUT`, `DELETE` |
| `http_path` | Request path | `/api/users/123` |
| `http_status` | Response status code | `200`, `404`, `500` |
| `client_ip` | Client IP address | `192.0.2.1` |
| `user_agent` | User agent string | `Mozilla/5.0...` |
| `referer` | HTTP referer | `https://example.com` |

### Performance Fields

| Field | Description | Example |
|-------|-------------|---------|
| `duration_ms` | Request duration (ms) | `123` |
| `cold_start` | Cold start indicator | `true`, `false` |
| `region` | Vercel edge region | `iad1`, `sfo1`, `lhr1` |
| `cache` | Cache status (static) | `HIT`, `MISS`, `BYPASS` |

### Function Fields

| Field | Description | Example |
|-------|-------------|---------|
| `lambda_id` | Serverless function ID | `api-users-[id]` |
| `memory_mb` | Function memory limit | `1024` |
| `edge_function` | Edge function name | `middleware` |

## Creating Alerts

### High Error Rate Alert

```
# Alert: Too many errors
search index=vercel http_status>=500
  | stats count as errors
  | where errors > 10
```

### Slow Function Alert

```
# Alert: Function latency too high
search index=vercel vercel_source=lambda
  | stats avg(duration_ms) as avg_ms by lambda_id
  | where avg_ms > 1000
```

### Cold Start Alert

```
# Alert: Too many cold starts
search index=vercel vercel_source=lambda cold_start=true
  | stats count as cold_starts by lambda_id
  | where cold_starts > 50
```

### Build Failure Alert

```
# Alert: Build failed
search index=vercel vercel_source=build message~"failed" OR message~"error"
  | stats count as failures
  | where failures > 0
```

## Dashboard Examples

### Vercel Overview Dashboard

Create a dashboard with these panels:

#### 1. Request Volume (Timechart)
```
search index=vercel
  | timechart span=1h count by vercel_source
```

#### 2. Error Rate (Stat Card)
```
search index=vercel
  | eval is_error=if(http_status>=400, 1, 0)
  | stats count, sum(is_error) as errors
  | eval error_rate=(errors/count)*100
```

#### 3. Average Response Time (Stat Card)
```
search index=vercel vercel_source=lambda
  | stats avg(duration_ms) as avg_ms
```

#### 4. P95 Response Time (Stat Card)
```
search index=vercel vercel_source=lambda
  | stats p95(duration_ms) as p95_ms
```

#### 5. Top Endpoints (Bar Chart)
```
search index=vercel vercel_source=lambda
  | stats count by http_path
  | sort desc count
  | head 10
```

#### 6. Error Breakdown (Pie Chart)
```
search index=vercel http_status>=400
  | stats count by http_status
```

#### 7. Regional Traffic (Bar Chart)
```
search index=vercel
  | stats count by region
  | sort desc count
```

#### 8. Cold Starts (Timechart)
```
search index=vercel vercel_source=lambda cold_start=true
  | timechart span=1h count
```

### Serverless Functions Dashboard

#### 1. Function Invocations (Timechart)
```
search index=vercel vercel_source=lambda
  | timechart span=5m count by lambda_id
```

#### 2. Function Performance (Table)
```
search index=vercel vercel_source=lambda
  | stats count, avg(duration_ms) as avg_ms, p95(duration_ms) as p95_ms, sum(cold_start="true") as cold_starts by lambda_id
  | eval cold_start_pct=(cold_starts/count)*100
  | sort desc count
```

#### 3. Slowest Functions (Bar Chart)
```
search index=vercel vercel_source=lambda
  | stats avg(duration_ms) as avg_ms by lambda_id
  | sort desc avg_ms
  | head 10
```

#### 4. Error Rate by Function (Table)
```
search index=vercel vercel_source=lambda
  | eval is_error=if(http_status>=400, 1, 0)
  | stats count, sum(is_error) as errors by lambda_id
  | eval error_rate=(errors/count)*100
  | sort desc error_rate
```

## Troubleshooting

### Logs Not Arriving

1. **Check API Key**: Ensure the API key has write permissions
   ```bash
   # Test the endpoint manually
   curl -X POST https://your-lognog-server.com/api/ingest/vercel \
     -H "X-API-Key: your-api-key" \
     -H "Content-Type: application/x-ndjson" \
     -d '{"timestamp":1705312345000,"source":"lambda","message":"test"}'
   ```

2. **Check URL**: Verify the endpoint URL is correct and accessible from the internet
   - Try accessing the URL from a public location
   - Check for SSL certificate issues
   - Ensure no firewall is blocking Vercel's IP ranges

3. **Check Headers**: Ensure `X-API-Key` header is set correctly in Vercel settings

4. **Check Vercel Plan**: Log Drains require Pro or Enterprise plan

5. **Check Log Drain Status**: In Vercel Dashboard → Settings → Integrations → Log Drains
   - Look for error messages
   - Check delivery status (should show "Active")

6. **Check LogNog Logs**: Review API logs for ingestion errors
   ```
   search index=_internal message~"vercel" OR message~"ingest"
   ```

### Missing Fields

Some fields may not be present in all log types:
- **Lambda-specific fields** (`lambdaId`, `coldStart`) only appear in `source=lambda` logs
- **Cache fields** only appear in `source=static` logs
- **Build fields** only appear in `source=build` logs

If critical fields are missing, check:
1. Vercel log format version (may have changed)
2. Field extraction patterns in LogNog templates
3. Log source selection in Vercel settings

### High Volume / Rate Limiting

If you're receiving too many logs:

1. **Adjust Sampling Rate**: In Vercel Log Drain settings, reduce sampling from 1.0 to 0.5 (50%) or 0.1 (10%)

2. **Filter by Source**: Only enable the log sources you need (e.g., disable `static` if you don't need CDN logs)

3. **Set Up Retention Policies**: Configure shorter retention for high-volume logs
   ```
   search index=vercel vercel_source=static | delete
   ```

4. **Use Aggregation**: Create scheduled searches to aggregate data and delete raw logs

5. **Rate Limiting**: LogNog may throttle ingestion if volume is too high. Check API logs:
   ```
   search index=_internal message~"rate limit"
   ```

### Performance Issues

If queries are slow:

1. **Add Time Constraints**: Always include time range in queries
   ```
   search index=vercel earliest=-1h | stats count
   ```

2. **Use Indexed Fields**: Query on indexed fields when possible:
   - `vercel_source`
   - `http_status`
   - `lambda_id`

3. **Optimize Aggregations**: Use `stats` instead of raw events when possible

4. **Create Summary Indexes**: Build rollup tables for common queries

## Security Considerations

1. **API Key Security**:
   - Store your LogNog API key securely
   - Rotate API keys regularly
   - Use separate API keys for each log source
   - Revoke compromised keys immediately

2. **HTTPS Required**:
   - Always use HTTPS for the endpoint URL
   - Ensure valid SSL certificates
   - Vercel will not send to insecure HTTP endpoints

3. **Network Isolation**:
   - Consider using a VPN or private network
   - Whitelist Vercel's IP ranges if possible
   - Use API key authentication (required)

4. **Audit Logs**:
   - LogNog logs all ingestion events
   - Monitor for unauthorized access attempts
   - Review API key usage regularly

5. **Data Privacy**:
   - Logs may contain sensitive data (IPs, user agents, request data)
   - Ensure compliance with GDPR, CCPA, etc.
   - Consider masking sensitive fields
   - Set appropriate retention periods

6. **Request Signing** (Future):
   - Vercel may add request signing in the future
   - LogNog will support signature verification when available
   - Monitor Vercel changelog for updates

## Advanced Configuration

### Custom Field Extraction

Add custom field extraction patterns in LogNog:

1. Go to **Data Sources → Templates**
2. Find "Vercel Log Drains" template
3. Add custom field extractions:

```javascript
{
  field_name: 'function_name',
  pattern: 'lambdaId":"([^-]+)',
  pattern_type: 'regex',
  description: 'Extract function name from lambdaId'
}
```

### Filtering Unwanted Logs

Use Vercel's sampling rate or filter in LogNog:

```
# Delete static asset logs older than 7 days
search index=vercel vercel_source=static earliest=-7d
  | delete
```

### Integration with Other Tools

Forward Vercel logs to other systems:

```javascript
// In LogNog alert action
{
  "action": "webhook",
  "url": "https://slack.com/api/webhook",
  "body": {
    "text": "Vercel error: {{lambda_id}} - {{message}}"
  }
}
```

## Vercel Regions Reference

Common Vercel edge regions:

| Code | Location | Region |
|------|----------|--------|
| `iad1` | Washington, D.C., USA | US East |
| `sfo1` | San Francisco, USA | US West |
| `lhr1` | London, UK | Europe |
| `fra1` | Frankfurt, Germany | Europe |
| `sin1` | Singapore | Asia Pacific |
| `hnd1` | Tokyo, Japan | Asia Pacific |
| `syd1` | Sydney, Australia | Asia Pacific |
| `gru1` | São Paulo, Brazil | South America |

## Next Steps

1. **Create Dashboards**: Build custom dashboards for your Vercel projects
2. **Set Up Alerts**: Configure alerts for errors, slow functions, and cold starts
3. **Optimize Performance**: Use LogNog insights to optimize function performance
4. **Monitor Deployments**: Track deployment impact on performance and errors
5. **Explore Advanced Queries**: Dive deeper into your Vercel data with DSL queries

## Resources

- [Vercel Log Drains Documentation](https://vercel.com/docs/observability/log-drains)
- [LogNog Query Language Guide](./QUERY-LANGUAGE.md)
- [LogNog Dashboard Guide](./DASHBOARDS.md)
- [LogNog Alert Configuration](./ALERTS.md)

## Support

For issues or questions:
1. Check this documentation
2. Review LogNog API logs for errors
3. Verify Vercel Log Drain status
4. Open an issue on GitHub
