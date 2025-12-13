# Windows Event Log Collection

The LogNog In agent supports collecting Windows Event Logs on Windows systems using the `pywin32` library.

## Features

- Collects from any Windows Event Log channel (Security, System, Application, etc.)
- Optional event ID filtering for targeted collection
- Persistent bookmarks to avoid re-reading events after restarts
- Efficient batch reading with configurable poll intervals
- Maps Windows event types to standard severity levels
- Includes high-value security event descriptions
- Graceful fallback if `pywin32` is not installed

## Installation

On Windows, install the agent with pywin32 support:

```bash
pip install -e ".[dev]"
```

The `pywin32` package will be automatically installed on Windows systems.

## Configuration

Add the `windows_events` section to your `config.yaml`:

```yaml
windows_events:
  enabled: true
  channels:
    - Security
    - System
    - Application
  event_ids:
    - 4624  # Successful logon
    - 4625  # Failed logon
    - 4688  # Process creation
    - 7045  # Service installed
  poll_interval: 10
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable/disable Windows Event collection |
| `channels` | list | `["Security", "System", "Application"]` | Event log channels to monitor |
| `event_ids` | list or null | `null` | Event IDs to collect (null = all events) |
| `poll_interval` | integer | `10` | Seconds between polling cycles |

### Common Event Log Channels

- `Security` - Security events (logons, privilege use, etc.)
- `System` - System events (service changes, driver issues)
- `Application` - Application events (crashes, errors)
- `Microsoft-Windows-PowerShell/Operational` - PowerShell activity
- `Microsoft-Windows-Sysmon/Operational` - Sysmon events (if installed)
- `Microsoft-Windows-Windows Defender/Operational` - Windows Defender
- `Microsoft-Windows-TaskScheduler/Operational` - Scheduled tasks

## High-Value Security Events

The collector includes descriptions for high-value security events:

### Logon Events
- **4624** - Successful logon
- **4625** - Failed logon
- **4648** - Explicit credential logon
- **4672** - Special privileges assigned

### Account Management
- **4720** - User account created
- **4722** - User account enabled
- **4723** - Password change attempt
- **4724** - Password reset attempt
- **4725** - User account disabled
- **4726** - User account deleted
- **4738** - User account changed
- **4740** - User account locked out

### Group Management
- **4732** - Member added to security-enabled local group
- **4733** - Member removed from security-enabled local group
- **4756** - Member added to security-enabled universal group
- **4757** - Member removed from security-enabled universal group

### System Events
- **4688** - Process creation
- **4698** - Scheduled task created
- **4699** - Scheduled task deleted
- **4700** - Scheduled task enabled
- **4701** - Scheduled task disabled
- **4702** - Scheduled task updated
- **7045** - Service installed
- **7040** - Service start type changed

## Event Format

Windows events are converted to LogNog's standard format:

```json
{
  "timestamp": "2025-12-12T10:30:45.123456Z",
  "hostname": "DESKTOP-PC",
  "source": "lognog-in-winevents",
  "source_type": "windows_security",
  "file_path": "EventLog://Security",
  "message": "An account was successfully logged on...",
  "metadata": {
    "severity": "info",
    "event_id": 4624,
    "provider": "Microsoft-Windows-Security-Auditing",
    "channel": "Security",
    "record_number": 12345,
    "event_type": 4,
    "computer": "DESKTOP-PC",
    "user_sid": "S-1-5-21-...",
    "event_category": "Successful logon",
    "event_data": [
      "SYSTEM",
      "NT AUTHORITY",
      ...
    ]
  }
}
```

### Severity Mapping

Windows event types are mapped to standard severity levels:

| Windows Event Type | Severity |
|-------------------|----------|
| Error | `error` |
| Warning | `warning` |
| Information | `info` |
| Audit Success | `info` |
| Audit Failure | `warning` |

## Bookmark Management

The collector uses a SQLite database to track the last read event for each channel:

- **Location**: `%LOCALAPPDATA%\MachineKingLabs\lognog-in\windows_events_bookmarks.db`
- **Purpose**: Prevents re-reading events after agent restarts
- **Reset**: Delete the bookmark file to re-collect events from the current position

On first run, the collector starts from the most recent 100 events to avoid reading the entire history.

## Performance Considerations

### Poll Interval

- **Default**: 10 seconds
- **Low-volume systems**: 30-60 seconds
- **High-volume systems**: 5 seconds
- **Real-time monitoring**: 1-2 seconds (may increase CPU usage)

### Event ID Filtering

Filtering by event IDs significantly reduces the volume of collected events:

- **No filter**: Collects ALL events (can be thousands per minute)
- **With filter**: Only collects specified events (typically 10-100 per minute)

**Recommendation**: Always use event ID filtering unless you need complete audit trails.

### Batch Size

The collector reads up to 100 events per channel per poll cycle by default. This is configured in the collector code and provides a good balance between throughput and memory usage.

## Troubleshooting

### pywin32 Not Available

If you see this warning:
```
pywin32 not available - Windows Event collection disabled
```

Install pywin32:
```bash
pip install pywin32
```

After installation, run the post-install script:
```bash
python Scripts/pywin32_postinstall.py -install
```

### Permission Denied

Reading Security events requires **Administrator privileges**. Run the agent as Administrator:

1. Right-click `lognog-in.exe`
2. Select "Run as administrator"

Or configure the agent to run as a Windows service with appropriate permissions.

### No Events Collected

Check the following:

1. **Enabled**: Ensure `windows_events.enabled: true` in config
2. **Channels exist**: Verify channel names with Event Viewer
3. **Bookmarks**: Delete bookmark database to reset position
4. **Event IDs**: If filtering, ensure events matching the IDs are being generated

View collector stats in the agent logs:
```
Windows Event collector started for channels: Security, System, Application
Filtering for event IDs: [4624, 4625, 4688, 7045]
```

### High CPU Usage

If the agent uses excessive CPU:

1. Increase `poll_interval` (e.g., 30 seconds)
2. Add event ID filtering to reduce volume
3. Monitor fewer channels (e.g., only Security)

## Examples

### Minimal Security Monitoring

Collect only critical security events:

```yaml
windows_events:
  enabled: true
  channels:
    - Security
  event_ids:
    - 4625  # Failed logon
    - 4720  # User created
    - 4726  # User deleted
    - 7045  # Service installed
  poll_interval: 30
```

### Comprehensive Audit Trail

Collect all events from multiple channels:

```yaml
windows_events:
  enabled: true
  channels:
    - Security
    - System
    - Application
    - Microsoft-Windows-PowerShell/Operational
  event_ids: null  # Collect all
  poll_interval: 5
```

### Threat Hunting

Focus on process creation and PowerShell activity:

```yaml
windows_events:
  enabled: true
  channels:
    - Security
    - Microsoft-Windows-PowerShell/Operational
    - Microsoft-Windows-Sysmon/Operational
  event_ids:
    - 4688  # Process creation
    - 4104  # PowerShell script block
    - 1     # Sysmon process creation
    - 3     # Sysmon network connection
  poll_interval: 2
```

## Integration with LogNog

Windows events are sent to LogNog with:

- **source**: `lognog-in-winevents`
- **source_type**: `windows_{channel}` (e.g., `windows_security`, `windows_system`)

Search in LogNog:

```splunk
search source_type=windows_security
  | filter metadata.event_id=4624
  | stats count by metadata.user_sid
```

## Advanced Usage

### Programmatic Collection

You can also use the collector programmatically:

```python
from lognog_in.collectors.windows_events import WindowsEventCollector

# One-time collection
collector = WindowsEventCollector(
    channels=["Security"],
    hostname="my-pc",
    event_ids=[4624, 4625],
)

events = collector.collect()
for event in events:
    print(event.message)
```

### Custom Event Processing

Register a callback for real-time processing:

```python
def handle_event(event):
    if event.metadata.get("event_id") == 4625:
        print(f"Failed logon detected: {event.message}")

collector = WindowsEventCollector(
    channels=["Security"],
    hostname="my-pc",
    on_event=handle_event,
)

collector.start()
# Events are now processed in real-time
```

## Security Considerations

1. **Sensitive Data**: Security events may contain usernames, IP addresses, and other sensitive information
2. **Access Control**: Restrict access to the LogNog server where events are stored
3. **Encryption**: Use HTTPS for the `server_url` to encrypt events in transit
4. **Retention**: Configure appropriate retention policies for compliance
5. **Administrator Rights**: The agent requires admin privileges to read Security events

## Limitations

1. **Windows Only**: This feature only works on Windows systems with pywin32
2. **Sequential Reading**: Events are read sequentially; cannot seek to specific time ranges
3. **No Real-time Subscription**: Uses polling instead of event subscriptions
4. **Batch Size**: Limited to 100 events per channel per poll to avoid memory issues
5. **Message Formatting**: Some events may not format properly if message DLLs are missing

## Performance Metrics

Typical collection rates on a standard Windows workstation:

| Scenario | Events/Min | CPU Usage | Memory |
|----------|-----------|-----------|--------|
| Filtered Security (10 IDs) | 10-50 | <1% | 50 MB |
| All Security Events | 1000-5000 | 2-5% | 100 MB |
| All Channels (filtered) | 50-200 | 1-2% | 75 MB |
| All Channels (no filter) | 5000-20000 | 5-10% | 150 MB |
