# Alert Actions System

LogNog's Alert Actions system provides a powerful, extensible framework for sending notifications when alerts trigger. It supports 113+ notification services via Apprise, enhanced template syntax with filters and math expressions, AI-powered summaries, and conditional content.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Notification Channels](#notification-channels)
- [Template Syntax](#template-syntax)
  - [Basic Variables](#basic-variables)
  - [Filters](#filters)
  - [Math Expressions](#math-expressions)
  - [Aggregate Functions](#aggregate-functions)
  - [Conditional Content](#conditional-content)
- [AI-Powered Summaries](#ai-powered-summaries)
- [Action Types](#action-types)
- [Docker Setup](#docker-setup)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [API Reference](#api-reference)

---

## Overview

When an alert fires in LogNog, it can execute one or more **actions**. Each action sends a notification to a configured destination (Slack, Discord, PagerDuty, email, etc.).

### Features

- **113+ Notification Services** via Apprise (Slack, Discord, Telegram, PagerDuty, SMS, and more)
- **Enhanced Template Syntax** with filters like `{{result_count:comma}}`, `{{timestamp:relative}}`
- **Math Expressions** in templates: `{{result.bytes / 1024 / 1024}}`
- **Aggregate Functions**: `{{results:sum:bytes}}`, `{{results:pluck:hostname:join:", "}}`
- **Conditional Content**: `{{#if severity == "critical"}}...{{/if}}`
- **AI Summaries**: `{{ai_summary}}` generates human-readable summaries via Ollama or OpenRouter
- **Global + Per-Alert Configuration**: Set up channels once in Settings, use everywhere

## Quick Start

### 1. Set Up a Notification Channel

Go to **Settings > Notifications** and add a channel:

1. Click **+ Add Channel**
2. Choose a service (e.g., Slack)
3. Enter the webhook URL
4. Click **Test Channel** to verify
5. Save

### 2. Create an Alert with Actions

Go to **Alerts** and create or edit an alert:

1. Define your search query and trigger conditions
2. In the **Actions** section, click **+ Add Action**
3. Select **Notification Channel**
4. Choose your configured channel
5. Customize the message template (optional)

### 3. Use Template Variables

Customize your notification message:

```
{{#if severity == "critical"}}
🔴 URGENT: Immediate attention required!
{{/if}}

Alert: {{alert_name}}
Severity: {{alert_severity:badge}}
Results: {{result_count:comma}}
Time: {{timestamp:relative}}

{{ai_summary}}

Top affected hosts:
{{#each results limit=5}}
• {{hostname}}: {{message:truncate:80}}
{{/each}}
```

## Notification Channels

Notification channels are configured globally in **Settings > Notifications** and can be used across all alerts.

### Supported Services

| Service | Description | URL Pattern |
|---------|-------------|-------------|
| Slack | Slack channels via webhook | `slack://TokenA/TokenB/TokenC/#channel` |
| Discord | Discord channels via webhook | `discord://webhook_id/webhook_token` |
| Telegram | Telegram bot messages | `tgram://bot_token/chat_id` |
| MS Teams | Microsoft Teams channels | `msteams://TokenA/TokenB/TokenC` |
| PagerDuty | Incident management | `pagerduty://integration_key` |
| Opsgenie | Alert management | `opsgenie://api_key` |
| Pushover | Push notifications | `pover://user_key/api_token` |
| ntfy | Self-hosted push notifications | `ntfy://topic` |
| Gotify | Self-hosted notifications | `gotify://hostname/token` |
| Matrix | Matrix room messages | `matrix://user:pass@hostname/#room` |
| Email (SMTP) | Email notifications | `mailto://user:pass@smtp.host` |
| Twilio SMS | SMS messages | `twilio://sid:token@from/to` |
| Custom Webhook | Any HTTP endpoint | `json://hostname/path` |

For a complete list of 113+ supported services, see [Apprise Wiki](https://github.com/caronc/apprise/wiki).

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/notifications/channels` | GET | List all channels |
| `/notifications/channels` | POST | Create a channel |
| `/notifications/channels/:id` | PUT | Update a channel |
| `/notifications/channels/:id` | DELETE | Delete a channel |
| `/notifications/channels/:id/test` | POST | Send test notification |
| `/notifications/services` | GET | List available services |
| `/notifications/status` | GET | Check Apprise service status |

## Template Syntax

LogNog's template engine supports variables, filters, math, aggregates, conditionals, and loops.

### Basic Variables

| Variable | Description | Example Output |
|----------|-------------|----------------|
| `{{alert_name}}` | Alert name | "High CPU Usage" |
| `{{alert_severity}}` | Alert severity | "CRITICAL" |
| `{{result_count}}` | Number of results | "1234" |
| `{{timestamp}}` | ISO timestamp | "2025-12-31T15:45:00Z" |
| `{{search_query}}` | The DSL query | "host=* cpu>90" |
| `{{result.field}}` | Field from first result | "web-01" |
| `{{result[0].field}}` | Field from Nth result | "192.168.1.1" |
| `{{ai_summary}}` | AI-generated summary | "High CPU detected on 3 servers" |

### Filters

Apply transformations using `{{variable:filter}}` syntax:

#### String Filters

| Filter | Description | Example |
|--------|-------------|---------|
| `upper` | UPPERCASE | `{{name:upper}}` → "JOHN" |
| `lower` | lowercase | `{{name:lower}}` → "john" |
| `capitalize` | Capitalize first | `{{name:capitalize}}` → "John" |
| `trim` | Remove whitespace | `{{value:trim}}` |
| `truncate:N` | Limit to N chars | `{{msg:truncate:100}}` → "First 100..." |
| `replace:old:new` | Replace text | `{{text:replace:_:-}}` |

#### Number Filters

| Filter | Description | Example |
|--------|-------------|---------|
| `comma` | Thousand separators | `{{count:comma}}` → "1,234" |
| `round:N` | Round to N decimals | `{{value:round:2}}` → "123.46" |
| `percent` | Format as percentage | `{{ratio:percent}}` → "94.5%" |
| `bytes` | Human-readable bytes | `{{size:bytes}}` → "1.5 GB" |

#### Date/Time Filters

| Filter | Description | Example |
|--------|-------------|---------|
| `relative` | Relative time | `{{ts:relative}}` → "5 minutes ago" |
| `date` | Formatted date | `{{ts:date}}` → "Dec 31, 2025" |
| `time` | Formatted time | `{{ts:time}}` → "3:45:00 PM" |
| `iso` | ISO 8601 format | `{{ts:iso}}` → "2025-12-31T15:45:00Z" |

#### Other Filters

| Filter | Description | Example |
|--------|-------------|---------|
| `badge` | Severity with emoji | `{{severity:badge}}` → "🔴 CRITICAL" |
| `json` | Pretty JSON | `{{data:json}}` |
| `default:val` | Fallback value | `{{name:default:Unknown}}` |
| `escape_html` | HTML escape | `{{text:escape_html}}` |

### Math Expressions

Perform calculations directly in templates:

```
{{result.bytes / 1024 / 1024}}       → 156.3 (MB)
{{result.used / result.total * 100}} → 75.5 (percentage)
{{result.errors + result.warnings}}  → Combined count
```

### Aggregate Functions

Aggregate across all results:

| Aggregate | Description | Example |
|-----------|-------------|---------|
| `count` | Count results | `{{results:count}}` |
| `sum:field` | Sum a field | `{{results:sum:bytes}}` |
| `avg:field` | Average a field | `{{results:avg:latency}}` |
| `min:field` | Minimum value | `{{results:min:size}}` |
| `max:field` | Maximum value | `{{results:max:cpu}}` |
| `first:field` | First value | `{{results:first:hostname}}` |
| `last:field` | Last value | `{{results:last:message}}` |
| `pluck:field` | Extract all values | `{{results:pluck:hostname}}` |
| `unique:field` | Unique values | `{{results:unique:hostname}}` |

Chain aggregates:

```
{{results:pluck:hostname:join:", "}}  → "host1, host2, host3"
{{results:unique:hostname:count}}     → 3
{{results:sum:bytes:bytes}}           → "1.5 GB"
```

### Conditional Content

Include content based on conditions:

```
{{#if severity == "critical"}}
🔴 URGENT: Immediate attention required!

Recommended steps:
1. Check server status
2. Verify no active incidents
3. Escalate to on-call if needed
{{#else if severity == "high"}}
🟠 Action needed within 1 hour
{{#else}}
ℹ️ For your information
{{/if}}
```

Supported operators: `==`, `!=`, `>`, `<`, `>=`, `<=`

### Loops

Iterate over results:

```
{{#each results limit=5}}
• Host: {{hostname}} - {{message:truncate:50}}
{{/each}}
```

Special loop variables:
- `{{@index}}` - Zero-based index
- `{{@number}}` - One-based number

## AI-Powered Summaries

The `{{ai_summary}}` variable generates a human-readable summary of the alert using AI.

### Configuration

LogNog supports two AI providers:

#### Ollama (Local, Self-Hosted)

```env
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

#### OpenRouter (Cloud, 200+ Models)

```env
OPENROUTER_API_KEY=sk-or-v1-...
OPENROUTER_MODEL=anthropic/claude-3-haiku-20240307
```

If both are configured, OpenRouter is tried first, with Ollama as fallback.

### Example Output

**Alert Context:**
- Alert: High CPU Usage
- Results: 3 servers with CPU > 95%

**AI Summary:**
> "High CPU usage detected on 3 production servers (web-01, web-02, db-01) over the last 15 minutes. Average CPU at 94%. Consider scaling or investigating resource-intensive processes."

## Action Types

### Apprise (Notification Channel)

Send notifications via any configured channel.

```json
{
  "type": "apprise",
  "config": {
    "channel": "slack-ops",
    "title": "{{alert_severity:badge}} {{alert_name}}",
    "message": "{{ai_summary}}\n\nResults: {{result_count:comma}}",
    "format": "text"
  }
}
```

### Email (SMTP)

Send email notifications.

```json
{
  "type": "email",
  "config": {
    "to": "alerts@example.com",
    "subject": "[{{alert_severity}}] {{alert_name}}",
    "body": "Alert details..."
  }
}
```

Requires SMTP configuration:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=alerts@example.com
SMTP_PASS=app-password
SMTP_FROM=LogNog <alerts@example.com>
```

### Webhook

Send HTTP requests to any endpoint.

```json
{
  "type": "webhook",
  "config": {
    "url": "https://api.example.com/alerts",
    "method": "POST",
    "headers": {
      "Authorization": "Bearer token"
    },
    "payload": "{\"alert\": \"{{alert_name}}\", \"count\": {{result_count}}}"
  }
}
```

### Script

Execute a local script or command.

```json
{
  "type": "script",
  "config": {
    "command": "/opt/scripts/handle-alert.sh"
  }
}
```

Environment variables available to scripts:
- `LOGNOG_ALERT_NAME`
- `LOGNOG_ALERT_SEVERITY`
- `LOGNOG_ALERT_RESULT_COUNT`
- `LOGNOG_ALERT_QUERY`
- `LOGNOG_ALERT_RESULTS_JSON`

### Log

Write to console/log for debugging.

```json
{
  "type": "log",
  "config": {}
}
```

## Docker Setup

Apprise is included in LogNog's Docker Compose:

```yaml
apprise:
  image: caronc/apprise:latest
  container_name: lognog-apprise
  ports:
    - "8000:8000"
  environment:
    - APPRISE_STATEFUL_MODE=simple
  volumes:
    - apprise-config:/config
  restart: unless-stopped
```

The API connects to Apprise via the `APPRISE_URL` environment variable:

```yaml
api:
  environment:
    APPRISE_URL: http://apprise:8000
```

## Best Practices

### 1. Use Conditional Severity Messaging

```
{{#if severity == "critical"}}
🔴 CRITICAL - Immediate action required!

ESCALATION: Page the on-call engineer immediately.
{{#else if severity == "high"}}
🟠 HIGH - Please investigate within 1 hour.
{{#else}}
ℹ️ Info - For awareness only.
{{/if}}
```

### 2. Include Remediation Steps

```
{{#if alert_name == "High CPU Usage"}}
Remediation steps:
1. Check running processes: `top -c`
2. Identify CPU hogs: `ps aux --sort=-%cpu | head`
3. Check for runaway processes
4. Consider horizontal scaling
{{/if}}
```

### 3. Use AI Summaries for Context

```
{{ai_summary}}

---
Full details: {{result_count:comma}} events in the last {{time_range}}
```

### 4. List Affected Resources

```
Affected hosts ({{results:unique:hostname:count}}):
{{#each results limit=10}}
• {{hostname}} ({{severity:badge}})
{{/each}}
{{#if result_count > 10}}
... and {{result_count - 10}} more
{{/if}}
```

### 5. Include Quick Links

```
[View in LogNog](https://lognog.local/search?q={{search_query:escape_url}})
[Silence Alert](https://lognog.local/silences/new?alert_id={{alert_id}})
```

## Troubleshooting

### Apprise Not Connecting

Check if the Apprise container is running:
```bash
docker ps | grep apprise
docker logs lognog-apprise
```

Check the health endpoint:
```bash
curl http://localhost:8000/status
```

### Notifications Not Sending

1. Verify the notification channel is enabled
2. Test the channel in Settings > Notifications
3. Check API logs: `docker logs lognog-api`
4. Verify the Apprise URL is correct

### AI Summary Not Working

1. Check if Ollama or OpenRouter is configured
2. Verify Ollama is running: `curl http://localhost:11434/api/tags`
3. Check for API key issues in logs

### Template Syntax Errors

Common issues:
- Missing closing braces: `{{variable}` (should be `{{variable}}`)
- Typos in filter names: `{{value:uppeer}}` (should be `upper`)
- Invalid conditions: `{{#if value = 1}}` (should be `==`)

## API Reference

### Create Alert with Apprise Action

```bash
curl -X POST http://localhost:4000/alerts \
  -H "Content-Type: application/json" \
  -d '{
    "name": "High Error Rate",
    "search_query": "severity<=3",
    "trigger_type": "number_of_results",
    "trigger_condition": "greater_than",
    "trigger_threshold": 100,
    "time_range": "-5m",
    "severity": "high",
    "actions": [{
      "type": "apprise",
      "config": {
        "channel": "slack-ops",
        "title": "{{alert_severity:badge}} {{alert_name}}",
        "message": "{{ai_summary}}\n\n{{result_count:comma}} errors detected."
      }
    }]
  }'
```

### Test Notification Channel

```bash
curl -X POST http://localhost:4000/notifications/channels/{id}/test
```

### Get Available Template Filters

```bash
curl http://localhost:4000/notifications/filters
```
