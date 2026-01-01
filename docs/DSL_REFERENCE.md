# LogNog Query Language (DSL) Reference

> **Your Data, Your Way** - Master the art of log searching

The LogNog DSL (Domain Specific Language) is a powerful, Splunk-inspired query language that compiles to ClickHouse SQL. Learn it once, query forever.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Search Command](#search-command)
3. [Filter Commands](#filter-commands)
4. [Stats Command](#stats-command)
5. [Transformation Commands](#transformation-commands)
6. [Output Commands](#output-commands)
7. [Field Reference](#field-reference)
8. [Operators](#operators)
9. [Time Expressions](#time-expressions)
10. [Common Patterns](#common-patterns)
11. [Performance Tips](#performance-tips)

---

## Quick Start

### Basic Query Structure

```
search <conditions> | command1 | command2 | command3
```

Every query starts with `search` and pipes through transformation commands.

### Your First Queries

```bash
# Find all errors
search severity<=3

# Find logs from a specific host
search host=web-server-01

# Find failed logins
search message~"failed password"

# Combine conditions
search host=firewall severity<=4 message~"BLOCK"
```

### The Pipeline Concept

Think of the pipe (`|`) as passing logs through a series of filters:

```
search severity<=3        # Start: all critical logs
| filter host~"prod"      # Keep only production hosts
| stats count by app      # Count by application
| sort desc               # Sort by count descending
| limit 10                # Keep top 10
```

---

## Search Command

The `search` command is your starting point. It filters logs based on field conditions.

### Syntax

```
search <field><operator><value> [<field><operator><value>...]
```

### Supported Operators

| Operator | Meaning | Example |
|----------|---------|---------|
| `=` | Equals | `host=router` |
| `!=` | Not equals | `severity!=6` |
| `>` | Greater than | `severity>4` |
| `>=` | Greater or equal | `bytes>=1000` |
| `<` | Less than | `severity<3` |
| `<=` | Less or equal | `duration<=100` |
| `~` | Contains (regex) | `message~"error"` |
| `!~` | Not contains | `message!~"debug"` |

### Examples

```bash
# Exact match
search hostname=web-server-01

# Numeric comparison
search severity<=3

# Pattern matching (case insensitive)
search message~"failed password"

# Multiple conditions (AND)
search hostname=router severity<=4 app_name=kernel

# Negation
search hostname!=localhost message!~"debug"
```

### Field Aliases

LogNog automatically translates common aliases:

| Alias | Actual Field |
|-------|--------------|
| `host` | `hostname` |
| `app` | `app_name` |
| `src` | `source_ip` |
| `dst` | `dest_ip` |
| `srcport` | `source_port` |
| `dstport` | `dest_port` |
| `msg` | `message` |

So these are equivalent:
```bash
search host=router
search hostname=router
```

---

## Filter Commands

Additional filtering after the initial search.

### filter / where

```
search ... | filter <conditions>
search ... | where <conditions>
```

Same as `search` but used mid-pipeline:

```bash
# Two-stage filtering
search severity<=4 | filter app_name~"nginx"

# Multiple filters
search hostname~"prod" | filter severity<=3 | filter message~"error"
```

---

## Stats Command

Aggregate and summarize your data.

### Syntax

```
stats <function>(<field>) [<function>(<field>)...] [by <field1> [<field2>...]]
```

### Aggregation Functions

| Function | Description | Example |
|----------|-------------|---------|
| `count` | Count events | `stats count` |
| `count(<field>)` | Count non-null values | `stats count(user)` |
| `sum(<field>)` | Sum numeric values | `stats sum(bytes)` |
| `avg(<field>)` | Average | `stats avg(duration)` |
| `min(<field>)` | Minimum value | `stats min(severity)` |
| `max(<field>)` | Maximum value | `stats max(response_time)` |
| `dc(<field>)` | Distinct count | `stats dc(source_ip)` |
| `values(<field>)` | List unique values | `stats values(app_name)` |
| `earliest(<field>)` | First value by time | `stats earliest(message)` |
| `latest(<field>)` | Last value by time | `stats latest(status)` |

### Examples

```bash
# Simple count
search severity<=3 | stats count

# Count by field
search severity<=4 | stats count by hostname

# Multiple aggregations
search app_name=nginx | stats count sum(bytes) avg(duration) by status

# Multiple group-by fields
search severity<=4 | stats count by hostname app_name

# Distinct count
search message~"login" | stats dc(user) by hostname

# Get all unique values
search hostname=router | stats values(source_ip)
```

### Advanced Stats Patterns

```bash
# Top talkers by bytes
search * | stats sum(bytes) as total_bytes by source_ip | sort desc total_bytes | limit 10

# Error rate by application
search * | stats count as total count(severity<=3) as errors by app_name | eval error_rate=errors/total*100

# Unique users per hour (requires time bucketing)
search message~"login" | stats dc(user) by hour(timestamp)
```

---

## Transformation Commands

Reshape and modify your results.

### sort

Order results by field values.

```
sort [asc|desc] [<field>]
```

```bash
# Default: sort by count descending
search ... | stats count by host | sort desc

# Sort by specific field
search ... | stats count by host | sort desc count

# Sort ascending
search ... | sort asc timestamp

# Sort by field name (ascending by default)
search ... | sort timestamp
```

### limit

Restrict number of results.

```
limit <number>
```

```bash
# Top 10 results
search severity<=3 | limit 10

# With stats
search ... | stats count by host | sort desc | limit 5
```

### dedup

Remove duplicate events based on field values.

```
dedup <field1> [<field2>...]
```

```bash
# One event per hostname
search severity<=3 | dedup hostname

# Unique combinations
search message~"error" | dedup hostname app_name

# Dedup with sort (keeps first occurrence)
search ... | sort desc timestamp | dedup source_ip
```

### eval

Create computed fields.

```
eval <new_field>=<expression>
```

```bash
# Simple calculation
search ... | eval duration_sec=duration_ms/1000

# Conditional
search ... | eval status=if(severity<=3, "critical", "normal")

# String concatenation
search ... | eval full_host=hostname + "." + domain
```

---

## Output Commands

Control what fields appear in results.

### table / fields

Select specific fields for output.

```
table <field1> [<field2>...]
fields <field1> [<field2>...]
```

```bash
# Show only specific fields
search severity<=3 | table timestamp hostname message

# With stats
search ... | stats count by hostname app_name | table hostname count
```

### rename

Rename fields in output.

```
rename <old_field> as <new_field>
```

```bash
# Single rename
search ... | rename hostname as host

# Multiple renames
search ... | rename hostname as host app_name as application

# With stats
search ... | stats count by hostname | rename hostname as server count as events
```

---

## Field Reference

### Core Fields

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | DateTime | Event timestamp |
| `hostname` | String | Source hostname |
| `app_name` | String | Application name |
| `message` | String | Log message body |
| `severity` | Int | Syslog severity (0-7) |
| `facility` | Int | Syslog facility |
| `index_name` | String | Index/source type |

### Network Fields

| Field | Type | Description |
|-------|------|-------------|
| `source_ip` | String | Source IP address |
| `source_port` | Int | Source port |
| `dest_ip` | String | Destination IP |
| `dest_port` | Int | Destination port |
| `protocol` | String | Network protocol |
| `action` | String | Allow/deny/etc |

### Extracted Fields

| Field | Type | Description |
|-------|------|-------------|
| `user` | String | Username |
| `url` | String | Request URL |
| `method` | String | HTTP method |
| `status_code` | Int | HTTP status |
| `bytes` | Int | Bytes transferred |
| `duration` | Int | Request duration |
| `request_id` | String | Request identifier |

### Severity Levels

| Value | Level | Use For |
|-------|-------|---------|
| 0 | Emergency | System unusable |
| 1 | Alert | Immediate action needed |
| 2 | Critical | Critical conditions |
| 3 | Error | Error conditions |
| 4 | Warning | Warning conditions |
| 5 | Notice | Normal but significant |
| 6 | Info | Informational |
| 7 | Debug | Debug messages |

**Common Severity Filters:**
```bash
# Critical and above
search severity<=2

# Warnings and above
search severity<=4

# Exclude debug
search severity<=6
```

---

## Operators

### Comparison Operators

```bash
# Equality
field=value
field!=value

# Numeric comparison
field>value
field>=value
field<value
field<=value

# Pattern matching (regex)
field~"pattern"
field!~"pattern"
```

### Pattern Matching

The `~` operator performs regex matching:

```bash
# Contains "error" (case insensitive by default)
message~"error"

# Starts with
message~"^ERROR:"

# Ends with
message~"failed$"

# Complex patterns
message~"user=\w+ action=(login|logout)"

# IP address pattern
source_ip~"192\.168\."

# NOT matching
message!~"debug"
```

### Boolean Logic

Conditions in `search` are implicitly ANDed:

```bash
# This means: hostname=router AND severity<=4
search hostname=router severity<=4
```

For OR logic, use regex alternation:
```bash
# hostname is router OR firewall
search hostname~"^(router|firewall)$"

# message contains error OR warning
search message~"(error|warning)"
```

---

## Time Expressions

### Time Range in UI

The UI provides time picker with:
- Relative: `-15m`, `-1h`, `-24h`, `-7d`, `-30d`
- Absolute: ISO 8601 timestamps

### Time in Queries

```bash
# These are handled by the API time parameters, not DSL
# But you can reference timestamp in sorting:
search severity<=3 | sort desc timestamp | limit 100
```

### Time Bucketing (in stats)

```bash
# Events per hour
search ... | stats count by hour(timestamp)

# Events per day
search ... | stats count by day(timestamp)
```

---

## Common Patterns

### Security Investigations

```bash
# Failed logins last 24 hours
search message~"failed password" | stats count by source_ip | sort desc | limit 20

# Firewall blocks by source
search message~"UFW BLOCK" | stats count by source_ip dest_port | sort desc count

# Privilege escalation attempts
search message~"sudo" user!=root | table timestamp hostname user message

# Brute force detection (>10 failures from same IP)
search message~"authentication failure" | stats count by source_ip | filter count>10
```

### Performance Analysis

```bash
# Slowest requests
search app_name=nginx | sort desc duration | table timestamp url duration status_code | limit 20

# Error rate by endpoint
search app_name=api | stats count count(status_code>=500) as errors by url | eval error_rate=errors/count*100 | sort desc error_rate

# Bytes transferred by host
search * | stats sum(bytes) as total_bytes by hostname | sort desc total_bytes

# Request distribution
search app_name=nginx | stats count by status_code | sort status_code
```

### System Health

```bash
# Services restarting frequently
search message~"(Started|Stopped|Restarting)" | stats count by app_name | sort desc count

# Disk/memory alerts
search severity<=4 message~"(disk|memory|swap)" | table timestamp hostname message

# Kernel errors
search app_name=kernel severity<=3 | dedup message | table timestamp hostname message

# OOM events
search message~"Out of memory" | stats count by hostname
```

### Network Analysis

```bash
# Top talkers
search * | stats sum(bytes) by source_ip | sort desc | limit 10

# Port scanning detection
search action=deny | stats dc(dest_port) as ports_scanned by source_ip | filter ports_scanned>20

# DNS queries
search app_name~"named|dnsmasq" message~"query" | stats count by query_domain | sort desc count

# Connection tracking
search source_ip=192.168.1.100 | stats count by dest_ip dest_port | sort desc count
```

### Log Exploration

```bash
# What applications are logging?
search * | stats count by app_name | sort desc count

# Severity distribution
search * | stats count by severity | sort severity

# Recent errors (any)
search severity<=3 | sort desc timestamp | limit 50 | table timestamp hostname app_name message

# Unique hostnames
search * | stats dc(hostname) values(hostname)
```

---

## Performance Tips

### 1. Filter Early

Put the most restrictive conditions first:

```bash
# Good: severity filter reduces data immediately
search severity<=3 hostname~"prod"

# Less optimal: hostname regex first
search hostname~"prod" severity<=3
```

### 2. Use Exact Matches When Possible

```bash
# Fast: exact match
search hostname=web-server-01

# Slower: regex match
search hostname~"web-server-01"
```

### 3. Limit Large Result Sets

```bash
# Always add limit for exploration
search severity<=4 | limit 1000

# Use stats to summarize instead of returning all rows
search severity<=4 | stats count by hostname
```

### 4. Avoid Expensive Patterns

```bash
# Expensive: leading wildcard
search message~".*error.*"

# Better: no leading wildcard
search message~"error"
```

### 5. Use Dedup Wisely

```bash
# Dedup at the end to reduce output
search severity<=3 | sort desc timestamp | dedup hostname | limit 10
```

### 6. Time Ranges Matter

Always use appropriate time ranges in the UI. Searching all time is expensive.

- Last 15 minutes: Great for real-time monitoring
- Last hour: Good for recent investigations
- Last 24 hours: Standard analysis window
- Last 7 days: Trend analysis
- Beyond 30 days: Use specific time ranges

---

## Query Templates

### Template: Security Dashboard

```bash
# Panel 1: Critical Events
search severity<=2 | stats count

# Panel 2: Auth Failures
search message~"(failed|invalid|denied)" | stats count by source_ip | sort desc | limit 10

# Panel 3: Blocked Connections
search action=deny | stats count by dest_port | sort desc | limit 10

# Panel 4: Unusual Activity
search severity<=4 | stats count by hostname | sort desc | limit 10
```

### Template: Application Health

```bash
# Panel 1: Request Volume
search app_name=nginx | stats count

# Panel 2: Error Rate
search app_name=nginx status_code>=400 | stats count by status_code

# Panel 3: Latency
search app_name=nginx | stats avg(duration) max(duration) p95(duration)

# Panel 4: Top Endpoints
search app_name=nginx | stats count by url | sort desc | limit 10
```

### Template: Infrastructure Overview

```bash
# Panel 1: Hosts Reporting
search * | stats dc(hostname)

# Panel 2: Log Volume by Host
search * | stats count by hostname | sort desc | limit 10

# Panel 3: Severity Distribution
search * | stats count by severity | sort severity

# Panel 4: Top Applications
search * | stats count by app_name | sort desc | limit 10
```

---

## Troubleshooting Queries

### Query Not Returning Results?

1. **Check field names** - Use actual field names, not aliases in complex queries
2. **Check value format** - Strings need quotes in regex: `message~"error"`
3. **Check time range** - Expand your time range
4. **Remove filters** - Start with `search *` and add conditions one at a time

### Query Too Slow?

1. **Narrow time range** - Less data = faster query
2. **Add more filters** - Be specific
3. **Use limit** - Don't return millions of rows
4. **Use stats** - Aggregate instead of returning raw logs

### Parse Errors?

```bash
# Validate your query
curl -X POST http://localhost:4000/search/validate \
  -H "Content-Type: application/json" \
  -d '{"query": "search hostname=router | stats count"}'
```

Common issues:
- Missing quotes around regex patterns
- Using `AND`/`OR` keywords (not supported, use implicit AND or regex alternation)
- Typos in command names

---

## DSL vs SQL

For those familiar with SQL, here's how LogNog DSL maps:

| DSL | SQL Equivalent |
|-----|----------------|
| `search hostname=router` | `WHERE hostname = 'router'` |
| `search severity<=3` | `WHERE severity <= 3` |
| `search message~"error"` | `WHERE message LIKE '%error%'` |
| `\| stats count by hostname` | `GROUP BY hostname` |
| `\| sort desc count` | `ORDER BY count DESC` |
| `\| limit 10` | `LIMIT 10` |
| `\| table field1 field2` | `SELECT field1, field2` |

**Full Example:**

DSL:
```
search hostname~"web" severity<=4 | stats count by app_name | sort desc count | limit 5
```

SQL:
```sql
SELECT app_name, count(*) as count
FROM logs
WHERE hostname LIKE '%web%' AND severity <= 4
GROUP BY app_name
ORDER BY count DESC
LIMIT 5
```

---

*Now go forth and query!*
