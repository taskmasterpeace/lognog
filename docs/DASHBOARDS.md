# Dashboards & Visualizations Guide

> **See the Signal in the Noise** - Transform raw data into actionable insights

Dashboards are where your data comes alive. This guide teaches you how to build powerful, beautiful dashboards that tell the story hidden in your logs.

---

## Table of Contents

1. [Dashboard Philosophy](#dashboard-philosophy)
2. [Creating Dashboards](#creating-dashboards)
3. [Panel Types](#panel-types)
4. [Drag-and-Drop Layout](#drag-and-drop-layout)
5. [Dashboard Variables](#dashboard-variables)
6. [Dashboard Branding](#dashboard-branding)
7. [Public Sharing](#public-sharing)
8. [AI Insights](#ai-insights)
9. [Click-to-Drilldown](#click-to-drilldown)
10. [Dashboard Templates](#dashboard-templates)
11. [Export & Import](#export--import)
12. [Query Optimization](#query-optimization)
13. [Layout Best Practices](#layout-best-practices)
14. [Advanced Techniques](#advanced-techniques)

---

## Dashboard Philosophy

### The Three Questions

Every dashboard panel should answer at least one of these:

1. **What's happening RIGHT NOW?** (Real-time monitoring)
2. **Is something WRONG?** (Anomaly detection)
3. **What's the TREND?** (Historical analysis)

### Dashboard Types

| Type | Purpose | Refresh Rate | Example |
|------|---------|--------------|---------|
| **Operational** | Real-time monitoring | 30 seconds | NOC status board |
| **Analytical** | Investigation & drill-down | On-demand | Security investigation |
| **Executive** | High-level overview | Hourly/Daily | Weekly summary |

### The 5-Second Rule

If someone can't understand a panel's message within 5 seconds, it's too complicated. Simplify.

---

## Creating Dashboards

### Via UI

1. Navigate to **Dashboards** tab
2. Click **New Dashboard**
3. Enter a name and description
4. Click **Create**
5. Click **Add Panel** to add visualizations

### Via API

```bash
# Create dashboard
curl -X POST http://localhost:4000/dashboards \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Security Operations",
    "description": "Real-time security monitoring dashboard"
  }'

# Add panel
curl -X POST http://localhost:4000/dashboards/1/panels \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Error Count",
    "query": "search severity<=3 | stats count",
    "visualization": "gauge",
    "position": {"x": 0, "y": 0, "width": 3, "height": 2},
    "options": {
      "thresholds": [
        {"value": 0, "color": "green"},
        {"value": 10, "color": "yellow"},
        {"value": 50, "color": "red"}
      ]
    }
  }'
```

---

## Panel Types

### Gauge

**Best For:** Single important numbers, KPIs, current status

```bash
# Error count
search severity<=3 | stats count

# Active connections
search message~"connection" action=accept | stats count

# Unique hosts
search * | stats dc(hostname)
```

**Configuration Options:**
- `thresholds`: Color boundaries (green → yellow → red)
- `unit`: Display unit (%, ms, GB, etc.)
- `min`/`max`: Scale boundaries

**Example Configuration:**
```json
{
  "visualization": "gauge",
  "options": {
    "thresholds": [
      {"value": 0, "color": "#10B981"},
      {"value": 100, "color": "#F59E0B"},
      {"value": 500, "color": "#EF4444"}
    ],
    "unit": "events",
    "max": 1000
  }
}
```

---

### Bar Chart

**Best For:** Comparing values across categories

```bash
# Logs by host
search * | stats count by hostname | sort desc count | limit 10

# Events by severity
search * | stats count by severity | sort severity

# Top applications
search * | stats count by app_name | sort desc count | limit 10
```

**Configuration Options:**
- `orientation`: horizontal or vertical
- `stacked`: stack bars or group them
- `showValues`: display values on bars

**Example Configuration:**
```json
{
  "visualization": "bar",
  "options": {
    "orientation": "horizontal",
    "showValues": true,
    "colors": ["#3B82F6", "#10B981", "#F59E0B", "#EF4444"]
  }
}
```

---

### Time Series

**Best For:** Trends over time, patterns, anomaly detection

```bash
# Log volume over time
search * | stats count by timestamp

# Errors over time
search severity<=3 | stats count by timestamp

# Multiple series
search * | stats count by timestamp hostname
```

**Configuration Options:**
- `type`: line, area, or bar
- `fill`: fill area under line
- `smooth`: smooth line curves
- `showLegend`: display legend

**Example Configuration:**
```json
{
  "visualization": "timeseries",
  "options": {
    "type": "area",
    "fill": 0.3,
    "smooth": true,
    "showLegend": true
  }
}
```

---

### Pie Chart

**Best For:** Distribution, proportions, composition

```bash
# Severity distribution
search * | stats count by severity

# Traffic by protocol
search * | stats count by protocol

# Events by source type
search * | stats count by index_name
```

**Configuration Options:**
- `donut`: show as donut chart
- `showLabels`: display value labels
- `showPercentage`: show percentages

**Example Configuration:**
```json
{
  "visualization": "pie",
  "options": {
    "donut": true,
    "showLabels": true,
    "showPercentage": true
  }
}
```

---

### Table

**Best For:** Detailed data, drill-down, investigation

```bash
# Recent errors
search severity<=3 | sort desc timestamp | limit 50 | table timestamp hostname app_name message

# Top talkers with details
search * | stats count sum(bytes) as total_bytes by hostname | sort desc count | limit 20

# Firewall blocks
search message~"BLOCK" | table timestamp source_ip dest_ip dest_port action
```

**Configuration Options:**
- `pagination`: rows per page
- `sortable`: allow column sorting
- `filterable`: allow column filtering

**Example Configuration:**
```json
{
  "visualization": "table",
  "options": {
    "pagination": 25,
    "sortable": true,
    "columns": [
      {"field": "timestamp", "width": 180},
      {"field": "hostname", "width": 150},
      {"field": "message", "width": "auto"}
    ]
  }
}
```

---

### Heatmap

**Best For:** Time-based patterns, correlation, density

```bash
# Activity by hour of day
search * | stats count by hour(timestamp) day(timestamp)

# Errors by host over time
search severity<=3 | stats count by hostname hour(timestamp)
```

**Configuration Options:**
- `colorScheme`: color gradient
- `showValues`: display count in cells

---

### Stat Panel

**Best For:** Simple number display with optional comparison

```bash
# Current error count
search severity<=3 | stats count

# With comparison (requires two queries)
# Query 1: Current period
search severity<=3 | stats count
# Query 2: Previous period (for delta)
```

---

## Drag-and-Drop Layout

LogNog dashboards use react-grid-layout for intuitive panel arrangement.

### Entering Edit Mode

1. Open a dashboard
2. Click the **Settings** dropdown (gear icon)
3. Select **Edit Layout**
4. A yellow banner confirms edit mode is active

### Arranging Panels

In edit mode:
- **Drag** panel headers to move them
- **Resize** from panel corners
- Panels snap to a 12-column grid
- Layouts auto-save when you make changes

### Layout Grid

The dashboard uses a 12-column grid system:

| Panel Width | Grid Columns | Use Case |
|-------------|--------------|----------|
| Small | 3-4 columns | Gauges, stats |
| Medium | 6 columns | Charts, tables |
| Full width | 12 columns | Time series, large tables |

### Exiting Edit Mode

Click **Done Editing** in the yellow banner, or click **Edit Layout** again in the settings menu.

---

## Dashboard Variables

Variables let you create dynamic, reusable dashboards with dropdown filters.

### Variable Types

| Type | Description | Example |
|------|-------------|---------|
| **Query** | Values from a search | Hostnames from logs |
| **Custom** | Static list of values | `prod,staging,dev` |
| **Textbox** | Free-text input | Custom IP address |
| **Interval** | Time intervals | `5m,1h,1d` |

### Creating Variables

1. Click the **Variables** button (when present) or open **Settings > Edit Variables**
2. Click **Add Variable**
3. Configure:
   - **Name**: Variable identifier (e.g., `host`)
   - **Label**: Display name (e.g., "Hostname")
   - **Type**: Query, Custom, Textbox, or Interval
   - **Query**: For Query type, the search to get values
   - **Default**: Initial value

### Using Variables in Queries

Reference variables with `$variable$` syntax:

```bash
# Filter by selected hostname
search hostname=$host$ | stats count by app_name

# Use multiple variables
search hostname=$host$ severity>=$severity$ | table timestamp message

# With intervals
search * | timechart span=$interval$ count by hostname
```

### Variable Queries

For Query-type variables, use searches that return distinct values:

```bash
# Get all hostnames
search * | stats count by hostname | table hostname

# Get all applications
search * | stats count by app_name | table app_name

# Get severity levels
search * | stats count by severity | table severity
```

---

## Dashboard Branding

Customize dashboards with your own branding for team dashboards or client-facing displays.

### Branding Options

| Option | Description |
|--------|-------------|
| **Logo URL** | Image URL for dashboard header |
| **Logo Position** | Left, center, or right |
| **Accent Color** | Primary accent color |
| **Header Color** | Dashboard header background |
| **Description** | Dashboard description text |

### Setting Branding

1. Open dashboard **Settings** dropdown
2. Click **Branding**
3. Configure logo and colors
4. Click **Save**

### Logo Guidelines

- Use logos 120x120px or smaller
- Transparent backgrounds work best
- HTTPS URLs required for security
- Supports PNG, JPG, SVG formats

---

## Public Sharing

Share dashboards publicly without requiring login.

### Enabling Public Access

1. Open dashboard **Settings** dropdown
2. Click **Share**
3. Toggle **Enable Public Sharing**
4. Optionally set:
   - **Password**: Require password to view
   - **Expiration**: Auto-disable after date
5. Copy the public URL

### Public URL Format

```
https://your-lognog-server/public/dashboard/<token>
```

### Security Notes

- Public dashboards are read-only
- Data refreshes on each view
- Disable sharing to revoke access immediately
- Expired shares return 404

### Use Cases

- NOC status boards on wall monitors
- Customer-facing status pages
- Team dashboards without individual logins

---

## AI Insights

LogNog integrates with Ollama for AI-powered dashboard insights.

### Requirements

- Ollama installed and running (`ollama serve`)
- A compatible model (default: `llama3.2`)

### Enabling AI Insights

1. Open dashboard **Settings** dropdown
2. Click **AI Insights**
3. Insights panel appears above the dashboard

### Insight Types

| Type | Color | Description |
|------|-------|-------------|
| **Anomaly** | Red/Orange | Unusual patterns detected |
| **Trend** | Blue | Notable changes over time |
| **Suggestion** | Green | Recommended actions |

### Environment Variables

```bash
# Ollama URL (default: http://localhost:11434)
OLLAMA_URL=http://localhost:11434

# Model to use (default: llama3.2)
OLLAMA_MODEL=llama3.2
```

### Natural Language Queries

Use AI to convert natural language to DSL:

1. Click the AI query builder
2. Type: "show me errors from the last hour by host"
3. AI generates: `search severity<=3 | stats count by hostname`
4. Review and execute

---

## Click-to-Drilldown

Click any chart element to automatically navigate to a filtered search.

### How It Works

1. Click a bar in a bar chart
2. Click a slice in a pie chart
3. Click a row in a table
4. LogNog navigates to Search with filters applied

### Drilldown Behavior

| Chart Type | Drilldown Action |
|------------|------------------|
| Bar Chart | Filter by category value |
| Pie Chart | Filter by slice value |
| Table | Filter by first column value |
| Time Series | Filter by time range |

### Example

On a "Logs by Host" bar chart, clicking the "web-01" bar opens:

```
/search?query=search+hostname%3Dweb-01&earliest=-24h
```

---

## Dashboard Templates

LogNog includes 7 pre-built templates for common homelab scenarios.

### Available Templates

| Template | Description | Required Sources |
|----------|-------------|------------------|
| **pfSense Security** | Firewall monitoring | pfSense syslog |
| **Docker Health** | Container monitoring | Docker logs |
| **Windows Security** | Windows security events | LogNog In agent |
| **Web Server** | Nginx/Apache monitoring | Web server logs |
| **Minecraft Server** | Game server monitoring | Minecraft logs |
| **System Overview** | General system health | Any sources |
| **Ubiquiti Network** | UniFi network monitoring | Ubiquiti syslog |

### Creating from Template

1. Go to **Dashboards**
2. Click **New from Template**
3. Select a template
4. Optionally rename
5. Click **Create**

### Template Contents

Each template includes:
- Pre-configured panels with queries
- Optimized layouts
- Appropriate visualizations
- Time range presets

---

## Export & Import

Backup dashboards or share with the community.

### Exporting a Dashboard

1. Open the dashboard
2. Click **Settings** dropdown
3. Click **Export**
4. Save the JSON file

### Export Format

```json
{
  "name": "Security Dashboard",
  "description": "Real-time security monitoring",
  "logo_url": "https://...",
  "accent_color": "#0ea5e9",
  "panels": [
    {
      "title": "Error Count",
      "query": "search severity<=3 | stats count",
      "visualization": "gauge",
      "position_x": 0,
      "position_y": 0,
      "width": 3,
      "height": 2
    }
  ],
  "variables": [
    {
      "name": "host",
      "type": "query",
      "query": "search * | stats count by hostname | table hostname"
    }
  ],
  "exported_at": "2025-01-15T10:30:00Z",
  "version": "1.0"
}
```

### Importing a Dashboard

1. Go to **Dashboards**
2. Click **Import**
3. Select JSON file or paste JSON
4. Optionally rename
5. Click **Import**

---

## Query Optimization

### Dashboard Performance Tips

1. **Use Time Ranges Wisely**
   - Real-time dashboards: Last 15-60 minutes
   - Daily dashboards: Last 24 hours
   - Historical dashboards: Last 7-30 days

2. **Limit Results**
   ```bash
   # Always limit for bar charts and tables
   search * | stats count by hostname | sort desc | limit 10
   ```

3. **Pre-aggregate When Possible**
   ```bash
   # Good: aggregate then sort
   search * | stats count by hostname | sort desc count

   # Bad: sort all data then aggregate
   search * | sort desc timestamp | stats count by hostname
   ```

4. **Be Specific in Searches**
   ```bash
   # Good: specific filter
   search hostname=web-01 severity<=3

   # Bad: broad search with late filter
   search * | filter hostname=web-01 severity<=3
   ```

### Query Templates by Panel Type

**Gauge (single value):**
```bash
search <filter> | stats count|sum|avg(<field>)
```

**Bar Chart (categories):**
```bash
search <filter> | stats count by <category_field> | sort desc count | limit 10
```

**Time Series (trends):**
```bash
search <filter> | stats count by timestamp
```

**Table (details):**
```bash
search <filter> | sort desc timestamp | table <field1> <field2> ... | limit 100
```

---

## Layout Best Practices

### The F-Pattern

Users scan dashboards in an F-pattern (top-left to right, then down). Place most important panels:

```
┌─────────────┬─────────────┬─────────────┐
│  CRITICAL   │  CRITICAL   │  IMPORTANT  │
│  METRIC 1   │  METRIC 2   │  METRIC 3   │
├─────────────┴─────────────┴─────────────┤
│                                         │
│            TIME SERIES CHART            │
│                                         │
├─────────────┬─────────────┬─────────────┤
│  CATEGORY   │  CATEGORY   │  DETAIL     │
│  BREAKDOWN  │  BREAKDOWN  │  TABLE      │
└─────────────┴─────────────┴─────────────┘
```

### Panel Sizing Guide

| Panel Type | Recommended Size | Notes |
|------------|-----------------|-------|
| Gauge | 2x2 or 3x2 | Compact, fit 3-4 per row |
| Bar Chart | 4x3 or 6x4 | Needs room for labels |
| Time Series | 6x3 or 12x4 | Full width works best |
| Pie Chart | 4x4 | Square works best |
| Table | 6x4 or 12x6 | Needs vertical space |
| Heatmap | 6x4 or 8x6 | Square-ish |

### Color Guidelines

| Color | Use For |
|-------|---------|
| Green (#10B981) | Good, healthy, success |
| Yellow (#F59E0B) | Warning, attention needed |
| Red (#EF4444) | Error, critical, failure |
| Blue (#3B82F6) | Neutral data, information |
| Purple (#8B5CF6) | Unique/distinct categories |
| Gray (#6B7280) | Secondary information |

---

## Dashboard Templates

### Template 1: Security Operations Center (SOC)

```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│  CRITICAL   │  AUTH       │  FIREWALL   │  UNIQUE     │
│  EVENTS     │  FAILURES   │  BLOCKS     │  SOURCES    │
│  (Gauge)    │  (Gauge)    │  (Gauge)    │  (Gauge)    │
├─────────────┴─────────────┴─────────────┴─────────────┤
│                                                       │
│        SECURITY EVENTS OVER TIME (Time Series)        │
│                                                       │
├─────────────────────────┬─────────────────────────────┤
│   TOP ATTACKING IPs     │    TOP TARGETED SERVICES    │
│   (Bar Chart)           │    (Bar Chart)              │
├─────────────────────────┴─────────────────────────────┤
│                                                       │
│            RECENT SECURITY EVENTS (Table)             │
│                                                       │
└───────────────────────────────────────────────────────┘
```

**Panel Queries:**

```bash
# Critical Events (Gauge)
search severity<=2 | stats count

# Auth Failures (Gauge)
search message~"(failed|invalid|denied)" message~"(password|auth|login)" | stats count

# Firewall Blocks (Gauge)
search message~"(BLOCK|DROP|DENY)" | stats count

# Unique Sources (Gauge)
search severity<=4 | stats dc(source_ip)

# Security Events Over Time (Time Series)
search severity<=4 | stats count by timestamp

# Top Attacking IPs (Bar Chart)
search severity<=4 source_ip!~"^(10\\.|192\\.168\\.)" | stats count by source_ip | sort desc | limit 10

# Top Targeted Services (Bar Chart)
search message~"(BLOCK|DROP|DENY)" | stats count by dest_port | sort desc | limit 10

# Recent Security Events (Table)
search severity<=4 | sort desc timestamp | table timestamp hostname source_ip message | limit 50
```

---

### Template 2: Infrastructure Health

```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│  TOTAL      │  ERROR      │  ACTIVE     │  SERVICES   │
│  EVENTS     │  RATE       │  HOSTS      │  REPORTING  │
│  (Gauge)    │  (Gauge)    │  (Gauge)    │  (Gauge)    │
├─────────────┴─────────────┴─────────────┴─────────────┤
│                                                       │
│           LOG VOLUME OVER TIME (Time Series)          │
│                                                       │
├─────────────────────────┬─────────────────────────────┤
│   EVENTS BY HOST        │    SEVERITY DISTRIBUTION    │
│   (Bar Chart)           │    (Pie Chart)              │
├─────────────────────────┼─────────────────────────────┤
│   TOP APPLICATIONS      │    SERVICE STATUS           │
│   (Bar Chart)           │    (Table)                  │
└─────────────────────────┴─────────────────────────────┘
```

**Panel Queries:**

```bash
# Total Events (Gauge)
search * | stats count

# Error Rate (Gauge) - percentage
search * | stats count count(severity<=3) as errors | eval error_rate=errors/count*100

# Active Hosts (Gauge)
search * | stats dc(hostname)

# Services Reporting (Gauge)
search * | stats dc(app_name)

# Log Volume Over Time (Time Series)
search * | stats count by timestamp

# Events by Host (Bar Chart)
search * | stats count by hostname | sort desc | limit 10

# Severity Distribution (Pie Chart)
search * | stats count by severity

# Top Applications (Bar Chart)
search * | stats count by app_name | sort desc | limit 10

# Service Status (Table)
search app_name=systemd message~"(Started|Stopped|Failed)" | dedup hostname app_name | table timestamp hostname message
```

---

### Template 3: Application Performance

```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│  REQUEST    │  ERROR      │  AVG        │  P95        │
│  COUNT      │  COUNT      │  LATENCY    │  LATENCY    │
│  (Gauge)    │  (Gauge)    │  (Gauge)    │  (Gauge)    │
├─────────────┴─────────────┴─────────────┴─────────────┤
│                                                       │
│        REQUEST VOLUME & ERRORS (Time Series)          │
│                                                       │
├─────────────────────────┬─────────────────────────────┤
│   STATUS CODE DIST      │    TOP ENDPOINTS            │
│   (Pie Chart)           │    (Bar Chart)              │
├─────────────────────────┴─────────────────────────────┤
│                                                       │
│              SLOW REQUESTS (Table)                    │
│                                                       │
└───────────────────────────────────────────────────────┘
```

**Panel Queries:**

```bash
# Request Count (Gauge)
search app_name=nginx | stats count

# Error Count (Gauge)
search app_name=nginx status_code>=400 | stats count

# Average Latency (Gauge)
search app_name=nginx | stats avg(duration)

# P95 Latency (Gauge)
search app_name=nginx | stats percentile(duration, 95)

# Request Volume & Errors (Time Series)
search app_name=nginx | stats count count(status_code>=400) as errors by timestamp

# Status Code Distribution (Pie Chart)
search app_name=nginx | stats count by status_code

# Top Endpoints (Bar Chart)
search app_name=nginx | stats count by request_uri | sort desc | limit 10

# Slow Requests (Table)
search app_name=nginx duration>1000 | sort desc duration | table timestamp request_uri duration status_code | limit 20
```

---

### Template 4: Network Overview

```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│  TOTAL      │  BLOCKED    │  UNIQUE     │  UNIQUE     │
│  TRAFFIC    │  CONNS      │  SOURCES    │  DESTS      │
│  (Gauge)    │  (Gauge)    │  (Gauge)    │  (Gauge)    │
├─────────────┴─────────────┴─────────────┴─────────────┤
│                                                       │
│        TRAFFIC OVER TIME (Time Series)                │
│                                                       │
├─────────────────────────┬─────────────────────────────┤
│   TOP TALKERS           │    TOP DESTINATIONS         │
│   (Bar Chart)           │    (Bar Chart)              │
├─────────────────────────┼─────────────────────────────┤
│   PROTOCOL DIST         │    PORT DISTRIBUTION        │
│   (Pie Chart)           │    (Bar Chart)              │
└─────────────────────────┴─────────────────────────────┘
```

---

### Template 5: Homelab Overview

```
┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐
│ Router  │ NAS     │ Plex    │ Docker  │ Pi-hole │ Camera  │
│ Status  │ Status  │ Status  │ Status  │ Status  │ Status  │
│ (Gauge) │ (Gauge) │ (Gauge) │ (Gauge) │ (Gauge) │ (Gauge) │
├─────────┴─────────┴─────────┴─────────┴─────────┴─────────┤
│                                                           │
│              SYSTEM ACTIVITY (Time Series)                │
│                                                           │
├─────────────────────────┬─────────────────────────────────┤
│   ERROR LOG             │    RECENT EVENTS                │
│   (Table)               │    (Table)                      │
└─────────────────────────┴─────────────────────────────────┘
```

**Panel Queries (Status Gauges):**

```bash
# Router Status - count recent logs (>0 = alive)
search hostname=router | stats count

# NAS Status
search hostname=nas | stats count

# Use last event timestamp to determine freshness
search hostname=plex | stats latest(timestamp) as last_seen
```

---

## Advanced Techniques

### Dynamic Thresholds

Set gauge thresholds based on historical data:

```bash
# Get baseline
search severity<=3 | stats avg(count) as baseline

# Use baseline * 2 as warning, baseline * 5 as critical
```

### Drill-Down Dashboards

Create linked dashboards for investigation:

1. **Overview Dashboard** - High-level metrics
2. **Click metric** → Opens detailed dashboard
3. **Detailed Dashboard** - Filtered to specific host/app

### Dashboard Variables

Use template variables for reusable dashboards:

```bash
# With variable $hostname$
search hostname=$hostname$ severity<=3 | stats count by app_name

# User selects hostname from dropdown
# Query automatically filters to that host
```

### Multi-Panel Correlation

Show related data together:

```
┌──────────────────────┬──────────────────────┐
│  CPU USAGE           │  MEMORY USAGE        │
│  (Time Series)       │  (Time Series)       │
├──────────────────────┴──────────────────────┤
│                                             │
│  CORRELATED: Error Rate + Resource Usage    │
│  (Overlay Time Series)                      │
│                                             │
└─────────────────────────────────────────────┘
```

### Alerts Integration

Add visual indicators for alert states:

- Green border: All clear
- Yellow border: Warning threshold exceeded
- Red border: Critical threshold exceeded
- Blinking: Active incident

---

## Dashboard Maintenance

### Regular Review Checklist

- [ ] Are all panels still relevant?
- [ ] Are queries optimized for current data volume?
- [ ] Are thresholds still appropriate?
- [ ] Are any panels erroring out?
- [ ] Is the time range appropriate?

### Performance Monitoring

Watch for:
- Slow-loading panels (>5 seconds)
- High CPU usage during refresh
- Memory pressure from large queries

Solutions:
- Increase refresh interval
- Add stricter filters
- Use pre-aggregated data
- Reduce time range

---

## Quick Reference

### Panel Type Selection

| Question | Best Panel |
|----------|-----------|
| What's the current value? | Gauge |
| How does X compare to Y? | Bar Chart |
| What's the trend over time? | Time Series |
| What's the distribution? | Pie Chart |
| What are the details? | Table |
| Where are the hot spots? | Heatmap |

### Query Cheat Sheet

```bash
# Count
stats count

# Count by category
stats count by field | sort desc | limit N

# Count over time
stats count by timestamp

# Percentages
stats count | eval percentage=count/total*100

# Multiple metrics
stats count sum(bytes) avg(duration) by field
```

---

*Build dashboards that make you look like a wizard. Your future self will thank you.*
