# LogNog In Agent

> The lightweight agent that ships your logs into LogNog

## Overview

**LogNog In** is a cross-platform agent that runs on your endpoints (Windows, macOS, Linux) and:
- Watches files/directories for changes
- Ships logs to your LogNog server
- Monitors file integrity (FIM)
- Runs silently in the system tray

## User Experience

### Installation

```bash
# Windows (MSI installer or standalone)
lognog-in.exe --install

# Linux
sudo apt install lognog-in  # or download binary

# macOS
brew install lognog-in
```

### First Run

1. Agent starts and shows system tray icon
2. Right-click tray icon → "Configure"
3. Enter your LogNog server URL
4. Paste your API key (generated in LogNog Settings)
5. Agent connects and shows green status

### What You See

**System Tray Icon:**
- 🟢 Green: Connected, shipping logs
- 🟡 Yellow: Buffering (server unreachable, will retry)
- 🔴 Red: Error (check logs)

**Right-Click Menu:**
- Status: "Connected to lognog.local"
- View Logs
- Configure
- Pause/Resume
- Exit

### Configuration UI

```
┌─────────────────────────────────────────────┐
│ LogNog In - Configuration                   │
├─────────────────────────────────────────────┤
│                                             │
│ Server: [https://lognog.local:443    ]      │
│ API Key: [lnog_abc123...             ] 🔒   │
│                                             │
│ ─── Watch Paths ───────────────────────     │
│ [+] /var/log/**/*.log                       │
│ [+] /home/*/app/logs/*.log                  │
│ [+] C:\Logs\*.txt                           │
│ [ Add Path ]                                │
│                                             │
│ ─── File Integrity Monitoring ──────────    │
│ [x] Enable FIM                              │
│ [+] /etc/**                                 │
│ [+] C:\Windows\System32\*.dll               │
│ [ Add FIM Path ]                            │
│                                             │
│ ─── Options ────────────────────────────    │
│ [x] Start on boot                           │
│ [x] Send hostname                           │
│ [ ] Debug logging                           │
│                                             │
│              [ Save ]  [ Cancel ]           │
└─────────────────────────────────────────────┘
```

## What Data Gets Sent

### Log Events

When a watched file changes, LogNog In sends:

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "hostname": "workstation-01",
  "source": "lognog-in",
  "source_type": "file",
  "file_path": "/var/log/app.log",
  "message": "User login successful: john@example.com",
  "metadata": {
    "file_size": 1024567,
    "file_modified": "2024-01-15T10:30:44.000Z",
    "agent_version": "1.0.0"
  }
}
```

### FIM Events

When a monitored file is created, modified, or deleted:

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "hostname": "workstation-01",
  "source": "lognog-in",
  "source_type": "fim",
  "event_type": "modified",
  "file_path": "/etc/passwd",
  "previous_hash": "sha256:abc123...",
  "current_hash": "sha256:def456...",
  "file_owner": "root",
  "file_permissions": "0644",
  "metadata": {
    "agent_version": "1.0.0"
  }
}
```

## Tech Stack

| Component | Technology | Why |
|-----------|------------|-----|
| Language | Python 3.10+ | Cross-platform, easy to package |
| File Watching | `watchdog` | Mature, cross-platform (inotify/FSEvents/ReadDirectoryChanges) |
| System Tray | `pystray` | Cross-platform tray icon |
| HTTP Client | `httpx` | Async, HTTP/2, connection pooling |
| Config | YAML | Human-readable, comments |
| Packaging | PyInstaller | Single executable |
| Hashing | `hashlib` | SHA-256 for FIM |

## Local Storage

LogNog In maintains a small local database for:
- **FIM baselines**: Hash of every monitored file
- **Event buffer**: Queued events when server unreachable
- **Config**: Server URL, API key, watch paths

```
~/.lognog-in/
├── config.yaml       # Configuration
├── baseline.db       # SQLite: FIM hashes
├── buffer.db         # SQLite: Pending events
└── logs/
    └── agent.log     # Agent logs (rotated)
```

### Why SQLite?

- Zero external dependencies
- Single file, easy to backup/reset
- Survives reboots
- Perfect for local buffering

## Docker Deployment

Yes, you can run LogNog In in a container:

```yaml
# docker-compose.yml
services:
  lognog-in:
    image: machinekinglabs/lognog-in:latest
    container_name: lognog-in
    restart: unless-stopped
    environment:
      LOGNOG_SERVER: https://lognog.local
      LOGNOG_API_KEY: lnog_your_api_key_here
    volumes:
      # Mount directories you want to watch
      - /var/log:/watch/var-log:ro
      - /home:/watch/home:ro
      # Persist agent state
      - lognog-in-data:/data
    # Optional: host network for hostname detection
    network_mode: host

volumes:
  lognog-in-data:
```

**Container Use Cases:**
- Sidecar for other containers
- Kubernetes DaemonSet
- Log aggregation from Docker volumes

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        LogNog In Agent                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Watchdog   │    │     FIM      │    │   System     │  │
│  │   (files)    │    │  (hashing)   │    │    Tray      │  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│         │                   │                   │          │
│         ▼                   ▼                   ▼          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Event Queue                       │   │
│  │              (in-memory + SQLite buffer)            │   │
│  └─────────────────────────┬───────────────────────────┘   │
│                            │                               │
│                            ▼                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   HTTP Shipper                       │   │
│  │         (async, batched, retry w/ backoff)          │   │
│  └─────────────────────────┬───────────────────────────┘   │
│                            │                               │
└────────────────────────────┼───────────────────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  LogNog Server  │
                    │  (API endpoint) │
                    └─────────────────┘
```

## API Endpoint

LogNog In ships events to:

```
POST /api/ingest/agent
Authorization: ApiKey lnog_your_api_key

{
  "events": [
    { "timestamp": "...", "message": "...", ... },
    { "timestamp": "...", "message": "...", ... }
  ]
}
```

**Response:**
```json
{
  "accepted": 100,
  "rejected": 0,
  "errors": []
}
```

## Roadmap

### Phase 1 (MVP)
- [x] File watching with watchdog
- [x] System tray icon
- [ ] API key authentication
- [ ] SQLite buffer
- [ ] Basic config UI

### Phase 2 ✅
- [x] File Integrity Monitoring
- [x] Windows Event Log collection
- [ ] macOS Unified Log collection
- [ ] Linux journald collection

## Windows Event Log Collection

LogNog In can collect Windows Event Logs directly without needing additional agents.

### Enable Windows Events

In your `config.yaml`:

```yaml
windows_events:
  enabled: true
  channels:
    - Security
    - System
    - Application
  event_ids: null  # null = all events, or list like [4624, 4625, 4634]
  poll_interval: 10  # seconds
```

### High-Value Security Events

By default, the agent tracks these security events:

| Event ID | Description |
|----------|-------------|
| 4624 | Successful logon |
| 4625 | Failed logon |
| 4648 | Explicit credential logon |
| 4672 | Special privileges assigned |
| 4688 | Process creation |
| 4698-4702 | Scheduled task changes |
| 4720 | User account created |
| 4726 | User account deleted |
| 4740 | User account locked out |
| 7045 | Service installed |

### Filter by Event IDs

To collect only specific events:

```yaml
windows_events:
  enabled: true
  channels:
    - Security
  event_ids:
    - 4624  # Successful logon
    - 4625  # Failed logon
    - 4740  # Account lockout
```

### Querying Windows Events

```
# All Windows security events
search source_type=windows_events index=security

# Failed login attempts
search source_type=windows_events event_id=4625
  | stats count by computer

# Account lockouts
search source_type=windows_events event_id=4740
  | table timestamp, computer, message

# New services installed (potential malware)
search source_type=windows_events event_id=7045
  | table timestamp, computer, message
```

### Phase 3
- [ ] OpenTelemetry export
- [ ] Syslog output (for legacy systems)
- [ ] Prometheus metrics endpoint
- [ ] Auto-update mechanism

## Resource Usage

LogNog In is designed to be lightweight:

| Metric | Target |
|--------|--------|
| Memory | < 50 MB |
| CPU (idle) | < 0.1% |
| CPU (active) | < 1% |
| Disk | < 10 MB (+ buffer) |

## Security

- API keys stored encrypted (OS keychain when available)
- TLS required for server connections
- No data sent to third parties
- Local logs redacted of sensitive data
- FIM alerts on agent config changes

## Comparison

| Feature | LogNog In | Elastic Agent | Fluentd |
|---------|-----------|---------------|---------|
| Open Source | Yes | Partial | Yes |
| System Tray | Yes | No | No |
| FIM Built-in | Yes | Yes | No |
| Single Binary | Yes | Yes | No |
| Config UI | Yes | Via Fleet | No |
| Memory | ~50MB | ~200MB | ~50MB |
