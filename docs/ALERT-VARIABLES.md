# Alert Variable Templating

LogNog alerts support Splunk-style variable templating in alert titles, messages, and webhook payloads. This allows you to create dynamic, context-rich notifications that include specific information from your query results.

## Overview

Variables are enclosed in double curly braces: `{{variable_name}}`. When an alert triggers, these variables are replaced with actual values from the query results.

## Available Variables

### Alert Metadata

These variables provide information about the alert itself:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{alert_name}}` | Name of the alert | `High Error Rate` |
| `{{alert_severity}}` | Severity level (uppercase) | `CRITICAL` |
| `{{result_count}}` | Number of results that triggered | `150` |
| `{{timestamp}}` | When the alert was triggered | `2025-12-16T10:30:00Z` |

### Result Fields

These variables access fields from the first result returned by your query:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{hostname}}` | Hostname from logs | `web-01` |
| `{{app_name}}` | Application name | `nginx` |
| `{{severity}}` | Log severity level | `3` |
| `{{message}}` | Log message | `Connection timeout` |
| `{{source_ip}}` | Source IP address | `192.168.1.100` |
| `{{user}}` | User from logs | `admin` |

### Aggregated Fields

When using `stats` commands, the aggregated values are available:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{count}}` | Count from stats | `42` |
| `{{sum}}` | Sum from stats | `1024` |
| `{{avg}}` | Average from stats | `25.5` |
| `{{max}}` | Maximum value | `100` |
| `{{min}}` | Minimum value | `1` |

## Advanced Access Patterns

### Direct Field Access

Use the `result.` prefix to explicitly access fields from the first result:

```
{{result.hostname}}
{{result.app_name}}
{{result.severity}}
```

### Indexed Result Access

Access specific results by index:

```
{{result[0].hostname}}   # First result
{{result[1].hostname}}   # Second result
{{result[2].hostname}}   # Third result
```

### Nested Field Access

Use dot notation for nested fields:

```
{{result.metadata.server.name}}
{{result.http.request.method}}
{{result.user.email}}
```

## Examples

### Email Alert Subject

```
High Error Rate on {{hostname}} - {{result_count}} errors
```

**Result:**
```
High Error Rate on web-01 - 150 errors
```

### Email Alert Body

```
Alert: {{alert_name}}
Severity: {{alert_severity}}
Time: {{timestamp}}

The following host has triggered an alert:
- Hostname: {{hostname}}
- Application: {{app_name}}
- Error Count: {{result_count}}
- Last Message: {{message}}

Please investigate immediately.
```

**Result:**
```
Alert: High Error Rate
Severity: CRITICAL
Time: 2025-12-16T10:30:00Z

The following host has triggered an alert:
- Hostname: web-01
- Application: nginx
- Error Count: 150
- Last Message: Connection timeout

Please investigate immediately.
```

### Webhook Payload

```json
{
  "alert": "{{alert_name}}",
  "severity": "{{alert_severity}}",
  "host": "{{hostname}}",
  "count": {{result_count}},
  "timestamp": "{{timestamp}}",
  "details": {
    "app": "{{app_name}}",
    "message": "{{message}}"
  }
}
```

**Result:**
```json
{
  "alert": "High Error Rate",
  "severity": "CRITICAL",
  "host": "web-01",
  "count": 150,
  "timestamp": "2025-12-16T10:30:00Z",
  "details": {
    "app": "nginx",
    "message": "Connection timeout"
  }
}
```

### Stats Query Variables

For queries with stats commands:

**Query:**
```
search severity<=3 | stats count, avg(response_time) as avg_time by hostname
```

**Email Subject:**
```
Performance Alert: {{hostname}} - {{count}} errors, {{avg_time}}ms avg
```

**Result:**
```
Performance Alert: web-01 - 42 errors, 523.5ms avg
```

## Using the Variable Helper (UI)

When creating or editing alert actions in the UI:

1. Look for the "Variable Helper" button next to text fields that support variables
2. Click the button to see all available variables
3. Variables are organized by category for easy browsing
4. Click any variable to copy it to your clipboard or insert it directly into the field

## Fallback Behavior

If a variable doesn't exist in the results:
- The raw variable name is displayed (e.g., `{{missing_field}}`)
- No error is thrown
- The alert continues to execute normally

This graceful fallback ensures alerts don't fail due to missing fields.

## Best Practices

### 1. Use Descriptive Subjects

❌ Bad:
```
Alert triggered
```

✅ Good:
```
{{alert_severity}}: {{hostname}} - {{result_count}} {{alert_name}}
```

### 2. Provide Context in Body

Include relevant details that help responders act quickly:

```
ALERT: {{alert_name}}
Severity: {{alert_severity}}
Time: {{timestamp}}

Affected System:
- Host: {{hostname}}
- Application: {{app_name}}
- IP: {{source_ip}}

Metrics:
- Event Count: {{result_count}}
- Error Message: {{message}}

Action Required: Investigate immediately
```

### 3. Structure Webhook Payloads

Use valid JSON with proper quoting:

```json
{
  "text": "Alert: {{alert_name}}",
  "severity": "{{alert_severity}}",
  "count": {{result_count}},
  "host": "{{hostname}}"
}
```

Note: Numeric variables like `{{result_count}}` don't need quotes.

### 4. Test Variables First

Before enabling an alert:
1. Use the "Test Alert" button to see what results your query returns
2. Check which fields are available in the results
3. Update your variable references accordingly

### 5. Handle Multiple Results

If your query returns multiple results, consider:
- Using `{{result[0]}}`, `{{result[1]}}`, etc. to reference specific results
- Summarizing in the message: "{{result_count}} hosts affected"
- Creating separate alerts for different scenarios

## Integration Examples

### Slack Webhook

```json
{
  "text": "🚨 *{{alert_name}}*",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Severity:* {{alert_severity}}\n*Host:* {{hostname}}\n*Count:* {{result_count}}"
      }
    }
  ]
}
```

### Microsoft Teams Webhook

```json
{
  "@type": "MessageCard",
  "@context": "https://schema.org/extensions",
  "summary": "{{alert_name}}",
  "themeColor": "FF0000",
  "title": "{{alert_severity}}: {{alert_name}}",
  "sections": [{
    "activityTitle": "Alert Triggered",
    "facts": [
      {"name": "Host", "value": "{{hostname}}"},
      {"name": "Count", "value": "{{result_count}}"},
      {"name": "Time", "value": "{{timestamp}}"}
    ]
  }]
}
```

### PagerDuty Events API

```json
{
  "routing_key": "YOUR_KEY",
  "event_action": "trigger",
  "payload": {
    "summary": "{{alert_name}} on {{hostname}}",
    "severity": "critical",
    "source": "{{hostname}}",
    "custom_details": {
      "alert": "{{alert_name}}",
      "count": {{result_count}},
      "message": "{{message}}"
    }
  }
}
```

## Variable Reference Quick Guide

| Category | Variables |
|----------|-----------|
| **Alert Info** | `alert_name`, `alert_severity`, `result_count`, `timestamp` |
| **Log Fields** | `hostname`, `app_name`, `severity`, `message`, `source_ip`, `user` |
| **Stats** | `count`, `sum`, `avg`, `max`, `min` |
| **Advanced** | `result.field`, `result[N].field`, `result.nested.field` |

## Technical Implementation

Variable substitution happens server-side when the alert triggers:

1. Alert condition is met
2. Query results are retrieved
3. Variables in action configs are replaced with actual values
4. Actions (email, webhook) are executed with substituted values

This ensures:
- Variables are always up-to-date
- No client-side exposure of sensitive data
- Consistent behavior across all action types
