# LogNog MCP Server Integration

Connect LogNog to Claude Desktop for AI-powered log management. Ask Claude to search your logs, create dashboards, set up alerts, and more - all using natural language.

---

## What is MCP?

**Model Context Protocol (MCP)** is an open standard that allows AI assistants like Claude to securely interact with external tools and data sources. With LogNog's MCP server, Claude can:

- Search and analyze your logs using natural language
- Create and modify dashboards
- Set up alert rules
- Generate reports
- Ingest new log entries

All while keeping your data on your own infrastructure.

---

## Quick Start

### Prerequisites

- LogNog running (Full or Lite)
- Claude Desktop installed
- API key from LogNog (Settings → API Keys)

### Step 1: Generate an API Key

1. Open LogNog in your browser
2. Go to **Settings → API Keys**
3. Click **Create API Key**
4. Give it a name like "Claude Desktop"
5. Copy the API key (you won't see it again!)

### Step 2: Configure Claude Desktop

Add LogNog to your Claude Desktop configuration:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "lognog": {
      "command": "curl",
      "args": [
        "-N",
        "-H", "X-API-Key: YOUR_API_KEY_HERE",
        "http://localhost:4000/mcp/sse"
      ]
    }
  }
}
```

Replace `YOUR_API_KEY_HERE` with your actual API key.

For remote LogNog servers, replace `localhost:4000` with your server address.

### Step 3: Restart Claude Desktop

Close and reopen Claude Desktop. You should see LogNog in the MCP servers list.

### Step 4: Start Chatting!

Try these example prompts:

- "Show me error logs from the last hour"
- "Create a dashboard for nginx traffic"
- "Set up an alert for failed SSH logins"
- "What are the top 10 hosts by log volume?"

---

## Available Resources

Resources are read-only data that Claude can access:

| Resource URI | Description |
|--------------|-------------|
| `lognog://logs/recent` | Most recent 100 log entries |
| `lognog://dashboards` | All dashboard configurations |
| `lognog://dashboards/{id}` | Specific dashboard with panels |
| `lognog://alerts` | All alert rules |
| `lognog://silences` | Active alert silences |
| `lognog://stats` | System statistics |
| `lognog://templates` | Log source templates |
| `lognog://saved-searches` | Saved search queries |

---

## Available Tools

Tools allow Claude to perform actions in LogNog:

### search_logs

Execute a DSL query to search logs.

**Parameters:**
- `query` (required): DSL query string
- `earliest`: Start time (ISO format, default: 24 hours ago)
- `latest`: End time (ISO format, default: now)

**Example prompts:**
- "Search for logs containing 'error' from the last hour"
- "Show me failed login attempts grouped by IP address"
- "Find nginx 404 errors and count by URL"

### create_dashboard

Create a new dashboard with optional panels.

**Parameters:**
- `name` (required): Dashboard name
- `description`: Dashboard description
- `panels`: Array of panel configurations

**Example prompts:**
- "Create a dashboard called 'Security Overview'"
- "Build me a dashboard with error counts by host and a severity breakdown"

### update_dashboard

Update an existing dashboard.

**Parameters:**
- `id` (required): Dashboard ID
- `name`: New dashboard name
- `description`: New dashboard description

### add_dashboard_panel

Add a panel to an existing dashboard.

**Parameters:**
- `dashboard_id` (required): Dashboard ID
- `title` (required): Panel title
- `query` (required): DSL query for the panel
- `visualization` (required): Chart type (table, bar, pie, line, area, single, heatmap, gauge)

**Example prompts:**
- "Add a pie chart showing severity distribution to my Security dashboard"
- "Add a time series of error counts to the overview dashboard"

### create_alert

Create a new alert rule.

**Parameters:**
- `name` (required): Alert name
- `query` (required): DSL query that triggers the alert
- `condition` (required): Condition type (greater_than, less_than, equals, not_equals)
- `threshold` (required): Threshold value
- `schedule`: Cron expression (default: every 5 minutes)
- `actions`: Array of actions (email, webhook, log)

**Example prompts:**
- "Create an alert for when error count exceeds 100 in 5 minutes"
- "Set up an alert for failed SSH logins with email notification"

### silence_alert

Create a silence to suppress alerts.

**Parameters:**
- `type` (required): Silence type (global, host, alert)
- `target`: Target hostname or alert ID (for host/alert types)
- `duration_minutes` (required): Duration in minutes
- `reason`: Reason for the silence

**Example prompts:**
- "Silence all alerts for 30 minutes - maintenance window"
- "Silence alerts for host web-01 for 2 hours"

### ingest_logs

Ingest log entries into LogNog.

**Parameters:**
- `logs` (required): Array of log entries

**Example prompts:**
- "Add a log entry saying 'MCP test successful'"
- "Ingest these application logs: [...]"

### generate_report

Generate a report from a dashboard or query.

**Parameters:**
- `dashboard_id`: Dashboard ID to report on
- `query`: Custom DSL query
- `format`: Output format (html, json)

**Example prompts:**
- "Generate a report from the Security dashboard"
- "Create an HTML report of top error sources"

---

## Example Conversations

### Investigating an Issue

**You:** "I'm seeing slow response times. Can you check the logs for any errors in the last 30 minutes?"

**Claude:** *Searches logs for severity <= 3 in the last 30 minutes, summarizes findings*

**You:** "Create a dashboard so I can monitor this going forward"

**Claude:** *Creates a dashboard with relevant panels for monitoring*

### Setting Up Monitoring

**You:** "Set up monitoring for our nginx servers. I want to track request rates, error rates, and response times."

**Claude:** *Creates a dashboard with:*
- *Requests per minute timechart*
- *Error rate by status code*
- *95th percentile response time*
- *Suggests an alert for high error rates*

### Security Investigation

**You:** "Show me all failed SSH login attempts and group them by source IP"

**Claude:** *Executes: `search app_name=sshd message~"Failed" | stats count by source_ip | sort desc count`*

**You:** "Create an alert for brute force attempts - more than 10 failures from the same IP in 5 minutes"

**Claude:** *Creates alert with appropriate query and threshold*

---

## API Endpoints

### SSE Connection

```
GET /mcp/sse
Header: X-API-Key: your-api-key
```

Establishes a Server-Sent Events connection for MCP communication.

### Message Handling

```
POST /mcp/messages?connectionId=xxx
```

Handles messages from connected clients.

### Status Check

```
GET /mcp/status
```

Returns MCP server status, version, and capabilities.

### Health Check

```
GET /mcp/health
```

Simple health check endpoint.

---

## Security

### Authentication

All MCP connections require a valid API key. Keys can be created in LogNog's Settings → API Keys section.

### Permissions

MCP respects LogNog's role-based access control:
- **Admin**: Full read/write access
- **User**: Read access + create dashboards/alerts
- **Readonly**: Read access only

### Data Privacy

- All communication stays on your network
- No data is sent to external services
- Logs are queried from your LogNog instance

---

## Troubleshooting

### Connection Refused

**Problem:** Claude can't connect to LogNog

**Solutions:**
1. Check LogNog is running: `curl http://localhost:4000/health`
2. Verify API key is correct
3. Check firewall settings
4. For remote servers, ensure the URL is accessible

### Invalid API Key

**Problem:** "401 Unauthorized" error

**Solutions:**
1. Regenerate API key in LogNog Settings
2. Update Claude Desktop config with new key
3. Restart Claude Desktop

### No Results

**Problem:** Queries return empty results

**Solutions:**
1. Check time range - ensure logs exist in that period
2. Verify query syntax using LogNog's search page
3. Check log ingestion is working

### SSE Connection Drops

**Problem:** Connection drops frequently

**Solutions:**
1. Check network stability
2. Look for proxy/load balancer timeouts
3. Increase timeout settings if using a reverse proxy

---

## Configuration Options

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_ENABLED` | `true` | Enable/disable MCP server |
| `MCP_MAX_CONNECTIONS` | `100` | Maximum concurrent connections |

### Rate Limiting

MCP endpoints respect LogNog's rate limiting settings. Default: 100 requests/minute per API key.

---

## Comparison with Other Integrations

| Feature | MCP | REST API | NogChat |
|---------|-----|----------|---------|
| Natural language | Yes (Claude) | No | Yes |
| Programmatic access | Yes | Yes | No |
| Real-time updates | SSE | Polling | Chat |
| Tool calling | Yes | N/A | Limited |
| Best for | AI assistants | Automation | Quick queries |

---

## Roadmap

- [ ] WebSocket transport (alternative to SSE)
- [ ] Custom prompts/templates
- [ ] Multi-tenant support
- [ ] Audit logging for MCP actions
- [ ] Rate limiting per tool

---

## Need Help?

- [GitHub Issues](https://github.com/machinekinglabs/lognog/issues)
- [Query Language Reference](QUERY-LANGUAGE.md)
- [LogNog Guide](LOGNOG-GUIDE.md)
