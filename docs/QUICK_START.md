# Spunk Quick Start Guide

> **From Zero to Log Hero in 10 Minutes**

Welcome to Spunk! This guide will have you ingesting, searching, and analyzing logs faster than you can say "where did my disk space go?"

---

## What is Spunk?

Spunk is a **self-hosted, fully-local Splunk alternative** for homelab log management. Think Splunk, but:
- 100% local (no cloud, no subscriptions, no data leaving your network)
- Runs entirely in Docker (one command to start)
- Free forever (open source)

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Your      │───▶│   Spunk     │───▶│   Search    │───▶│   Profit!   │
│   Logs      │    │             │    │   Analyze   │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

---

## Step 1: Launch Spunk (2 minutes)

### Prerequisites
- Docker & Docker Compose installed
- 4GB RAM minimum (8GB recommended)
- 10GB disk space

### Start Everything

```bash
# Clone the repo (or download)
git clone https://github.com/your-org/spunk.git
cd spunk

# Launch!
docker-compose up -d
```

That's it. Spunk is now running.

### What Just Started?

| Service | Port | Purpose |
|---------|------|---------|
| **Nginx** | 80 | Web UI & API proxy |
| **API** | 4000 | Backend API |
| **ClickHouse** | 8123, 9000 | Log storage |
| **Vector** | 514/UDP, 514/TCP | Syslog ingestion |

### Verify It's Working

```bash
# Check all containers are running
docker-compose ps

# Should see: nginx, api, clickhouse, vector all "Up"
```

Open your browser to: **http://localhost**

You should see the Spunk search interface!

---

## Step 2: Send Your First Log (1 minute)

Let's send a test log to make sure everything works:

```bash
# Send a test syslog message
echo "<14>Test message from Spunk setup" | nc -u localhost 514
```

Or multiple messages:
```bash
for i in {1..10}; do
  echo "<$((i % 8 + 8))>Test message number $i from my homelab" | nc -u localhost 514
done
```

### Verify in UI

1. Go to http://localhost
2. Set time range to "Last 15 minutes"
3. Click Search (or press Enter)
4. You should see your test messages!

---

## Step 3: Point Your Devices at Spunk (5 minutes)

Now let's get real logs flowing.

### Configure rsyslog (Linux/Most NAS)

Add to `/etc/rsyslog.conf` or create `/etc/rsyslog.d/spunk.conf`:

```
# Send all logs to Spunk
*.* @YOUR_SPUNK_IP:514
```

Restart rsyslog:
```bash
sudo systemctl restart rsyslog
```

### Configure syslog-ng

Add to `/etc/syslog-ng/syslog-ng.conf`:

```
destination d_spunk {
    udp("YOUR_SPUNK_IP" port(514));
};

log {
    source(s_sys);
    destination(d_spunk);
};
```

### Configure pfSense/OPNsense

1. Go to Status → System Logs → Settings
2. Enable Remote Logging
3. Remote log server: `YOUR_SPUNK_IP:514`
4. Select what to log (Firewall events recommended)
5. Save

### Configure Synology NAS

1. Control Panel → Log Center → Log Sending
2. Check "Send logs to syslog server"
3. Server: `YOUR_SPUNK_IP`
4. Port: `514`
5. Protocol: UDP
6. Apply

### Configure Ubiquiti/UniFi

1. Settings → System → Remote Logging
2. Enable Remote Logging
3. Host: `YOUR_SPUNK_IP`
4. Port: `514`
5. Apply

### Verify Logs Are Flowing

After configuring, check the Spunk UI. You should see logs from your configured devices appearing!

```
search hostname=YOUR_DEVICE | limit 10
```

---

## Step 4: Your First Real Search (2 minutes)

Now let's do something useful!

### Basic Searches

```bash
# All logs from last hour (default view)
search *

# Only errors and above
search severity<=3

# Specific host
search hostname=router

# Pattern matching
search message~"failed"
```

### Analytics

```bash
# Count by severity
search * | stats count by severity

# Top hosts by log volume
search * | stats count by hostname | sort desc count

# Error messages by app
search severity<=3 | stats count by app_name | sort desc count
```

### Time-Based Analysis

```bash
# Logs over time (for charts)
search * | stats count by timestamp
```

---

## Step 5: Create Your First Dashboard (Bonus)

1. Go to **Dashboards** tab
2. Click **New Dashboard**
3. Name it "My Homelab Overview"
4. Click **Add Panel**
5. Configure:
   - Title: "Logs by Host"
   - Query: `search * | stats count by hostname`
   - Visualization: Bar Chart
6. Save

Repeat to add:
- Error count gauge
- Severity distribution pie chart
- Time series of log volume

---

## Quick Reference

### Essential Searches

| What | Query |
|------|-------|
| All errors | `search severity<=3` |
| From specific host | `search hostname=myhost` |
| Pattern match | `search message~"pattern"` |
| Count by field | `search * \| stats count by hostname` |
| Last N events | `search severity<=4 \| limit 100` |
| Top talkers | `search * \| stats count by hostname \| sort desc \| limit 10` |

### Severity Levels

| Level | Name | When to Care |
|-------|------|--------------|
| 0-2 | Emergency/Critical | Investigate immediately! |
| 3 | Error | Something's broken |
| 4 | Warning | Heads up |
| 5-6 | Notice/Info | Normal operation |
| 7 | Debug | Verbose details |

### Ports to Remember

| Port | Service | Protocol |
|------|---------|----------|
| 80 | Web UI | HTTP |
| 514 | Syslog | UDP/TCP |
| 4000 | API | HTTP |

---

## What's Next?

You've got the basics down! Here's where to go next:

### 📖 Learn More
- **[DSL Reference](./DSL_REFERENCE.md)** - Master the query language
- **[Knowledge Management](./KNOWLEDGE_MANAGEMENT.md)** - Field extractions, event types, workflows

### 🔧 Level Up
- **[Field Extraction](./FIELD_EXTRACTION.md)** - Parse custom log formats
- **[Dashboards Guide](./DASHBOARDS.md)** - Build operational views
- **[Alerting](./ALERTS.md)** - Get notified when things go wrong

### 🏠 Homelab Recipes
- **[Use Cases](./USE_CASES.md)** - Real-world examples for common setups

---

## Troubleshooting

### No logs appearing?

1. Check Vector is receiving logs:
   ```bash
   docker-compose logs vector
   ```

2. Check ClickHouse is healthy:
   ```bash
   docker-compose exec clickhouse clickhouse-client -q "SELECT count() FROM spunk.logs"
   ```

3. Verify your device is actually sending:
   ```bash
   # On Spunk server
   tcpdump -i any port 514
   ```

### UI not loading?

```bash
# Check all services
docker-compose ps

# Check nginx logs
docker-compose logs nginx

# Check API logs
docker-compose logs api
```

### Searches slow?

- Narrow your time range (last 15 min vs last 30 days)
- Add more specific filters
- Use `limit` to cap results

---

## Need Help?

- 📝 [GitHub Issues](https://github.com/your-org/spunk/issues)
- 📚 [Full Documentation](./README.md)
- 💬 Community Discord (coming soon!)

---

*Happy Spunking! Your logs are now under your control.*
