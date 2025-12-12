# LogNog Lite

**One EXE. No Docker. Just Works.**

LogNog Lite is the lightweight version of LogNog for small homelabs. Double-click to run.

## Download

Get `LogNogLite.exe` from [Releases](https://github.com/machinekinglabs/lognog/releases)

## Requirements

- Windows 10/11
- [Node.js 18+](https://nodejs.org/) (just install it, LogNog Lite does the rest)

## Usage

1. **Double-click `LogNogLite.exe`**
2. **That's it.** Browser opens automatically.

The server runs in the system tray. Right-click the icon to access options or exit.

## What You Get

- Full web dashboard at http://localhost:4000
- Splunk-like query language
- Custom dashboards
- Report generation
- Receives logs from LogNog In agents
- All data stored locally in SQLite

## Data Location

All your logs and settings are stored in a `data` folder next to the EXE:
```
LogNogLite.exe
data/
  lognog.db       <- Settings, dashboards, users
  lognog-logs.db  <- Your log data
```

## Performance

- Recommended: Up to 100K logs/day
- Storage: ~100 bytes per log

For larger deployments, use [LogNog Full (Docker)](../README.md#lognog-full-docker-installation).

---

<p align="center">
  <strong>LogNog Lite</strong> - Your Logs, Your Control<br>
  <em>By Machine King Labs</em>
</p>
