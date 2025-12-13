# LogNog Lite

> SQLite-powered log management for small deployments - No Docker required!

## Overview

LogNog Lite is a lightweight version of LogNog that uses SQLite instead of ClickHouse for log storage. It's perfect for:

- **Small homelabs** (1-10 machines)
- **Development environments**
- **Quick demos and testing**
- **Windows machines** where Docker isn't available
- **Single-machine deployments**

## Quick Start

### Windows (No Docker)

```powershell
# Download the LogNog Lite installer
Invoke-WebRequest -Uri "https://github.com/machinekinglabs/lognog/releases/latest/download/lognog-lite-windows.zip" -OutFile "lognog-lite.zip"

# Extract
Expand-Archive -Path "lognog-lite.zip" -DestinationPath "C:\LogNog"

# Run
cd C:\LogNog
.\lognog-lite.exe
```

Access the UI at `http://localhost:4000`

### Linux/macOS

```bash
# Download
curl -L https://github.com/machinekinglabs/lognog/releases/latest/download/lognog-lite-linux -o lognog-lite
chmod +x lognog-lite

# Run
./lognog-lite
```

### From Source

```bash
cd lognog/lite
npm install
npm run start
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    LogNog Lite                          │
│                                                         │
│  ┌──────────────┐    ┌──────────────┐                  │
│  │   React UI   │◀──▶│  Node.js API │                  │
│  │   (Vite)     │    │  (Express)   │                  │
│  └──────────────┘    └──────┬───────┘                  │
│                             │                          │
│                      ┌──────┴──────┐                   │
│                      │   SQLite    │                   │
│                      │ (logs.db)   │                   │
│                      └─────────────┘                   │
│                                                         │
│  Data Sources:                                          │
│  ├── HTTP API (POST /api/ingest)                       │
│  ├── LogNog In Agent                                    │
│  └── File Import                                        │
└─────────────────────────────────────────────────────────┘
```

## Features Comparison

| Feature | LogNog Full | LogNog Lite |
|---------|-------------|-------------|
| **Storage** | ClickHouse | SQLite |
| **Log Volume** | 1K-10K/sec | Up to 100K/day |
| **Docker Required** | Yes | No |
| **Syslog Ingestion** | Yes | Via Agent |
| **HTTP Ingestion** | Yes | Yes |
| **Full DSL Support** | Yes | Yes |
| **Dashboards** | Yes | Yes |
| **Alerts** | Yes | Yes |
| **Reports** | Yes | Yes |
| **GeoIP** | Yes | Yes |
| **Multi-user** | Yes | Yes |
| **Retention** | TTL-based | Manual/Scheduled |
| **Deployment** | docker-compose | Single binary |

## SQLite Storage

### Database Files

```
./lognog-lite/
├── lognog.db        # Metadata (users, alerts, dashboards)
├── lognog-logs.db   # Log storage
└── config.yaml      # Configuration
```

### Schema

The log schema mirrors the ClickHouse version:

```sql
CREATE TABLE logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  received_at TEXT NOT NULL,
  hostname TEXT DEFAULT '',
  app_name TEXT DEFAULT '',
  severity INTEGER DEFAULT 6,
  facility INTEGER DEFAULT 1,
  priority INTEGER DEFAULT 14,
  message TEXT DEFAULT '',
  raw TEXT DEFAULT '',
  structured_data TEXT DEFAULT '{}',
  index_name TEXT DEFAULT 'main',
  protocol TEXT DEFAULT 'agent',
  source_ip TEXT DEFAULT '',
  source_port INTEGER DEFAULT 0
);

-- Full-text search
CREATE VIRTUAL TABLE logs_fts USING fts5(message, raw);
```

### Performance

SQLite is optimized for:

- **WAL mode**: Better concurrent read/write performance
- **NORMAL synchronous**: Faster writes with reasonable durability
- **64MB cache**: Good balance of memory and speed
- **FTS5**: Full-text search on message and raw fields

Expected performance:
- **Insert**: ~5,000 logs/second
- **Search**: <100ms for most queries
- **Storage**: ~200 bytes per log (average)

## DSL Compiler

LogNog Lite uses the SQLite DSL compiler (`compiler-sqlite.ts`) which generates SQLite-compatible SQL:

```
# LogNog DSL
search host=router severity>=warning | stats count by app_name

# Compiled to SQLite SQL
SELECT app_name, COUNT(*) as count
FROM logs
WHERE hostname = 'router' AND severity <= 4
GROUP BY app_name
```

### Differences from ClickHouse

| Feature | ClickHouse | SQLite |
|---------|------------|--------|
| Array functions | Native | JSON functions |
| IPv4 type | Native | TEXT |
| DateTime | DateTime64 | TEXT (ISO8601) |
| Full-text | LIKE | FTS5 MATCH |

## Configuration

### config.yaml

```yaml
# Server settings
port: 4000
host: "0.0.0.0"

# Database paths
logs_db: "./lognog-logs.db"
metadata_db: "./lognog.db"

# Performance
cache_size_mb: 64
wal_mode: true

# Retention
retention_days: 30
cleanup_schedule: "0 3 * * *"  # 3 AM daily

# Security
jwt_secret: "your-secret-key"
admin_password: "change-me"  # First run only
```

### Environment Variables

```bash
LOGS_DB_PATH=./lognog-logs.db
METADATA_DB_PATH=./lognog.db
PORT=4000
JWT_SECRET=your-secret-key
```

## Ingestion Methods

### 1. LogNog In Agent (Recommended)

Install the agent on your machines:

```yaml
# agent config.yaml
server_url: "http://localhost:4000"
api_key: "your-api-key"
watch_paths:
  - path: /var/log
    pattern: "*.log"
```

### 2. HTTP API

Send logs directly via HTTP:

```bash
curl -X POST http://localhost:4000/api/ingest/http \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '[
    {
      "timestamp": "2024-01-15T10:30:00Z",
      "hostname": "myserver",
      "app_name": "myapp",
      "message": "User logged in"
    }
  ]'
```

### 3. File Import

Import existing log files:

```bash
# Import a log file
lognog-lite import /var/log/syslog --source=syslog --hostname=myserver
```

## Retention & Cleanup

### Automatic Cleanup

Configure automatic log cleanup in config.yaml:

```yaml
retention_days: 30
cleanup_schedule: "0 3 * * *"
```

### Manual Cleanup

```bash
# Delete logs older than 30 days
lognog-lite cleanup --days=30

# Vacuum database to reclaim space
lognog-lite vacuum
```

### Database Maintenance

```bash
# Check database integrity
lognog-lite check

# Optimize database
lognog-lite optimize

# Backup database
lognog-lite backup ./backup/
```

## Monitoring System Status

LogNog Lite includes built-in monitoring for alerting you when systems are down:

### Heartbeat Alerts

Create alerts that trigger when a host stops sending logs:

```
# Alert: No logs from critical server in 5 minutes
search hostname=critical-server
  | stats latest(timestamp) as last_seen
  | eval minutes_ago=round((now()-strptime(last_seen, "%Y-%m-%dT%H:%M:%S"))/60)
  | where minutes_ago > 5
```

### Example Dashboard for System Health

```
# All hosts with their last log time
search *
  | stats latest(timestamp) as last_seen, count by hostname
  | eval status=if(now()-strptime(last_seen, "%Y-%m-%dT%H:%M:%S") > 300, "DOWN", "UP")
  | table hostname, status, last_seen, count
```

## Migration

### From LogNog Full to Lite

```bash
# Export from ClickHouse
clickhouse-client --query "SELECT * FROM logs FORMAT JSONEachRow" > logs.json

# Import to SQLite
lognog-lite import logs.json --format=json
```

### From Lite to Full

```bash
# Export from SQLite
sqlite3 lognog-logs.db ".mode json" ".output logs.json" "SELECT * FROM logs"

# Import to ClickHouse (via API)
curl -X POST http://lognog-full/api/ingest/http \
  -H "X-API-Key: key" \
  -d @logs.json
```

## Troubleshooting

### Database Locked

```bash
# Check for locks
lsof lognog-logs.db

# Force unlock (be careful!)
lognog-lite unlock
```

### Slow Queries

```bash
# Enable query logging
LOGNOG_DEBUG=queries lognog-lite

# Analyze slow queries
lognog-lite analyze-queries
```

### Out of Disk Space

```bash
# Check database size
lognog-lite stats

# Emergency cleanup
lognog-lite cleanup --days=7 --vacuum
```

## Resource Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 256 MB | 512 MB |
| CPU | 1 core | 2 cores |
| Disk | 1 GB | 10 GB |
| OS | Windows 10+, Linux, macOS |

## Security

- Same authentication system as LogNog Full
- JWT tokens for sessions
- API keys for agents
- Encrypted database option (SQLCipher)
- All network traffic over HTTPS (recommended)

## Limitations

1. **Volume**: Not suitable for >100K logs/day sustained
2. **Concurrency**: SQLite has limited write concurrency
3. **Clustering**: Single-node only
4. **Syslog**: No direct UDP/TCP syslog (use agent instead)
5. **Some DSL functions**: Array operations are limited

## When to Upgrade to Full

Consider upgrading to LogNog Full when:
- Log volume exceeds 100K/day consistently
- You need direct syslog ingestion
- You want distributed storage
- You need sub-second query performance on large datasets
