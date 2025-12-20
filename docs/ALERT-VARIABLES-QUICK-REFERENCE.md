# Alert Variables - Quick Reference

## Syntax
Variables use double curly braces: `{{variable_name}}`

## Common Variables

### Alert Info
| Variable | Example |
|----------|---------|
| `{{alert_name}}` | `High Error Rate` |
| `{{alert_severity}}` | `CRITICAL` |
| `{{result_count}}` | `150` |
| `{{timestamp}}` | `2025-12-16T10:30:00Z` |

### Log Fields
| Variable | Example |
|----------|---------|
| `{{hostname}}` | `web-01` |
| `{{app_name}}` | `nginx` |
| `{{severity}}` | `3` |
| `{{message}}` | `Connection timeout` |
| `{{source_ip}}` | `192.168.1.100` |
| `{{user}}` | `admin` |

### Stats Results
| Variable | Example |
|----------|---------|
| `{{count}}` | `42` |
| `{{sum}}` | `1024` |
| `{{avg}}` | `25.5` |
| `{{max}}` | `100` |
| `{{min}}` | `1` |

## Access Patterns

### Direct (first result)
```
{{hostname}}
{{message}}
```

### Explicit first result
```
{{result.hostname}}
{{result.message}}
```

### Specific result by index
```
{{result[0].hostname}}  # First
{{result[1].hostname}}  # Second
{{result[2].hostname}}  # Third
```

### Nested fields
```
{{result.metadata.server.name}}
{{result.http.request.method}}
```

## Quick Examples

### Email Subject
```
{{alert_severity}}: {{hostname}} - {{result_count}} events
```
→ `CRITICAL: web-01 - 150 events`

### Email Body
```
Alert: {{alert_name}}
Host: {{hostname}}
Count: {{result_count}}
Time: {{timestamp}}
```

### Webhook (Slack)
```json
{
  "text": "🚨 {{alert_name}}",
  "blocks": [{
    "type": "section",
    "text": {
      "type": "mrkdwn",
      "text": "*Host:* {{hostname}}\n*Count:* {{result_count}}"
    }
  }]
}
```

### Webhook (Generic)
```json
{
  "alert": "{{alert_name}}",
  "severity": "{{alert_severity}}",
  "host": "{{hostname}}",
  "count": {{result_count}},
  "timestamp": "{{timestamp}}"
}
```

## Tips

1. **Missing variables** → Shown as-is: `{{unknown}}`
2. **Numeric variables** → No quotes needed in JSON
3. **Test first** → Use "Test Alert" button
4. **Use Variable Helper** → Click button in UI for full list

## Common Use Cases

### Multiple hosts
```
Alert: {{result_count}} hosts affected
First: {{result[0].hostname}}
Second: {{result[1].hostname}}
```

### Stats query results
```
Query: search error | stats count by hostname

Subject: {{hostname}} has {{count}} errors
```

### With aggregations
```
Query: search | stats avg(response_time) as avg_time by hostname

Body: Host {{hostname}} avg response: {{avg_time}}ms
```

## Full Documentation
See `docs/ALERT-VARIABLES.md` for complete guide.
