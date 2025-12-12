# LogNog

<p align="center">
  <img src="ui/public/lognoglogo.png" width="120" height="120" alt="LogNog Logo">
</p>

<p align="center">
  <strong>Your Logs, Your Control</strong><br>
  Self-hosted log management for homelabs and beyond
</p>

<p align="center">
  <a href="#choose-your-setup">Get Started</a> •
  <a href="#features">Features</a> •
  <a href="#query-language">Query Language</a> •
  <a href="#architecture">Architecture</a> •
  <a href="docs/">Documentation</a>
</p>

<p align="center">
  <em>By Machine King Labs</em>
</p>

---

## Why LogNog?

**Splunk lost its way.** What started as a powerful tool for everyone became an enterprise-only product with pricing that locks out homelabbers, small teams, and independent developers. The dev license? A joke.

**LogNog is different:**
- 100% open source (MIT license)
- Runs entirely on your hardware
- No cloud dependencies
- No phone-home telemetry
- No arbitrary limits

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

---

## Features

### Core Features (All Versions)
- **Real-time Log Search** - Powerful query language, sub-second results
- **Live Tail** - SSE-powered real-time log streaming
- **Custom Dashboards** - Build your own visualizations
- **File Integrity Monitoring** - Know when critical files change
- **Splunk-style Alerts** - Threshold-based triggers with email, webhook, and log actions
- **Reports** - Generate and schedule HTML reports

### LogNog Full (Docker) Extras
- **Syslog Ingestion** - UDP/TCP port 514 (RFC 3164 & 5424)
- **OpenTelemetry (OTLP)** - Native OTLP/HTTP JSON ingestion
- **ClickHouse Storage** - Columnar database for billions of logs
- **Vector Pipeline** - High-performance log routing
- **Network Device Support** - pfSense, OPNsense, Ubiquiti, etc.

---

## LogNog In (Agent)

The lightweight agent that ships logs to your LogNog server.

### Features
- System tray with status indicator
- GUI configuration (no command line needed)
- File watching with pattern matching
- File Integrity Monitoring (FIM)
- **Alert notifications** - Push alerts from server to system tray
- **Alert history** - View previous alerts received
- Offline buffering - never lose logs
- Low resource usage (~50MB RAM)

### Quick Start

1. **Download** `LogNogIn.exe` from [Releases](https://github.com/machinekinglabs/lognog/releases)
2. **Run** - Double-click the EXE
3. **Configure** - Double-click the tray icon
4. **Done** - Logs start flowing

[Full Agent Documentation →](agent/README.md)

---

## LogNog Lite Installation

Native Windows server with SQLite - no Docker required!

### Prerequisites
- Windows 10/11
- [Node.js 18+](https://nodejs.org/)

### Quick Start

1. **Download** the `LogNogLite.zip` from [Releases](https://github.com/machinekinglabs/lognog/releases)
2. **Extract** to any folder
3. **Run** `LogNogLite.exe`
4. **Done** - Browser opens automatically to http://localhost:4000

### What's Included

```
LogNogLite/
+-- LogNogLite.exe    (run this)
+-- api/              (server code)
+-- ui/               (dashboard)
+-- data/             (created on first run)
    +-- lognog.db     (settings)
    +-- lognog-logs.db (your logs)
```

### Performance

- **Recommended**: Up to 100K logs/day
- **Storage**: ~100 bytes per log

For larger deployments, use [LogNog Full (Docker)](#lognog-full-docker-installation).

---

## LogNog Full (Docker) Installation

### Prerequisites
- Docker & Docker Compose
- 4GB+ RAM recommended

### Quick Start

```bash
# Clone the repository
git clone https://github.com/machinekinglabs/lognog.git
cd lognog

# Start all services
docker-compose up -d

# Check status
docker-compose ps
```

### Access

| Service | URL | Description |
|---------|-----|-------------|
| **Web UI** | http://localhost | Main dashboard |
| **API** | http://localhost:4000 | REST API |
| **Syslog** | localhost:514 (UDP/TCP) | Log ingestion |

### Send Test Logs

```bash
# Quick test
echo "<14>$(date '+%b %d %H:%M:%S') testhost myapp[1234]: Hello LogNog!" | nc -u localhost 514

# Generate realistic test data
docker-compose --profile testing up -d
```

---

## Query Language

LogNog uses a Splunk-like query language that compiles to SQL.

### Basic Syntax

```
command arguments | command arguments | ...
```

### Commands

| Command | Description | Example |
|---------|-------------|---------|
| `search` | Filter logs | `search host=router severity>=warning` |
| `filter` | Additional filtering | `filter app_name~"nginx"` |
| `stats` | Aggregate | `stats count by hostname` |
| `sort` | Order results | `sort desc timestamp` |
| `limit` | Limit results | `limit 100` |
| `table` | Select fields | `table timestamp hostname message` |
| `dedup` | Remove duplicates | `dedup hostname` |
| `rename` | Rename fields | `rename hostname as host` |

### Example Queries

```bash
# All errors from the last hour
search severity<=3

# Count by host
search * | stats count by hostname | sort desc

# Find failed SSH logins
search app_name=sshd message~"Failed" | stats count by hostname

# Top talkers
search * | stats count by app_name | sort desc | limit 10
```

---

## Architecture

### LogNog Full (Docker)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Syslog    │────▶│   Vector    │────▶│ ClickHouse  │
│   Clients   │     │  (ingest)   │     │  (storage)  │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                    ┌─────────────┐            │
                    │  React UI   │◀───────────┤
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
| 80 | Nginx | HTTP | Web UI (main entry) |
| 514 | Vector | UDP/TCP | Syslog ingestion |
| 4000 | API | HTTP | REST API (internal) |
| 8123 | ClickHouse | HTTP | Database (internal) |

---

## Log Sources

### LogNog In Agent (Recommended)
Install on any Windows/Mac/Linux machine to ship logs.

### Syslog (Docker version)

**Linux (rsyslog)**
```bash
# /etc/rsyslog.d/50-lognog.conf
*.* @lognog-server:514
sudo systemctl restart rsyslog
```

**Docker Containers**
```yaml
services:
  myapp:
    logging:
      driver: syslog
      options:
        syslog-address: "udp://lognog-server:514"
```

**Network Devices**
Configure syslog forwarding to your LogNog server IP on port 514.

### OpenTelemetry (OTLP)

LogNog Full supports native OpenTelemetry log ingestion via OTLP/HTTP JSON.

**Endpoint:** `POST /api/ingest/otlp/v1/logs`

**Example with OpenTelemetry Collector:**
```yaml
exporters:
  otlphttp:
    endpoint: http://lognog-server:4000/api/ingest
    tls:
      insecure: true

service:
  pipelines:
    logs:
      exporters: [otlphttp]
```

**Example with curl:**
```bash
curl -X POST http://localhost:4000/api/ingest/otlp/v1/logs \
  -H "Content-Type: application/json" \
  -d '{
    "resourceLogs": [{
      "resource": {
        "attributes": [
          {"key": "service.name", "value": {"stringValue": "my-app"}},
          {"key": "host.name", "value": {"stringValue": "server01"}}
        ]
      },
      "scopeLogs": [{
        "logRecords": [{
          "timeUnixNano": "1702400000000000000",
          "severityNumber": 9,
          "body": {"stringValue": "Hello from OpenTelemetry!"}
        }]
      }]
    }]
  }'
```

---

## Development

### API
```bash
cd api
npm install
npm run dev      # Development server
npm run test     # Run tests
```

### UI
```bash
cd ui
npm install
npm run dev      # Vite dev server (port 3000)
```

### Agent
```bash
cd agent
pip install -e ".[dev]"
pytest           # Run tests
python -m lognog_in  # Run agent
```

### Build Agent EXE
```bash
cd agent
python build.py  # Creates dist/LogNogIn.exe
```

---

## Configuration

### Environment Variables

```bash
# API Port
PORT=4000

# SMTP for scheduled reports
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=reports@example.com
SMTP_PASS=your-password
SMTP_FROM=reports@example.com
```

---

## Roadmap

- [x] Custom dashboards
- [x] Report generation & scheduling
- [x] User authentication
- [x] LogNog In agent (Windows)
- [x] LogNog Lite (native Windows server)
- [x] Splunk-style alert rules & notifications
- [x] OpenTelemetry (OTLP) ingestion
- [x] SSE Live Tail (real-time streaming)
- [x] Agent alert notifications (push to system tray)
- [ ] macOS/Linux agent packages
- [ ] Kubernetes deployment
- [ ] Log forwarding between LogNog instances

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

MIT License - see [LICENSE](LICENSE)

---

<p align="center">
  <strong>LogNog</strong> - Your Logs, Your Control<br>
  <em>By Machine King Labs</em>
</p>
