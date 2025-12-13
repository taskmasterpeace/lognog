# OTLP Authentication

This document describes how to configure authentication for OpenTelemetry (OTLP) log ingestion in LogNog.

## Overview

LogNog supports receiving logs via the OpenTelemetry Protocol (OTLP) HTTP/JSON endpoint at:

```
POST /api/ingest/otlp/v1/logs
```

By default, this endpoint requires API key authentication to prevent unauthorized log ingestion. However, authentication can be disabled for migration or testing purposes.

## Authentication Methods

The OTLP endpoint supports three authentication header formats:

### 1. Bearer Token (Recommended)

```bash
Authorization: Bearer <api-key>
```

### 2. ApiKey Format

```bash
Authorization: ApiKey <api-key>
```

### 3. Custom Header

```bash
X-API-Key: <api-key>
```

## Configuration

### Environment Variable

The OTLP authentication behavior is controlled by the `OTLP_REQUIRE_AUTH` environment variable:

| Value | Behavior |
|-------|----------|
| `true` (default) | API key authentication is required |
| `false` | Authentication is optional (allows unauthenticated ingestion) |

In `docker-compose.yml`:

```yaml
api:
  environment:
    OTLP_REQUIRE_AUTH: ${OTLP_REQUIRE_AUTH:-true}
```

To disable authentication:

```bash
# Create .env file or export environment variable
export OTLP_REQUIRE_AUTH=false
docker-compose up -d
```

### API Key Requirements

API keys used for OTLP ingestion must have the `write` permission. Keys with only `read` permission will be rejected.

## Creating an API Key for OTLP

### Via Web UI

1. Log in to LogNog
2. Navigate to **Settings > API Keys**
3. Click **Create API Key**
4. Fill in the details:
   - **Name**: "OTLP Ingestion" (or any descriptive name)
   - **Permissions**: Select `write` (or `*` for all permissions)
   - **Expiration**: Optional (e.g., 365 days)
5. Click **Create**
6. Copy the API key immediately (it won't be shown again)

### Via API

```bash
# Login to get access token
ACCESS_TOKEN=$(curl -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}' \
  | jq -r '.tokens.accessToken')

# Create API key with write permission
curl -X POST http://localhost/api/auth/api-keys \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "OTLP Ingestion",
    "permissions": ["write"],
    "expiresInDays": 365
  }'
```

## OpenTelemetry Collector Configuration

### Basic Configuration

Configure your OpenTelemetry Collector to send logs to LogNog with authentication:

```yaml
exporters:
  otlphttp/lognog:
    endpoint: http://lognog.example.com/api/ingest/otlp/v1/logs
    headers:
      Authorization: "Bearer lnog_abc123_your_api_key_here"

service:
  pipelines:
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlphttp/lognog]
```

### Using X-API-Key Header

```yaml
exporters:
  otlphttp/lognog:
    endpoint: http://lognog.example.com/api/ingest/otlp/v1/logs
    headers:
      X-API-Key: "lnog_abc123_your_api_key_here"
```

### Environment Variable for API Key

For better security, use environment variables:

```yaml
exporters:
  otlphttp/lognog:
    endpoint: http://lognog.example.com/api/ingest/otlp/v1/logs
    headers:
      Authorization: "Bearer ${LOGNOG_API_KEY}"
```

Then run the collector with:

```bash
export LOGNOG_API_KEY=lnog_abc123_your_api_key_here
otelcol --config=config.yaml
```

## Application SDK Configuration

### Node.js (JavaScript/TypeScript)

```javascript
const { LoggerProvider } = require('@opentelemetry/sdk-logs');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');

const logExporter = new OTLPLogExporter({
  url: 'http://lognog.example.com/api/ingest/otlp/v1/logs',
  headers: {
    'Authorization': 'Bearer lnog_abc123_your_api_key_here',
  },
});

const loggerProvider = new LoggerProvider();
loggerProvider.addLogRecordProcessor(
  new BatchLogRecordProcessor(logExporter)
);
```

### Python

```python
from opentelemetry.sdk._logs import LoggerProvider
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter

exporter = OTLPLogExporter(
    endpoint="http://lognog.example.com/api/ingest/otlp/v1/logs",
    headers={
        "Authorization": "Bearer lnog_abc123_your_api_key_here"
    }
)

provider = LoggerProvider()
provider.add_log_record_processor(BatchLogRecordProcessor(exporter))
```

### Go

```go
package main

import (
    "go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp"
    "go.opentelemetry.io/otel/sdk/log"
)

func main() {
    exporter, err := otlploghttp.New(
        context.Background(),
        otlploghttp.WithEndpoint("lognog.example.com"),
        otlploghttp.WithURLPath("/api/ingest/otlp/v1/logs"),
        otlploghttp.WithHeaders(map[string]string{
            "Authorization": "Bearer lnog_abc123_your_api_key_here",
        }),
        otlploghttp.WithInsecure(), // Remove for HTTPS
    )
    if err != nil {
        panic(err)
    }

    provider := log.NewLoggerProvider(
        log.WithProcessor(log.NewBatchProcessor(exporter)),
    )
    defer provider.Shutdown(context.Background())
}
```

## Testing OTLP Ingestion

### Using cURL

```bash
curl -X POST http://localhost/api/ingest/otlp/v1/logs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer lnog_abc123_your_api_key_here" \
  -d '{
    "resourceLogs": [{
      "resource": {
        "attributes": [
          {"key": "service.name", "value": {"stringValue": "test-service"}},
          {"key": "host.name", "value": {"stringValue": "test-host"}}
        ]
      },
      "scopeLogs": [{
        "scope": {"name": "test"},
        "logRecords": [{
          "timeUnixNano": "1234567890000000000",
          "severityNumber": 9,
          "severityText": "INFO",
          "body": {"stringValue": "Test log message"}
        }]
      }]
    }]
  }'
```

### Verify Authentication

Test with no authentication (should fail if `OTLP_REQUIRE_AUTH=true`):

```bash
curl -X POST http://localhost/api/ingest/otlp/v1/logs \
  -H "Content-Type: application/json" \
  -d '{"resourceLogs": []}'

# Expected response (401 Unauthorized):
{
  "error": "Authentication required",
  "message": "Provide API key in Authorization header (Bearer <key>) or X-API-Key header"
}
```

Test with invalid API key (should fail):

```bash
curl -X POST http://localhost/api/ingest/otlp/v1/logs \
  -H "Authorization: Bearer invalid-key" \
  -H "Content-Type: application/json" \
  -d '{"resourceLogs": []}'

# Expected response (401 Unauthorized):
{
  "error": "Invalid API key"
}
```

## Security Best Practices

### 1. Always Use HTTPS in Production

Never send API keys over unencrypted connections:

```yaml
exporters:
  otlphttp/lognog:
    endpoint: https://lognog.example.com/api/ingest/otlp/v1/logs  # HTTPS!
    headers:
      Authorization: "Bearer ${LOGNOG_API_KEY}"
```

### 2. Rotate API Keys Regularly

Create new API keys periodically and revoke old ones:

```bash
# List existing keys
curl http://localhost/api/auth/api-keys \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# Revoke old key
curl -X DELETE http://localhost/api/auth/api-keys/{key-id} \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### 3. Use Dedicated API Keys

Create separate API keys for different services or environments:

- `otlp-production` - Production OTLP ingestion
- `otlp-staging` - Staging environment
- `otlp-dev` - Development testing

### 4. Monitor API Key Usage

Check the **Settings > API Keys** page to view:
- Last used timestamp
- Number of ingestion events
- Failed authentication attempts

### 5. Set Expiration Dates

Always set expiration dates for API keys:

```json
{
  "name": "OTLP Production",
  "permissions": ["write"],
  "expiresInDays": 90
}
```

### 6. Restrict Permissions

Only grant `write` permission for ingestion keys. Avoid using `*` (all permissions) unless necessary.

## Audit Logging

All OTLP ingestion events are logged in the authentication audit log:

```sql
-- View recent OTLP ingestion events
SELECT * FROM auth_audit_log
WHERE event_type IN ('otlp_ingest_auth', 'otlp_ingest', 'ingestion_permission_denied')
ORDER BY created_at DESC
LIMIT 100;
```

Events logged:
- `otlp_ingest_auth` - Successful authentication
- `otlp_ingest` - Successful log ingestion
- `ingestion_permission_denied` - API key lacks write permission

## Troubleshooting

### Error: "Authentication required"

**Cause**: No API key provided and `OTLP_REQUIRE_AUTH=true`

**Solution**: Add API key to headers or set `OTLP_REQUIRE_AUTH=false`

### Error: "Invalid API key"

**Cause**: API key is incorrect, expired, or revoked

**Solution**:
1. Verify API key is correct
2. Check if key is expired in Settings > API Keys
3. Create a new API key

### Error: "API key requires write permission for ingestion"

**Cause**: API key only has `read` permission

**Solution**: Create a new API key with `write` or `*` permission

### Error: "User account is disabled"

**Cause**: The user associated with the API key is deactivated

**Solution**: Reactivate the user account or create a new API key with an active user

### Logs Not Appearing in LogNog

**Checklist**:
1. Verify API key is valid: Test with cURL
2. Check OTLP payload format: Ensure `resourceLogs` array exists
3. Review API logs: `docker-compose logs api`
4. Check authentication audit log for errors
5. Verify network connectivity: Can collector reach LogNog?

### Connection Refused

**Cause**: LogNog API is not accessible

**Solution**:
1. Verify LogNog is running: `docker-compose ps`
2. Check port mapping: API should be on port 80 (nginx) or 4000 (direct)
3. Test connectivity: `curl http://lognog-host/health`

## Migration from Unauthenticated OTLP

If you're migrating from an unauthenticated setup:

1. **Create API keys** for all existing OTLP sources
2. **Update configurations** with API keys (test in staging first)
3. **Enable authentication**: Set `OTLP_REQUIRE_AUTH=true`
4. **Restart LogNog**: `docker-compose restart api`
5. **Monitor logs** for authentication errors
6. **Update remaining sources** as needed

Alternatively, use a phased approach:

1. Deploy with `OTLP_REQUIRE_AUTH=false` (allows both authenticated and unauthenticated)
2. Update all OTLP sources to include API keys
3. Verify all sources are authenticated (check audit logs)
4. Enable `OTLP_REQUIRE_AUTH=true`

## API Reference

### Endpoint

```
POST /api/ingest/otlp/v1/logs
```

### Request Headers

| Header | Format | Required |
|--------|--------|----------|
| `Content-Type` | `application/json` | Yes |
| `Authorization` | `Bearer <api-key>` or `ApiKey <api-key>` | Yes* |
| `X-API-Key` | `<api-key>` | Yes* |

*Required if `OTLP_REQUIRE_AUTH=true` (default)

### Request Body

OTLP/HTTP JSON format as specified in the [OpenTelemetry Protocol specification](https://opentelemetry.io/docs/specs/otlp/).

### Response Codes

| Code | Meaning |
|------|---------|
| `200` | Success - logs accepted |
| `400` | Invalid OTLP format |
| `401` | Authentication required or invalid API key |
| `403` | API key lacks write permission |
| `500` | Internal server error |

### Success Response

```json
{
  "accepted": 42
}
```

### Error Response

```json
{
  "error": "Authentication required",
  "message": "Provide API key in Authorization header (Bearer <key>) or X-API-Key header"
}
```

## See Also

- [OpenTelemetry Collector Documentation](https://opentelemetry.io/docs/collector/)
- [OTLP Specification](https://opentelemetry.io/docs/specs/otlp/)
- [LogNog API Keys Guide](../README.md#authentication)
- [Security Best Practices](./SECURITY-ROADMAP.md)
