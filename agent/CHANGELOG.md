# LogNog In — Changelog

## 0.2.0 (2026-09-02)

### Windows Event Logs
- **Modern Event Log API** (`EvtQuery`/`EvtRender`): reads every channel, including
  `Microsoft-Windows-Sysmon/Operational`, `…-PowerShell/Operational`,
  `…-TaskScheduler/Operational`, `…-Windows Defender/Operational`. The legacy
  reader could only open the classic Application/System/Security logs — the
  channels the example config advertised silently produced nothing.
- Events carry **named fields** (`event_data.TargetUserName`, `IpAddress`,
  `CommandLine` …) instead of positional string inserts, plus provider, level
  name, task/opcode, keywords, audit success/failure, process/thread ids and
  the Sysmon/Security event category.
- Event ID include **and exclude** lists; filtering runs inside the query.
- `api: auto|modern|legacy`, per-input `index`, `batch_size`, per-channel
  access diagnostics (`lognog-in doctor`).
- New **Windows Events tab** in the configuration window with one-click
  presets (Sysmon, PowerShell, Task Scheduler, Defender) and service controls.

### File tailing
- Partial trailing lines are **held back** until newline-terminated (or stale
  for 3 s), so a line written in two `write()` calls ships as one event.
- Byte-offset reads with per-path `encoding` (BOM/CRLF aware).
- `exclude` globs, `start_position: end|beginning`, `source_type`, `index`.
- `multiline_pattern` merges stack traces / multi-line JSON into one event.
- Periodic re-scan (`scan_interval_seconds`) catches changes the OS watcher
  misses (SMB shares, containers) and flushes pending multi-line events.
- Each file read is buffered in one SQLite transaction.

### Shipping
- **Backlog drains back-to-back**: a full batch no longer waits
  `batch_interval_seconds` before the next one (throughput was capped at
  `batch_size/batch_interval` ≈ 20 events/s).
- gzip request bodies (`compress_payloads`), `verify_tls` / `ca_bundle`,
  static `tags`, default `index`, `User-Agent: LogNog-In/<version>`.
- **Heartbeat** event (`source_type=agent_heartbeat`) every 60 s with
  sent/buffered/dropped/uptime counters so the server can alert on a dead agent.
- Buffer capacity accounting is O(1) per insert; WAL journal mode.

### Windows service / EXE
- `--service install` registers the **frozen EXE itself** as the service
  binary; `--service run` hands the process to the SCM dispatcher and falls
  back to a console run when not launched by the SCM (error 1063).
- Service start no longer crashes on `signal.signal` from the SCM worker thread.
- `--service status`; clear messages for "access denied" / "already exists".
- The windowed EXE **attaches to the parent console** for `test`, `status`,
  `doctor`, `--help`, `--version`, `--service …` — output is visible again.
- API key stored **DPAPI-encrypted** (machine scope) in `config.yaml`.

### CLI
- `doctor` (config, buffer, channel access, service state, connectivity),
  `send-test`, `flush`, `version`.

### Tray
- Brand icon with a live **status dot** (green connected / amber buffering /
  red error / grey paused), stats line, "Open LogNog", "Send Test Event",
  "Flush Buffer Now".

### Fixes
- `retry_backoff_max_seconds`, `buffer_max_rows`, `buffer_max_bytes` were
  read but never written back by `save()`.
- Offset-store pruning walked the whole watched tree on every file event.
- Off-brand blue accents in the GUI.

## 0.1.0
Initial release.
