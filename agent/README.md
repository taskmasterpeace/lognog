# LogNog In Agent

> **Lightweight log shipping agent for LogNog**

LogNog In is a cross-platform agent that monitors log files, ships them to your LogNog server, and provides File Integrity Monitoring (FIM) capabilities. Designed for homelabs and self-hosted environments, it runs silently in your system tray and ensures you never lose logs—even when the server is offline.

**By Machine King Labs**

---

## Features

- **Real-time log file monitoring** - Tails files by byte offset (partial lines held until complete), per-path encoding, exclude globs, `start_position`, multi-line merging for stack traces, and a periodic re-scan for shares the OS watcher misses
- **Windows Event Log collection** - Modern Event Log API: every channel (Security, System, Application, **Sysmon**, **PowerShell**, Task Scheduler, Defender …) with **named event fields**, include/exclude ID filters evaluated inside the query
- **File Integrity Monitoring (FIM)** - SHA-256 baseline tracking with change detection for security monitoring
- **Offline buffering** - SQLite-backed queue ensures logs are never lost when the server is unreachable
- **Per-input routing** - `index`, `source_type` and static `tags` per watch path / channel
- **Agent heartbeat** - `source_type=agent_heartbeat` every 60 s with sent/buffered/dropped counters, so LogNog can alert on a dead agent
- **System tray integration** - Brand icon with a live status dot (connected / buffering / error / paused), stats, test event, flush
- **Windows service** - `--service install` from the EXE (LocalSystem unlocks the Security channel), auto-restart on crash, DPAPI-protected API key
- **Cross-platform** - Runs on Windows, macOS, and Linux with native file system watchers
- **Low resource footprint** - Under 50 MB RAM, <1% CPU during active monitoring
- **Automatic retry** - Exponential backoff with jitter; a backlog drains back-to-back
- **Batched, compressed shipping** - gzip request bodies, TLS options (`verify_tls`, `ca_bundle`)
- **Diagnostics** - `lognog-in doctor` checks config, buffer, channel access, service state and connectivity in one screen
- **Headless mode** - Run as daemon/service without system tray for servers
- **Sound alerts** - Customizable audio notifications for alert severity levels (critical, error, warning, info)

---

## Installation

### Windows (Recommended)

Download the standalone executable from the [releases page](https://github.com/machinekinglabs/lognog/releases):

```powershell
# Download lognog-in.exe
# Double-click to run, or via PowerShell:
.\lognog-in.exe
```

### Python Package (All Platforms)

```bash
# Install via pip
pip install lognog-in

# Verify installation
lognog-in --version
```

### From Source

```bash
# Clone the repository
git clone https://github.com/machinekinglabs/lognog.git
cd lognog/agent

# Install in development mode
pip install -e .

# Run the agent
lognog-in
```

### Docker

```bash
docker pull machinekinglabs/lognog-in:latest
```

See [Docker Deployment](#docker-deployment) section for details.

---

## Quick Start

Get started in 5 minutes:

### Option A: Use the GUI (Recommended for Windows)

1. **Run LogNogIn.exe** - Double-click the executable
2. **Double-click the tray icon** - Opens the configuration window
3. **Enter your server URL** - e.g., `http://192.168.1.100:4000`
4. **Enter your API key** - Get this from LogNog → Settings → API Keys
5. **Add watch paths** - Click "Add Path..." to select folders with log files
6. **Click Save** - Configuration is saved and agent starts monitoring

### Option B: Use the Command Line

#### 1. Initialize Configuration

```bash
lognog-in init --server https://lognog.local --api-key lnog_your_api_key_here
```

This creates a config file with your server connection details.

### 2. Add Paths to Watch

Edit the config file (see [Configuration](#configuration) for location):

```yaml
watch_paths:
  - path: /var/log/
    pattern: "*.log"
    recursive: true

  - path: /home/*/myapp/logs/
    pattern: "*.log"
    recursive: true
```

### 3. Start the Agent

```bash
# With system tray
lognog-in

# Headless (daemon mode)
lognog-in --headless
```

### 4. Verify Connection

```bash
lognog-in test
```

You should see:
```
✓ Server health check passed
✓ Authenticated as: admin
Connection test successful!
```

---

## GUI Configuration Window

Double-click the system tray icon to open the configuration window:

```
┌─────────────────────────────────────────────────────────────┐
│  [Logo] LogNog In                        Machine King Labs  │
│         Lightweight Log Shipping Agent                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Server Connection                                          │
│  ─────────────────                                          │
│  Server URL: [http://localhost:4000                    ]    │
│  API Key:    [********************************         ]    │
│  ☐ Show   Get your API key from LogNog → Settings → API Keys│
│  [Test Connection]                                          │
│                                                             │
│  Log Watch Paths                                            │
│  ───────────────                                            │
│  Add folders containing log files. The agent will detect    │
│  new log entries in real-time.                              │
│  ┌───────────────────────────────────────────────────┐     │
│  │ ✓ C:\Logs (*.log)                                 │     │
│  │ ✓ C:\MyApp\logs (*.txt)                           │     │
│  └───────────────────────────────────────────────────┘     │
│  [Add Path...] [Remove]                                     │
│                                                             │
│  File Integrity Monitoring (FIM)                            │
│  ───────────────────────────────                            │
│  Monitor critical files for changes.                        │
│  ☑ Enable File Integrity Monitoring                         │
│  ┌───────────────────────────────────────────────────┐     │
│  │ ✓ C:\Windows\System32 (*.dll)                     │     │
│  └───────────────────────────────────────────────────┘     │
│  [Add Path...] [Remove]                                     │
│                                                             │
│  Advanced                                                   │
│  ────────                                                   │
│  ☐ Enable debug logging                                     │
│  ☐ Start on Windows boot                                    │
│                                                             │
│                                    [Save]  [Cancel]         │
└─────────────────────────────────────────────────────────────┘
```

### GUI Features

- **Tooltips** - Hover over any field for helpful information
- **Test Connection** - Verify your server URL and API key work
- **Browse for folders** - Click "Add Path..." to select folders visually
- **Start on boot** - Automatically run when Windows starts
- **Sound Alerts Tab** - Configure custom sounds for different alert severity levels

---

## Configuration

### Config File Location

The agent stores configuration in platform-specific directories:

| Platform | Location |
|----------|----------|
| **Linux** | `~/.config/lognog-in/config.yaml` |
| **macOS** | `~/Library/Application Support/lognog-in/config.yaml` |
| **Windows** | `%APPDATA%\MachineKingLabs\lognog-in\config.yaml` |

### Full Configuration Example

```yaml
# Server connection
server_url: https://lognog.local:443
api_key: lnog_abc123def456...

# Agent identification
hostname: workstation-01
send_hostname: true

# Log file paths to watch
watch_paths:
  - path: /var/log/
    pattern: "*.log"
    recursive: true
    enabled: true

  - path: /home/*/app/logs/
    pattern: "*.log"
    recursive: true
    enabled: true

  - path: C:\Logs\
    pattern: "*.txt"
    recursive: false
    enabled: true

# File Integrity Monitoring
fim_enabled: true
fim_paths:
  - path: /etc/
    pattern: "*"
    recursive: true
    enabled: true

  - path: /usr/local/bin/
    pattern: "*"
    recursive: false
    enabled: true

  - path: C:\Windows\System32\
    pattern: "*.dll"
    recursive: false
    enabled: true

# Batching settings
batch_size: 100                    # Max events per batch
batch_interval_seconds: 5.0        # Max seconds to wait before shipping

# Retry settings
retry_max_attempts: 5              # Max retry attempts for failed shipments
retry_backoff_seconds: 2.0         # Initial backoff (doubles each retry)

# Behavior
start_on_boot: false               # Auto-start with system (future)
debug_logging: false               # Enable verbose debug logs

# Sound alerts
sound_alerts_enabled: true         # Enable sound alerts for notifications
sound_critical: default            # Sound for critical alerts (path or "default")
sound_error: default               # Sound for error alerts
sound_warning: default             # Sound for warning alerts
sound_info: default                # Sound for info alerts
sound_volume: 100                  # Volume level (0-100)
```

### Path Patterns

The agent uses glob patterns for path matching:

| Pattern | Matches |
|---------|---------|
| `*` | Any single path component |
| `**` | Any number of nested directories |
| `*.log` | Files ending in .log |
| `app-*.log` | Files like app-2024.log |
| `/var/log/**/*.log` | All .log files recursively under /var/log |

---

## CLI Commands

### Main Command

```bash
# Start agent with system tray
lognog-in

# Start in headless mode (daemon)
lognog-in --headless

# Use custom config file
lognog-in --config /path/to/config.yaml

# Enable debug logging
lognog-in --debug

# Quick setup (overrides config file)
lognog-in --server https://lognog.local --api-key lnog_abc123

# Add watch paths on the fly
lognog-in --watch /var/log/*.log --watch /home/user/app/logs/

# Enable FIM on the fly
lognog-in --fim /etc/ --fim /usr/local/bin/

# Show version
lognog-in --version
```

### Subcommands

#### `lognog-in init`

Initialize configuration with server details:

```bash
lognog-in init --server https://lognog.local --api-key lnog_abc123def456
```

#### `lognog-in test`

Test server connection and authentication:

```bash
lognog-in test

# Output:
# Testing connection to https://lognog.local...
# ✓ Server health check passed
# ✓ Authenticated as: admin
# Connection test successful!
```

#### `lognog-in status`

Show agent status and configuration summary:

```bash
lognog-in status

# Output:
# LogNog In Agent Status
# ========================================
# Version: 0.1.0
# Config: ~/.config/lognog-in/config.yaml
# Data: ~/.local/share/lognog-in
# Logs: ~/.local/share/lognog-in/logs
#
# Server: https://lognog.local
# Configured: Yes
# Hostname: workstation-01
#
# Watch paths: 2
#   ✓ /var/log/ (*.log)
#   ✓ /home/*/app/logs/ (*.log)
#
# FIM enabled: Yes
# FIM paths: 1
#   ✓ /etc/ (*)
```

#### `lognog-in doctor`

One-screen diagnostics — what a support ticket would ask for:

```bash
lognog-in doctor

# LogNog In 0.2.0 doctor
# Python 3.13.0 on win32 (frozen EXE)
# [OK]   Server URL + API key configured: https://logs.example.com
# [OK]   API key protection (DPAPI): available
# [OK]   Watch path C:\inetpub\logs\LogFiles: 14 file(s) match u_ex*.log
# [OK]   Offline buffer: 0 event(s), 0.0 KB at ...\buffer.db
# Windows Event API: modern (EvtQuery)
# [OK]   Channel Security: readable, newest record 987654 at 2026-09-02T15:04:30+00:00
# [FAIL] Channel Microsoft-Windows-Sysmon/Operational: The specified channel could not be found (error 15007)
# Windows service: running
# [OK]   Server health check passed
# [OK]   Authenticated as: agent-key
```

#### `lognog-in send-test` / `lognog-in flush`

```bash
lognog-in send-test            # one event, search LogNog for source_type=agent_test
lognog-in flush --timeout 120  # ship everything in the offline buffer now
```

#### `lognog-in --service …` (Windows)

```powershell
# From an elevated prompt. Works from the EXE and from a pip install.
LogNogIn.exe --service install    # registers LogNogIn.exe --service run, auto-start, LocalSystem
LogNogIn.exe --service start
LogNogIn.exe --service status
LogNogIn.exe --service stop
LogNogIn.exe --service uninstall
```

The service runs headless and shares `config.yaml` with the tray app (the API key is DPAPI-encrypted in machine scope so both can read it).

#### `lognog-in config`

Display current configuration (with redacted API key):

```bash
lognog-in config

# Output:
# # Configuration from: ~/.config/lognog-in/config.yaml
#
# server_url: https://lognog.local
# api_key: lnog_abc123def456...
# hostname: workstation-01
# batch_size: 100
# batch_interval_seconds: 5.0
# ...
```

---

## How It Works

### Architecture Overview

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

### File Watching

LogNog In uses the [watchdog](https://github.com/gorakhargosh/watchdog) library for efficient file system monitoring:

- **Linux**: inotify (kernel-level file events)
- **macOS**: FSEvents (native file system API)
- **Windows**: ReadDirectoryChangesW (Win32 API)

When a file changes, the agent:
1. Reads new lines appended to the file
2. Parses each line as a log event
3. Adds timestamp, hostname, and metadata
4. Queues the event for batching

### Event Batching

To minimize HTTP overhead, events are batched before shipping:

- Events accumulate in an in-memory queue
- Batch ships when either:
  - `batch_size` events are queued (default: 100)
  - `batch_interval_seconds` elapsed (default: 5s)
- Each batch is a single HTTP POST with JSON array

### Offline Buffering

If the LogNog server is unreachable:

1. Events are written to a local SQLite database
2. System tray icon turns yellow (buffering mode)
3. HTTP shipper retries with exponential backoff
4. Once connected, buffered events are replayed
5. System tray icon turns green (connected)

Database location:
- Linux/macOS: `~/.local/share/lognog-in/buffer.db`
- Windows: `%LOCALAPPDATA%\MachineKingLabs\lognog-in\buffer.db`

### File Integrity Monitoring (FIM)

When FIM is enabled, the agent:

1. **Baseline creation**: Hashes all monitored files with SHA-256
2. **Change detection**: Watches for file create/modify/delete events
3. **Hash comparison**: Re-hashes modified files and compares to baseline
4. **Alert generation**: Ships FIM events to LogNog with old/new hashes

FIM baseline location:
- Linux/macOS: `~/.local/share/lognog-in/baseline.db`
- Windows: `%LOCALAPPDATA%\MachineKingLabs\lognog-in\baseline.db`

**FIM Event Example:**
```json
{
  "timestamp": "2025-12-12T10:30:45.123Z",
  "hostname": "workstation-01",
  "source": "lognog-in",
  "source_type": "fim",
  "event_type": "modified",
  "file_path": "/etc/passwd",
  "previous_hash": "sha256:abc123...",
  "current_hash": "sha256:def456...",
  "file_owner": "root",
  "file_permissions": "0644"
}
```

---

## System Tray Interface

The agent provides a visual system tray icon with status indicators:

### Status Icons

| Icon | Status | Description |
|------|--------|-------------|
| 🟢 Green | Connected | Actively shipping logs to server |
| 🟡 Yellow | Buffering | Server unreachable, buffering locally |
| 🔴 Red | Error | Configuration error or fatal issue |

### Right-Click Menu

- **Status / stats**: "Connected" · "1,204 sent · 0 buffered"
- **Configure…**: Opens the configuration window (General, Windows Events, Sound Alerts)
- **Open LogNog**: Opens the server in your browser
- **View Agent Log** / **View Alerts**
- **Send Test Event**: Ships one `source_type=agent_test` event
- **Flush Buffer Now**: Re-scans files and drains the offline buffer
- **Run Setup Wizard…**
- **Pause/Resume**: Temporarily stop collecting (grey dot)
- **Quit**: Graceful shutdown (buffer is flushed first)

---

## Sound Alerts

LogNog In can play audio notifications when alert notifications are received from the server. This helps ensure you never miss critical alerts.

### Features

- **Severity-based sounds**: Different sounds for critical, error, warning, and info alerts
- **Built-in beeps**: Default system beeps with frequency based on severity (no additional dependencies)
- **Custom sounds**: Use your own .wav files for each severity level
- **Volume control**: Adjust playback volume from 0-100%
- **Test sounds**: Preview sounds before saving configuration
- **Cross-platform**: Works on Windows (winsound), and other platforms with pygame

### Audio Backend

The agent automatically detects the available audio backend:

1. **Windows**: Uses built-in `winsound` module (no additional dependencies)
2. **Other platforms**: Uses `pygame` if installed (optional dependency)
3. **Fallback**: System bell if no audio backend available

### Installation with Sound Support

```bash
# Install with optional sound dependencies
pip install lognog-in[sound]

# Or install manually
pip install lognog-in pygame numpy
```

### Configuration

#### Using the GUI

1. Open the configuration window (double-click tray icon)
2. Navigate to the **Sound Alerts** tab
3. Check **Enable sound alerts for notifications**
4. Adjust the volume slider (0-100%)
5. For each severity level:
   - Click **Browse...** to select a custom .wav file
   - Click **Default** to use the built-in system beep
   - Click **Test** to preview the sound
6. Click **Save** to apply changes

#### Using YAML Config

```yaml
# Enable sound alerts
sound_alerts_enabled: true

# Set volume (0-100)
sound_volume: 75

# Configure sounds per severity
sound_critical: default                           # Built-in beep
sound_error: C:\Sounds\error.wav                 # Custom sound
sound_warning: /home/user/sounds/warning.wav     # Custom sound
sound_info: default                              # Built-in beep
```

### Custom Sound Files

- **Format**: Only .wav files are supported
- **Recommendations**:
  - Keep files under 5 seconds
  - Use 16-bit PCM encoding
  - Sample rate: 22050 Hz or 44100 Hz
  - Mono or stereo

### Default Beep Frequencies

When using "default" beeps, the agent plays system beeps at different frequencies:

| Severity | Frequency | Duration | Color |
|----------|-----------|----------|-------|
| Critical | 1000 Hz   | 500 ms   | Red   |
| Error    | 800 Hz    | 300 ms   | Orange|
| Warning  | 600 Hz    | 200 ms   | Yellow|
| Info     | 400 Hz    | 150 ms   | Blue  |

### Troubleshooting

**No sound plays**:
- Verify sound alerts are enabled in configuration
- Check system volume is not muted
- Test each severity level using the GUI
- On non-Windows systems, install pygame: `pip install pygame numpy`

**Sound quality is poor**:
- Use higher quality .wav files (44100 Hz, 16-bit)
- Adjust volume in the configuration

**Sounds are too quiet/loud**:
- Adjust the volume slider in the Sound Alerts tab
- Check system volume settings

---

## Use Cases

### 1. Homelab Log Aggregation

Collect logs from all your homelab servers in one place:

```yaml
# On each server
watch_paths:
  - path: /var/log/
    pattern: "*.log"
    recursive: true

  - path: /var/log/nginx/
    pattern: "*.log"
    recursive: false
```

### 2. Application Log Monitoring

Monitor your application's log directory:

```yaml
watch_paths:
  - path: /opt/myapp/logs/
    pattern: "app-*.log"
    recursive: false

  - path: /opt/myapp/logs/errors/
    pattern: "*.log"
    recursive: true
```

### 3. Security Monitoring with FIM

Detect unauthorized changes to critical system files:

```yaml
fim_enabled: true
fim_paths:
  # Linux
  - path: /etc/
    pattern: "*"
    recursive: true

  - path: /usr/local/bin/
    pattern: "*"
    recursive: false

  # Windows
  - path: C:\Windows\System32\
    pattern: "*.dll"
    recursive: false

  - path: C:\Program Files\
    pattern: "*.exe"
    recursive: true
```

### 4. Windows Security Event Collection

Collect security events from any Windows Event Log channel (Windows only). The
agent uses the modern Event Log API, so Sysmon, PowerShell and other
`Microsoft-Windows-*/Operational` channels work, and each event ships with its
named fields (`event_data.TargetUserName`, `event_data.IpAddress`,
`event_data.CommandLine` …):

```yaml
windows_events:
  enabled: true
  api: auto            # modern (EvtQuery) with legacy fallback
  channels:
    - Security
    - System
    - Microsoft-Windows-Sysmon/Operational
    - Microsoft-Windows-PowerShell/Operational
  event_ids:           # include list (omit for all); evaluated inside the query
    - 4624  # Successful logon
    - 4625  # Failed logon
    - 4688  # Process creation
    - 7045  # Service installed
    - 1     # Sysmon process create
    - 4104  # PowerShell script block
  exclude_event_ids: [5156, 5158]   # noisy filtering-platform events
  poll_interval: 10
  index: windows       # optional per-input LogNog index
```

In LogNog: `search source_type=windows_security event_id=4625 | stats count by event_data.TargetUserName, event_data.IpAddress`.

The Security channel needs LocalSystem/Administrator rights — install the
agent as a service (`--service install`) or use the **Windows Events** tab in the
configuration window, which has presets for the common channels and buttons to
install/start/stop the service.

See [docs/WINDOWS-EVENTS.md](docs/WINDOWS-EVENTS.md) for complete documentation.

### 5. Multi-line application logs and IIS

```yaml
watch_paths:
  - path: D:\apps\api\logs
    pattern: "*.log"
    multiline_pattern: '^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}'   # stack traces stay one event
    source_type: app_java
  - path: C:\inetpub\logs\LogFiles
    pattern: "u_ex*.log"
    exclude: ["*.zip"]
    source_type: iis
    index: web-logs
tags:
  environment: production
  role: web
```

### 6. Docker Container Logging

Ship logs from Docker containers to LogNog:

```bash
# Create a volume for container logs
docker run -d \
  --name myapp \
  -v /var/log/myapp:/app/logs \
  myapp:latest

# Configure LogNog In to watch the volume
lognog-in --watch /var/log/myapp/*.log
```

Or run the agent as a sidecar:

```yaml
# docker-compose.yml
services:
  myapp:
    image: myapp:latest
    volumes:
      - app-logs:/app/logs

  lognog-in:
    image: machinekinglabs/lognog-in:latest
    environment:
      LOGNOG_SERVER: https://lognog.local
      LOGNOG_API_KEY: lnog_abc123
    volumes:
      - app-logs:/watch/app-logs:ro

volumes:
  app-logs:
```

---

## Docker Deployment

### Quick Start

```bash
docker run -d \
  --name lognog-in \
  --restart unless-stopped \
  -e LOGNOG_SERVER=https://lognog.local \
  -e LOGNOG_API_KEY=lnog_abc123 \
  -v /var/log:/watch/var-log:ro \
  -v lognog-in-data:/data \
  machinekinglabs/lognog-in:latest
```

### Docker Compose

```yaml
services:
  lognog-in:
    image: machinekinglabs/lognog-in:latest
    container_name: lognog-in
    restart: unless-stopped
    environment:
      LOGNOG_SERVER: https://lognog.local
      LOGNOG_API_KEY: lnog_abc123
      LOGNOG_WATCH_PATHS: /watch/var-log/**/*.log,/watch/app-logs/*.log
      LOGNOG_FIM_ENABLED: "true"
      LOGNOG_FIM_PATHS: /watch/etc/**
    volumes:
      # Mount directories to watch
      - /var/log:/watch/var-log:ro
      - /home/user/app/logs:/watch/app-logs:ro
      - /etc:/watch/etc:ro
      # Persist agent state
      - lognog-in-data:/data
    # Optional: use host network for hostname detection
    network_mode: host

volumes:
  lognog-in-data:
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LOGNOG_SERVER` | LogNog server URL | `http://localhost:4000` |
| `LOGNOG_API_KEY` | API key for authentication | _(required)_ |
| `LOGNOG_WATCH_PATHS` | Comma-separated paths to watch | _none_ |
| `LOGNOG_FIM_ENABLED` | Enable FIM | `false` |
| `LOGNOG_FIM_PATHS` | Comma-separated FIM paths | _none_ |
| `LOGNOG_BATCH_SIZE` | Events per batch | `100` |
| `LOGNOG_BATCH_INTERVAL` | Batch interval (seconds) | `5.0` |
| `LOGNOG_DEBUG` | Enable debug logging | `false` |

---

## API Key Setup

To authenticate with your LogNog server, you need an API key.

### Generate an API Key

1. Open the LogNog web UI (e.g., https://lognog.local)
2. Navigate to **Settings** > **API Keys**
3. Click **Create API Key**
4. Enter a name: `lognog-in-agent`
5. Set permissions: `ingest:write`
6. Copy the generated key: `lnog_abc123def456...`

### Use the API Key

```bash
# Initialize with API key
lognog-in init --server https://lognog.local --api-key lnog_abc123def456

# Or set via environment variable
export LOGNOG_API_KEY=lnog_abc123def456
lognog-in
```

The API key is stored in the config file with restricted permissions (0600 on Unix).

---

## Troubleshooting

### Agent won't start

**Symptom**: Agent exits immediately or fails to start

**Solutions**:
1. Check configuration: `lognog-in config`
2. Test connection: `lognog-in test`
3. Enable debug logging: `lognog-in --debug`
4. Check logs:
   - Linux/macOS: `~/.local/share/lognog-in/logs/agent.log`
   - Windows: `%LOCALAPPDATA%\MachineKingLabs\lognog-in\logs\agent.log`

### No logs are being shipped

**Symptom**: Agent is running but no logs appear in LogNog

**Solutions**:
1. Verify watch paths exist: `lognog-in status`
2. Check file permissions (agent needs read access)
3. Test with a known file: `echo "test" >> /var/log/test.log`
4. Check server connectivity: `lognog-in test`
5. Look for errors in agent logs

### System tray icon is yellow (buffering)

**Symptom**: Agent is buffering events offline

**Solutions**:
1. Check server is running: `curl https://lognog.local/health`
2. Verify API key is valid: `lognog-in test`
3. Check firewall/network connectivity
4. Agent will automatically reconnect and replay buffered events

### High memory usage

**Symptom**: Agent using more than 100 MB RAM

**Solutions**:
1. Reduce `batch_size` in config (default: 100)
2. Increase `batch_interval_seconds` to ship more frequently
3. Check for very large log files (>1 GB)
4. Verify buffer database isn't too large:
   - Linux/macOS: `ls -lh ~/.local/share/lognog-in/buffer.db`
   - Windows: `dir %LOCALAPPDATA%\MachineKingLabs\lognog-in\buffer.db`

### FIM baseline too large

**Symptom**: FIM baseline creation is slow or database is huge

**Solutions**:
1. Reduce FIM path scope (avoid `/` or `C:\`)
2. Use more specific patterns: `*.conf` instead of `*`
3. Disable recursive monitoring: `recursive: false`
4. Exclude large directories in patterns

### Permission denied errors

**Symptom**: Agent can't read log files

**Solutions**:
1. Run agent with appropriate permissions:
   - Linux: Add user to `adm` group for `/var/log` access
   - Windows: Run as Administrator for system logs
2. Check file permissions: `ls -l /var/log/app.log`
3. Use read-only bind mounts in Docker: `-v /var/log:/watch:ro`

### Docker: Can't connect to host

**Symptom**: Container can't reach LogNog server on host

**Solutions**:
1. Use host network: `--network host`
2. Use host.docker.internal (Mac/Windows):
   ```bash
   -e LOGNOG_SERVER=http://host.docker.internal:4000
   ```
3. Use host IP (Linux):
   ```bash
   -e LOGNOG_SERVER=http://192.168.1.100:4000
   ```

---

## Data Directories

The agent uses platform-specific directories for storing data:

### Linux

```
~/.config/lognog-in/config.yaml       # Configuration
~/.local/share/lognog-in/baseline.db  # FIM baselines
~/.local/share/lognog-in/buffer.db    # Event buffer
~/.local/share/lognog-in/logs/        # Agent logs
```

### macOS

```
~/Library/Application Support/lognog-in/config.yaml  # Configuration
~/Library/Application Support/lognog-in/baseline.db  # FIM baselines
~/Library/Application Support/lognog-in/buffer.db    # Event buffer
~/Library/Logs/lognog-in/                            # Agent logs
```

### Windows

```
%APPDATA%\MachineKingLabs\lognog-in\config.yaml    # Configuration
%LOCALAPPDATA%\MachineKingLabs\lognog-in\baseline.db  # FIM baselines
%LOCALAPPDATA%\MachineKingLabs\lognog-in\buffer.db    # Event buffer
%LOCALAPPDATA%\MachineKingLabs\lognog-in\logs\        # Agent logs
```

---

## Resource Usage

LogNog In is designed to be lightweight and efficient:

| Metric | Typical | Peak |
|--------|---------|------|
| Memory | 30-50 MB | 80 MB |
| CPU (idle) | <0.1% | 0.2% |
| CPU (active) | 0.5-1% | 5% |
| Disk I/O | Minimal | Moderate (during batch ship) |
| Network | ~10 KB/s | 100 KB/s (batches) |

**Factors affecting resource usage:**
- Number of watched paths
- Log volume (events/sec)
- Batch size (larger = less frequent HTTP)
- FIM enabled (adds CPU for hashing)

---

## Security

LogNog In follows security best practices:

- **API keys**: Stored in config file with restricted permissions (0600 on Unix)
- **TLS required**: Server connections use HTTPS with certificate verification
- **No cloud dependencies**: All data stays on your network
- **Local logs redacted**: Sensitive data (API keys) redacted in agent logs
- **FIM on config**: Optionally monitor agent config file for tampering
- **Least privilege**: Runs as unprivileged user (no root/admin required)

### Recommended Security Practices

1. **Use unique API keys per agent**: Rotate keys if compromised
2. **Enable TLS**: Always use `https://` for server URL
3. **Monitor FIM events**: Alert on changes to critical files
4. **Restrict config file**: Ensure config file is not world-readable
5. **Regular updates**: Keep agent updated for security patches

---

## Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Language | Python 3.10+ | Cross-platform, easy packaging |
| File Watching | [watchdog](https://github.com/gorakhargosh/watchdog) | Native file system events (inotify/FSEvents/ReadDirectoryChanges) |
| Windows Events | [pywin32](https://github.com/mhammond/pywin32) | Windows Event Log API (Windows only) |
| HTTP Client | [httpx](https://www.python-httpx.org/) | Async, HTTP/2, connection pooling |
| System Tray | [pystray](https://github.com/moses-palmer/pystray) | Cross-platform tray icon |
| Config Format | YAML | Human-readable configuration |
| Hashing | hashlib (stdlib) | SHA-256 for FIM |
| Local Storage | SQLite (stdlib) | Event buffer and FIM baselines |

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Clone repository
git clone https://github.com/machinekinglabs/lognog.git
cd lognog/agent

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install in development mode
pip install -e ".[dev]"

# Run tests
pytest

# Run linter
ruff check src/

# Run type checker
mypy src/
```

---

## License

MIT License - see [LICENSE](../LICENSE) for details.

---

## Support

- **Documentation**: [docs.lognog.io](https://docs.lognog.io)
- **Issues**: [GitHub Issues](https://github.com/machinekinglabs/lognog/issues)
- **Discussions**: [GitHub Discussions](https://github.com/machinekinglabs/lognog/discussions)

---

**Machine King Labs** - Building tools for the self-hosted future.
