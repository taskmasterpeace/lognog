# LogNog

<p align="center">
  <img src="ui/public/lognoglogo.png" width="120" height="120" alt="LogNog Logo">
</p>

<p align="center">
  <strong>Your Logs, Your Control</strong><br>
  Self-hosted log management for homelabs and beyond
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue" alt="Version 1.0.0">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License">
  <img src="https://img.shields.io/badge/tests-224%20passing-brightgreen" alt="224 Tests Passing">
  <img src="https://img.shields.io/badge/docker-ready-blue" alt="Docker Ready">
</p>

<p align="center">
  <em>By Machine King Labs</em>
</p>

---

## Table of Contents

- [Quick Start](#quick-start)
- [Why LogNog?](#why-lognog)
- [How LogNog Compares](#how-lognog-compares)
- [Screenshots](#screenshots)
- [Choose Your Setup](#choose-your-setup)
- [Features](#features)
  - [Core Features](#core-features)
  - [Dashboard Features](#dashboard-features)
  - [Alert System](#alert-system)
  - [Search & Query](#search--query)
  - [User Experience](#user-experience)
  - [AI Features](#ai-features)
  - [Security & Authentication](#security--authentication)
- [Advanced Features](#advanced-features)
  - [Anomaly Detection (UEBA)](#anomaly-detection-ueba)
  - [Assets & Identities](#assets--identities)
  - [Common Information Model (CIM)](#common-information-model-cim)
  - [AI Agent](#ai-agent)
  - [Synthetic Monitoring](#synthetic-monitoring)
- [Installation](#installation)
  - [LogNog Full (Docker)](#lognog-full-docker-installation)
  - [LogNog Lite (Windows)](#lognog-lite-installation)
  - [LogNog In Agent](#lognog-in-agent)
- [Query Language](#query-language)
  - [Commands Reference](#commands-reference)
  - [Operators](#operators)
  - [Functions](#functions)
  - [Example Queries](#example-queries)
- [Integrations](#integrations)
  - [Supabase Log Drains](#supabase-log-drains)
  - [Vercel Log Drains](#vercel-log-drains)
  - [SmartThings IoT](#smartthings-iot)
  - [OpenTelemetry (OTLP)](#opentelemetry-otlp)
  - [Claude Desktop (MCP)](#claude-desktop-mcp)
  - [Generic HTTP](#generic-http)
- [API Reference](#api-reference)
- [Configuration](#configuration)
  - [Environment Variables](#environment-variables)
  - [User Preferences](#user-preferences)
  - [Notification Channels](#notification-channels)
- [Architecture](#architecture)
- [Documentation](#documentation)
- [Development](#development)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Quick Start

Get from zero to searching logs in under 5 minutes:

```bash
# 1. Clone and start
git clone https://github.com/machinekinglabs/lognog.git
cd lognog
docker-compose up -d

# 2. Open browser
open http://localhost    # Or just visit http://localhost
```

**3. Create your admin account** - First visit prompts you to set up your login (no default passwords!)

**4. Follow the Welcome Wizard** - The guided setup helps you:
   - Generate demo data to explore (or connect real logs)
   - Create your first dashboard from templates
   - Set up optional alerts

**5. Start searching!**
```
search severity<=3 | stats count by hostname
```

That's it! You're now running a fully-featured log management platform.

> **Already have logs?** Point your syslog to `UDP 514` or POST JSON to `/api/ingest/http`.

---

## Why LogNog?

**Enterprise log management shouldn't require enterprise budgets.** Tools like Splunk offer powerful features, but their pricing puts them out of reach for homelabbers, small teams, and independent developers.

**LogNog is different:**
- 100% open source (MIT license)
- Runs entirely on your hardware
- No cloud dependencies
- No phone-home telemetry
- No arbitrary limits

---

## How LogNog Compares

| Feature | LogNog | Splunk | ELK Stack | Grafana Loki |
|---------|--------|--------|-----------|--------------|
| **Cost** | Free (MIT) | $$$$ | Free* | Free* |
| **Setup Time** | 5 minutes | Hours | Hours | 30+ min |
| **Query Language** | Splunk-like DSL | SPL | Lucene/KQL | LogQL |
| **Learning Curve** | Low | High | Medium | Medium |
| **Single Binary** | Yes (Lite) | No | No | No |
| **Windows Native** | Yes | Yes | Painful | No |
| **Docker Required** | Optional | No | Yes | Yes |
| **Welcome Wizard** | Yes | No | No | No |
| **Built-in Alerts** | Yes | Yes | Via Elastalert | Via Grafana |
| **Alert Templates** | 8 pre-built | No | No | No |
| **Built-in Dashboards** | Yes | Yes | Via Kibana | Via Grafana |
| **Dashboard Templates** | 7 pre-built | Yes | No | No |
| **FIM (File Monitoring)** | Yes | Via addon | No | No |
| **Real-time Tail** | Yes (SSE) | Yes | Yes | Yes |
| **AI Features** | Yes (Ollama) | Premium | No | No |
| **GeoIP** | Yes | Yes | Yes | Plugin |
| **UEBA/Anomaly Detection** | Yes | Premium | No | No |
| **Asset Management** | Yes | Premium | No | No |
| **Common Info Model** | Yes | Yes | No | No |
| **AI Agent** | Yes (Ollama) | Premium | No | No |
| **Synthetic Monitoring** | Yes | No | No | No |
| **Components** | 1-3 | 1 | 3+ | 3+ |

*ELK and Loki are free but require significant infrastructure and expertise

---

## Screenshots

### Log Search
![Log Search](docs/images/01-search.png)

### Dashboards
![Dashboards](docs/images/03-dashboards.png)

### Alerts
![Alerts](docs/images/04-alerts.png)

### Live Tail
![Live Tail](docs/images/05-live-tail.png)

---

## Choose Your Setup

<table>
<tr>
<td width="33%" align="center">
<h3>📁 Agent Only</h3>
<p><strong>Monitor This PC</strong></p>
<p>Watch folders for changes, get alerts when files are modified. No server needed.</p>
<p><a href="agent/">Download LogNog In</a></p>
<p><em>Perfect for: File monitoring on a single machine</em></p>
</td>
<td width="33%" align="center">
<h3>🖥️ LogNog Lite</h3>
<p><strong>Small Homelab</strong></p>
<p>Native Windows installer. Web dashboard, multiple agents, no Docker required.</p>
<p><a href="#lognog-lite-installation">Get Started</a></p>
<p><em>Perfect for: 1-10 machines, Windows users</em></p>
</td>
<td width="33%" align="center">
<h3>🐳 LogNog Full</h3>
<p><strong>Power Users</strong></p>
<p>Docker stack with ClickHouse. Syslog ingestion, scales to millions of logs.</p>
<p><a href="#lognog-full-docker-installation">Get Started</a></p>
<p><em>Perfect for: Large homelabs, enterprise</em></p>
</td>
</tr>
</table>

### Remote Access & Secure Deployment

Need to access LogNog from outside your network? See our **[Deployment Guide](docs/DEPLOYMENT-GUIDE.md)** for:

- **Cloudflare Tunnel** - Free, secure, no port forwarding needed ([Setup Guide](docs/CLOUDFLARE-TUNNEL-SETUP.md))
- **Tailscale** - Private mesh network for team access
- **VPS Deployment** - Run on Hetzner, DigitalOcean, etc.
- **Self-hosted tunnels** - FRP, Rathole, Headscale options

---

## Features

### Core Features

| Feature | Description |
|---------|-------------|
| **Real-time Log Search** | Powerful Splunk-like query language with sub-second results |
| **Live Tail** | SSE-powered real-time log streaming |
| **Welcome Wizard** | Guided 4-step setup for new users |
| **Demo Data Generator** | One-click sample data for exploring features |
| **Field Browser** | Interactive field discovery and pinning |
| **Saved Searches** | Store and reuse common queries |
| **Export to CSV** | One-click export of search results |
| **Source Templates** | 15+ pre-built templates for common log sources |
| **Field Extractions** | Grok and regex patterns for parsing |

### Dashboard Features

LogNog includes a powerful dashboard system with 7 visualization types:

| Visualization | Use Case |
|--------------|----------|
| **Time Series** | Line, area, and bar charts over time |
| **Bar Chart** | Single, grouped, or stacked comparisons |
| **Pie/Donut** | Distribution and proportions |
| **Gauge** | KPI thresholds and progress |
| **Heatmap** | Pattern detection across dimensions |
| **Stat Card** | Single metric display with trends |
| **Table** | Paginated results with sorting |

**Dashboard Capabilities:**

- **Drag-and-drop layout** - Resize and rearrange panels freely
- **Dashboard variables** - Dynamic `$host$`, `$app$` dropdowns that filter all panels
- **Click-to-drilldown** - Click any chart element to search those logs
- **Dashboard branding** - Custom logos, accent colors, headers per dashboard
- **Public sharing** - Share dashboards without requiring login (optional password)
- **Export/Import** - Backup dashboards as JSON, share with community
- **Annotations** - Mark events on your dashboard timeline
- **Auto-refresh** - 30s, 1m, 5m intervals
- **7 pre-built templates** - pfSense, Docker, Windows, Nginx, Minecraft, System, Ubiquiti
- **One-click duplication** - Clone dashboards with all panels and variables

### Alert System

**Alert Templates (8 Pre-built):**

| Template | Category | Description |
|----------|----------|-------------|
| High Error Rate | Errors | Alert when error logs spike |
| Failed SSH Logins | Security | Detect brute force attempts |
| Windows Failed Logins | Security | Track Windows auth failures |
| Firewall Block Spike | Security | Unusual firewall activity |
| Web Server Errors | Errors | HTTP 5xx monitoring |
| Docker Container Restarts | Availability | Container health |
| New Admin User | Security | Privilege escalation detection |
| Host Silent | Availability | Missing heartbeat detection |

**Alert Features:**

| Feature | Description |
|---------|-------------|
| **Multiple Trigger Types** | Number of results, threshold comparison, percentage change |
| **Scheduling** | Real-time, cron, hourly, daily, weekly, monthly |
| **Severity Levels** | Critical, High, Medium, Low |
| **Multiple Actions** | Email, Slack, Discord, Webhook, Teams, and 10+ more via Apprise |
| **Throttling** | Prevent alert storms with deduplication windows |
| **Silencing** | Global, per-host, or per-alert muting with expiration |
| **History & Acknowledgment** | Track all triggers with sample results |
| **Test Before Save** | Preview alert behavior without committing |

### Search & Query

**Query Language (DSL):**

- 17 commands: search, filter, stats, sort, limit, dedup, table, fields, rename, top, rare, bin, timechart, rex, eval, head, tail
- Full boolean logic: AND, OR, NOT with parentheses
- 25+ functions: Math, string, statistical, percentile, time
- Field extraction with regex (rex command)
- Field discovery and autocomplete

**Search Features:**

| Feature | Description |
|---------|-------------|
| **Field Sidebar** | Pin frequently used fields |
| **Facet Filters** | Click-to-filter on field values |
| **Percentage Display** | See value distribution for each field |
| **Query History** | Browse and rerun past queries |
| **Syntax Highlighting** | Clear visual feedback in query editor |
| **AI Query Builder** | Natural language to DSL conversion |

### User Experience

| Feature | Description |
|---------|-------------|
| **Welcome Wizard** | 4-step guided setup for new users |
| **Relative Timestamps** | "5m ago" display alongside formatted times |
| **Time Range Memory** | Remembers your preferred time range |
| **Sidebar Persistence** | Keeps filter panel state |
| **Tab Title Updates** | See result count without switching tabs |
| **Empty Results Help** | Helpful suggestions when no results |
| **Form Validation** | Visual feedback for inputs |
| **Dark Mode** | Automatic system detection + manual override |
| **Mobile Responsive** | Usable on tablets and phones |

### AI Features

*Requires Ollama or OpenRouter*

| Feature | Description |
|---------|-------------|
| **Natural Language Search** | "Show me errors from the last hour" → DSL |
| **Dashboard Insights** | AI-generated anomaly detection and trends |
| **NogChat Assistant** | Chat interface for query help |
| **Codebase Interview Wizard** | Generate logging implementation guides for dev teams |

### Security & Authentication

| Feature | Description |
|---------|-------------|
| **JWT Authentication** | Secure token-based auth with refresh rotation |
| **Role-Based Access** | Admin, User, Readonly roles |
| **API Key Management** | Create keys with specific permissions |
| **Audit Logging** | Track all security events |
| **Rate Limiting** | Protection against brute force |
| **No Default Passwords** | You create credentials on first run |
| **Password Hashing** | bcrypt with 12 rounds |
| **User Management** | Admin UI for user lifecycle |

---

## Advanced Features

LogNog includes enterprise-grade features typically found in premium SIEM solutions like Splunk Enterprise Security.

### Anomaly Detection (UEBA)

User and Entity Behavior Analytics - LogNog learns what "normal" looks like and alerts when something's off.

| Feature | Description |
|---------|-------------|
| **Baseline Learning** | Moving averages for login counts, data transfer, error rates |
| **Per-Entity Profiles** | Each user/host/app has its own "normal" |
| **Time-Aware** | Understands patterns by hour and day of week |
| **AI Analysis** | Optional LLM-powered risk scoring via Ollama |
| **Risk Dashboard** | See highest-risk entities at a glance |

**Example Detections:**
- User logging in at unusual hours or locations
- Host transferring 10x normal data volume
- Service account with sudden failed logins
- Application with abnormal error rates

**Location:** Sidebar → **Anomaly**

### Assets & Identities

Automatic discovery and tracking of all devices and users in your environment.

| Feature | Description |
|---------|-------------|
| **Auto-Discovery** | Extracts hosts, IPs, users from your logs |
| **Criticality Scoring** | Rate importance 1-100 |
| **Ownership Tracking** | Assign owners to assets |
| **Privileged Flags** | Mark admin/service accounts |
| **First/Last Seen** | Track when entities appear |

**Use Cases:**
- Know if an IP belongs to a critical server or a dev laptop
- Find all privileged accounts that haven't logged in for 90 days
- Track asset ownership for compliance

**Location:** Sidebar → **Assets** / **Identities**

### Common Information Model (CIM)

Normalize field names across all your log sources. Write one search, query everything.

| Feature | Description |
|---------|-------------|
| **Built-in Models** | Authentication, Network, Endpoint, Web |
| **Field Mappings** | Map source fields to standard names |
| **Auto-Normalization** | Searches use canonical fields automatically |

**Before CIM:**
```
search (sourcetype=windows AccountName=admin) OR
       (sourcetype=linux user=admin) OR
       (sourcetype=aws userIdentity.userName=admin)
```

**After CIM:**
```
search user=admin
```

**Location:** Sidebar → **Data Models**

### AI Agent

Conversational AI assistant that searches your logs using natural language.

| Feature | Description |
|---------|-------------|
| **Natural Language** | Ask questions in plain English |
| **Multi-Step Reasoning** | Breaks down complex investigations |
| **Tool Use** | Runs searches, looks up assets, enriches IPs |
| **Personas** | Security Analyst, SRE, Compliance modes |

**Example Conversations:**

| You Ask | AI Does |
|---------|---------|
| "Show me failed logins in the last hour" | Runs search, shows results |
| "Is there anything unusual with the DB server?" | Checks anomalies, reviews errors |
| "Who logged in from outside the US?" | Searches, enriches IPs with GeoIP |

**Location:** Sidebar → **AI Agent**

### Synthetic Monitoring

Proactive uptime testing - be the first to know when services go down.

| Test Type | Description |
|-----------|-------------|
| **HTTP** | Check if URLs return expected status codes |
| **API** | Validate endpoints with JSON assertions |
| **TCP** | Verify port connectivity |
| **Browser** | Playwright-based page load tests (coming soon) |

**Features:**

| Feature | Description |
|---------|-------------|
| **Scheduling** | Every 1/5/15/30 min, hourly, daily |
| **Assertions** | Status code, response time, body content, JSON paths |
| **Uptime Tracking** | Historical uptime percentages |
| **Consecutive Failures** | Alert after X failures in a row |

**Example Tests:**
- Homepage returns 200 in under 500ms
- `/api/health` returns `{"status":"ok"}`
- Database port 5432 is reachable

**Location:** Sidebar → **Synthetic**

> **📖 Detailed Guide:** See [New Features Guide](docs/NEW-FEATURES-GUIDE.md) for step-by-step usage and real-world examples.

---

## Installation

### LogNog Full (Docker) Installation

**Prerequisites:**
- Docker & Docker Compose
- 4GB+ RAM recommended

**Quick Start:**

```bash
# Clone the repository
git clone https://github.com/machinekinglabs/lognog.git
cd lognog

# Start all services
docker-compose up -d

# Check status
docker-compose ps
```

**Access Points:**

| Service | URL | Description |
|---------|-----|-------------|
| **Web UI** | http://localhost | Main dashboard |
| **API** | http://localhost:4000 | REST API |
| **Syslog** | localhost:514 (UDP/TCP) | Log ingestion |

**First Time Setup:**

1. Open http://localhost
2. Click "Get Started"
3. Create your admin account (username, email, password)
4. Follow the Welcome Wizard
5. Start exploring!

**Send Test Logs:**

```bash
# Quick syslog test
echo "<14>$(date '+%b %d %H:%M:%S') testhost myapp[1234]: Hello LogNog!" | nc -u localhost 514

# Generate realistic test data
docker-compose --profile testing up -d
```

---

### LogNog Lite Installation

Native Windows server with SQLite - no Docker required!

**Prerequisites:**
- Windows 10/11
- [Node.js 18+](https://nodejs.org/)

**Quick Start:**

1. **Download** `LogNogLite.zip` from [Releases](https://github.com/machinekinglabs/lognog/releases)
2. **Extract** to any folder
3. **Run** `LogNogLite.exe`
4. **Browser opens** to http://localhost:4000
5. **Create your admin account**
6. **Follow the Welcome Wizard**

**Performance:**
- Recommended: Up to 100K logs/day
- Storage: ~100 bytes per log

[Full Lite Documentation →](docs/LOGNOG-LITE.md)

---

### LogNog In Agent

Lightweight agent that ships logs to your LogNog server.

**Features:**

| Feature | Description |
|---------|-------------|
| **System Tray GUI** | No command line needed |
| **File Watching** | Monitor folders with patterns |
| **FIM** | File Integrity Monitoring with SHA-256 |
| **Windows Events** | Security, System, Application channels |
| **Sound Alerts** | Customizable per-severity notifications |
| **Alert History** | View past server alerts |
| **Offline Buffering** | Never lose logs |
| **Low Resources** | ~50MB RAM |

**Quick Start:**

1. **Download** `LogNogIn.exe` from [Releases](https://github.com/machinekinglabs/lognog/releases)
2. **Run** - Double-click the EXE
3. **Configure** - Double-click tray icon
4. **Done** - Logs start flowing

[Full Agent Documentation →](agent/README.md)

---

## Query Language

LogNog uses a Splunk-like query language that compiles to SQL.

### Commands Reference

| Command | Description | Example |
|---------|-------------|---------|
| `search` | Filter logs | `search host=router severity>=warning` |
| `filter` | Additional filtering | `filter app_name~"nginx"` |
| `where` | Alias for filter | `where severity<=3` |
| `stats` | Aggregate | `stats count, avg(bytes) by hostname` |
| `sort` | Order results | `sort desc timestamp` |
| `limit` | Limit results | `limit 100` |
| `head` | First N results | `head 50` |
| `tail` | Last N results | `tail 20` |
| `table` | Select fields | `table timestamp hostname message` |
| `fields` | Include/exclude | `fields - raw structured_data` |
| `dedup` | Deduplicate | `dedup hostname` |
| `rename` | Rename fields | `rename hostname as host` |
| `top` | Most common | `top 10 hostname` |
| `rare` | Least common | `rare 10 app_name` |
| `bin` | Time bucketing | `bin span=1h timestamp` |
| `timechart` | Time stats | `timechart span=1h count by hostname` |
| `rex` | Regex extract | `rex field=message "user=(?P<user>\w+)"` |
| `eval` | Calculate | `eval rate=bytes/1024` |

### Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `=` | Equals | `host=router` |
| `!=` | Not equals | `severity!=7` |
| `>` `>=` `<` `<=` | Comparison | `severity>=warning` |
| `~` | Contains/regex | `message~"error"` |
| `AND` `OR` `NOT` | Boolean | `host=router AND severity<=3` |
| `()` | Grouping | `(host=a OR host=b) AND severity<=3` |

### Functions

**Math Functions:**
`abs`, `round`, `floor`, `ceil`, `sqrt`, `pow`, `log`, `log10`, `exp`

**String Functions:**
`len`, `lower`, `upper`, `trim`, `ltrim`, `rtrim`, `substr`, `replace`, `concat`, `split`

**Statistical Functions:**
`count`, `sum`, `avg`, `min`, `max`, `dc` (distinct count), `values`, `list`, `earliest`, `latest`

**Percentile Functions:**
`p50`, `p90`, `p95`, `p99`, `median`, `mode`, `stddev`, `variance`, `range`

**IP Functions:**
`is_private(ip)`, `is_public(ip)`, `ip_type(ip)`

### Example Queries

```bash
# All errors from the last hour
search severity<=3

# Count by host with boolean logic
search (host=router OR host=firewall) AND severity<=4
  | stats count by hostname

# Find failed SSH logins
search app_name=sshd message~"Failed"
  | stats count by hostname

# Top 10 talkers with percentiles
search *
  | stats count, p95(bytes) as p95_bytes by app_name
  | sort desc count
  | limit 10

# Time-based analysis
search severity<=3
  | timechart span=1h count by hostname

# Extract fields with regex
search app_name=nginx
  | rex field=message "status=(?P<status>\d+)"
  | stats count by status

# Calculate rates
search app_name=api
  | eval duration_sec=duration_ms/1000
  | stats avg(duration_sec) as avg_duration by endpoint
```

[Full Query Language Documentation →](docs/QUERY-LANGUAGE.md)

---

## Integrations

LogNog integrates with popular platforms:

| Platform | Endpoint | Documentation |
|----------|----------|---------------|
| **Supabase** | `POST /api/ingest/supabase` | [Guide](docs/SUPABASE-INTEGRATION.md) |
| **Vercel** | `POST /api/ingest/vercel` | [Guide](docs/VERCEL-INTEGRATION.md) |
| **SmartThings** | `POST /api/ingest/smartthings` | [Below](#smartthings-iot) |
| **Generic HTTP** | `POST /api/ingest/http` | [Below](#generic-http) |
| **OpenTelemetry** | `POST /api/ingest/otlp/v1/logs` | [Guide](docs/OTLP_AUTHENTICATION.md) |
| **Claude Desktop** | SSE `/mcp/sse` | [Guide](docs/MCP-INTEGRATION.md) |

### Supabase Log Drains

Ingest logs from Supabase projects (database, auth, storage, edge functions):

1. Go to Supabase Dashboard → Settings → Log Drains
2. Add destination: Generic HTTP endpoint
3. URL: `https://your-lognog-server/api/ingest/supabase`
4. Headers: `X-API-Key: your-lognog-api-key`

### Vercel Log Drains

Ingest logs from Vercel (serverless, edge, builds):

1. Go to Vercel Dashboard → Project Settings → Log Drains
2. Add Log Drain → Custom HTTP endpoint
3. URL: `https://your-lognog-server/api/ingest/vercel`
4. Headers: `X-API-Key: your-lognog-api-key`

### SmartThings IoT

Ingest device events from Samsung SmartThings:

1. Create SmartApp in SmartThings Developer Workspace
2. Register Webhook pointing to: `https://your-lognog-server/api/ingest/smartthings`
3. Add header: `X-API-Key: your-lognog-api-key`
4. Subscribe to device events, health events, lifecycle events

**Events captured:** Device state changes, health status, hub events

### OpenTelemetry OTLP

Native OTLP/HTTP JSON ingestion:

```bash
curl -X POST "https://your-lognog/api/ingest/otlp/v1/logs" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d @otlp-logs.json
```

[OTLP Authentication Guide →](docs/OTLP_AUTHENTICATION.md)

### Claude Desktop MCP

Connect LogNog to Claude Desktop for AI-powered log analysis:

1. Generate API key in LogNog (Settings → API Keys)
2. Add to Claude Desktop config:
   ```json
   {
     "mcpServers": {
       "lognog": {
         "command": "curl",
         "args": ["-N", "-H", "X-API-Key: YOUR_KEY", "http://localhost:4000/mcp/sse"]
       }
     }
   }
   ```
3. Restart Claude Desktop
4. Ask: "Show me error logs from the last hour"

[MCP Integration Guide →](docs/MCP-INTEGRATION.md)

### Generic HTTP

Send any JSON array of logs:

```bash
curl -X POST "https://your-lognog/api/ingest/http" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '[{
    "timestamp": "2024-01-15T10:30:00Z",
    "message": "User logged in",
    "level": "info",
    "user_id": "12345"
  }]'
```

---

## API Reference

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/search/query` | Execute DSL query |
| `GET` | `/api/dashboards` | List dashboards |
| `POST` | `/api/dashboards` | Create dashboard |
| `GET` | `/api/alerts` | List alerts |
| `POST` | `/api/alerts` | Create alert |
| `GET` | `/api/alerts/templates` | List alert templates |
| `POST` | `/api/alerts/from-template/:id` | Create from template |
| `GET` | `/api/stats/overview` | System statistics |

### Ingestion Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/ingest/http` | Generic JSON ingestion |
| `POST` | `/api/ingest/supabase` | Supabase Log Drains |
| `POST` | `/api/ingest/vercel` | Vercel Log Drains |
| `POST` | `/api/ingest/smartthings` | SmartThings IoT |
| `POST` | `/api/ingest/otlp/v1/logs` | OpenTelemetry |
| `POST` | `/api/ingest/agent` | LogNog In Agent |

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | User login |
| `POST` | `/api/auth/refresh` | Refresh token |
| `GET` | `/api/auth/me` | Current user info |
| `POST` | `/api/auth/api-keys` | Create API key |
| `GET` | `/api/auth/users` | List users (admin) |

---

## Configuration

### Environment Variables

```bash
# API Port
PORT=4000

# Security (REQUIRED in production)
JWT_SECRET=your-secure-random-secret
JWT_REFRESH_SECRET=your-secure-refresh-secret
NODE_ENV=production

# OTLP Authentication (optional)
OTLP_REQUIRE_AUTH=true

# SMTP for scheduled reports
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=reports@example.com
SMTP_PASS=your-password
SMTP_FROM=reports@example.com

# AI Features (optional)
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

# Apprise Notifications (optional)
APPRISE_URL=http://localhost:8000
```

> **Security Note:** In production, `JWT_SECRET` and `JWT_REFRESH_SECRET` must be set. Use `openssl rand -base64 32` to generate.

### User Preferences

Configurable per-user in Settings:

| Preference | Options |
|------------|---------|
| Theme | Light, Dark, System |
| Default Time Range | 15m, 1h, 4h, 24h, 7d |
| Default View Mode | Log, Table, JSON |
| Sidebar State | Open, Closed |
| Query History Limit | 10-100 entries |

### Notification Channels

LogNog supports 14+ notification services via Apprise:

- Slack, Discord, Microsoft Teams
- Telegram, Pushover, ntfy.sh
- PagerDuty, Opsgenie
- Email (SMTP), Twilio SMS
- Gotify, Matrix
- Custom Webhooks

---

## Architecture

### LogNog Full (Docker)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Syslog    │────▶│   Vector    │────▶│ ClickHouse  │
│   Clients   │     │  (ingest)   │     │  (storage)  │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
┌─────────────┐                                │
│  Supabase   │─────────────────────────┐      │
│  Vercel     │                         │      │
└─────────────┘     ┌─────────────┐     │      │
                    │  React UI   │◀────┴──────┤
                    │             │            │
                    └─────────────┘            ▼
                                        ┌─────────────┐
┌─────────────┐                         │  Node.js    │
│  LogNog In  │────────────────────────▶│    API      │
│   Agents    │                         └─────────────┘
└─────────────┘
```

### Ports

| Port | Service | Protocol | Description |
|------|---------|----------|-------------|
| 80 | Nginx | HTTP | Web UI |
| 514 | Vector | UDP/TCP | Syslog |
| 4000 | API | HTTP | REST API |
| 8123 | ClickHouse | HTTP | Database |

---

## Documentation

| Document | Description |
|----------|-------------|
| [New Features Guide](docs/NEW-FEATURES-GUIDE.md) | UEBA, Assets, CIM, AI Agent, Synthetic Monitoring |
| [Query Language](docs/QUERY-LANGUAGE.md) | Complete DSL reference |
| [Dashboards](docs/DASHBOARDS.md) | Dashboard features and templates |
| [Codebase Interview Wizard](docs/CODEBASE-INTERVIEW-WIZARD.md) | AI logging implementation guides |
| [Supabase Integration](docs/SUPABASE-INTEGRATION.md) | Supabase Log Drains setup |
| [Vercel Integration](docs/VERCEL-INTEGRATION.md) | Vercel Log Drains setup |
| [MCP Integration](docs/MCP-INTEGRATION.md) | Claude Desktop integration |
| [Cloudflare Tunnel](docs/CLOUDFLARE-TUNNEL-SETUP.md) | Secure remote access |
| [IP Classification](docs/IP-CLASSIFICATION.md) | IP categorization |
| [GeoIP Implementation](docs/GEOIP-IMPLEMENTATION.md) | GeoIP setup |
| [OTLP Authentication](docs/OTLP_AUTHENTICATION.md) | OpenTelemetry auth |
| [LogNog Lite](docs/LOGNOG-LITE.md) | SQLite mode docs |
| [Database Templates](docs/DATABASE-TEMPLATES.md) | Database log templates |
| [Agent Guide](agent/README.md) | LogNog In agent docs |
| [Alert Variables](docs/ALERT-VARIABLES.md) | Dynamic alert variables |
| [Deployment Guide](docs/DEPLOYMENT-GUIDE.md) | Secure deployment |

---

## Development

### API Development

```bash
cd api
npm install
npm run dev      # Development server with hot reload
npm run build    # Build TypeScript
npm run test     # Run tests (224 tests)
```

### UI Development

```bash
cd ui
npm install
npm run dev      # Vite dev server (port 3000)
npm run build    # Production build
```

### Agent Development

```bash
cd agent
pip install -e ".[dev]"
pytest           # Run tests (68 tests)
python -m lognog_in  # Run agent
python build.py  # Build EXE
```

### Test Coverage

| Component | Tests | Status |
|-----------|-------|--------|
| API (Vitest) | 224 | ✅ |
| Agent (pytest) | 68 | ✅ |

---

## Roadmap

### Completed ✅

- Welcome Wizard with guided setup
- 8 pre-built alert templates
- 7 dashboard templates (pfSense, Docker, Windows, etc.)
- Dashboard variables and drilldown
- Public dashboard sharing
- Dashboard export/import
- AI features via Ollama
- 14+ notification channels via Apprise
- Supabase, Vercel, SmartThings integrations
- MCP Server for Claude Desktop
- Windows Event Log collection
- File Integrity Monitoring
- GeoIP and IP classification
- **Anomaly Detection (UEBA)** - Behavioral baselines + AI-powered risk scoring
- **Asset & Identity Framework** - Auto-discovery and tracking
- **Common Information Model (CIM)** - Field normalization across sources
- **AI Agent** - Conversational log investigation
- **Synthetic Monitoring** - Proactive uptime testing

### Planned

**Short Term:**
- JSON batch import via UI
- PDF export for dashboards
- Dashboard template gallery
- Browser-based synthetic tests (Playwright)

**Medium Term:**
- Sigma rule importer (3000+ security rules)
- Lookup tables (CSV enrichment)
- macOS/Linux agent packages

**Long Term:**
- Grafana data source plugin
- Kubernetes deployment (Helm chart)
- Multi-tenant support

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

MIT License - see [LICENSE](LICENSE)

---

<p align="center">
  <strong>LogNog v1.0.0</strong> - Your Logs, Your Control<br>
  <em>By Machine King Labs</em>
</p>
