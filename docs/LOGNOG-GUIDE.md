# LogNog User Guide

> Your Logs, Your Control - Self-hosted log management for homelabs

---

## What is LogNog?

LogNog is a self-hosted, fully-local Splunk alternative designed for homelabs and small teams. It lets you collect, search, and analyze logs from all your devices without sending data to the cloud.

**Key Benefits:**
- 100% local - your logs never leave your network
- Splunk-like query language that's easy to learn
- Built-in alerting and dashboards
- Supports syslog, OTLP, and many integrations
- AI-powered features using local LLMs

---

## Getting Started

### Quick Start (Docker)

1. Clone the repository and start services:
```bash
git clone https://github.com/yourusername/lognog.git
cd lognog
docker-compose up -d
```

2. Open http://localhost in your browser
3. Create your admin account
4. Start sending logs!

### First Steps After Installation

1. **Create an API Key** - Go to Settings → API Keys to create a key for ingestion
2. **Configure a Log Source** - Point your devices to LogNog via syslog (UDP/TCP 514)
3. **Run a Search** - Go to Search and try: `search *`
4. **Create a Dashboard** - Save interesting searches as dashboard panels

---

## Query Language (DSL)

LogNog uses a Splunk-like query language. Queries are pipelines of commands connected by `|`.

### Basic Search

```
search host=router severity>=warning
```

This finds logs where:
- `host` equals "router"
- `severity` is 4 (warning) or higher (error, critical, alert, emergency)

### Common Commands

| Command | Purpose | Example |
|---------|---------|---------|
| `search` | Find logs matching conditions | `search app_name=nginx` |
| `filter` | Additional filtering | `filter message~"error"` |
| `stats` | Aggregate data | `stats count by hostname` |
| `sort` | Order results | `sort desc timestamp` |
| `limit` | Limit results | `limit 100` |
| `table` | Select specific fields | `table timestamp hostname message` |
| `timechart` | Time-based aggregation | `timechart span=1h count` |

### Operators

- `=` exact match: `host=web-01`
- `!=` not equal: `severity!=7`
- `>=` `<=` `>` `<` comparison: `severity>=4`
- `~` regex match: `message~"error|fail"`
- `!~` regex not match: `message!~"debug"`

### Statistics Functions

- `count` - count events
- `sum(field)` - sum values
- `avg(field)` - average
- `min(field)` / `max(field)` - extremes
- `dc(field)` - distinct count
- `values(field)` - list unique values

### Examples

**Find errors from the last hour:**
```
search severity>=error
```

**Count logs by host:**
```
search * | stats count by hostname
```

**Error trend over time:**
```
search severity>=error | timechart span=1h count
```

**Top 10 talking hosts:**
```
search * | stats count by hostname | sort desc count | limit 10
```

**Find 404 errors in nginx:**
```
search app_name=nginx | filter message~"404"
```

---

## Sending Logs to LogNog

### Syslog (Recommended for Servers)

LogNog accepts syslog on port 514 (UDP and TCP).

**Linux rsyslog:**
```bash
# Add to /etc/rsyslog.conf
*.* @lognog-server:514    # UDP
*.* @@lognog-server:514   # TCP
```

**Test syslog:**
```bash
echo "<14>Test message from $(hostname)" | nc -u lognog-server 514
```

### HTTP API (For Applications)

Use the HTTP endpoint for direct log ingestion:

```bash
curl -X POST http://lognog-server:4000/api/ingest/http \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '[{
    "timestamp": "2025-01-15T10:00:00Z",
    "hostname": "my-app",
    "app_name": "myapp",
    "severity": 6,
    "message": "User logged in",
    "structured_data": {"user_id": "123"}
  }]'
```

### LogNog In Agent (For Windows/Desktop)

Install the LogNog In agent to collect:
- Log files
- Windows Event Logs
- File Integrity Monitoring (FIM)

### Supabase Log Drains

1. Go to Supabase Dashboard → Settings → Log Drains
2. Add HTTP endpoint: `https://lognog-server/api/ingest/supabase`
3. Add header: `X-API-Key: your-api-key`

### Vercel Log Drains

1. Go to Vercel Dashboard → Project Settings → Log Drains
2. URL: `https://lognog-server/api/ingest/vercel`
3. Add header: `X-API-Key: your-api-key`

### SmartThings (IoT Devices)

1. Create SmartApp in SmartThings Developer Workspace
2. Configure webhook: `https://lognog-server/api/ingest/smartthings`
3. Add header: `X-API-Key: your-api-key`

---

## Alerts

### Creating Alerts

1. Go to Alerts → Create Alert
2. Enter a DSL query (e.g., `search severity>=error | stats count`)
3. Set threshold (e.g., trigger when count > 10)
4. Configure alert actions (see below)
5. Set check interval

### Alert Actions (Notifications)

LogNog supports 113+ notification services via Apprise integration:

**Supported Services:**
- Slack, Discord, Microsoft Teams
- Telegram, Pushover, ntfy
- PagerDuty, Opsgenie
- Email (SMTP)
- Custom webhooks
- And 100+ more!

**Setting up notifications:**

1. Go to Settings → Notifications
2. Add a notification channel (e.g., Slack)
3. Test the channel with one click
4. When creating alerts, select the channel from the dropdown

**Template Variables:**

Use variables in alert messages:
```
🚨 {{alert_name:upper}}

{{ai_summary}}

Results: {{result_count:comma}}
Time: {{timestamp:relative}}
```

Available filters:
- `{{value:upper}}` - UPPERCASE
- `{{value:lower}}` - lowercase
- `{{count:comma}}` - 1,234 format
- `{{timestamp:relative}}` - "5 minutes ago"
- `{{message:truncate:100}}` - First 100 chars
- `{{ai_summary}}` - AI-generated summary (requires Ollama)

See [Alert Actions Guide](./ALERT-ACTIONS.md) for complete documentation.

### Alert Examples

**High error rate:**
```
search severity>=error | timechart span=5m count | where count > 50
```

**Disk space warning:**
```
search message~"disk.*(full|space)" severity>=warning
```

**Authentication failures:**
```
search message~"authentication.*(fail|denied)" | stats count | where count > 5
```

### Silencing Alerts

You can silence alerts temporarily:
- **Global silence** - silences all alerts
- **Per-host silence** - silence alerts from specific hosts
- **Per-alert silence** - silence a specific alert rule

---

## Data Sources

### Data Source Onboarding Wizard

LogNog includes a guided wizard to help you set up new log sources:

1. Go to Data Sources → Add Source
2. Choose your source type:
   - **Syslog** - Network devices, Linux servers
   - **Supabase** - Supabase Log Drains
   - **Vercel** - Vercel Log Drains
   - **Next.js** - Next.js applications
   - **SmartThings** - IoT devices
   - **Windows Events** - Windows servers
3. Follow the step-by-step guide with copy-paste instructions
4. Test the connection

### Active Sources Dashboard

Monitor which devices are sending logs:

1. Go to Data Sources → Active Sources tab
2. View:
   - List of all devices sending logs
   - Last seen timestamp for each source
   - Event count per source
   - Health status (active, stale, inactive)

### Custom Index Headers

Organize logs with custom headers per data source:

1. Create a new data source configuration
2. Specify a unique index name
3. Logs from that source get their own searchable index

---

## Search Features

### Field Discovery Sidebar

Quickly explore your log data:

1. On the Search page, click the sidebar icon (☰)
2. Browse all fields in your logs
3. See top values for each field
4. Click a value to add it as a filter

### Search-to-Action Buttons

Save searches directly to other features:

1. Run a search query
2. Click "Save As" dropdown:
   - **Dashboard** - Add as a dashboard panel
   - **Alert** - Create an alert rule
   - **Report** - Schedule as a report
3. Configure and save in one click

---

## Dashboards

### Creating a Dashboard

1. Go to Dashboards → Create Dashboard
2. Add panels with DSL queries
3. Choose visualization type (table, chart, counter)
4. Save and share

### Duplicating a Dashboard

Quickly copy an existing dashboard:

1. Go to Dashboards
2. Find the dashboard you want to copy
3. Click the "⋮" menu (three dots) on the dashboard card
4. Select "Duplicate"
5. A copy is created with "(Copy)" appended to the name
6. Edit the new dashboard as needed

### Dashboard Panel Types

- **Table** - Show raw events or stats
- **Line Chart** - Time series data
- **Bar Chart** - Categorical comparisons
- **Counter** - Single value display
- **Pie Chart** - Distribution visualization

### Example Dashboard Panels

**Event Overview:**
```
search * | stats count by app_name | sort desc count
```

**Error Rate Timeline:**
```
search severity>=error | timechart span=1h count by hostname
```

**Top Talking Hosts:**
```
search * | stats count by hostname | sort desc count | limit 10
```

---

## AI Features

LogNog includes AI-powered features using local LLMs (Ollama).

### Natural Language to Query

Ask in plain English and get a DSL query:
- "Show me errors from the last hour" → `search severity>=error`
- "Which host has the most logs?" → `search * | stats count by hostname | sort desc count | limit 1`

### Interview Wizard

The Interview Wizard helps development teams set up logging:

1. Generate questionnaire about your application
2. Have developers fill it out
3. Get AI-analyzed recommendations
4. Receive copy-paste ready implementation code

### LlamaIndex RAG

Query your indexed documentation and knowledge base:
- Index company runbooks
- Query postmortems
- Search internal documentation

---

## Severity Levels

LogNog uses standard syslog severity levels:

| Level | Name | Description |
|-------|------|-------------|
| 0 | Emergency | System unusable |
| 1 | Alert | Immediate action required |
| 2 | Critical | Critical conditions |
| 3 | Error | Error conditions |
| 4 | Warning | Warning conditions |
| 5 | Notice | Normal but significant |
| 6 | Info | Informational messages |
| 7 | Debug | Debug-level messages |

**Query by severity:**
- `severity>=error` - errors and above (0-3)
- `severity>=warning` - warnings and above (0-4)
- `severity=info` - only info level (6)

---

## Troubleshooting

### Logs not appearing

1. Check if Vector is running: `docker logs lognog-vector`
2. Verify syslog connectivity: `echo "<14>test" | nc -u localhost 514`
3. Check API health: `curl http://localhost:4000/health`
4. Check ClickHouse: `docker logs lognog-clickhouse`

### Slow queries

1. Add time constraints: `search severity>=error | limit 1000`
2. Use specific fields instead of `*`
3. Add hostname filters to narrow scope

### AI not working

1. Check Ollama status: `curl http://localhost:11434/api/tags`
2. Verify models are downloaded: `ollama list`
3. Check API AI status: `curl http://localhost:4000/ai/status`

---

## API Reference

### Health Check
```
GET /health
```

### Search Logs
```
POST /api/search
Content-Type: application/json

{
  "query": "search severity>=error | limit 100",
  "timeRange": {
    "from": "2025-01-01T00:00:00Z",
    "to": "2025-01-15T23:59:59Z"
  }
}
```

### Ingest Logs
```
POST /api/ingest/http
X-API-Key: your-api-key
Content-Type: application/json

[{
  "timestamp": "2025-01-15T10:00:00Z",
  "hostname": "server-01",
  "app_name": "myapp",
  "severity": 6,
  "message": "Application started"
}]
```

### AI Query Generation
```
POST /api/ai/generate-query
Content-Type: application/json

{
  "prompt": "show me errors from nginx in the last hour"
}
```

---

## Mobile Support

LogNog is fully responsive and works great on mobile devices:

- **Search** - Optimized search bar and results for touch
- **Dashboards** - Charts and panels resize for mobile screens
- **Alerts** - Create and manage alerts on the go
- **Stats** - Mobile-friendly analytics page
- **Reports** - View and create reports from your phone
- **Documentation** - Readable docs with scrollable navigation

All features are available on mobile - no separate app needed.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Run search |
| `Ctrl+S` | Save dashboard |
| `Escape` | Close modal |

---

## Support

- GitHub Issues: https://github.com/yourusername/lognog/issues
- Documentation: /docs in this repository
- In-app help: Click the AI assistant icon

---

*LogNog - Your Logs, Your Control*
