# Knowledge Management in LogNog

> **The Brain Behind Your Logs** - Transform raw log data into actionable intelligence

Welcome to LogNog's Knowledge Management system! This guide will take you from zero to hero, teaching you how to extract, classify, enrich, and automate your way to log mastery.

---

## Table of Contents

1. [The Big Picture](#the-big-picture)
2. [Field Extractions](#field-extractions) - Mining Gold from Raw Text
3. [Event Types](#event-types) - Classifying Your Log Universe
4. [Tags](#tags) - The Art of Labeling
5. [Lookups](#lookups) - Your Data Enrichment Engine
6. [Workflow Actions](#workflow-actions) - Automation Superpowers
7. [Putting It All Together](#putting-it-all-together)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)

---

## The Big Picture

Imagine your logs as a river of raw data flowing into LogNog. Knowledge Management is your toolkit for:

```
Raw Logs → Field Extractions → Event Types → Tags → Lookups → Workflow Actions
    ↓              ↓               ↓           ↓          ↓            ↓
  Text         Structure       Categories   Labels    Enrichment   Automation
```

Each layer builds on the previous one, transforming chaos into clarity.

### Why Knowledge Management Matters

Without Knowledge Management:
```
Dec 11 10:15:32 router kernel: [UFW BLOCK] IN=eth0 SRC=192.168.1.100 DST=10.0.0.1 PROTO=TCP DPT=22
```

With Knowledge Management:
```json
{
  "timestamp": "2025-12-11T10:15:32",
  "hostname": "router",
  "event_type": "firewall_block",
  "tags": ["security", "ssh_attempt", "internal_network"],
  "source_ip": "192.168.1.100",
  "source_location": "Living Room IoT Hub",  // ← From lookup!
  "dest_port": 22,
  "service": "SSH",
  "threat_level": "medium",
  "action_available": "Block IP in firewall"  // ← Workflow action!
}
```

---

## Field Extractions

> **Level Up:** Turn unstructured text into queryable fields

Field extractions are the foundation of everything in LogNog. They parse your raw log messages and pull out meaningful data points.

### Understanding Extraction Types

#### 1. Grok Patterns (Recommended for Beginners)

Grok is a friendly pattern matching syntax that uses named patterns. Think of it as "regex with training wheels."

**Common Grok Patterns Available:**

| Pattern | Matches | Example |
|---------|---------|---------|
| `%{IP}` | IPv4/IPv6 addresses | `192.168.1.1` |
| `%{HOSTNAME}` | Hostnames | `server01.local` |
| `%{NUMBER}` | Any number | `42`, `3.14` |
| `%{WORD}` | Single word | `ERROR` |
| `%{GREEDYDATA}` | Everything remaining | `any text here...` |
| `%{TIMESTAMP_ISO8601}` | ISO timestamps | `2025-12-11T10:15:32Z` |
| `%{LOGLEVEL}` | Log levels | `INFO`, `WARN`, `ERROR` |
| `%{MAC}` | MAC addresses | `00:1A:2B:3C:4D:5E` |
| `%{URI}` | Full URIs | `https://example.com/path` |
| `%{UUID}` | UUIDs | `550e8400-e29b-41d4-a716-446655440000` |

**Tutorial: Your First Grok Extraction**

Let's extract fields from a firewall log:

```
[UFW BLOCK] IN=eth0 SRC=192.168.1.100 DST=10.0.0.1 PROTO=TCP DPT=22
```

Step 1: Identify the parts you want to extract:
- Action: `BLOCK`
- Interface: `eth0`
- Source IP: `192.168.1.100`
- Destination IP: `10.0.0.1`
- Protocol: `TCP`
- Destination Port: `22`

Step 2: Build your Grok pattern:
```
\[UFW %{WORD:fw_action}\] IN=%{WORD:interface} SRC=%{IP:source_ip} DST=%{IP:dest_ip} PROTO=%{WORD:protocol} DPT=%{NUMBER:dest_port}
```

Step 3: Create the extraction in LogNog:

```bash
curl -X POST http://localhost:4000/knowledge/field-extractions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ufw_firewall",
    "pattern": "\\[UFW %{WORD:fw_action}\\] IN=%{WORD:interface} SRC=%{IP:source_ip} DST=%{IP:dest_ip} PROTO=%{WORD:protocol} DPT=%{NUMBER:dest_port}",
    "type": "grok",
    "source_type": "syslog",
    "priority": 10,
    "enabled": true
  }'
```

Step 4: Test your extraction:
```bash
curl -X POST http://localhost:4000/knowledge/field-extractions/test \
  -H "Content-Type: application/json" \
  -d '{
    "pattern": "\\[UFW %{WORD:fw_action}\\] IN=%{WORD:interface} SRC=%{IP:source_ip} DST=%{IP:dest_ip} PROTO=%{WORD:protocol} DPT=%{NUMBER:dest_port}",
    "type": "grok",
    "sample": "[UFW BLOCK] IN=eth0 SRC=192.168.1.100 DST=10.0.0.1 PROTO=TCP DPT=22"
  }'
```

**Result:**
```json
{
  "success": true,
  "fields": {
    "fw_action": "BLOCK",
    "interface": "eth0",
    "source_ip": "192.168.1.100",
    "dest_ip": "10.0.0.1",
    "protocol": "TCP",
    "dest_port": "22"
  }
}
```

#### 2. Regular Expressions (For Power Users)

When Grok isn't flexible enough, use raw regex with named capture groups.

**Tutorial: Extracting from Custom Application Logs**

Your app logs like this:
```
2025-12-11 10:15:32 [REQ-abc123] user=john action=login status=success duration=45ms
```

Regex pattern with named groups:
```regex
\[REQ-(?<request_id>[a-z0-9]+)\] user=(?<username>\w+) action=(?<action>\w+) status=(?<status>\w+) duration=(?<duration_ms>\d+)ms
```

```bash
curl -X POST http://localhost:4000/knowledge/field-extractions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "app_request_log",
    "pattern": "\\[REQ-(?<request_id>[a-z0-9]+)\\] user=(?<username>\\w+) action=(?<action>\\w+) status=(?<status>\\w+) duration=(?<duration_ms>\\d+)ms",
    "type": "regex",
    "source_type": "application",
    "priority": 20,
    "enabled": true
  }'
```

### Field Extraction Patterns Library

Here's a collection of battle-tested patterns for common log formats:

#### Network & Security

```grok
# Nginx Access Log
%{IP:client_ip} - %{USER:user} \[%{HTTPDATE:timestamp}\] "%{WORD:method} %{URIPATHPARAM:request} HTTP/%{NUMBER:http_version}" %{NUMBER:status} %{NUMBER:bytes}

# SSH Authentication
%{WORD:auth_result} %{WORD:auth_method} for %{USER:username} from %{IP:source_ip} port %{NUMBER:source_port}

# DNS Query
query: %{HOSTNAME:query_domain} IN %{WORD:query_type}

# DHCP Lease
DHCPACK on %{IP:leased_ip} to %{MAC:client_mac} \(%{HOSTNAME:client_hostname}\)
```

#### Application Logs

```grok
# Docker Container Log
%{TIMESTAMP_ISO8601:timestamp} %{LOGLEVEL:level} %{GREEDYDATA:message}

# Python Traceback (first line)
Traceback \(most recent call last\):

# Java Exception
(?<exception_class>[\w.]+Exception): %{GREEDYDATA:exception_message}

# Node.js Error
%{LOGLEVEL:level}: %{GREEDYDATA:message} at %{PATH:file}:%{NUMBER:line}:%{NUMBER:column}
```

#### System Logs

```grok
# Systemd Service
Started %{GREEDYDATA:service_description}\.
Stopped %{GREEDYDATA:service_description}\.

# Cron Job
\(%{USER:cron_user}\) CMD \(%{GREEDYDATA:cron_command}\)

# Kernel OOM
Out of memory: Kill process %{NUMBER:pid} \(%{WORD:process_name}\)
```

### Priority System

Extractions are applied in priority order (lower number = higher priority). Use this to layer extractions:

| Priority | Use Case |
|----------|----------|
| 1-10 | Critical security patterns (always extract first) |
| 11-50 | Application-specific patterns |
| 51-100 | General catch-all patterns |

**Example Strategy:**
```
Priority 1:  Security events (failed logins, blocks)
Priority 10: Network events (connections, DNS)
Priority 20: Application events (requests, errors)
Priority 50: Generic syslog parsing
Priority 99: Catch-all for unmatched logs
```

---

## Event Types

> **Classify Everything:** Automatically categorize logs by their meaning

Event types let you define categories based on search queries. When a log matches an event type's search string, it gets classified automatically.

### Creating Event Types

**Tutorial: Building a Security Event Classification System**

Let's create a hierarchy of security-related event types:

```bash
# Critical Security Events
curl -X POST http://localhost:4000/knowledge/event-types \
  -H "Content-Type: application/json" \
  -d '{
    "name": "security_critical",
    "search_string": "severity<=2 OR message~\"attack\" OR message~\"breach\"",
    "description": "Critical security events requiring immediate attention",
    "priority": 1,
    "enabled": true
  }'

# Authentication Failures
curl -X POST http://localhost:4000/knowledge/event-types \
  -H "Content-Type: application/json" \
  -d '{
    "name": "auth_failure",
    "search_string": "message~\"authentication failure\" OR message~\"Failed password\" OR message~\"Invalid user\"",
    "description": "Failed authentication attempts",
    "priority": 10,
    "enabled": true
  }'

# Firewall Blocks
curl -X POST http://localhost:4000/knowledge/event-types \
  -H "Content-Type: application/json" \
  -d '{
    "name": "firewall_block",
    "search_string": "message~\"UFW BLOCK\" OR message~\"DENIED\" OR message~\"DROP\"",
    "description": "Firewall blocked connections",
    "priority": 10,
    "enabled": true
  }'

# Service Status Changes
curl -X POST http://localhost:4000/knowledge/event-types \
  -H "Content-Type: application/json" \
  -d '{
    "name": "service_change",
    "search_string": "message~\"Started\" OR message~\"Stopped\" OR message~\"Restarting\"",
    "description": "Service lifecycle events",
    "priority": 50,
    "enabled": true
  }'
```

### Event Type Hierarchy Pattern

Create a multi-level classification:

```
Level 1 (Priority 1-9): Severity-based
├── critical_event (severity <= 2)
├── warning_event (severity = 4)
└── info_event (severity >= 6)

Level 2 (Priority 10-49): Category-based
├── security_event (auth, firewall, crypto)
├── network_event (dns, dhcp, routing)
├── application_event (web, api, database)
└── system_event (kernel, cron, systemd)

Level 3 (Priority 50-99): Specific types
├── login_success
├── login_failure
├── file_access
└── config_change
```

### Using Event Types in Searches

Once defined, query by event type:

```
search event_type=auth_failure | stats count by hostname | sort desc
```

```
search event_type=firewall_block source_ip!=10.0.0.0/8 | table timestamp source_ip dest_port
```

---

## Tags

> **Label with Purpose:** Add meaningful context to field values

Tags are key-value pairs that add semantic meaning to specific field values. They're like sticky notes you attach to your data.

### Tag Anatomy

```
Tag Name: "production_server"
Field: "hostname"
Value: "web-prod-01"
```

This means: Whenever `hostname` equals `web-prod-01`, apply the tag `production_server`.

### Tutorial: Building a Tagging System

**Step 1: Environment Tags**

```bash
# Production servers
curl -X POST http://localhost:4000/knowledge/tags \
  -H "Content-Type: application/json" \
  -d '{"tag_name": "env:production", "field": "hostname", "value": "web-prod-01"}'

curl -X POST http://localhost:4000/knowledge/tags \
  -H "Content-Type: application/json" \
  -d '{"tag_name": "env:production", "field": "hostname", "value": "db-prod-01"}'

# Development servers
curl -X POST http://localhost:4000/knowledge/tags \
  -H "Content-Type: application/json" \
  -d '{"tag_name": "env:development", "field": "hostname", "value": "dev-server"}'

# Staging servers
curl -X POST http://localhost:4000/knowledge/tags \
  -H "Content-Type: application/json" \
  -d '{"tag_name": "env:staging", "field": "hostname", "value": "staging-01"}'
```

**Step 2: Severity Tags**

```bash
# Map numeric severities to human-readable tags
curl -X POST http://localhost:4000/knowledge/tags \
  -H "Content-Type: application/json" \
  -d '{"tag_name": "severity:emergency", "field": "severity", "value": "0"}'

curl -X POST http://localhost:4000/knowledge/tags \
  -H "Content-Type: application/json" \
  -d '{"tag_name": "severity:critical", "field": "severity", "value": "2"}'

curl -X POST http://localhost:4000/knowledge/tags \
  -H "Content-Type: application/json" \
  -d '{"tag_name": "severity:warning", "field": "severity", "value": "4"}'

curl -X POST http://localhost:4000/knowledge/tags \
  -H "Content-Type: application/json" \
  -d '{"tag_name": "severity:info", "field": "severity", "value": "6"}'
```

**Step 3: Service Tags**

```bash
# Tag applications by service category
curl -X POST http://localhost:4000/knowledge/tags \
  -H "Content-Type: application/json" \
  -d '{"tag_name": "service:web", "field": "app_name", "value": "nginx"}'

curl -X POST http://localhost:4000/knowledge/tags \
  -H "Content-Type: application/json" \
  -d '{"tag_name": "service:database", "field": "app_name", "value": "postgres"}'

curl -X POST http://localhost:4000/knowledge/tags \
  -H "Content-Type: application/json" \
  -d '{"tag_name": "service:cache", "field": "app_name", "value": "redis"}'
```

### Tag Naming Conventions

Use namespaced tags for organization:

```
env:production          # Environment
service:web            # Service category
team:platform          # Team ownership
compliance:pci         # Compliance requirements
criticality:high       # Business criticality
location:us-east       # Geographic location
```

### Querying by Tags

```
search tag=env:production severity<=4 | stats count by hostname
```

```
search tag=service:database | stats avg(duration_ms) by hostname
```

---

## Lookups

> **Enrich Your Data:** Add context from external data sources

Lookups are translation tables that add information to your logs. They transform cryptic values into meaningful context.

### Lookup Types

1. **Manual Lookups** - Define data directly in JSON
2. **CSV Lookups** - Import from CSV files

### Tutorial: Creating Useful Lookups

**Example 1: IP to Location Mapping**

Map internal IP addresses to physical locations or device names:

```bash
curl -X POST http://localhost:4000/knowledge/lookups \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ip_locations",
    "type": "manual",
    "key_field": "ip_address",
    "output_fields": ["location", "device_type", "owner"],
    "data": [
      {"ip_address": "192.168.1.1", "location": "Network Closet", "device_type": "Router", "owner": "IT"},
      {"ip_address": "192.168.1.10", "location": "Living Room", "device_type": "Smart TV", "owner": "Home"},
      {"ip_address": "192.168.1.20", "location": "Office", "device_type": "Workstation", "owner": "John"},
      {"ip_address": "192.168.1.30", "location": "Garage", "device_type": "IoT Hub", "owner": "Home"},
      {"ip_address": "192.168.1.100", "location": "Guest Network", "device_type": "Unknown", "owner": "Guest"}
    ],
    "description": "Maps IP addresses to physical locations and device info"
  }'
```

**Example 2: Port to Service Mapping**

```bash
curl -X POST http://localhost:4000/knowledge/lookups \
  -H "Content-Type: application/json" \
  -d '{
    "name": "port_services",
    "type": "manual",
    "key_field": "port",
    "output_fields": ["service_name", "protocol", "risk_level"],
    "data": [
      {"port": "22", "service_name": "SSH", "protocol": "TCP", "risk_level": "high"},
      {"port": "80", "service_name": "HTTP", "protocol": "TCP", "risk_level": "medium"},
      {"port": "443", "service_name": "HTTPS", "protocol": "TCP", "risk_level": "low"},
      {"port": "3306", "service_name": "MySQL", "protocol": "TCP", "risk_level": "high"},
      {"port": "5432", "service_name": "PostgreSQL", "protocol": "TCP", "risk_level": "high"},
      {"port": "6379", "service_name": "Redis", "protocol": "TCP", "risk_level": "high"},
      {"port": "8080", "service_name": "HTTP-Alt", "protocol": "TCP", "risk_level": "medium"},
      {"port": "53", "service_name": "DNS", "protocol": "UDP", "risk_level": "low"}
    ],
    "description": "Common port to service mappings with risk assessment"
  }'
```

**Example 3: HTTP Status Code Lookup**

```bash
curl -X POST http://localhost:4000/knowledge/lookups \
  -H "Content-Type: application/json" \
  -d '{
    "name": "http_status_codes",
    "type": "manual",
    "key_field": "status_code",
    "output_fields": ["status_text", "category", "action_needed"],
    "data": [
      {"status_code": "200", "status_text": "OK", "category": "success", "action_needed": "none"},
      {"status_code": "301", "status_text": "Moved Permanently", "category": "redirect", "action_needed": "check_config"},
      {"status_code": "400", "status_text": "Bad Request", "category": "client_error", "action_needed": "check_client"},
      {"status_code": "401", "status_text": "Unauthorized", "category": "auth_error", "action_needed": "check_credentials"},
      {"status_code": "403", "status_text": "Forbidden", "category": "auth_error", "action_needed": "check_permissions"},
      {"status_code": "404", "status_text": "Not Found", "category": "client_error", "action_needed": "check_url"},
      {"status_code": "500", "status_text": "Internal Server Error", "category": "server_error", "action_needed": "investigate"},
      {"status_code": "502", "status_text": "Bad Gateway", "category": "server_error", "action_needed": "check_upstream"},
      {"status_code": "503", "status_text": "Service Unavailable", "category": "server_error", "action_needed": "check_capacity"}
    ],
    "description": "HTTP status code reference with recommended actions"
  }'
```

**Example 4: User Directory**

```bash
curl -X POST http://localhost:4000/knowledge/lookups \
  -H "Content-Type: application/json" \
  -d '{
    "name": "user_directory",
    "type": "manual",
    "key_field": "username",
    "output_fields": ["full_name", "department", "role", "contact"],
    "data": [
      {"username": "john", "full_name": "John Smith", "department": "Engineering", "role": "Developer", "contact": "john@company.com"},
      {"username": "jane", "full_name": "Jane Doe", "department": "Security", "role": "Analyst", "contact": "jane@company.com"},
      {"username": "admin", "full_name": "System Admin", "department": "IT", "role": "Administrator", "contact": "it@company.com"},
      {"username": "root", "full_name": "Root Account", "department": "System", "role": "Superuser", "contact": "security@company.com"}
    ],
    "description": "User account directory for log enrichment"
  }'
```

### Using Lookups via API

Look up enrichment data:

```bash
curl "http://localhost:4000/knowledge/lookups/ip_locations/search?key=192.168.1.20"
```

Response:
```json
{
  "ip_address": "192.168.1.20",
  "location": "Office",
  "device_type": "Workstation",
  "owner": "John"
}
```

---

## Workflow Actions

> **Automate Everything:** Turn insights into action

Workflow actions are the crown jewel of Knowledge Management. They let you define actions that can be triggered from log events - opening links, running searches, or executing Python scripts.

### Action Types

| Type | Description | Use Case |
|------|-------------|----------|
| `link` | Open a URL with field substitution | External lookups, ticket creation |
| `search` | Generate a new search query | Drill-down investigation |
| `script` | Execute Python code | Custom automation, API calls |

### Tutorial: Link Actions

Link actions generate URLs with field values substituted in.

**Example 1: IP Reputation Lookup**

```bash
curl -X POST http://localhost:4000/knowledge/workflow-actions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Check IP Reputation",
    "type": "link",
    "config": {
      "url": "https://www.abuseipdb.com/check/$source_ip$",
      "open_in_new_tab": true
    },
    "description": "Look up IP reputation on AbuseIPDB",
    "enabled": true
  }'
```

**Example 2: Create Support Ticket**

```bash
curl -X POST http://localhost:4000/knowledge/workflow-actions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Create Ticket",
    "type": "link",
    "config": {
      "url": "https://yourtickets.com/new?title=Issue on $hostname$&description=Error: $message$&severity=$severity$",
      "open_in_new_tab": true
    },
    "description": "Create a support ticket from this log entry",
    "enabled": true
  }'
```

**Example 3: VirusTotal File Lookup**

```bash
curl -X POST http://localhost:4000/knowledge/workflow-actions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "VirusTotal Lookup",
    "type": "link",
    "config": {
      "url": "https://www.virustotal.com/gui/search/$file_hash$",
      "open_in_new_tab": true
    },
    "description": "Check file hash on VirusTotal",
    "enabled": true
  }'
```

### Tutorial: Search Actions

Search actions generate new LogNog queries for drill-down analysis.

**Example 1: Find Related Events**

```bash
curl -X POST http://localhost:4000/knowledge/workflow-actions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Find Related Events",
    "type": "search",
    "config": {
      "query_template": "search hostname=$hostname$ app_name=$app_name$ | sort timestamp | limit 100"
    },
    "description": "Find all events from same host and application",
    "enabled": true
  }'
```

**Example 2: Investigate Source IP**

```bash
curl -X POST http://localhost:4000/knowledge/workflow-actions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Investigate IP",
    "type": "search",
    "config": {
      "query_template": "search source_ip=$source_ip$ | stats count by hostname app_name action | sort desc count"
    },
    "description": "Analyze all activity from this source IP",
    "enabled": true
  }'
```

**Example 3: User Activity Timeline**

```bash
curl -X POST http://localhost:4000/knowledge/workflow-actions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "User Timeline",
    "type": "search",
    "config": {
      "query_template": "search user=$user$ | table timestamp hostname app_name action message | sort timestamp"
    },
    "description": "View complete activity timeline for this user",
    "enabled": true
  }'
```

### Tutorial: Python Script Actions

Script actions are where the real magic happens. Execute Python code with full access to log context!

#### Script Action Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Log Event  │────▶│   LogNog     │────▶│   Python    │
│  (context)  │     │   API       │     │   Script    │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                    │
                           │              ┌─────┴─────┐
                           │              │  Actions  │
                           │              │  - API    │
                           │              │  - File   │
                           │              │  - Notify │
                           │              └───────────┘
                           │                    │
                           ▼                    ▼
                    ┌─────────────┐     ┌─────────────┐
                    │   Output    │◀────│   Result    │
                    └─────────────┘     └─────────────┘
```

#### Built-in Helper Functions

Your Python scripts have access to these helpers:

```python
# Get a field value from the log event
value = get_field("hostname")
value = get_field("source_ip", "unknown")  # with default

# Set the output that LogNog will display
set_output("Operation completed successfully!")
set_output({"status": "success", "details": {...}})  # JSON output

# The full context is available as a dict
context = {
    "hostname": "...",
    "source_ip": "...",
    "message": "...",
    # ... all other fields
}
```

#### Example 1: Slack Notification

```bash
curl -X POST http://localhost:4000/knowledge/workflow-actions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Send to Slack",
    "type": "script",
    "config": {
      "script": "import urllib.request\nimport json\n\nwebhook_url = \"https://hooks.slack.com/services/YOUR/WEBHOOK/URL\"\n\nmessage = {\n    \"text\": f\":warning: Alert from {get_field('"'"'hostname'"'"')}\",\n    \"blocks\": [\n        {\n            \"type\": \"section\",\n            \"text\": {\n                \"type\": \"mrkdwn\",\n                \"text\": f\"*Host:* {get_field('"'"'hostname'"'"')}\\n*Severity:* {get_field('"'"'severity'"'"')}\\n*Message:* {get_field('"'"'message'"'"')[:200]}\"\n            }\n        }\n    ]\n}\n\nreq = urllib.request.Request(\n    webhook_url,\n    data=json.dumps(message).encode(),\n    headers={\"Content-Type\": \"application/json\"}\n)\n\ntry:\n    with urllib.request.urlopen(req, timeout=10) as response:\n        set_output(f\"Slack notification sent! Status: {response.status}\")\nexcept Exception as e:\n    set_output(f\"Failed to send: {str(e)}\")"
    },
    "description": "Send alert to Slack channel",
    "enabled": true
  }'
```

#### Example 2: Block IP in Firewall

```bash
curl -X POST http://localhost:4000/knowledge/workflow-actions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Block IP in Firewall",
    "type": "script",
    "config": {
      "script": "import subprocess\nimport json\n\nip_to_block = get_field(\"source_ip\")\n\nif not ip_to_block:\n    set_output({\"error\": \"No source_ip found in event\"})\nelse:\n    # Log the action (in production, actually run the command)\n    # subprocess.run([\"ufw\", \"deny\", \"from\", ip_to_block], check=True)\n    \n    result = {\n        \"action\": \"block_ip\",\n        \"ip\": ip_to_block,\n        \"status\": \"simulated\",\n        \"command\": f\"ufw deny from {ip_to_block}\",\n        \"note\": \"Uncomment subprocess line for actual blocking\"\n    }\n    set_output(result)"
    },
    "description": "Block source IP in UFW firewall",
    "enabled": true
  }'
```

#### Example 3: Create Jira Ticket

```bash
curl -X POST http://localhost:4000/knowledge/workflow-actions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Create Jira Issue",
    "type": "script",
    "config": {
      "script": "import urllib.request\nimport json\nimport base64\n\n# Configuration\nJIRA_URL = \"https://your-domain.atlassian.net\"\nJIRA_EMAIL = \"your-email@domain.com\"\nJIRA_TOKEN = \"your-api-token\"\nPROJECT_KEY = \"OPS\"\n\n# Build the issue\nissue = {\n    \"fields\": {\n        \"project\": {\"key\": PROJECT_KEY},\n        \"summary\": f\"Alert: {get_field('"'"'hostname'"'"')} - {get_field('"'"'app_name'"'"')}\",\n        \"description\": f\"Automated issue from LogNog\\n\\nHostname: {get_field('"'"'hostname'"'"')}\\nSeverity: {get_field('"'"'severity'"'"')}\\nMessage: {get_field('"'"'message'"'"')}\\n\\nTimestamp: {get_field('"'"'timestamp'"'"')}\",\n        \"issuetype\": {\"name\": \"Bug\"}\n    }\n}\n\n# Auth header\nauth_string = base64.b64encode(f\"{JIRA_EMAIL}:{JIRA_TOKEN}\".encode()).decode()\n\nreq = urllib.request.Request(\n    f\"{JIRA_URL}/rest/api/3/issue\",\n    data=json.dumps(issue).encode(),\n    headers={\n        \"Content-Type\": \"application/json\",\n        \"Authorization\": f\"Basic {auth_string}\"\n    }\n)\n\ntry:\n    with urllib.request.urlopen(req, timeout=15) as response:\n        result = json.loads(response.read())\n        set_output({\n            \"status\": \"created\",\n            \"issue_key\": result.get(\"key\"),\n            \"url\": f\"{JIRA_URL}/browse/{result.get('"'"'key'"'"')}\"\n        })\nexcept Exception as e:\n    set_output({\"error\": str(e)})"
    },
    "description": "Create a Jira issue from this log entry",
    "enabled": true
  }'
```

#### Example 4: Enrich with GeoIP

```bash
curl -X POST http://localhost:4000/knowledge/workflow-actions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GeoIP Lookup",
    "type": "script",
    "config": {
      "script": "import urllib.request\nimport json\n\nip = get_field(\"source_ip\")\n\nif not ip:\n    set_output({\"error\": \"No IP address found\"})\nelse:\n    try:\n        # Using ip-api.com (free, no key required)\n        with urllib.request.urlopen(f\"http://ip-api.com/json/{ip}?fields=status,message,country,regionName,city,isp,org,as,query\", timeout=10) as response:\n            data = json.loads(response.read())\n            if data.get(\"status\") == \"success\":\n                set_output({\n                    \"ip\": ip,\n                    \"country\": data.get(\"country\"),\n                    \"region\": data.get(\"regionName\"),\n                    \"city\": data.get(\"city\"),\n                    \"isp\": data.get(\"isp\"),\n                    \"organization\": data.get(\"org\"),\n                    \"asn\": data.get(\"as\")\n                })\n            else:\n                set_output({\"error\": data.get(\"message\", \"Unknown error\")})\n    except Exception as e:\n        set_output({\"error\": str(e)})"
    },
    "description": "Look up geographic location of source IP",
    "enabled": true
  }'
```

#### Example 5: Automated Threat Assessment

```bash
curl -X POST http://localhost:4000/knowledge/workflow-actions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Threat Assessment",
    "type": "script",
    "config": {
      "script": "import json\n\n# Scoring rules\nscore = 0\nfindings = []\n\n# Check severity\nseverity = int(get_field(\"severity\", \"6\"))\nif severity <= 2:\n    score += 40\n    findings.append(\"Critical severity level\")\nelif severity <= 4:\n    score += 20\n    findings.append(\"Warning severity level\")\n\n# Check for suspicious patterns in message\nmessage = get_field(\"message\", \"\").lower()\nsuspicious_patterns = [\n    (\"failed password\", 15, \"Authentication failure detected\"),\n    (\"invalid user\", 20, \"Invalid user attempt\"),\n    (\"root\", 10, \"Root user activity\"),\n    (\"sudo\", 5, \"Privilege escalation\"),\n    (\"denied\", 10, \"Access denied\"),\n    (\"attack\", 30, \"Potential attack keyword\"),\n    (\"overflow\", 25, \"Possible overflow attempt\"),\n    (\"injection\", 25, \"Possible injection attempt\")\n]\n\nfor pattern, points, description in suspicious_patterns:\n    if pattern in message:\n        score += points\n        findings.append(description)\n\n# Check source IP (private vs public)\nsource_ip = get_field(\"source_ip\", \"\")\nif source_ip and not source_ip.startswith((\"10.\", \"192.168.\", \"172.\")):\n    score += 15\n    findings.append(\"External source IP\")\n\n# Determine threat level\nif score >= 60:\n    threat_level = \"HIGH\"\n    recommendation = \"Immediate investigation required\"\nelif score >= 30:\n    threat_level = \"MEDIUM\"\n    recommendation = \"Review within 24 hours\"\nelse:\n    threat_level = \"LOW\"\n    recommendation = \"Standard monitoring\"\n\nset_output({\n    \"threat_score\": score,\n    \"threat_level\": threat_level,\n    \"findings\": findings,\n    \"recommendation\": recommendation,\n    \"analyzed_fields\": {\n        \"severity\": severity,\n        \"source_ip\": source_ip,\n        \"message_preview\": message[:100]\n    }\n})"
    },
    "description": "Automated threat scoring and assessment",
    "enabled": true
  }'
```

#### Example 6: Send to PagerDuty

```bash
curl -X POST http://localhost:4000/knowledge/workflow-actions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Page On-Call",
    "type": "script",
    "config": {
      "script": "import urllib.request\nimport json\n\nPD_ROUTING_KEY = \"your-pagerduty-routing-key\"\n\nevent = {\n    \"routing_key\": PD_ROUTING_KEY,\n    \"event_action\": \"trigger\",\n    \"dedup_key\": f\"{get_field('"'"'hostname'"'"')}-{get_field('"'"'app_name'"'"')}-{get_field('"'"'timestamp'"'"')}\",\n    \"payload\": {\n        \"summary\": f\"LogNog Alert: {get_field('"'"'hostname'"'"')} - {get_field('"'"'message'"'"')[:100]}\",\n        \"severity\": \"critical\" if int(get_field(\"severity\", \"6\")) <= 3 else \"warning\",\n        \"source\": get_field(\"hostname\"),\n        \"custom_details\": {\n            \"app_name\": get_field(\"app_name\"),\n            \"source_ip\": get_field(\"source_ip\"),\n            \"full_message\": get_field(\"message\")\n        }\n    }\n}\n\nreq = urllib.request.Request(\n    \"https://events.pagerduty.com/v2/enqueue\",\n    data=json.dumps(event).encode(),\n    headers={\"Content-Type\": \"application/json\"}\n)\n\ntry:\n    with urllib.request.urlopen(req, timeout=10) as response:\n        result = json.loads(response.read())\n        set_output({\n            \"status\": result.get(\"status\"),\n            \"dedup_key\": result.get(\"dedup_key\"),\n            \"message\": result.get(\"message\")\n        })\nexcept Exception as e:\n    set_output({\"error\": str(e)})"
    },
    "description": "Trigger PagerDuty incident for on-call",
    "enabled": true
  }'
```

### Testing Script Actions

Always test your scripts before deploying:

```bash
curl -X POST http://localhost:4000/knowledge/scripts/test \
  -H "Content-Type: application/json" \
  -d '{
    "script": "threat_score = 0\nif int(get_field(\"severity\", \"6\")) <= 3:\n    threat_score += 50\nset_output({\"score\": threat_score})",
    "context": {
      "hostname": "web-server-01",
      "severity": "2",
      "message": "Failed password for invalid user admin"
    }
  }'
```

### Executing Workflow Actions

Execute an action with context:

```bash
curl -X POST http://localhost:4000/knowledge/workflow-actions/1/execute \
  -H "Content-Type: application/json" \
  -d '{
    "context": {
      "hostname": "firewall-01",
      "source_ip": "203.0.113.100",
      "severity": "3",
      "message": "UFW BLOCK from external IP"
    }
  }'
```

---

## Putting It All Together

Let's build a complete security monitoring workflow using all knowledge objects together.

### Scenario: SSH Brute Force Detection & Response

**Step 1: Create Field Extraction for SSH Logs**

```bash
curl -X POST http://localhost:4000/knowledge/field-extractions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ssh_auth",
    "pattern": "%{WORD:auth_result} %{WORD:auth_method} for (?<ssh_user>\\S+) from %{IP:source_ip} port %{NUMBER:source_port}",
    "type": "grok",
    "source_type": "syslog",
    "priority": 5,
    "enabled": true
  }'
```

**Step 2: Create Event Types**

```bash
# SSH Login Failure
curl -X POST http://localhost:4000/knowledge/event-types \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ssh_failure",
    "search_string": "app_name=sshd message~\"Failed password\"",
    "description": "SSH authentication failures",
    "priority": 10,
    "enabled": true
  }'

# Potential Brute Force
curl -X POST http://localhost:4000/knowledge/event-types \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ssh_brute_force",
    "search_string": "app_name=sshd message~\"Failed password\" | stats count by source_ip | filter count > 5",
    "description": "Potential SSH brute force attack",
    "priority": 5,
    "enabled": true
  }'
```

**Step 3: Create Tags**

```bash
curl -X POST http://localhost:4000/knowledge/tags \
  -H "Content-Type: application/json" \
  -d '{"tag_name": "service:ssh", "field": "app_name", "value": "sshd"}'

curl -X POST http://localhost:4000/knowledge/tags \
  -H "Content-Type: application/json" \
  -d '{"tag_name": "action:denied", "field": "auth_result", "value": "Failed"}'
```

**Step 4: Create IP Reputation Lookup**

```bash
curl -X POST http://localhost:4000/knowledge/lookups \
  -H "Content-Type: application/json" \
  -d '{
    "name": "known_bad_ips",
    "type": "manual",
    "key_field": "ip",
    "output_fields": ["threat_type", "confidence", "first_seen"],
    "data": [
      {"ip": "203.0.113.100", "threat_type": "scanner", "confidence": "high", "first_seen": "2025-01-01"},
      {"ip": "198.51.100.50", "threat_type": "brute_force", "confidence": "medium", "first_seen": "2025-06-15"}
    ],
    "description": "Known malicious IP addresses"
  }'
```

**Step 5: Create Workflow Actions**

```bash
# Investigation action
curl -X POST http://localhost:4000/knowledge/workflow-actions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "SSH Investigation",
    "type": "search",
    "config": {
      "query_template": "search app_name=sshd source_ip=$source_ip$ | stats count by ssh_user auth_result | sort desc count"
    },
    "description": "Investigate SSH activity from this IP",
    "enabled": true
  }'

# Block and alert action
curl -X POST http://localhost:4000/knowledge/workflow-actions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Block & Alert",
    "type": "script",
    "config": {
      "script": "import json\nimport urllib.request\n\nip = get_field(\"source_ip\")\nhostname = get_field(\"hostname\")\ncount = get_field(\"count\", \"unknown\")\n\n# In production: actually block the IP\n# subprocess.run([\"ufw\", \"deny\", \"from\", ip], check=True)\n\n# Send webhook notification\nwebhook_data = {\n    \"text\": f\":rotating_light: SSH Brute Force Blocked\",\n    \"blocks\": [\n        {\n            \"type\": \"section\",\n            \"text\": {\n                \"type\": \"mrkdwn\",\n                \"text\": f\"*Blocked IP:* `{ip}`\\n*Target Host:* {hostname}\\n*Failed Attempts:* {count}\"\n            }\n        }\n    ]\n}\n\nset_output({\n    \"action\": \"block_and_alert\",\n    \"blocked_ip\": ip,\n    \"target_host\": hostname,\n    \"notification_sent\": True,\n    \"firewall_rule\": f\"ufw deny from {ip}\"\n})"
    },
    "description": "Block IP and send alert",
    "enabled": true
  }'
```

**Step 6: Create Detection Dashboard**

Use these searches in your dashboard panels:

```
# Failed SSH attempts over time
search app_name=sshd message~"Failed password" | stats count by timestamp | sort timestamp

# Top attacking IPs
search event_type=ssh_failure | stats count by source_ip | sort desc count | limit 10

# Targeted accounts
search event_type=ssh_failure | stats count by ssh_user | sort desc count | limit 10

# Geographic distribution (after GeoIP enrichment)
search event_type=ssh_failure | stats count by source_country | sort desc count
```

---

## Best Practices

### Field Extraction Best Practices

1. **Start Specific, Then Generalize**
   - Create patterns for your most common log formats first
   - Add catch-all patterns at low priority for edge cases

2. **Test Before Deploy**
   - Always test patterns with real log samples
   - Check for false positives and missed extractions

3. **Use Meaningful Names**
   - `nginx_access` > `pattern1`
   - `ssh_auth_failure` > `ssh`

4. **Document Your Patterns**
   - Add descriptions explaining what each pattern extracts
   - Note any edge cases or limitations

### Event Type Best Practices

1. **Build a Hierarchy**
   - Top level: Severity-based classification
   - Middle level: Category-based (security, network, app)
   - Bottom level: Specific event types

2. **Use Precise Search Strings**
   - Be specific enough to avoid false positives
   - Test with `search ... | limit 10` before committing

3. **Keep Priorities Ordered**
   - Critical events: 1-10
   - Important events: 11-30
   - Standard events: 31-50
   - Catch-all: 51+

### Tag Best Practices

1. **Use Namespaces**
   - `env:production`, `env:staging`
   - `team:platform`, `team:security`
   - `compliance:pci`, `compliance:hipaa`

2. **Keep Tags Consistent**
   - Define a tagging standard for your organization
   - Document all valid tag values

3. **Avoid Over-Tagging**
   - Only tag what you'll actually query
   - Remove unused tags periodically

### Lookup Best Practices

1. **Keep Lookups Current**
   - Review and update regularly
   - Remove stale entries

2. **Use Descriptive Key Fields**
   - `ip_address` > `key`
   - `username` > `id`

3. **Limit Output Fields**
   - Only include fields you'll actually use
   - Large lookups slow down queries

### Workflow Action Best Practices

1. **Start with Search Actions**
   - Easier to debug than scripts
   - Good for building investigation workflows

2. **Test Scripts Thoroughly**
   - Use the test endpoint before production
   - Handle all error cases

3. **Use Timeouts Wisely**
   - External API calls should have timeouts
   - Don't block on slow operations

4. **Log Script Actions**
   - Include logging in complex scripts
   - Track what actions have been taken

---

## Troubleshooting

### Field Extraction Issues

**Problem: Pattern doesn't match**
```bash
# Test your pattern
curl -X POST http://localhost:4000/knowledge/field-extractions/test \
  -H "Content-Type: application/json" \
  -d '{"pattern": "YOUR_PATTERN", "type": "grok", "sample": "YOUR_LOG_LINE"}'
```

**Problem: Regex special characters not escaped**
- Remember to double-escape in JSON: `\\d` not `\d`
- Use raw strings when possible

**Problem: Extraction priority wrong**
- Lower numbers = higher priority
- Check that critical patterns have low priority numbers

### Event Type Issues

**Problem: Events not being classified**
- Verify the search string works standalone
- Check priority ordering (lower = checked first)
- Ensure event type is enabled

**Problem: Too many false positives**
- Make search string more specific
- Add additional filter conditions

### Tag Issues

**Problem: Tags not appearing**
- Verify exact field and value match
- Check that the field exists in your logs
- Tags are case-sensitive

### Lookup Issues

**Problem: Lookup not returning results**
- Check exact key value match
- Verify lookup is populated with data
- Key fields are case-sensitive

### Workflow Action Issues

**Problem: Script timeout**
- Scripts have 30-second timeout
- Add timeout to external API calls
- Optimize slow operations

**Problem: Script output not appearing**
- Ensure `set_output()` is called
- Check for syntax errors
- Look for exceptions in API logs

**Problem: Link URL not substituting**
- Use `$field_name$` syntax (with dollar signs)
- Verify field exists in context
- URL-encode special characters

---

## API Quick Reference

### Field Extractions
```
GET    /knowledge/field-extractions        # List all
POST   /knowledge/field-extractions        # Create
GET    /knowledge/field-extractions/:id    # Get one
PUT    /knowledge/field-extractions/:id    # Update
DELETE /knowledge/field-extractions/:id    # Delete
POST   /knowledge/field-extractions/test   # Test pattern
```

### Event Types
```
GET    /knowledge/event-types              # List all
POST   /knowledge/event-types              # Create
GET    /knowledge/event-types/:id          # Get one
PUT    /knowledge/event-types/:id          # Update
DELETE /knowledge/event-types/:id          # Delete
```

### Tags
```
GET    /knowledge/tags                     # List all
POST   /knowledge/tags                     # Create
GET    /knowledge/tags/:id                 # Get one
PUT    /knowledge/tags/:id                 # Update
DELETE /knowledge/tags/:id                 # Delete
GET    /knowledge/tags/lookup?field=X&value=Y  # Find by field/value
```

### Lookups
```
GET    /knowledge/lookups                  # List all
POST   /knowledge/lookups                  # Create
GET    /knowledge/lookups/:id              # Get one
PUT    /knowledge/lookups/:id              # Update
DELETE /knowledge/lookups/:id              # Delete
GET    /knowledge/lookups/:name/search?key=X  # Lookup by key
```

### Workflow Actions
```
GET    /knowledge/workflow-actions         # List all
POST   /knowledge/workflow-actions         # Create
GET    /knowledge/workflow-actions/:id     # Get one
PUT    /knowledge/workflow-actions/:id     # Update
DELETE /knowledge/workflow-actions/:id     # Delete
POST   /knowledge/workflow-actions/:id/execute  # Execute with context
POST   /knowledge/scripts/test             # Test script code
```

---

## What's Next?

Now that you've mastered Knowledge Management, explore:

- **[Dashboard Guide](./DASHBOARDS.md)** - Visualize your enriched data
- **[Alert Actions Guide](./ALERT-ACTIONS.md)** - Set up automated notifications
- **[DSL Reference](./DSL_REFERENCE.md)** - Advanced query techniques
- **[LogNog Guide](./LOGNOG-GUIDE.md)** - Complete user guide with API reference

---

*Happy LogNoging!* Your logs are now smarter than ever.
