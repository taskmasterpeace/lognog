# Spunk Use Cases & Recipes

> **Real-World Solutions for Real-World Problems**

This guide is your cookbook for getting value out of Spunk. Each recipe solves a specific problem you'll encounter in your homelab or small business environment.

---

## Table of Contents

1. [Security Operations](#security-operations)
2. [Network Monitoring](#network-monitoring)
3. [Application Performance](#application-performance)
4. [Infrastructure Health](#infrastructure-health)
5. [Compliance & Auditing](#compliance--auditing)
6. [Home Automation](#home-automation)
7. [Gaming & Media Servers](#gaming--media-servers)
8. [Advanced Workflows](#advanced-workflows)

---

## Security Operations

### Recipe: Brute Force Detection System

**The Problem:** Someone is trying to break into your SSH server, but you don't notice until it's too late.

**The Solution:** Detect and respond to brute force attacks automatically.

#### Step 1: Create Field Extraction

Extract authentication details from SSH logs:

```bash
curl -X POST http://localhost:4000/knowledge/field-extractions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ssh_auth_events",
    "pattern": "%{WORD:auth_result} (password|publickey) for (?:invalid user )?(?<target_user>\\S+) from %{IP:attacker_ip} port %{NUMBER:attacker_port}",
    "type": "grok",
    "source_type": "syslog",
    "priority": 5,
    "enabled": true
  }'
```

#### Step 2: Create Event Type

Define what constitutes a brute force attempt:

```bash
curl -X POST http://localhost:4000/knowledge/event-types \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ssh_brute_force",
    "search_string": "app_name=sshd message~\"Failed password\"",
    "description": "SSH authentication failures indicating potential brute force",
    "priority": 5,
    "enabled": true
  }'
```

#### Step 3: Create Detection Dashboard

**Panel 1: Failed Login Attempts (Gauge)**
```
search app_name=sshd message~"Failed password" | stats count
```

**Panel 2: Top Attacking IPs (Bar Chart)**
```
search app_name=sshd message~"Failed password" | stats count by source_ip | sort desc count | limit 10
```

**Panel 3: Targeted Usernames (Bar Chart)**
```
search app_name=sshd message~"Failed password" | stats count by target_user | sort desc count | limit 10
```

**Panel 4: Attack Timeline (Time Series)**
```
search app_name=sshd message~"Failed password" | stats count by timestamp
```

#### Step 4: Create Automated Response

```bash
curl -X POST http://localhost:4000/knowledge/workflow-actions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Auto-Block Attacker",
    "type": "script",
    "config": {
      "script": "import json\nimport subprocess\n\nip = get_field(\"attacker_ip\") or get_field(\"source_ip\")\n\nif ip:\n    # Check if already blocked\n    # In production, query your firewall state\n    \n    # Block the IP (uncomment for real use)\n    # subprocess.run([\"ufw\", \"deny\", \"from\", ip], check=True)\n    \n    result = {\n        \"action\": \"block\",\n        \"ip\": ip,\n        \"status\": \"simulated\",\n        \"firewall_cmd\": f\"ufw deny from {ip}\"\n    }\nelse:\n    result = {\"error\": \"No IP found in event\"}\n\nset_output(result)"
    },
    "description": "Automatically block IPs after brute force detection",
    "enabled": true
  }'
```

---

### Recipe: Firewall Block Analysis

**The Problem:** Your firewall is blocking stuff, but you don't know if it's legit traffic or attacks.

**The Solution:** Visualize and categorize blocked connections.

#### Field Extraction for UFW/iptables

```bash
curl -X POST http://localhost:4000/knowledge/field-extractions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ufw_block",
    "pattern": "\\[UFW %{WORD:fw_action}\\] IN=%{WORD:interface} OUT=(?<out_interface>\\S*) MAC=(?<mac>\\S+)? ?SRC=%{IP:blocked_src} DST=%{IP:blocked_dst}.*PROTO=%{WORD:blocked_proto}(?:.*SPT=%{NUMBER:blocked_sport})?(?:.*DPT=%{NUMBER:blocked_dport})?",
    "type": "grok",
    "source_type": "syslog",
    "priority": 10,
    "enabled": true
  }'
```

#### Service Lookup Table

```bash
curl -X POST http://localhost:4000/knowledge/lookups \
  -H "Content-Type: application/json" \
  -d '{
    "name": "risky_ports",
    "type": "manual",
    "key_field": "port",
    "output_fields": ["service", "risk", "description"],
    "data": [
      {"port": "22", "service": "SSH", "risk": "high", "description": "Remote shell access"},
      {"port": "23", "service": "Telnet", "risk": "critical", "description": "Unencrypted remote access"},
      {"port": "3389", "service": "RDP", "risk": "high", "description": "Windows remote desktop"},
      {"port": "445", "service": "SMB", "risk": "critical", "description": "Windows file sharing"},
      {"port": "1433", "service": "MSSQL", "risk": "high", "description": "SQL Server"},
      {"port": "3306", "service": "MySQL", "risk": "high", "description": "MySQL database"},
      {"port": "5432", "service": "PostgreSQL", "risk": "high", "description": "PostgreSQL database"},
      {"port": "6379", "service": "Redis", "risk": "critical", "description": "Redis cache (often unauthed)"},
      {"port": "27017", "service": "MongoDB", "risk": "critical", "description": "MongoDB (often unauthed)"},
      {"port": "9200", "service": "Elasticsearch", "risk": "high", "description": "Search engine"}
    ],
    "description": "Commonly attacked ports and their risk levels"
  }'
```

#### Dashboard Queries

```bash
# Blocks by destination port (what are they scanning for?)
search message~"UFW BLOCK" | stats count by blocked_dport | sort desc count | limit 20

# Blocks by source (who is scanning?)
search message~"UFW BLOCK" | stats count by blocked_src | sort desc count | limit 20

# External vs Internal blocks
search message~"UFW BLOCK" blocked_src!~"^(10\\.|192\\.168\\.|172\\.)" | stats count

# High-risk port scans
search message~"UFW BLOCK" blocked_dport~"^(22|23|3389|445|3306|6379)$" | stats count by blocked_dport blocked_src
```

---

### Recipe: Privileged Access Monitoring

**The Problem:** You need to know every time someone uses sudo or accesses sensitive systems.

#### Event Types

```bash
# Sudo usage
curl -X POST http://localhost:4000/knowledge/event-types \
  -H "Content-Type: application/json" \
  -d '{
    "name": "privilege_escalation",
    "search_string": "message~\"sudo\" OR message~\"su:\" OR message~\"pkexec\"",
    "description": "Privilege escalation events",
    "priority": 5,
    "enabled": true
  }'

# Root logins
curl -X POST http://localhost:4000/knowledge/event-types \
  -H "Content-Type: application/json" \
  -d '{
    "name": "root_activity",
    "search_string": "user=root OR message~\"ROOT LOGIN\" OR message~\"session opened for user root\"",
    "description": "Root user activity",
    "priority": 3,
    "enabled": true
  }'
```

#### Alert Workflow

```bash
curl -X POST http://localhost:4000/knowledge/workflow-actions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Privilege Alert",
    "type": "script",
    "config": {
      "script": "import urllib.request\nimport json\n\n# Pushover notification (replace with your keys)\nPUSHOVER_TOKEN = \"your-app-token\"\nPUSHOVER_USER = \"your-user-key\"\n\nmessage = f\"Privilege escalation on {get_field('"'"'hostname'"'"')}\\n\\nUser: {get_field('"'"'user'"'"', '"'"'unknown'"'"')}\\nMessage: {get_field('"'"'message'"'"')[:200]}\"\n\ndata = {\n    \"token\": PUSHOVER_TOKEN,\n    \"user\": PUSHOVER_USER,\n    \"message\": message,\n    \"priority\": 1,\n    \"title\": \"Security Alert\"\n}\n\ntry:\n    req = urllib.request.Request(\n        \"https://api.pushover.net/1/messages.json\",\n        data=json.dumps(data).encode(),\n        headers={\"Content-Type\": \"application/json\"}\n    )\n    with urllib.request.urlopen(req, timeout=10) as resp:\n        set_output({\"status\": \"notification_sent\"})\nexcept Exception as e:\n    set_output({\"error\": str(e)})"
    },
    "description": "Send mobile push notification for privilege escalation",
    "enabled": true
  }'
```

---

## Network Monitoring

### Recipe: Who's Using My Bandwidth?

**The Problem:** Your internet is slow, and you don't know which device is the culprit.

#### Field Extraction for Traffic Logs

```bash
curl -X POST http://localhost:4000/knowledge/field-extractions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "netflow_basic",
    "pattern": "SRC=%{IP:flow_src} DST=%{IP:flow_dst} .*BYTES=(?<flow_bytes>\\d+)",
    "type": "grok",
    "source_type": "netflow",
    "priority": 15,
    "enabled": true
  }'
```

#### Dashboard Queries

```bash
# Top bandwidth consumers (by source IP)
search index_name=netflow | stats sum(flow_bytes) as total_bytes by flow_src | sort desc total_bytes | limit 10

# Top destinations
search index_name=netflow | stats sum(flow_bytes) as total_bytes by flow_dst | sort desc total_bytes | limit 10

# Traffic over time
search index_name=netflow | stats sum(flow_bytes) by timestamp

# Heavy connections
search index_name=netflow | stats sum(flow_bytes) as bytes by flow_src flow_dst | sort desc bytes | limit 20
```

#### Device Lookup

```bash
curl -X POST http://localhost:4000/knowledge/lookups \
  -H "Content-Type: application/json" \
  -d '{
    "name": "network_devices",
    "type": "manual",
    "key_field": "ip",
    "output_fields": ["device_name", "device_type", "location", "owner"],
    "data": [
      {"ip": "192.168.1.1", "device_name": "Main Router", "device_type": "router", "location": "Network Closet", "owner": "Infrastructure"},
      {"ip": "192.168.1.10", "device_name": "Living Room TV", "device_type": "smart_tv", "location": "Living Room", "owner": "Family"},
      {"ip": "192.168.1.11", "device_name": "Gaming PC", "device_type": "desktop", "location": "Office", "owner": "John"},
      {"ip": "192.168.1.12", "device_name": "Work Laptop", "device_type": "laptop", "location": "Mobile", "owner": "John"},
      {"ip": "192.168.1.20", "device_name": "NAS", "device_type": "storage", "location": "Server Room", "owner": "Infrastructure"},
      {"ip": "192.168.1.30", "device_name": "Plex Server", "device_type": "server", "location": "Server Room", "owner": "Media"},
      {"ip": "192.168.1.100", "device_name": "Guest WiFi", "device_type": "network", "location": "All", "owner": "Guest"}
    ],
    "description": "Map IP addresses to friendly device names"
  }'
```

---

### Recipe: DNS Query Analysis

**The Problem:** You want to know what domains your devices are querying (ad tracking? malware?)

#### Field Extraction

```bash
curl -X POST http://localhost:4000/knowledge/field-extractions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "dns_query",
    "pattern": "query\\[(?<query_type>[A-Z]+)\\] (?<query_domain>[\\w.-]+) from %{IP:query_client}",
    "type": "grok",
    "source_type": "syslog",
    "priority": 20,
    "enabled": true
  }'
```

#### Suspicious Domain Detection

```bash
curl -X POST http://localhost:4000/knowledge/lookups \
  -H "Content-Type: application/json" \
  -d '{
    "name": "suspicious_tlds",
    "type": "manual",
    "key_field": "tld",
    "output_fields": ["risk_level", "category"],
    "data": [
      {"tld": ".xyz", "risk_level": "medium", "category": "often_malicious"},
      {"tld": ".top", "risk_level": "high", "category": "phishing"},
      {"tld": ".work", "risk_level": "medium", "category": "spam"},
      {"tld": ".click", "risk_level": "high", "category": "malvertising"},
      {"tld": ".gq", "risk_level": "high", "category": "free_tld_abuse"},
      {"tld": ".ml", "risk_level": "high", "category": "free_tld_abuse"},
      {"tld": ".tk", "risk_level": "high", "category": "free_tld_abuse"}
    ],
    "description": "TLDs often associated with malicious activity"
  }'
```

#### Dashboard Queries

```bash
# Top queried domains
search app_name~"(named|dnsmasq|pihole)" message~"query" | stats count by query_domain | sort desc count | limit 20

# Queries by client
search app_name~"(named|dnsmasq|pihole)" message~"query" | stats count dc(query_domain) as unique_domains by query_client | sort desc count

# Suspicious queries (long random strings often = malware)
search app_name~"(named|dnsmasq|pihole)" query_domain~"[a-z0-9]{20,}" | table timestamp query_client query_domain

# External DNS queries (bypassing your DNS)
search dest_port=53 dest_ip!=192.168.1.1 | stats count by source_ip dest_ip
```

---

### Recipe: DHCP Lease Tracking

**The Problem:** New devices keep appearing on your network and you want to know about them.

#### Field Extraction

```bash
curl -X POST http://localhost:4000/knowledge/field-extractions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "dhcp_lease",
    "pattern": "DHCP(?<dhcp_action>ACK|OFFER|REQUEST|DISCOVER) (?:on )?%{IP:leased_ip} to %{MAC:client_mac}(?: \\((?<client_hostname>[^)]+)\\))?",
    "type": "grok",
    "source_type": "syslog",
    "priority": 20,
    "enabled": true
  }'
```

#### New Device Alert

```bash
curl -X POST http://localhost:4000/knowledge/workflow-actions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New Device Alert",
    "type": "script",
    "config": {
      "script": "import json\n\nmac = get_field(\"client_mac\")\nip = get_field(\"leased_ip\")\nhostname = get_field(\"client_hostname\", \"Unknown\")\n\n# In a real implementation, check against known MAC list\nknown_macs = [\n    \"aa:bb:cc:dd:ee:ff\",\n    \"11:22:33:44:55:66\"\n]\n\nis_known = mac.lower() in [m.lower() for m in known_macs]\n\nresult = {\n    \"mac_address\": mac,\n    \"ip_address\": ip,\n    \"hostname\": hostname,\n    \"is_known_device\": is_known,\n    \"action\": \"none\" if is_known else \"investigate\",\n    \"message\": f\"{'Known' if is_known else 'NEW'} device: {hostname} ({mac}) got IP {ip}\"\n}\n\nset_output(result)"
    },
    "description": "Alert on new unknown devices joining the network",
    "enabled": true
  }'
```

---

## Application Performance

### Recipe: Web Server Health Dashboard

**The Problem:** You're running nginx/Apache and need to know response times and error rates.

#### Field Extraction for Nginx Access Logs

```bash
curl -X POST http://localhost:4000/knowledge/field-extractions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "nginx_access",
    "pattern": "%{IP:client_ip} - (?<remote_user>\\S+) \\[%{HTTPDATE:access_time}\\] \"%{WORD:http_method} (?<request_uri>\\S+) HTTP/%{NUMBER:http_version}\" %{NUMBER:status_code} %{NUMBER:body_bytes}(?: \"%{DATA:referrer}\" \"%{DATA:user_agent}\")?",
    "type": "grok",
    "source_type": "nginx",
    "priority": 10,
    "enabled": true
  }'
```

#### HTTP Status Lookup

```bash
curl -X POST http://localhost:4000/knowledge/lookups \
  -H "Content-Type: application/json" \
  -d '{
    "name": "http_status",
    "type": "manual",
    "key_field": "code",
    "output_fields": ["status_text", "category", "severity"],
    "data": [
      {"code": "200", "status_text": "OK", "category": "success", "severity": "info"},
      {"code": "201", "status_text": "Created", "category": "success", "severity": "info"},
      {"code": "301", "status_text": "Moved Permanently", "category": "redirect", "severity": "info"},
      {"code": "302", "status_text": "Found", "category": "redirect", "severity": "info"},
      {"code": "304", "status_text": "Not Modified", "category": "success", "severity": "info"},
      {"code": "400", "status_text": "Bad Request", "category": "client_error", "severity": "warning"},
      {"code": "401", "status_text": "Unauthorized", "category": "auth_error", "severity": "warning"},
      {"code": "403", "status_text": "Forbidden", "category": "auth_error", "severity": "warning"},
      {"code": "404", "status_text": "Not Found", "category": "client_error", "severity": "info"},
      {"code": "500", "status_text": "Internal Server Error", "category": "server_error", "severity": "error"},
      {"code": "502", "status_text": "Bad Gateway", "category": "server_error", "severity": "error"},
      {"code": "503", "status_text": "Service Unavailable", "category": "server_error", "severity": "error"},
      {"code": "504", "status_text": "Gateway Timeout", "category": "server_error", "severity": "error"}
    ],
    "description": "HTTP status code reference"
  }'
```

#### Dashboard Queries

```bash
# Request volume over time
search app_name=nginx | stats count by timestamp

# Status code distribution
search app_name=nginx | stats count by status_code | sort status_code

# Error rate (4xx + 5xx)
search app_name=nginx status_code>=400 | stats count

# Top requested URLs
search app_name=nginx | stats count by request_uri | sort desc count | limit 20

# Slowest endpoints (if you have duration)
search app_name=nginx | stats avg(request_duration) by request_uri | sort desc | limit 10

# Top clients
search app_name=nginx | stats count by client_ip | sort desc count | limit 10

# Bytes served
search app_name=nginx | stats sum(body_bytes) by request_uri | sort desc | limit 10
```

---

### Recipe: Docker Container Monitoring

**The Problem:** You have containers dying and restarting, but you don't know why.

#### Event Types

```bash
curl -X POST http://localhost:4000/knowledge/event-types \
  -H "Content-Type: application/json" \
  -d '{
    "name": "container_lifecycle",
    "search_string": "app_name=docker message~\"(Created|Started|Stopped|Killed|Died|OOM)\"",
    "description": "Docker container lifecycle events",
    "priority": 10,
    "enabled": true
  }'

curl -X POST http://localhost:4000/knowledge/event-types \
  -H "Content-Type: application/json" \
  -d '{
    "name": "container_oom",
    "search_string": "message~\"OOM\" OR message~\"out of memory\" OR message~\"killed process\"",
    "description": "Out of memory events",
    "priority": 5,
    "enabled": true
  }'
```

#### Dashboard Queries

```bash
# Container restarts
search app_name=docker message~"Started" | stats count by container_name | sort desc count

# OOM kills
search message~"OOM" | stats count by hostname container_name

# Container errors
search app_name~"docker|containerd" severity<=3 | stats count by container_name message

# Health check failures
search message~"health check" message~"(failed|unhealthy)" | table timestamp container_name message
```

---

## Infrastructure Health

### Recipe: Disk Space Monitoring

**The Problem:** Your server ran out of disk space at 3 AM and everything broke.

#### Event Types

```bash
curl -X POST http://localhost:4000/knowledge/event-types \
  -H "Content-Type: application/json" \
  -d '{
    "name": "disk_warning",
    "search_string": "message~\"disk\" message~\"(full|space|quota|exceeded)\"",
    "description": "Disk space warnings",
    "priority": 10,
    "enabled": true
  }'
```

#### Dashboard Queries

```bash
# Disk-related messages
search message~"(disk|space|storage)" severity<=4 | table timestamp hostname message

# Specific filesystems
search message~"/dev/" message~"(full|exceeded)" | stats count by hostname

# Log volume by host (might indicate disk fill)
search * | stats count by hostname | sort desc count
```

---

### Recipe: Service Health Monitoring

**The Problem:** Services crash and you find out hours later.

#### Event Types

```bash
curl -X POST http://localhost:4000/knowledge/event-types \
  -H "Content-Type: application/json" \
  -d '{
    "name": "service_failure",
    "search_string": "message~\"(failed|crash|core dump|segfault|killed)\"",
    "description": "Service failure events",
    "priority": 5,
    "enabled": true
  }'

curl -X POST http://localhost:4000/knowledge/event-types \
  -H "Content-Type: application/json" \
  -d '{
    "name": "service_restart",
    "search_string": "message~\"(Started|Stopped|Restarting)\" app_name=systemd",
    "description": "Service lifecycle via systemd",
    "priority": 15,
    "enabled": true
  }'
```

#### Dashboard Queries

```bash
# Services starting (potential restarts)
search app_name=systemd message~"Started" | stats count by unit | sort desc count

# Service failures
search app_name=systemd message~"Failed" | table timestamp hostname unit message

# Crash indicators
search message~"(segfault|core dumped|killed)" | stats count by hostname app_name
```

---

## Compliance & Auditing

### Recipe: User Access Audit Trail

**The Problem:** You need to prove who accessed what and when.

#### Field Extraction

```bash
curl -X POST http://localhost:4000/knowledge/field-extractions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "linux_audit",
    "pattern": "type=%{WORD:audit_type}.*user=%{USER:audit_user}.*exe=\"(?<audit_exe>[^\"]+)\".*res=(?<audit_result>\\w+)",
    "type": "grok",
    "source_type": "audit",
    "priority": 5,
    "enabled": true
  }'
```

#### Dashboard Queries

```bash
# All user authentications
search message~"session opened" | stats count by user hostname

# Failed access attempts
search message~"(denied|unauthorized|forbidden)" | table timestamp user hostname message

# Sensitive file access (customize path)
search message~"/etc/passwd" OR message~"/etc/shadow" | table timestamp user hostname message

# User command history (if logging sudo)
search app_name=sudo | table timestamp user hostname message
```

---

### Recipe: Configuration Change Tracking

**The Problem:** Someone changed a config and broke production.

#### Event Types

```bash
curl -X POST http://localhost:4000/knowledge/event-types \
  -H "Content-Type: application/json" \
  -d '{
    "name": "config_change",
    "search_string": "message~\"(configuration|config|\.conf|\.cfg)\" message~\"(changed|modified|updated|reloaded)\"",
    "description": "Configuration file changes",
    "priority": 10,
    "enabled": true
  }'
```

#### Dashboard Queries

```bash
# Config changes
search event_type=config_change | table timestamp hostname user message

# Service reloads (often indicates config change)
search message~"reloading configuration" | stats count by hostname app_name

# Specific config files
search message~"(nginx|apache|sshd).conf" | table timestamp hostname message
```

---

## Home Automation

### Recipe: IoT Device Monitoring

**The Problem:** Your smart home devices are chatty and you want to know what they're doing.

#### Device Inventory Lookup

```bash
curl -X POST http://localhost:4000/knowledge/lookups \
  -H "Content-Type: application/json" \
  -d '{
    "name": "iot_devices",
    "type": "manual",
    "key_field": "mac",
    "output_fields": ["device_name", "manufacturer", "device_type", "trusted"],
    "data": [
      {"mac": "AA:BB:CC:DD:EE:01", "device_name": "Philips Hue Bridge", "manufacturer": "Philips", "device_type": "hub", "trusted": "yes"},
      {"mac": "AA:BB:CC:DD:EE:02", "device_name": "Ring Doorbell", "manufacturer": "Ring", "device_type": "camera", "trusted": "yes"},
      {"mac": "AA:BB:CC:DD:EE:03", "device_name": "Nest Thermostat", "manufacturer": "Google", "device_type": "thermostat", "trusted": "yes"},
      {"mac": "AA:BB:CC:DD:EE:04", "device_name": "Smart Plug #1", "manufacturer": "TP-Link", "device_type": "plug", "trusted": "yes"},
      {"mac": "AA:BB:CC:DD:EE:05", "device_name": "Unknown Device", "manufacturer": "Unknown", "device_type": "unknown", "trusted": "no"}
    ],
    "description": "IoT device inventory"
  }'
```

#### Dashboard Queries

```bash
# IoT device traffic
search source_ip~"192\\.168\\.10\\." | stats count by source_ip dest_ip dest_port

# Devices calling home (external traffic)
search source_ip~"192\\.168\\.10\\." dest_ip!~"^(10\\.|192\\.168\\.|172\\.)" | stats count by source_ip dest_ip

# Unusual IoT ports
search source_ip~"192\\.168\\.10\\." dest_port!~"^(80|443|53|123)$" | stats count by source_ip dest_port
```

---

### Recipe: Smart Home Event Correlation

**The Problem:** Your automation does weird things and you can't figure out why.

#### Event Types for Home Assistant

```bash
curl -X POST http://localhost:4000/knowledge/event-types \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ha_automation",
    "search_string": "app_name~\"homeassistant\" message~\"(Triggered|Executing|automation)\"",
    "description": "Home Assistant automation events",
    "priority": 20,
    "enabled": true
  }'

curl -X POST http://localhost:4000/knowledge/event-types \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ha_state_change",
    "search_string": "app_name~\"homeassistant\" message~\"state changed\"",
    "description": "Home Assistant state changes",
    "priority": 25,
    "enabled": true
  }'
```

---

## Gaming & Media Servers

### Recipe: Plex Activity Monitoring

**The Problem:** You want to know who's watching what on your Plex server.

#### Field Extraction for Plex

```bash
curl -X POST http://localhost:4000/knowledge/field-extractions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "plex_activity",
    "pattern": "(?<plex_action>playing|paused|stopped|started) (?<media_title>.+?) for user (?<plex_user>\\w+)",
    "type": "regex",
    "source_type": "plex",
    "priority": 20,
    "enabled": true
  }'
```

#### Dashboard Queries

```bash
# Active streams
search app_name=plex message~"playing" | stats count by plex_user media_title

# User activity
search app_name=plex | stats count by plex_user plex_action

# Popular content
search app_name=plex message~"playing" | stats count by media_title | sort desc count | limit 20

# Transcoding (high CPU)
search app_name=plex message~"transcode" | stats count by plex_user
```

---

### Recipe: Game Server Monitoring

**The Problem:** Your Minecraft/Valheim/whatever server crashes and you need to know why.

#### Event Types

```bash
curl -X POST http://localhost:4000/knowledge/event-types \
  -H "Content-Type: application/json" \
  -d '{
    "name": "gameserver_crash",
    "search_string": "app_name~\"(minecraft|valheim|ark|rust)\" message~\"(crash|exception|error|failed)\"",
    "description": "Game server crashes and errors",
    "priority": 5,
    "enabled": true
  }'

curl -X POST http://localhost:4000/knowledge/event-types \
  -H "Content-Type: application/json" \
  -d '{
    "name": "gameserver_player",
    "search_string": "app_name~\"(minecraft|valheim)\" message~\"(joined|left|connected|disconnected)\"",
    "description": "Player join/leave events",
    "priority": 20,
    "enabled": true
  }'
```

#### Dashboard Queries

```bash
# Player activity
search event_type=gameserver_player | stats count by player_name action

# Server errors
search app_name~"(minecraft|valheim)" severity<=3 | table timestamp message

# Concurrent players over time
search message~"joined" | stats count by timestamp
```

---

## Advanced Workflows

### Recipe: Multi-Stage Threat Response

**The Problem:** You want automated threat response but with human approval.

#### Workflow: Investigate → Assess → Alert → Block

```bash
# Stage 1: Investigation search action
curl -X POST http://localhost:4000/knowledge/workflow-actions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "1. Deep Investigation",
    "type": "search",
    "config": {
      "query_template": "search source_ip=$source_ip$ | stats count dc(dest_port) as ports_scanned dc(hostname) as hosts_targeted earliest(timestamp) as first_seen latest(timestamp) as last_seen by source_ip"
    },
    "description": "Stage 1: Gather comprehensive data about this IP",
    "enabled": true
  }'

# Stage 2: Threat assessment script
curl -X POST http://localhost:4000/knowledge/workflow-actions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "2. Threat Assessment",
    "type": "script",
    "config": {
      "script": "import json\nimport urllib.request\n\nip = get_field(\"source_ip\")\nscore = 0\nindicators = []\n\n# Check if IP is in known bad list (mock)\nbad_ips = [\"203.0.113.100\", \"198.51.100.50\"]\nif ip in bad_ips:\n    score += 50\n    indicators.append(\"Known malicious IP\")\n\n# Check event patterns\nif int(get_field(\"ports_scanned\", \"0\")) > 10:\n    score += 30\n    indicators.append(f\"Port scanning ({get_field('"'"'ports_scanned'"'"')} ports)\")\n\nif int(get_field(\"hosts_targeted\", \"0\")) > 3:\n    score += 20\n    indicators.append(f\"Multi-host targeting ({get_field('"'"'hosts_targeted'"'"')} hosts)\")\n\nseverity_count = int(get_field(\"severity_count\", \"0\"))\nif severity_count > 100:\n    score += 25\n    indicators.append(f\"High event volume ({severity_count} events)\")\n\nif score >= 70:\n    recommendation = \"BLOCK IMMEDIATELY\"\n    threat_level = \"CRITICAL\"\nelif score >= 40:\n    recommendation = \"INVESTIGATE FURTHER\"\n    threat_level = \"HIGH\"\nelse:\n    recommendation = \"MONITOR\"\n    threat_level = \"MEDIUM\"\n\nset_output({\n    \"ip\": ip,\n    \"threat_score\": score,\n    \"threat_level\": threat_level,\n    \"indicators\": indicators,\n    \"recommendation\": recommendation\n})"
    },
    "description": "Stage 2: Score threat level based on multiple indicators",
    "enabled": true
  }'

# Stage 3: Alert with context
curl -X POST http://localhost:4000/knowledge/workflow-actions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "3. Send Alert",
    "type": "script",
    "config": {
      "script": "import urllib.request\nimport json\n\n# Discord webhook (replace with yours)\nWEBHOOK_URL = \"https://discord.com/api/webhooks/YOUR/WEBHOOK\"\n\nip = get_field(\"source_ip\")\nthreat_level = get_field(\"threat_level\", \"UNKNOWN\")\n\ncolor = {\"CRITICAL\": 0xFF0000, \"HIGH\": 0xFFA500, \"MEDIUM\": 0xFFFF00}.get(threat_level, 0x808080)\n\nembed = {\n    \"title\": f\"Threat Alert: {threat_level}\",\n    \"description\": f\"Suspicious activity from **{ip}**\",\n    \"color\": color,\n    \"fields\": [\n        {\"name\": \"Threat Score\", \"value\": get_field(\"threat_score\", \"?\"), \"inline\": True},\n        {\"name\": \"Recommendation\", \"value\": get_field(\"recommendation\", \"Review\"), \"inline\": True},\n        {\"name\": \"Indicators\", \"value\": get_field(\"indicators\", \"None\"), \"inline\": False}\n    ]\n}\n\nmessage = {\"embeds\": [embed]}\n\ntry:\n    req = urllib.request.Request(\n        WEBHOOK_URL,\n        data=json.dumps(message).encode(),\n        headers={\"Content-Type\": \"application/json\"}\n    )\n    with urllib.request.urlopen(req, timeout=10) as resp:\n        set_output({\"status\": \"alert_sent\", \"channel\": \"discord\"})\nexcept Exception as e:\n    set_output({\"error\": str(e)})"
    },
    "description": "Stage 3: Send formatted alert to Discord",
    "enabled": true
  }'

# Stage 4: Block action
curl -X POST http://localhost:4000/knowledge/workflow-actions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "4. Block IP",
    "type": "script",
    "config": {
      "script": "import subprocess\nimport json\nimport datetime\n\nip = get_field(\"source_ip\")\nthreat_level = get_field(\"threat_level\", \"\")\n\nif threat_level != \"CRITICAL\":\n    set_output({\"status\": \"skipped\", \"reason\": f\"Threat level {threat_level} does not require auto-block\"})\nelse:\n    # Uncomment to actually block\n    # result = subprocess.run([\"ufw\", \"deny\", \"from\", ip], capture_output=True)\n    \n    block_record = {\n        \"action\": \"firewall_block\",\n        \"ip\": ip,\n        \"timestamp\": datetime.datetime.now().isoformat(),\n        \"reason\": f\"Auto-blocked: threat level {threat_level}\",\n        \"status\": \"simulated\",\n        \"command\": f\"ufw deny from {ip}\"\n    }\n    \n    set_output(block_record)"
    },
    "description": "Stage 4: Block IP if threat level is CRITICAL",
    "enabled": true
  }'
```

---

### Recipe: Log Enrichment Pipeline

**The Problem:** You want to automatically enrich logs with external data.

#### GeoIP Enrichment Workflow

```bash
curl -X POST http://localhost:4000/knowledge/workflow-actions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GeoIP Enrich",
    "type": "script",
    "config": {
      "script": "import urllib.request\nimport json\n\nip = get_field(\"source_ip\") or get_field(\"dest_ip\") or get_field(\"client_ip\")\n\nif not ip or ip.startswith((\"10.\", \"192.168.\", \"172.\")):\n    set_output({\"status\": \"skipped\", \"reason\": \"Private IP or no IP found\"})\nelse:\n    try:\n        with urllib.request.urlopen(f\"http://ip-api.com/json/{ip}?fields=status,country,regionName,city,isp,org,as,lat,lon\", timeout=5) as resp:\n            data = json.loads(resp.read())\n            if data.get(\"status\") == \"success\":\n                set_output({\n                    \"ip\": ip,\n                    \"geo\": {\n                        \"country\": data.get(\"country\"),\n                        \"region\": data.get(\"regionName\"),\n                        \"city\": data.get(\"city\"),\n                        \"lat\": data.get(\"lat\"),\n                        \"lon\": data.get(\"lon\")\n                    },\n                    \"network\": {\n                        \"isp\": data.get(\"isp\"),\n                        \"org\": data.get(\"org\"),\n                        \"asn\": data.get(\"as\")\n                    }\n                })\n            else:\n                set_output({\"error\": \"GeoIP lookup failed\"})\n    except Exception as e:\n        set_output({\"error\": str(e)})"
    },
    "description": "Enrich log with GeoIP data for source IP",
    "enabled": true
  }'
```

---

## Putting It All Together

### The Ultimate Homelab Dashboard

Create a dashboard with these panels:

| Panel | Query | Visualization |
|-------|-------|---------------|
| Log Volume | `search * \| stats count` | Gauge |
| Error Rate | `search severity<=3 \| stats count` | Gauge (red) |
| Volume by Host | `search * \| stats count by hostname` | Bar Chart |
| Severity Dist | `search * \| stats count by severity` | Pie Chart |
| Timeline | `search * \| stats count by timestamp` | Time Series |
| Top Apps | `search * \| stats count by app_name \| limit 10` | Bar Chart |
| Recent Errors | `search severity<=3 \| limit 20` | Table |
| Security Events | `search event_type~"security" \| stats count` | Gauge |

---

## Template Collection

Copy these ready-to-use templates:

### Security Template
```bash
# Critical alerts
search severity<=2 | table timestamp hostname message

# Auth failures (last hour)
search message~"(failed|invalid|denied)" | stats count by source_ip | sort desc

# Blocked connections
search message~"BLOCK" | stats count by source_ip dest_port | sort desc count | limit 20
```

### Performance Template
```bash
# Slow queries
search duration>1000 | table timestamp hostname duration message

# Error rate by service
search * | stats count count(severity<=3) as errors by app_name | sort desc errors

# Request volume
search app_name=nginx | stats count by timestamp
```

### Infrastructure Template
```bash
# Host health
search severity<=4 | stats count by hostname | sort desc count

# Service restarts
search message~"Started" app_name=systemd | stats count by unit | sort desc count

# Disk/Memory alerts
search message~"(disk|memory|swap)" severity<=4 | table timestamp hostname message
```

---

*Build something awesome! These recipes are just the beginning.*
