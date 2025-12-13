# LogNog Data Source Expansion - Complete Implementation Roadmap

**Document Version:** 1.0
**Last Updated:** 2025-12-12
**Purpose:** Comprehensive implementation guide for expanding LogNog's data source capabilities, cybersecurity features, and agent functionality.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Architecture Overview](#current-architecture-overview)
3. [Phase 1: Source Templates System](#phase-1-source-templates-system)
4. [Phase 2: Windows Event Logs in Agent](#phase-2-windows-event-logs-in-agent)
5. [Phase 3: Database Log Templates](#phase-3-database-log-templates)
6. [Phase 4: IP Classification (Built-in)](#phase-4-ip-classification-built-in)
7. [Phase 5: GeoIP Lookup (Optional MaxMind)](#phase-5-geoip-lookup-optional-maxmind)
8. [Phase 6: OTLP Authentication](#phase-6-otlp-authentication)
9. [Agent Alert Silencing](#agent-alert-silencing)
10. [Testing & Validation](#testing--validation)
11. [File Reference](#file-reference)

---

## Executive Summary

This document provides a complete implementation plan for expanding LogNog from a syslog-focused tool to a comprehensive log management platform supporting:

- **Multiple data sources**: Windows Events, database logs (MySQL, PostgreSQL, MongoDB), web server logs
- **Source templates**: Pre-built configurations for common log types with field extraction patterns
- **Cybersecurity features**: IP classification, GeoIP lookup, threat context
- **Agent enhancements**: Alert silencing, Windows Event collection

**Key Principle:** The existing schema already supports arbitrary log types via the `structured_data` JSON field. No schema changes are required for new sources—only field extraction patterns and onboarding UX.

---

## Current Architecture Overview

### What Already Works

| Source | Status | Ingestion Method |
|--------|--------|------------------|
| Syslog (RFC 3164/5424) | ✅ | Vector UDP/TCP 514 |
| OpenTelemetry (OTLP) | ✅ | `POST /api/ingest/otlp/v1/logs` |
| File logs via Agent | ✅ | LogNog In → `POST /api/ingest/agent` |
| FIM events | ✅ | LogNog In → `POST /api/ingest/agent` |
| Web logs (Apache/Nginx) | ✅ | Auto-detected in Vector |
| JSON structured logs | ✅ | Auto-detected in Vector |
| Stack traces | ✅ | Java/Python/JS detected |

### Key Schema Fields

```sql
-- ClickHouse logs table (simplified)
timestamp DateTime64(3),
hostname LowCardinality(String),
app_name LowCardinality(String),
severity UInt8,
message String,
raw String,
structured_data String,        -- JSON blob for type-specific data
index_name LowCardinality(String),  -- Logical grouping
source_ip IPv4,
-- ... additional fields
```

### Extensibility Points

1. **`structured_data`** - JSON field stores arbitrary type-specific data
2. **`index_name`** - Routes logs to logical groups (main, security, web, database)
3. **`app_name`** - Identifies the source application
4. **Field extractions table** - Regex/Grok patterns per source_type

---

## Phase 1: Source Templates System

**Effort:** 3-5 days
**Goal:** Provide pre-built configurations for common log types with one-click onboarding.

### 1.1 Database Schema

Add new table to SQLite (`api/src/db/sqlite.ts`):

```sql
CREATE TABLE IF NOT EXISTS source_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                    -- "MySQL Slow Query Log"
  source_type TEXT NOT NULL UNIQUE,      -- "mysql_slow"
  category TEXT NOT NULL,                -- "database" | "security" | "web" | "system"
  description TEXT,

  -- Onboarding instructions (Markdown)
  setup_instructions TEXT,               -- How to configure the source
  agent_config_example TEXT,             -- Example YAML for agent
  syslog_config_example TEXT,            -- Example rsyslog/syslog-ng config

  -- Field extraction patterns
  field_extractions TEXT,                -- JSON array of extraction rules

  -- Defaults
  default_index TEXT DEFAULT 'main',
  default_severity INTEGER DEFAULT 6,

  -- Sample data for testing
  sample_log TEXT,                       -- Example log line
  sample_query TEXT,                     -- Example DSL query

  -- UI helpers
  icon TEXT,                             -- Icon name (lucide-react)
  dashboard_widgets TEXT,                -- JSON array of widget configs
  alert_templates TEXT,                  -- JSON array of common alerts

  -- Metadata
  enabled INTEGER DEFAULT 1,
  built_in INTEGER DEFAULT 1,            -- 1 = shipped with app, 0 = user-created
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE INDEX idx_source_templates_category ON source_templates(category);
CREATE INDEX idx_source_templates_source_type ON source_templates(source_type);
```

### 1.2 Template Data Structure

```typescript
interface SourceTemplate {
  id: string;
  name: string;
  source_type: string;
  category: 'database' | 'security' | 'web' | 'system' | 'application';
  description: string;

  setup_instructions: string;  // Markdown
  agent_config_example?: string;
  syslog_config_example?: string;

  field_extractions: FieldExtraction[];

  default_index: string;
  default_severity: number;

  sample_log: string;
  sample_query: string;

  icon: string;
  dashboard_widgets?: DashboardWidget[];
  alert_templates?: AlertTemplate[];

  enabled: boolean;
  built_in: boolean;
}

interface FieldExtraction {
  field_name: string;
  pattern: string;
  pattern_type: 'regex' | 'grok' | 'json_path';
  description?: string;
  required?: boolean;
}
```

### 1.3 Built-in Templates to Ship

| Template | source_type | Category | Priority |
|----------|-------------|----------|----------|
| MySQL Error Log | `mysql_error` | database | High |
| MySQL Slow Query Log | `mysql_slow` | database | High |
| PostgreSQL | `postgresql` | database | High |
| MongoDB | `mongodb` | database | Medium |
| Windows Security Events | `windows_security` | security | High |
| Windows System Events | `windows_system` | security | Medium |
| Windows Application Events | `windows_application` | system | Low |
| Apache Access Log | `apache_access` | web | Medium |
| Apache Error Log | `apache_error` | web | Medium |
| Nginx Access Log | `nginx_access` | web | Medium |
| Nginx Error Log | `nginx_error` | web | Medium |
| IIS Access Log (W3C) | `iis_access` | web | Medium |
| Linux Auth Log | `linux_auth` | security | Medium |
| Linux Syslog | `linux_syslog` | system | Low |

### 1.4 API Endpoints

Add to `api/src/routes/`:

```typescript
// GET /api/templates - List all templates
// GET /api/templates/:id - Get single template
// POST /api/templates - Create custom template (admin only)
// PUT /api/templates/:id - Update template (admin only)
// DELETE /api/templates/:id - Delete custom template (admin only)
// POST /api/templates/:id/test - Test template against sample log
// GET /api/templates/categories - List categories with counts
```

### 1.5 UI Components

**New Page:** `ui/src/pages/DataSources.tsx`

```
┌─────────────────────────────────────────────────────────────┐
│  Data Sources                                    [+ Add]    │
├─────────────────────────────────────────────────────────────┤
│  Active Sources                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ✅ Syslog (UDP/TCP 514)         2.3K events/min     │   │
│  │ ✅ LogNog In Agents (3)         450 events/min      │   │
│  │ ✅ OpenTelemetry                1.1K events/min     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Available Templates                     [Filter by category]│
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │  MySQL   │ │ Postgres │ │ MongoDB  │ │ Windows  │      │
│  │ Database │ │ Database │ │ Database │ │ Security │      │
│  │ [Setup]  │ │ [Setup]  │ │ [Setup]  │ │ [Setup]  │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
└─────────────────────────────────────────────────────────────┘
```

**Setup Modal Flow:**
1. Select template
2. Show setup instructions (Markdown rendered)
3. Show config examples (copyable)
4. Verify connection (test query)
5. Confirm and save

### 1.6 Template Validation

Each template should include validation logic:

```typescript
interface TemplateValidation {
  // Test if a log line matches this template
  testMatch(logLine: string): boolean;

  // Extract fields from a log line
  extractFields(logLine: string): Record<string, any>;

  // Validate extracted fields
  validateFields(fields: Record<string, any>): ValidationResult;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  extracted_fields: Record<string, any>;
}
```

### 1.7 Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `api/src/db/sqlite.ts` | Modify | Add source_templates table |
| `api/src/routes/templates.ts` | Create | Template CRUD endpoints |
| `api/src/services/templates.ts` | Create | Template logic & validation |
| `api/src/data/builtin-templates.ts` | Create | Seed data for built-in templates |
| `ui/src/pages/DataSources.tsx` | Create | Main data sources page |
| `ui/src/components/TemplateSetup.tsx` | Create | Setup wizard modal |
| `ui/src/api/templates.ts` | Create | API client for templates |

---

## Phase 2: Windows Event Logs in Agent

**Effort:** ~1 week
**Goal:** Native Windows Event Log collection in LogNog In agent.

### 2.1 Python Dependencies

Add to `agent/pyproject.toml`:

```toml
dependencies = [
    # ... existing deps
    "pywin32>=306; sys_platform == 'win32'",
    "winevt>=1.0.0; sys_platform == 'win32'",
]
```

### 2.2 Windows Event Collector Module

Create `agent/src/lognog_in/windows_events.py`:

```python
"""
Windows Event Log collector for LogNog In agent.

Subscribes to Windows Event Log channels and ships events to LogNog server.
"""

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Callable, List
import xml.etree.ElementTree as ET

# Windows-only imports
try:
    import win32evtlog
    import win32evtlogutil
    import pywintypes
    WINDOWS_AVAILABLE = True
except ImportError:
    WINDOWS_AVAILABLE = False

logger = logging.getLogger(__name__)

@dataclass
class WindowsEventConfig:
    """Configuration for a Windows Event Log channel."""
    channel: str                    # "Security", "System", "Application"
    enabled: bool = True
    event_ids: Optional[List[int]] = None      # Filter to specific IDs (None = all)
    exclude_event_ids: Optional[List[int]] = None  # Exclude specific IDs
    min_level: int = 0              # 0=all, 1=critical, 2=error, 3=warning, 4=info

@dataclass
class WindowsEvent:
    """Represents a Windows Event Log entry."""
    timestamp: str
    hostname: str
    channel: str
    event_id: int
    level: int
    level_name: str
    provider: str
    computer: str
    user_sid: Optional[str]
    message: str
    event_data: dict
    xml_raw: str

class WindowsEventCollector:
    """Collects Windows Event Logs and forwards to callback."""

    # Map Windows levels to Syslog severity
    LEVEL_MAP = {
        0: 6,  # LogAlways -> Informational
        1: 2,  # Critical -> Critical
        2: 3,  # Error -> Error
        3: 4,  # Warning -> Warning
        4: 6,  # Informational -> Informational
        5: 7,  # Verbose -> Debug
    }

    LEVEL_NAMES = {
        0: 'LogAlways',
        1: 'Critical',
        2: 'Error',
        3: 'Warning',
        4: 'Information',
        5: 'Verbose',
    }

    # High-value security event IDs (recommended defaults)
    SECURITY_HIGH_VALUE = [
        4624, 4625, 4634,  # Logon/logoff
        4648,              # Explicit credentials
        4672,              # Special privileges
        4688,              # Process creation
        4698, 4699, 4700, 4701, 4702,  # Scheduled tasks
        4720, 4726,        # Account created/deleted
        4740,              # Account locked
        4776,              # Credential validation
        4768, 4769,        # Kerberos
        1102,              # Audit log cleared
        4697,              # Service installed
        7045,              # Service installed (System)
    ]

    # Noisy event IDs to exclude by default
    DEFAULT_EXCLUDE = [
        5156, 5157,        # Windows Filtering Platform (very noisy)
        4658,              # Handle closed (noisy)
        4656,              # Handle requested (noisy)
    ]

    def __init__(
        self,
        hostname: str,
        channels: List[WindowsEventConfig],
        on_event: Callable[[WindowsEvent], None],
    ):
        if not WINDOWS_AVAILABLE:
            raise RuntimeError("Windows Event Log collection requires Windows OS")

        self.hostname = hostname
        self.channels = channels
        self.on_event = on_event
        self._running = False
        self._handles = {}

    def start(self):
        """Start collecting events from all configured channels."""
        self._running = True
        for config in self.channels:
            if config.enabled:
                self._subscribe_channel(config)

    def stop(self):
        """Stop collecting events."""
        self._running = False
        for handle in self._handles.values():
            win32evtlog.EvtClose(handle)
        self._handles.clear()

    def _subscribe_channel(self, config: WindowsEventConfig):
        """Subscribe to a Windows Event Log channel."""
        try:
            # Build XPath query for filtering
            query = self._build_query(config)

            # Subscribe to channel
            handle = win32evtlog.EvtSubscribe(
                config.channel,
                win32evtlog.EvtSubscribeToFutureEvents,
                Query=query,
                Callback=lambda action, context, event: self._handle_event(config, event),
            )

            self._handles[config.channel] = handle
            logger.info(f"Subscribed to Windows Event Log channel: {config.channel}")

        except pywintypes.error as e:
            logger.error(f"Failed to subscribe to {config.channel}: {e}")

    def _build_query(self, config: WindowsEventConfig) -> str:
        """Build XPath query for event filtering."""
        conditions = []

        # Level filter
        if config.min_level > 0:
            conditions.append(f"Level <= {config.min_level}")

        # Event ID include filter
        if config.event_ids:
            id_list = " or ".join(f"EventID={eid}" for eid in config.event_ids)
            conditions.append(f"({id_list})")

        # Event ID exclude filter
        if config.exclude_event_ids:
            for eid in config.exclude_event_ids:
                conditions.append(f"EventID != {eid}")

        if conditions:
            return "*[System[" + " and ".join(conditions) + "]]"
        return "*"

    def _handle_event(self, config: WindowsEventConfig, event_handle):
        """Process a single Windows event."""
        try:
            # Render event as XML
            xml_str = win32evtlog.EvtRender(event_handle, win32evtlog.EvtRenderEventXml)

            # Parse XML
            root = ET.fromstring(xml_str)
            ns = {'e': 'http://schemas.microsoft.com/win/2004/08/events/event'}

            # Extract system data
            system = root.find('e:System', ns)
            event_id = int(system.find('e:EventID', ns).text)
            level = int(system.find('e:Level', ns).text)
            provider = system.find('e:Provider', ns).get('Name')
            computer = system.find('e:Computer', ns).text
            time_created = system.find('e:TimeCreated', ns).get('SystemTime')

            # Extract user SID if present
            security = system.find('e:Security', ns)
            user_sid = security.get('UserID') if security is not None else None

            # Extract EventData
            event_data = {}
            data_elem = root.find('e:EventData', ns)
            if data_elem is not None:
                for data in data_elem.findall('e:Data', ns):
                    name = data.get('Name', f'Data{len(event_data)}')
                    event_data[name] = data.text

            # Get rendered message
            try:
                message = win32evtlogutil.SafeFormatMessage(event_handle, config.channel)
            except:
                message = f"Event ID {event_id} from {provider}"

            # Create event object
            event = WindowsEvent(
                timestamp=time_created,
                hostname=self.hostname,
                channel=config.channel,
                event_id=event_id,
                level=level,
                level_name=self.LEVEL_NAMES.get(level, 'Unknown'),
                provider=provider,
                computer=computer,
                user_sid=user_sid,
                message=message,
                event_data=event_data,
                xml_raw=xml_str,
            )

            # Forward to callback
            self.on_event(event)

        except Exception as e:
            logger.error(f"Error processing Windows event: {e}")
```

### 2.3 Agent Integration

Modify `agent/src/lognog_in/agent.py`:

```python
# Add to imports
from .windows_events import WindowsEventCollector, WindowsEventConfig, WindowsEvent, WINDOWS_AVAILABLE

# Add to Agent.__init__
if WINDOWS_AVAILABLE and self.config.windows_events_enabled:
    self._windows_collector = WindowsEventCollector(
        hostname=self.hostname,
        channels=self._build_windows_channels(),
        on_event=self._on_windows_event,
    )

# Add method
def _on_windows_event(self, event: WindowsEvent):
    """Handle incoming Windows event."""
    log_event = {
        "type": "windows_event",
        "timestamp": event.timestamp,
        "hostname": event.hostname,
        "source": "windows-event-log",
        "source_type": f"windows_{event.channel.lower()}",
        "message": event.message,
        "metadata": {
            "channel": event.channel,
            "event_id": event.event_id,
            "level": event.level,
            "level_name": event.level_name,
            "provider": event.provider,
            "computer": event.computer,
            "user_sid": event.user_sid,
            "event_data": event.event_data,
        }
    }
    self._buffer.add(log_event)
```

### 2.4 Configuration Schema

Add to agent config YAML:

```yaml
# Windows Event Log collection (Windows only)
windows_events_enabled: true
windows_event_channels:
  - channel: Security
    enabled: true
    # Collect only high-value security events (recommended)
    event_ids: [4624, 4625, 4634, 4648, 4672, 4688, 4698, 4720, 4726, 4740, 1102]
    # Or exclude noisy events instead
    # exclude_event_ids: [5156, 5157, 4658, 4656]

  - channel: System
    enabled: true
    min_level: 3  # Warning and above
    event_ids: [7045, 7040, 1074, 6005, 6006]  # Service changes, shutdown/startup

  - channel: Application
    enabled: false  # Disabled by default (noisy)
```

### 2.5 Windows Event ID Reference

Include in documentation and UI:

| Event ID | Channel | Category | Description | MITRE ATT&CK |
|----------|---------|----------|-------------|--------------|
| **4624** | Security | Authentication | Successful logon | T1078 |
| **4625** | Security | Authentication | Failed logon | T1110 |
| **4634** | Security | Authentication | Logoff | - |
| **4648** | Security | Credential | Explicit credential logon | T1078 |
| **4672** | Security | Privilege | Special privileges assigned | T1078 |
| **4688** | Security | Execution | Process created | T1059 |
| **4698** | Security | Persistence | Scheduled task created | T1053 |
| **4699-4702** | Security | Persistence | Scheduled task modified | T1053 |
| **4720** | Security | Account | User account created | T1136 |
| **4726** | Security | Account | User account deleted | T1531 |
| **4740** | Security | Account | Account locked out | T1110 |
| **4768** | Security | Kerberos | TGT requested | T1558 |
| **4769** | Security | Kerberos | Service ticket requested | T1558 |
| **4776** | Security | Credential | Credential validation | T1110 |
| **1102** | Security | Defense Evasion | Audit log cleared | T1070 |
| **4697** | Security | Persistence | Service installed | T1543 |
| **7045** | System | Persistence | Service installed | T1543 |

### 2.6 Server-Side Processing

Add Windows event handling to `api/src/routes/ingest.ts`:

```typescript
// In the agent event processing loop
if (event.type === 'windows_event') {
  const severity = mapWindowsLevelToSyslog(event.metadata?.level);
  logs.push({
    timestamp: event.timestamp,
    received_at: now,
    hostname: event.hostname,
    app_name: event.metadata?.provider || 'windows',
    message: event.message,
    severity,
    index_name: event.metadata?.channel === 'Security' ? 'security' : 'windows',
    structured_data: JSON.stringify({
      source_type: event.source_type,
      channel: event.metadata?.channel,
      event_id: event.metadata?.event_id,
      level_name: event.metadata?.level_name,
      provider: event.metadata?.provider,
      computer: event.metadata?.computer,
      user_sid: event.metadata?.user_sid,
      event_data: event.metadata?.event_data,
    }),
    raw: JSON.stringify(event),
  });
}

function mapWindowsLevelToSyslog(level: number): number {
  const map: Record<number, number> = {
    0: 6,  // LogAlways -> Informational
    1: 2,  // Critical -> Critical
    2: 3,  // Error -> Error
    3: 4,  // Warning -> Warning
    4: 6,  // Information -> Informational
    5: 7,  // Verbose -> Debug
  };
  return map[level] ?? 6;
}
```

### 2.7 Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `agent/src/lognog_in/windows_events.py` | Create | Windows Event collector |
| `agent/src/lognog_in/agent.py` | Modify | Integrate Windows collector |
| `agent/src/lognog_in/config.py` | Modify | Add Windows config schema |
| `agent/src/lognog_in/gui.py` | Modify | Add Windows Events tab |
| `agent/pyproject.toml` | Modify | Add pywin32 dependency |
| `api/src/routes/ingest.ts` | Modify | Handle windows_event type |
| `api/src/data/builtin-templates.ts` | Modify | Add Windows templates |

---

## Phase 3: Database Log Templates

**Effort:** 2-3 days
**Goal:** Pre-built templates for MySQL, PostgreSQL, and MongoDB logs.

### 3.1 MySQL Error Log Template

```typescript
const mysqlErrorTemplate: SourceTemplate = {
  id: 'mysql-error',
  name: 'MySQL Error Log',
  source_type: 'mysql_error',
  category: 'database',
  description: 'MySQL server error log including startup, shutdown, and error messages.',

  setup_instructions: `
## MySQL Error Log Setup

### Log Location
Default locations:
- **Linux**: \`/var/log/mysql/error.log\` or \`/var/lib/mysql/<hostname>.err\`
- **Windows**: \`C:\\ProgramData\\MySQL\\MySQL Server 8.0\\Data\\<hostname>.err\`

### Enable Error Logging
In \`my.cnf\` or \`my.ini\`:
\`\`\`ini
[mysqld]
log_error = /var/log/mysql/error.log
log_error_verbosity = 3  # 1=errors, 2=errors+warnings, 3=all
\`\`\`

### LogNog In Agent Setup
Add to your agent config:
\`\`\`yaml
watch_paths:
  - path: /var/log/mysql/
    pattern: "*.log"
    source_type: mysql_error
\`\`\`
  `,

  field_extractions: [
    {
      field_name: 'timestamp',
      pattern: '^(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d+Z?)',
      pattern_type: 'regex',
      required: true,
    },
    {
      field_name: 'thread_id',
      pattern: '\\[(\\d+)\\]',
      pattern_type: 'regex',
    },
    {
      field_name: 'level',
      pattern: '\\[([A-Z]+)\\]',
      pattern_type: 'regex',
    },
    {
      field_name: 'error_code',
      pattern: '\\[MY-(\\d+)\\]',
      pattern_type: 'regex',
    },
    {
      field_name: 'subsystem',
      pattern: '\\[([A-Za-z]+)\\](?:\\s|$)',
      pattern_type: 'regex',
    },
  ],

  default_index: 'database',
  default_severity: 6,

  sample_log: '2025-01-15T10:23:45.123456Z 0 [Warning] [MY-010055] [Server] IP address \'192.168.1.100\' could not be resolved.',
  sample_query: 'search index=database source_type=mysql_error level=Error | stats count by error_code',

  icon: 'database',

  alert_templates: [
    {
      name: 'MySQL Critical Error',
      query: 'search index=database source_type=mysql_error level=Error',
      condition: { type: 'number_of_results', threshold: 1 },
      severity: 'high',
    },
  ],
};
```

### 3.2 MySQL Slow Query Log Template

```typescript
const mysqlSlowTemplate: SourceTemplate = {
  id: 'mysql-slow',
  name: 'MySQL Slow Query Log',
  source_type: 'mysql_slow',
  category: 'database',
  description: 'MySQL slow query log for performance analysis.',

  setup_instructions: `
## MySQL Slow Query Log Setup

### Enable Slow Query Logging
In \`my.cnf\` or \`my.ini\`:
\`\`\`ini
[mysqld]
slow_query_log = 1
slow_query_log_file = /var/log/mysql/slow.log
long_query_time = 2        # Queries taking > 2 seconds
log_queries_not_using_indexes = 1
\`\`\`

### Restart MySQL
\`\`\`bash
sudo systemctl restart mysql
\`\`\`

### Verify
\`\`\`sql
SHOW VARIABLES LIKE 'slow_query%';
\`\`\`
  `,

  field_extractions: [
    {
      field_name: 'query_time',
      pattern: 'Query_time:\\s+([\\d.]+)',
      pattern_type: 'regex',
      description: 'Total query execution time in seconds',
    },
    {
      field_name: 'lock_time',
      pattern: 'Lock_time:\\s+([\\d.]+)',
      pattern_type: 'regex',
    },
    {
      field_name: 'rows_sent',
      pattern: 'Rows_sent:\\s+(\\d+)',
      pattern_type: 'regex',
    },
    {
      field_name: 'rows_examined',
      pattern: 'Rows_examined:\\s+(\\d+)',
      pattern_type: 'regex',
    },
    {
      field_name: 'database',
      pattern: 'use\\s+(\\w+);',
      pattern_type: 'regex',
    },
    {
      field_name: 'user',
      pattern: 'User@Host:\\s+(\\S+)',
      pattern_type: 'regex',
    },
  ],

  default_index: 'database',
  sample_log: '# Time: 2025-01-15T10:23:45.123456Z\n# User@Host: root[root] @ localhost []\n# Query_time: 5.123456  Lock_time: 0.000123  Rows_sent: 1000  Rows_examined: 1000000\nSELECT * FROM large_table WHERE status = "pending";',
  sample_query: 'search index=database source_type=mysql_slow | stats avg(query_time) p95(query_time) by database',
  icon: 'clock',
};
```

### 3.3 PostgreSQL Template

```typescript
const postgresqlTemplate: SourceTemplate = {
  id: 'postgresql',
  name: 'PostgreSQL',
  source_type: 'postgresql',
  category: 'database',
  description: 'PostgreSQL server logs including queries, errors, and connections.',

  setup_instructions: `
## PostgreSQL Log Setup

### Option 1: Syslog (Recommended)
In \`postgresql.conf\`:
\`\`\`
log_destination = 'syslog'
syslog_facility = 'LOCAL0'
syslog_ident = 'postgres'
\`\`\`

Configure rsyslog to forward LOCAL0 to LogNog.

### Option 2: File-based
\`\`\`
logging_collector = on
log_directory = '/var/log/postgresql'
log_filename = 'postgresql-%Y-%m-%d.log'
log_statement = 'all'           # or 'ddl', 'mod'
log_min_duration_statement = 1000  # Log queries > 1s
\`\`\`

### LogNog In Agent Setup
\`\`\`yaml
watch_paths:
  - path: /var/log/postgresql/
    pattern: "postgresql-*.log"
    source_type: postgresql
\`\`\`
  `,

  field_extractions: [
    {
      field_name: 'timestamp',
      pattern: '^(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2})',
      pattern_type: 'regex',
    },
    {
      field_name: 'pid',
      pattern: '\\[(\\d+)\\]',
      pattern_type: 'regex',
    },
    {
      field_name: 'user',
      pattern: 'user=(\\w+)',
      pattern_type: 'regex',
    },
    {
      field_name: 'database',
      pattern: 'db=(\\w+)',
      pattern_type: 'regex',
    },
    {
      field_name: 'level',
      pattern: '(LOG|ERROR|WARNING|FATAL|PANIC|DEBUG)',
      pattern_type: 'regex',
    },
    {
      field_name: 'duration',
      pattern: 'duration:\\s+([\\d.]+)\\s+ms',
      pattern_type: 'regex',
    },
    {
      field_name: 'statement',
      pattern: 'statement:\\s+(.+)',
      pattern_type: 'regex',
    },
  ],

  default_index: 'database',
  sample_log: '2025-01-15 10:23:45.123 UTC [12345] user=appuser,db=mydb LOG:  duration: 1523.456 ms  statement: SELECT * FROM users WHERE status = $1',
  sample_query: 'search index=database source_type=postgresql level=ERROR | stats count by database',
  icon: 'database',
};
```

### 3.4 MongoDB Template

```typescript
const mongodbTemplate: SourceTemplate = {
  id: 'mongodb',
  name: 'MongoDB',
  source_type: 'mongodb',
  category: 'database',
  description: 'MongoDB server logs (JSON format, 4.4+).',

  setup_instructions: `
## MongoDB Log Setup

MongoDB 4.4+ outputs structured JSON logs by default.

### Log Location
- **Linux**: \`/var/log/mongodb/mongod.log\`
- **Docker**: Use \`docker logs\` or mount log volume

### LogNog In Agent Setup
\`\`\`yaml
watch_paths:
  - path: /var/log/mongodb/
    pattern: "mongod.log"
    source_type: mongodb
\`\`\`

### Increase Log Verbosity (optional)
\`\`\`javascript
db.setLogLevel(1, "command")
db.setLogLevel(1, "query")
\`\`\`
  `,

  field_extractions: [
    {
      field_name: 'timestamp',
      pattern: '$.t.$date',
      pattern_type: 'json_path',
    },
    {
      field_name: 'severity',
      pattern: '$.s',
      pattern_type: 'json_path',
      description: 'F=Fatal, E=Error, W=Warning, I=Info, D=Debug',
    },
    {
      field_name: 'component',
      pattern: '$.c',
      pattern_type: 'json_path',
    },
    {
      field_name: 'context',
      pattern: '$.ctx',
      pattern_type: 'json_path',
    },
    {
      field_name: 'message',
      pattern: '$.msg',
      pattern_type: 'json_path',
    },
    {
      field_name: 'duration_ms',
      pattern: '$.attr.durationMillis',
      pattern_type: 'json_path',
    },
  ],

  default_index: 'database',
  sample_log: '{"t":{"$date":"2025-01-15T10:23:45.123+00:00"},"s":"I","c":"COMMAND","ctx":"conn123","msg":"Slow query","attr":{"durationMillis":1523}}',
  sample_query: 'search index=database source_type=mongodb severity=E | stats count by component',
  icon: 'database',
};
```

### 3.5 Template Validation Logic

Add validation service `api/src/services/template-validator.ts`:

```typescript
export class TemplateValidator {
  /**
   * Test if a log line matches the template's patterns.
   */
  testMatch(template: SourceTemplate, logLine: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const extracted: Record<string, any> = {};

    for (const extraction of template.field_extractions) {
      const value = this.extractField(logLine, extraction);

      if (value !== null) {
        extracted[extraction.field_name] = value;
      } else if (extraction.required) {
        errors.push(`Required field '${extraction.field_name}' not found`);
      }
    }

    // Check if any fields were extracted
    if (Object.keys(extracted).length === 0) {
      errors.push('No fields could be extracted - log format may not match template');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      extracted_fields: extracted,
    };
  }

  private extractField(logLine: string, extraction: FieldExtraction): any {
    switch (extraction.pattern_type) {
      case 'regex':
        const match = logLine.match(new RegExp(extraction.pattern));
        return match ? match[1] : null;

      case 'grok':
        return this.extractGrok(logLine, extraction.pattern);

      case 'json_path':
        try {
          const obj = JSON.parse(logLine);
          return this.extractJsonPath(obj, extraction.pattern);
        } catch {
          return null;
        }

      default:
        return null;
    }
  }

  private extractJsonPath(obj: any, path: string): any {
    // Simple JSON path implementation: $.field.subfield
    const parts = path.replace(/^\$\.?/, '').split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return null;
      current = current[part];
    }

    return current;
  }
}
```

---

## Phase 4: IP Classification (Built-in)

**Effort:** 1-2 days
**Goal:** Built-in IP classification for internal/external/private detection.

### 4.1 IP Classification Module

Create `api/src/utils/ip-classifier.ts`:

```typescript
/**
 * IP Classification utility for LogNog.
 * Classifies IP addresses without external API calls.
 */

export type IPType = 'private' | 'loopback' | 'link_local' | 'multicast' | 'reserved' | 'public';

export interface IPClassification {
  ip: string;
  type: IPType;
  is_internal: boolean;
  risk_level: 'none' | 'low' | 'unknown';
  network_name?: string;
  description?: string;
}

// RFC 1918 private ranges
const PRIVATE_RANGES = [
  { start: '10.0.0.0', end: '10.255.255.255', name: 'Class A Private' },
  { start: '172.16.0.0', end: '172.31.255.255', name: 'Class B Private' },
  { start: '192.168.0.0', end: '192.168.255.255', name: 'Class C Private' },
];

// Special ranges
const SPECIAL_RANGES = [
  { start: '127.0.0.0', end: '127.255.255.255', type: 'loopback' as IPType, name: 'Loopback' },
  { start: '169.254.0.0', end: '169.254.255.255', type: 'link_local' as IPType, name: 'Link-Local (APIPA)' },
  { start: '224.0.0.0', end: '239.255.255.255', type: 'multicast' as IPType, name: 'Multicast' },
  { start: '240.0.0.0', end: '255.255.255.255', type: 'reserved' as IPType, name: 'Reserved' },
  { start: '0.0.0.0', end: '0.255.255.255', type: 'reserved' as IPType, name: 'This Network' },
  { start: '100.64.0.0', end: '100.127.255.255', type: 'private' as IPType, name: 'Carrier-Grade NAT' },
  { start: '192.0.0.0', end: '192.0.0.255', type: 'reserved' as IPType, name: 'IETF Protocol Assignments' },
  { start: '192.0.2.0', end: '192.0.2.255', type: 'reserved' as IPType, name: 'TEST-NET-1 (Documentation)' },
  { start: '198.51.100.0', end: '198.51.100.255', type: 'reserved' as IPType, name: 'TEST-NET-2 (Documentation)' },
  { start: '203.0.113.0', end: '203.0.113.255', type: 'reserved' as IPType, name: 'TEST-NET-3 (Documentation)' },
];

/**
 * Convert IP string to numeric value for comparison.
 */
function ipToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/**
 * Check if IP is in a given range.
 */
function isInRange(ip: string, start: string, end: string): boolean {
  const ipNum = ipToNumber(ip);
  return ipNum >= ipToNumber(start) && ipNum <= ipToNumber(end);
}

/**
 * Validate IPv4 address format.
 */
export function isValidIPv4(ip: string): boolean {
  const pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!pattern.test(ip)) return false;

  const parts = ip.split('.').map(Number);
  return parts.every(p => p >= 0 && p <= 255);
}

/**
 * Classify an IP address.
 */
export function classifyIP(ip: string): IPClassification {
  // Validate
  if (!isValidIPv4(ip)) {
    return {
      ip,
      type: 'reserved',
      is_internal: false,
      risk_level: 'none',
      description: 'Invalid IPv4 address',
    };
  }

  // Check special ranges first
  for (const range of SPECIAL_RANGES) {
    if (isInRange(ip, range.start, range.end)) {
      return {
        ip,
        type: range.type,
        is_internal: true,
        risk_level: 'none',
        network_name: range.name,
        description: `${range.name} address`,
      };
    }
  }

  // Check private ranges
  for (const range of PRIVATE_RANGES) {
    if (isInRange(ip, range.start, range.end)) {
      return {
        ip,
        type: 'private',
        is_internal: true,
        risk_level: 'low',
        network_name: range.name,
        description: `${range.name} (RFC 1918)`,
      };
    }
  }

  // Default: public IP
  return {
    ip,
    type: 'public',
    is_internal: false,
    risk_level: 'unknown',
    description: 'Public IP address',
  };
}

/**
 * Batch classify multiple IPs.
 */
export function classifyIPs(ips: string[]): Map<string, IPClassification> {
  const results = new Map<string, IPClassification>();

  for (const ip of ips) {
    if (!results.has(ip)) {
      results.set(ip, classifyIP(ip));
    }
  }

  return results;
}

/**
 * Quick check: is this IP internal/private?
 */
export function isInternalIP(ip: string): boolean {
  const classification = classifyIP(ip);
  return classification.is_internal;
}

/**
 * Quick check: is this IP public?
 */
export function isPublicIP(ip: string): boolean {
  const classification = classifyIP(ip);
  return classification.type === 'public';
}
```

### 4.2 User-Editable Classifications

Add to SQLite schema:

```sql
CREATE TABLE IF NOT EXISTS ip_classifications (
  id TEXT PRIMARY KEY,
  cidr TEXT NOT NULL,              -- "192.168.1.0/24" or "10.0.0.5"
  name TEXT NOT NULL,              -- "Office Network"
  type TEXT NOT NULL,              -- "internal" | "trusted" | "dmz" | "external"
  description TEXT,
  tags TEXT,                       -- JSON array of tags
  priority INTEGER DEFAULT 0,     -- Higher priority = checked first
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  created_by TEXT
);

CREATE INDEX idx_ip_classifications_priority ON ip_classifications(priority DESC);
```

### 4.3 API Endpoints

```typescript
// GET /api/ip/classify/:ip - Classify single IP
// POST /api/ip/classify - Batch classify IPs
// GET /api/ip/classifications - List user-defined networks
// POST /api/ip/classifications - Add custom network
// PUT /api/ip/classifications/:id - Update network
// DELETE /api/ip/classifications/:id - Delete network
```

### 4.4 DSL Integration

Add IP functions to DSL compiler:

```
// Example DSL usage
search source_ip=*
  | eval ip_type = classify_ip(source_ip)
  | where ip_type = "public"
  | stats count by source_ip
```

### 4.5 Ingest-Time Enrichment

Optionally enrich at ingest time in `api/src/routes/ingest.ts`:

```typescript
// Add to log processing
if (log.source_ip) {
  const classification = classifyIP(log.source_ip);
  log.source_ip_type = classification.type;
  log.source_ip_internal = classification.is_internal;
}
```

### 4.6 Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `api/src/utils/ip-classifier.ts` | Create | IP classification logic |
| `api/src/routes/ip.ts` | Create | IP API endpoints |
| `api/src/db/sqlite.ts` | Modify | Add ip_classifications table |
| `api/src/dsl/compiler.ts` | Modify | Add classify_ip() function |
| `ui/src/pages/Settings/IPNetworks.tsx` | Create | Network management UI |

---

## Phase 5: GeoIP Lookup (Optional MaxMind)

**Effort:** 3-5 days
**Goal:** Country, city, and ASN lookup using MaxMind GeoLite2.

### 5.1 MaxMind Registration Process

Users must register for a free MaxMind account:

1. **Go to**: https://www.maxmind.com/en/geolite2/signup
2. **Create account** with email and password
3. **Generate license key**: Account → Manage License Keys → Generate New License Key
4. **Download databases**:
   - GeoLite2-City.mmdb (~70MB)
   - GeoLite2-ASN.mmdb (~8MB)
5. **Set up auto-update** (databases update weekly on Tuesdays)

### 5.2 Dependencies

Add to `api/package.json`:

```json
{
  "dependencies": {
    "maxmind": "^4.3.0"
  }
}
```

### 5.3 GeoIP Service

Create `api/src/services/geoip.ts`:

```typescript
import maxmind, { CityResponse, AsnResponse, Reader } from 'maxmind';
import path from 'path';
import fs from 'fs';

export interface GeoIPResult {
  ip: string;
  country_code?: string;
  country_name?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  accuracy_radius?: number;
  timezone?: string;
  asn?: number;
  as_org?: string;
  is_anonymous_proxy?: boolean;
  is_satellite_provider?: boolean;
}

export class GeoIPService {
  private cityReader: Reader<CityResponse> | null = null;
  private asnReader: Reader<AsnResponse> | null = null;
  private initialized = false;
  private dataPath: string;

  constructor(dataPath: string = '/data/geoip') {
    this.dataPath = dataPath;
  }

  /**
   * Initialize GeoIP databases.
   * Must be called before lookup methods.
   */
  async initialize(): Promise<boolean> {
    const cityPath = path.join(this.dataPath, 'GeoLite2-City.mmdb');
    const asnPath = path.join(this.dataPath, 'GeoLite2-ASN.mmdb');

    try {
      if (fs.existsSync(cityPath)) {
        this.cityReader = await maxmind.open<CityResponse>(cityPath);
      }

      if (fs.existsSync(asnPath)) {
        this.asnReader = await maxmind.open<AsnResponse>(asnPath);
      }

      this.initialized = this.cityReader !== null || this.asnReader !== null;
      return this.initialized;
    } catch (error) {
      console.error('Failed to initialize GeoIP databases:', error);
      return false;
    }
  }

  /**
   * Check if GeoIP is available.
   */
  isAvailable(): boolean {
    return this.initialized;
  }

  /**
   * Lookup geographic information for an IP address.
   */
  lookup(ip: string): GeoIPResult | null {
    if (!this.initialized) return null;

    const result: GeoIPResult = { ip };

    // City lookup
    if (this.cityReader) {
      try {
        const city = this.cityReader.get(ip);
        if (city) {
          result.country_code = city.country?.iso_code;
          result.country_name = city.country?.names?.en;
          result.city = city.city?.names?.en;
          result.latitude = city.location?.latitude;
          result.longitude = city.location?.longitude;
          result.accuracy_radius = city.location?.accuracy_radius;
          result.timezone = city.location?.time_zone;
          result.is_anonymous_proxy = city.traits?.is_anonymous_proxy;
          result.is_satellite_provider = city.traits?.is_satellite_provider;
        }
      } catch (error) {
        // IP not found in database
      }
    }

    // ASN lookup
    if (this.asnReader) {
      try {
        const asn = this.asnReader.get(ip);
        if (asn) {
          result.asn = asn.autonomous_system_number;
          result.as_org = asn.autonomous_system_organization;
        }
      } catch (error) {
        // IP not found in database
      }
    }

    return Object.keys(result).length > 1 ? result : null;
  }

  /**
   * Batch lookup multiple IPs.
   */
  batchLookup(ips: string[]): Map<string, GeoIPResult | null> {
    const results = new Map<string, GeoIPResult | null>();

    for (const ip of ips) {
      if (!results.has(ip)) {
        results.set(ip, this.lookup(ip));
      }
    }

    return results;
  }
}

// Singleton instance
let geoipService: GeoIPService | null = null;

export async function getGeoIPService(): Promise<GeoIPService> {
  if (!geoipService) {
    geoipService = new GeoIPService(process.env.GEOIP_DATA_PATH || '/data/geoip');
    await geoipService.initialize();
  }
  return geoipService;
}
```

### 5.4 Database Download Script

Create `api/scripts/download-geoip.sh`:

```bash
#!/bin/bash
# Download MaxMind GeoLite2 databases

set -e

# Configuration
ACCOUNT_ID="${MAXMIND_ACCOUNT_ID:?Set MAXMIND_ACCOUNT_ID environment variable}"
LICENSE_KEY="${MAXMIND_LICENSE_KEY:?Set MAXMIND_LICENSE_KEY environment variable}"
DATA_DIR="${GEOIP_DATA_PATH:-/data/geoip}"

mkdir -p "$DATA_DIR"

echo "Downloading GeoLite2-City..."
curl -sSL "https://download.maxmind.com/geoip/databases/GeoLite2-City/download?suffix=tar.gz" \
  -u "${ACCOUNT_ID}:${LICENSE_KEY}" \
  -o /tmp/GeoLite2-City.tar.gz

tar -xzf /tmp/GeoLite2-City.tar.gz -C /tmp
mv /tmp/GeoLite2-City_*/GeoLite2-City.mmdb "$DATA_DIR/"

echo "Downloading GeoLite2-ASN..."
curl -sSL "https://download.maxmind.com/geoip/databases/GeoLite2-ASN/download?suffix=tar.gz" \
  -u "${ACCOUNT_ID}:${LICENSE_KEY}" \
  -o /tmp/GeoLite2-ASN.tar.gz

tar -xzf /tmp/GeoLite2-ASN.tar.gz -C /tmp
mv /tmp/GeoLite2-ASN_*/GeoLite2-ASN.mmdb "$DATA_DIR/"

echo "GeoIP databases downloaded to $DATA_DIR"
ls -la "$DATA_DIR"
```

### 5.5 API Endpoints

```typescript
// GET /api/geoip/status - Check if GeoIP is enabled/available
// GET /api/geoip/lookup/:ip - Lookup single IP
// POST /api/geoip/lookup - Batch lookup IPs
// POST /api/geoip/update - Trigger database update (admin)
```

### 5.6 UI Settings Page

Add GeoIP configuration to Settings:

```
┌─────────────────────────────────────────────────────────────┐
│  GeoIP Settings                                             │
├─────────────────────────────────────────────────────────────┤
│  Status: ✅ Enabled                                         │
│  Database Version: 2025-01-14                               │
│  Last Updated: 2025-01-14 03:00 UTC                         │
│                                                             │
│  [Update Now]  [View License]                               │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Setup Instructions:                                        │
│  1. Register at maxmind.com/en/geolite2/signup             │
│  2. Generate license key                                    │
│  3. Set environment variables:                              │
│     MAXMIND_ACCOUNT_ID=your_account_id                     │
│     MAXMIND_LICENSE_KEY=your_license_key                   │
│  4. Run: npm run geoip:update                              │
│                                                             │
│  [Copy Setup Script]                                        │
└─────────────────────────────────────────────────────────────┘
```

### 5.7 Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `api/src/services/geoip.ts` | Create | GeoIP lookup service |
| `api/src/routes/geoip.ts` | Create | GeoIP API endpoints |
| `api/scripts/download-geoip.sh` | Create | Database download script |
| `api/src/dsl/compiler.ts` | Modify | Add geoip() function |
| `ui/src/pages/Settings/GeoIP.tsx` | Create | GeoIP settings UI |
| `docker-compose.yml` | Modify | Add geoip volume mount |

---

## Phase 6: OTLP Authentication

**Effort:** 1 day
**Goal:** Add API key authentication to the OTLP endpoint.

### 6.1 Current State

The OTLP endpoint at `POST /api/ingest/otlp/v1/logs` currently has **no authentication**, which is a security risk.

### 6.2 Implementation

Modify `api/src/routes/ingest.ts`:

```typescript
// Before (insecure)
router.post('/otlp/v1/logs', async (req, res) => {
  // No auth check
});

// After (secure)
router.post('/otlp/v1/logs', authenticate, requirePermission('write'), async (req, res) => {
  // Auth required
});
```

### 6.3 Support Multiple Auth Methods

OTLP clients may send auth differently:

```typescript
// Support both header formats
// 1. Authorization: ApiKey lnog_xxx
// 2. Authorization: Bearer lnog_xxx (OTLP standard)
// 3. X-API-Key: lnog_xxx (custom header)

function extractApiKey(req: Request): string | null {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader) {
    if (authHeader.startsWith('ApiKey ')) {
      return authHeader.slice(7);
    }
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
  }

  // Check X-API-Key header
  const xApiKey = req.headers['x-api-key'];
  if (typeof xApiKey === 'string') {
    return xApiKey;
  }

  return null;
}
```

### 6.4 OpenTelemetry Collector Configuration

Document how to configure auth in OTEL collector:

```yaml
# otel-collector-config.yaml
exporters:
  otlphttp:
    endpoint: http://lognog-server:4000/api/ingest
    headers:
      Authorization: "ApiKey lnog_your_api_key_here"
    tls:
      insecure: true  # Set to false in production

service:
  pipelines:
    logs:
      exporters: [otlphttp]
```

---

## Agent Alert Silencing

**Goal:** Allow users to silence/snooze alerts at multiple levels.

### Architecture: Three Levels of Silencing

| Level | Scope | Where | Description |
|-------|-------|-------|-------------|
| **1. Per-Notification** | Single alert instance | Agent | Dismiss from history |
| **2. Per-Alert-Rule** | Specific alert rule | Server | Snooze rule for duration |
| **3. Global Suppress** | All notifications | Server | Maintenance window |

### Level 1: Per-Notification Dismissal (Agent-Side)

Modify `agent/src/lognog_in/gui.py`:

```python
class AlertHistoryWindow:
    def __init__(self, parent, alerts: list):
        # ... existing code ...

        # Add dismiss button
        self.dismiss_btn = ttk.Button(
            button_frame,
            text="Dismiss",
            command=self._dismiss_selected
        )
        self.dismiss_btn.pack(side='left', padx=5)

        # Track dismissed alerts
        self._dismissed_ids: set[str] = set()

    def _dismiss_selected(self):
        """Dismiss selected alert."""
        selection = self.tree.selection()
        if selection:
            item = selection[0]
            alert_id = self.tree.item(item)['values'][0]  # Assuming ID in first column
            self._dismissed_ids.add(alert_id)

            # Visual feedback - gray out the row
            self.tree.item(item, tags=('dismissed',))
            self.tree.tag_configure('dismissed', foreground='gray')
```

### Level 2: Per-Alert-Rule Silencing (Server-Side)

**Database Schema Change:**

```sql
ALTER TABLE alerts ADD COLUMN silenced INTEGER DEFAULT 0;
ALTER TABLE alerts ADD COLUMN silenced_until TEXT;
ALTER TABLE alerts ADD COLUMN silenced_by TEXT;
ALTER TABLE alerts ADD COLUMN silence_reason TEXT;
```

**API Endpoints:**

```typescript
// POST /api/alerts/:id/silence
// Body: { duration: "30m" | "1h" | "4h" | "24h" | "custom", until?: string, reason?: string }

// POST /api/alerts/:id/unmute

// GET /api/alerts/silenced - List all currently silenced alerts
```

**Service Logic in `api/src/services/alerts.ts`:**

```typescript
async evaluateAlert(alert: Alert): Promise<EvaluationResult> {
  // Check if silenced
  if (alert.silenced && alert.silenced_until) {
    const silencedUntil = new Date(alert.silenced_until);
    if (silencedUntil > new Date()) {
      return {
        triggered: false,
        skipped: true,
        reason: `Silenced until ${alert.silenced_until}`
      };
    } else {
      // Auto-unmute expired silence
      await this.unmute(alert.id);
    }
  }

  // Continue with normal evaluation...
}
```

### Level 3: Global Notification Suppression

**Database Schema:**

```sql
CREATE TABLE IF NOT EXISTS notification_settings (
  id TEXT PRIMARY KEY DEFAULT 'global',
  suppress_all INTEGER DEFAULT 0,
  suppress_until TEXT,
  suppress_reason TEXT,
  suppress_started_at TEXT,
  suppress_started_by TEXT,
  emergency_email TEXT,  -- Still notify this email during suppression
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT
);
```

**API Endpoints:**

```typescript
// GET /api/notifications/settings - Get suppression status
// POST /api/notifications/suppress - Start suppression
// POST /api/notifications/resume - End suppression
```

### Alert Silencing UI

**In Web Dashboard:**

```
┌─────────────────────────────────────────────────────────────┐
│  Alert: Disk Space Warning                    [⋮ Actions]   │
├─────────────────────────────────────────────────────────────┤
│  Status: 🔴 Triggered (3 times in last hour)               │
│                                                             │
│  [Silence ▼]  [Edit]  [Disable]  [Delete]                  │
│                                                             │
│  ┌─────────────────────────────────┐                       │
│  │ Silence for:                    │                       │
│  │   ○ 30 minutes                  │                       │
│  │   ○ 1 hour                      │                       │
│  │   ○ 4 hours                     │                       │
│  │   ○ 24 hours                    │                       │
│  │   ○ Until I unmute              │                       │
│  │                                 │                       │
│  │ Reason (optional):              │                       │
│  │ [_________________________]     │                       │
│  │                                 │                       │
│  │ [Cancel]  [Silence]             │                       │
│  └─────────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `api/src/db/sqlite.ts` | Modify | Add silence columns, notification_settings table |
| `api/src/services/alerts.ts` | Modify | Add silence check to evaluateAlert() |
| `api/src/routes/alerts.ts` | Modify | Add silence/unmute endpoints |
| `api/src/routes/notifications.ts` | Create | Global suppression endpoints |
| `agent/src/lognog_in/gui.py` | Modify | Add dismiss button to AlertHistoryWindow |
| `agent/src/lognog_in/agent.py` | Modify | Track dismissed notifications |
| `ui/src/components/AlertSilenceModal.tsx` | Create | Silence duration picker |
| `ui/src/pages/Alerts.tsx` | Modify | Add silence actions to alert list |

---

## Testing & Validation

### Template Testing

```typescript
// api/src/services/templates.test.ts
describe('SourceTemplates', () => {
  it('should extract MySQL error fields correctly', () => {
    const template = getMySQLErrorTemplate();
    const logLine = '2025-01-15T10:23:45.123456Z 0 [Warning] [MY-010055] [Server] IP address...';

    const result = validator.testMatch(template, logLine);

    expect(result.valid).toBe(true);
    expect(result.extracted_fields.level).toBe('Warning');
    expect(result.extracted_fields.error_code).toBe('010055');
  });
});
```

### IP Classification Testing

```typescript
// api/src/utils/ip-classifier.test.ts
describe('IP Classifier', () => {
  it('should identify RFC 1918 private IPs', () => {
    expect(classifyIP('10.0.0.1').type).toBe('private');
    expect(classifyIP('172.16.0.1').type).toBe('private');
    expect(classifyIP('192.168.1.1').type).toBe('private');
  });

  it('should identify public IPs', () => {
    expect(classifyIP('8.8.8.8').type).toBe('public');
    expect(classifyIP('1.1.1.1').type).toBe('public');
  });

  it('should identify loopback', () => {
    expect(classifyIP('127.0.0.1').type).toBe('loopback');
  });
});
```

### Windows Event Testing

```python
# agent/tests/test_windows_events.py
def test_security_event_parsing():
    """Test parsing of Windows Security event."""
    collector = WindowsEventCollector(hostname='test', channels=[], on_event=lambda e: None)

    # Mock XML event
    xml = '''<Event xmlns="...">
      <System>
        <EventID>4624</EventID>
        <Level>4</Level>
        ...
      </System>
    </Event>'''

    event = collector._parse_event_xml(xml)

    assert event.event_id == 4624
    assert event.level == 4
```

---

## File Reference

### Files to Create

| File | Phase | Description |
|------|-------|-------------|
| `api/src/routes/templates.ts` | 1 | Template CRUD API |
| `api/src/services/templates.ts` | 1 | Template logic |
| `api/src/services/template-validator.ts` | 1 | Template validation |
| `api/src/data/builtin-templates.ts` | 1 | Seed data |
| `ui/src/pages/DataSources.tsx` | 1 | Data sources page |
| `ui/src/components/TemplateSetup.tsx` | 1 | Setup wizard |
| `agent/src/lognog_in/windows_events.py` | 2 | Windows Event collector |
| `api/src/utils/ip-classifier.ts` | 4 | IP classification |
| `api/src/routes/ip.ts` | 4 | IP API |
| `ui/src/pages/Settings/IPNetworks.tsx` | 4 | Network management |
| `api/src/services/geoip.ts` | 5 | GeoIP service |
| `api/src/routes/geoip.ts` | 5 | GeoIP API |
| `api/scripts/download-geoip.sh` | 5 | DB download script |
| `ui/src/pages/Settings/GeoIP.tsx` | 5 | GeoIP settings |
| `api/src/routes/notifications.ts` | Silencing | Global suppress API |
| `ui/src/components/AlertSilenceModal.tsx` | Silencing | Silence picker |

### Files to Modify

| File | Phases | Changes |
|------|--------|---------|
| `api/src/db/sqlite.ts` | 1, 4, Silencing | Add tables |
| `api/src/routes/ingest.ts` | 2, 6 | Windows events, OTLP auth |
| `api/src/dsl/compiler.ts` | 4, 5 | Add functions |
| `api/src/services/alerts.ts` | Silencing | Add silence check |
| `api/src/routes/alerts.ts` | Silencing | Add endpoints |
| `agent/src/lognog_in/agent.py` | 2, Silencing | Windows events, dismiss tracking |
| `agent/src/lognog_in/gui.py` | 2, Silencing | Windows config, dismiss button |
| `agent/src/lognog_in/config.py` | 2 | Windows config schema |
| `agent/pyproject.toml` | 2 | Add pywin32 |
| `docker-compose.yml` | 5 | GeoIP volume |

---

## Summary

This roadmap provides a complete implementation path from the current state to a full-featured log management platform with:

- **6 phases** of incremental delivery
- **Detailed code examples** for each component
- **Database schemas** ready to implement
- **API endpoint specifications**
- **UI mockups and flows**
- **Testing strategies**
- **File references** for easy navigation

Each phase can be implemented independently, allowing for incremental delivery and testing.

---

**Document maintained by:** LogNog Development Team
**Source:** Research conducted 2025-12-12
