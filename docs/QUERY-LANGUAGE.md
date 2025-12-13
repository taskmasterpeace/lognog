# LogNog Query Language - Complete Reference

**Version 1.0** | Last Updated: December 2025

Welcome to the LogNog Query Language (LQL) complete reference. This comprehensive guide covers every command, operator, function, and feature available in the LogNog query language.

---

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Basic Searching](#basic-searching)
4. [Filtering & Transforming](#filtering--transforming)
5. [Aggregations & Statistics](#aggregations--statistics)
6. [Eval Functions](#eval-functions)
7. [Advanced Commands](#advanced-commands)
8. [Use Case Examples](#use-case-examples)
9. [Command Reference](#command-reference)
10. [Function Reference](#function-reference)

---

## Introduction

### What is the LogNog Query Language?

LogNog Query Language (LQL) is a Splunk-inspired DSL designed for querying and analyzing log data. It compiles to optimized ClickHouse SQL (or SQLite for LogNog Lite) under the hood, giving you the power of a columnar database with the simplicity of a pipe-based query syntax.

**Key Features:**
- **Pipe-based**: Chain commands together with `|` for intuitive data flow
- **Fast compilation**: <3ms parse overhead, hand-written recursive descent parser
- **Rich functions**: 50+ built-in functions for math, strings, and aggregations
- **Smart optimization**: Automatically generates optimized SQL with proper indexes
- **No SQL required**: Write queries in a simple, readable format

### Architecture

```
Your Query (LQL)
    ↓
Lexer → Parser → AST
    ↓
Compiler
    ↓
ClickHouse SQL (or SQLite)
    ↓
Results
```

---

## Getting Started

### Your First Search

The simplest query searches all logs:

```
search *
```

This returns the most recent 1000 logs (default limit) ordered by timestamp descending.

### Understanding Log Fields

Every log event in LogNog has these standard fields:

| Field | Type | Description | Aliases |
|-------|------|-------------|---------|
| `timestamp` | DateTime | When the log was created | `time`, `_time` |
| `hostname` | String | Source host | `host`, `source` |
| `app_name` | String | Application name | `app`, `program`, `sourcetype` |
| `severity` | UInt8 | Syslog severity (0-7) | `level` |
| `facility` | UInt8 | Syslog facility code | - |
| `message` | String | Log message content | `msg` |
| `raw` | String | Original raw message | `_raw` |
| `priority` | UInt16 | Syslog priority | - |
| `source_ip` | IPv4 | Source IP address | - |
| `dest_ip` | IPv4 | Destination IP | - |
| `source_port` | UInt16 | Source port | - |
| `dest_port` | UInt16 | Destination port | - |
| `protocol` | String | Network protocol | - |
| `action` | String | Action taken (e.g., allow, block) | - |
| `user` | String | Username | - |

### Time Range Selection

While time ranges are typically set in the UI, you can use time-based filtering in queries:

```
search timestamp >= "2025-12-01" timestamp < "2025-12-02"
```

---

## Basic Searching

### Field-Value Searches

Search for exact field matches:

```
search host=router
search app_name=nginx
search severity=3
```

### Wildcards

Use `*` for wildcard matching:

```
search host=web*           # Matches web01, web02, webserver, etc.
search app_name=*sql       # Matches mysql, postgresql, etc.
search host=*              # Match all (any value)
```

### Comparison Operators

Compare numeric or string values:

| Operator | Description | Example |
|----------|-------------|---------|
| `=` | Equal to | `severity=3` |
| `!=` | Not equal to | `severity!=6` |
| `<` | Less than | `severity<4` |
| `<=` | Less than or equal | `severity<=3` |
| `>` | Greater than | `severity>4` |
| `>=` | Greater than or equal | `severity>=warning` |

**Severity Name Support:**

You can use severity names instead of numbers:

```
search severity>=warning
search severity<=error
search severity=debug
```

Severity mapping:
- 0: emergency, emerg
- 1: alert
- 2: critical, crit
- 3: error, err
- 4: warning, warn
- 5: notice
- 6: info, informational
- 7: debug

### Contains/Regex Operator (`~`)

Search for text within fields:

```
search message~"error"                    # Contains "error"
search message~"connection*timeout"       # Wildcard pattern
search app_name~"web"                     # Contains "web"
```

The `~` operator uses case-insensitive matching and supports wildcards.

### Multiple Conditions

#### Implicit AND

Space-separated conditions are ANDed together:

```
search host=router severity>=warning
# Returns logs from router with severity warning or higher
```

#### Explicit AND

```
search host=router AND severity=3
```

#### OR Logic

```
search severity=0 OR severity=1 OR severity=2
search host=web01 OR host=web02
```

#### NOT Logic

Negate conditions with `NOT`:

```
search NOT severity=7                    # Exclude debug logs
search host=router NOT message~"keepalive"
```

#### Complex Logic with Parentheses

```
search (host=router OR host=firewall) AND severity<=3
search app_name=nginx AND (severity<=3 OR message~"timeout")
```

### Implicit Search

You can omit the `search` keyword for simple queries:

```
host=router severity>=warning
# Same as: search host=router severity>=warning
```

---

## Filtering & Transforming

### filter / where

Add additional filtering after initial search:

```
search * | filter app_name=nginx
search * | where severity<=3
search * | filter NOT message~"keepalive"
```

`filter` and `where` are aliases - they work identically.

### table

Select specific fields to display:

```
search * | table timestamp hostname message
search * | table timestamp severity app_name message
```

### fields

Include or exclude fields (alternative to `table`):

```
# Include only these fields
search * | fields timestamp hostname message

# Exclude fields (use - prefix)
search * | fields - raw structured_data
```

### rename

Rename fields in output:

```
search * | rename hostname as host
search * | rename hostname as host, app_name as application
```

### dedup

Remove duplicate results based on field values:

```
search * | dedup hostname                    # One result per hostname
search * | dedup hostname app_name           # One per host/app combo
```

### sort

Order results by one or more fields:

```
search * | sort desc timestamp               # Descending (newest first)
search * | sort asc severity                 # Ascending
search * | sort desc severity, asc hostname  # Multiple fields

# Sort at start applies to all fields
search * | sort desc hostname timestamp
```

### limit / head

Limit the number of results:

```
search * | limit 100
search * | head 50
```

### tail

Get the last N results:

```
search * | tail 20
```

---

## Aggregations & Statistics

### stats Command

The `stats` command performs aggregations on your data:

```
stats <aggregation> [as <alias>] [, <aggregation> ...] [by <field> [, <field> ...]]
```

### Basic Aggregations

#### count

Count events:

```
search * | stats count                       # Total count
search * | stats count by hostname           # Count per host
search * | stats count as total              # With alias
```

#### sum

Sum numeric values:

```
search * | stats sum(bytes)
search * | stats sum(bytes) as total_bytes
search * | stats sum(bytes) by hostname
```

#### avg

Calculate average:

```
search * | stats avg(response_time)
search * | stats avg(bytes) by app_name
```

#### min / max

Find minimum or maximum values:

```
search * | stats min(response_time)
search * | stats max(bytes)
search * | stats min(timestamp) as earliest, max(timestamp) as latest
```

#### dc (distinct count)

Count unique values:

```
search * | stats dc(hostname)                # Number of unique hosts
search * | stats dc(source_ip) by hostname   # Unique IPs per host
```

### Advanced Aggregations

#### values

Get array of unique values:

```
search * | stats values(hostname)            # Array of unique hostnames
search * | stats values(app_name) by hostname
```

#### list

Get array of all values (including duplicates):

```
search * | stats list(message) by hostname
search * | stats list(timestamp)
```

#### earliest / latest

Get earliest or latest value by timestamp:

```
search * | stats earliest(message)           # First message chronologically
search * | stats latest(message)             # Most recent message
search * | stats earliest(severity) by hostname
```

#### first / last

Get first or last value (by query order, not time):

```
search * | stats first(message)
search * | stats last(message)
```

### Statistical Aggregations

#### median

Calculate median value:

```
search * | stats median(response_time)
search * | stats median(bytes) by app_name
```

#### mode

Find most common value:

```
search * | stats mode(severity)
search * | stats mode(hostname)
```

#### stddev

Calculate standard deviation:

```
search * | stats stddev(response_time)
search * | stats stddev(bytes) by hostname
```

#### variance

Calculate variance:

```
search * | stats variance(response_time)
```

#### range

Calculate range (max - min):

```
search * | stats range(bytes)
search * | stats range(response_time) by endpoint
```

### Percentiles

Calculate percentile values:

```
search * | stats p50(response_time)          # 50th percentile (median)
search * | stats p90(response_time)          # 90th percentile
search * | stats p95(response_time)          # 95th percentile
search * | stats p99(response_time)          # 99th percentile
```

Percentiles are great for SLA monitoring:

```
search app_name=api
  | stats p50(response_time) as median,
          p95(response_time) as p95,
          p99(response_time) as p99
  by endpoint
```

### Multiple Aggregations

Combine multiple aggregations:

```
search *
  | stats count,
          sum(bytes) as total_bytes,
          avg(response_time) as avg_response,
          p95(response_time) as p95_response
  by hostname
```

### Grouping with "by"

Group results by one or more fields:

```
search * | stats count by hostname
search * | stats count by hostname, app_name
search * | stats avg(bytes) by source_ip, dest_ip
```

### Aliases

Name aggregation results:

```
search * | stats count as total
search * | stats count as events, dc(hostname) as hosts
search * | stats avg(response_time) as avg_ms by endpoint
```

---

## Eval Functions

The `eval` command creates new fields using expressions and functions.

### Syntax

```
eval <field>=<expression> [, <field>=<expression> ...]
```

### Math Functions

#### abs

Absolute value:

```
eval abs_value=abs(temperature)
eval diff=abs(actual - expected)
```

#### round

Round to nearest integer or N decimal places:

```
eval rounded=round(value)
eval rounded=round(value, 2)              # 2 decimal places
```

#### floor / ceil

Round down or up:

```
eval floored=floor(value)
eval ceiled=ceil(value)
```

#### sqrt

Square root:

```
eval distance=sqrt(pow(x, 2) + pow(y, 2))
```

#### pow

Raise to power:

```
eval squared=pow(value, 2)
eval cubed=pow(value, 3)
```

#### log / log10 / exp

Logarithms and exponential:

```
eval ln_value=log(value)                  # Natural log
eval log_value=log10(value)               # Base 10
eval exp_value=exp(value)                 # e^value
```

### String Functions

#### len / length

String length:

```
eval msg_length=len(message)
eval hostname_len=length(hostname)
```

#### lower / upper

Case conversion:

```
eval lowercase=lower(message)
eval uppercase=upper(hostname)
```

#### substr / substring

Extract substring:

```
eval first_10=substr(message, 0, 10)
eval from_pos_5=substr(message, 5)
```

#### trim / ltrim / rtrim

Remove whitespace:

```
eval cleaned=trim(message)                # Both sides
eval cleaned=ltrim(message)               # Left side
eval cleaned=rtrim(message)               # Right side
```

#### replace

Replace text:

```
eval cleaned=replace(message, "ERROR", "WARN")
eval path=replace(url, "/api/", "/v2/")
```

#### split

Split string and get element:

```
eval first_word=split(message, " ", 0)
eval second_word=split(message, " ", 1)
# Returns array if no index specified
```

#### concat

Concatenate strings:

```
eval full_name=concat(first_name, " ", last_name)
eval url=concat("https://", hostname, "/", path)
```

### Conditional Functions

#### if

Conditional expression:

```
eval level=if(severity <= 3, "high", "low")
eval status=if(code >= 200 AND code < 300, "success", "failure")
```

#### coalesce

Return first non-null value:

```
eval host=coalesce(hostname, source, "unknown")
eval app=coalesce(app_name, program, "default")
```

#### nullif

Return null if values are equal:

```
eval clean_value=nullif(value, 0)
eval result=nullif(current, previous)
```

#### case

Multi-way conditional:

```
eval category=case(
  severity,
  0, "critical",
  1, "critical",
  2, "critical",
  3, "error",
  4, "warning",
  "info"
)
```

### Arithmetic Operators

```
eval total=bytes_sent + bytes_received
eval difference=actual - expected
eval product=price * quantity
eval average=total / count
eval remainder=value % 10
```

### Examples

```
# Calculate response time category
search app_name=api
  | eval category=if(response_time < 100, "fast",
                     if(response_time < 500, "normal", "slow"))
  | stats count by category

# Extract domain from email
search message~"@"
  | eval domain=split(email, "@", 1)
  | stats count by domain

# Calculate error rate
search app_name=nginx
  | eval is_error=if(status >= 400, 1, 0)
  | stats sum(is_error) as errors, count as total
  | eval error_rate=(errors / total) * 100
```

---

## Advanced Commands

### top

Find the top N most common values:

```
search * | top 10 hostname                   # Top 10 hosts by count
search * | top 5 app_name
search * | top 20 source_ip
```

This is shorthand for:
```
stats count by <field> | sort desc count | limit N
```

### rare

Find the rarest N values:

```
search * | rare 10 hostname                  # 10 least common hosts
search * | rare 5 app_name
```

Shorthand for:
```
stats count by <field> | sort asc count | limit N
```

### bin

Create time buckets or numeric bins:

```
# Time bucketing
search * | bin span=1h timestamp
search * | bin span=5m timestamp
search * | bin span=1d timestamp

# Numeric bucketing
search * | bin span=100 bytes
search * | bin span=50 response_time
```

Time span units:
- `s`: seconds
- `m`: minutes
- `h`: hours
- `d`: days

Example:
```
search *
  | bin span=1h timestamp
  | stats count by time_bucket
```

### timechart

Aggregate data over time buckets:

```
# Count over time
search * | timechart span=1h count

# Multiple aggregations
search *
  | timechart span=5m count, avg(response_time), max(bytes)

# Split by field
search * | timechart span=1h count by hostname
search * | timechart span=30m avg(cpu) by server
```

### rex

Extract fields using regular expressions with named groups:

```
# Extract username from message
search *
  | rex field=message "user=(?P<username>\\w+)"

# Extract multiple fields
search *
  | rex field=message "ip=(?P<ip>[0-9.]+) port=(?P<port>\\d+)"

# Default field is "message"
search *
  | rex "status=(?P<status>\\d+)"
```

Named groups in the regex pattern become new fields.

---

## Use Case Examples

### Security Monitoring

#### Failed Login Attempts

```
search app_name=sshd message~"Failed"
  | stats count by source_ip, user
  | sort desc count
  | limit 20
```

#### Brute Force Detection

```
search app_name=sshd message~"Failed"
  | bin span=5m timestamp
  | stats count by time_bucket, source_ip
  | where count > 10
  | sort desc count
```

#### Firewall Blocks by Country

```
search app_name=firewall action=block
  | stats count by source_ip
  | sort desc count
  | limit 100
```

#### Privilege Escalation

```
search message~"sudo" OR message~"su "
  | table timestamp hostname user message
  | sort desc timestamp
```

### Performance Analysis

#### Slow API Endpoints

```
search app_name=api
  | stats p50(response_time) as median,
          p95(response_time) as p95,
          p99(response_time) as p99,
          max(response_time) as max
  by endpoint
  | sort desc p95
```

#### Response Time Distribution

```
search app_name=api
  | eval bucket=case(
      response_time,
      100, "0-100ms",
      500, "100-500ms",
      1000, "500ms-1s",
      "1s+"
    )
  | stats count by bucket
```

#### Database Query Performance

```
search app_name=postgres message~"duration"
  | rex field=message "duration: (?P<duration>\\d+) ms"
  | eval duration_num=tonumber(duration)
  | stats avg(duration_num) as avg_ms,
          p95(duration_num) as p95_ms,
          count
  by query_type
```

### Error Tracking

#### Error Rate by Application

```
search *
  | eval is_error=if(severity <= 3, 1, 0)
  | stats sum(is_error) as errors,
          count as total,
          (sum(is_error) / count * 100) as error_rate
  by app_name
  | sort desc error_rate
```

#### Error Trends Over Time

```
search severity<=3
  | timechart span=1h count by app_name
```

#### Unique Error Messages

```
search severity<=3
  | stats dc(message) as unique_errors,
          count as total_errors,
          values(message) as error_samples
  by app_name
```

### User Activity

#### Active Users

```
search message~"login"
  | rex field=message "user=(?P<username>\\w+)"
  | stats dc(username) as unique_users,
          count as total_logins
  by hostname
```

#### User Session Duration

```
search message~"login" OR message~"logout"
  | stats earliest(timestamp) as start,
          latest(timestamp) as end
  by user
  | eval duration=end - start
  | sort desc duration
```

### Infrastructure Monitoring

#### Disk Usage Alerts

```
search message~"disk" AND message~"%"
  | rex field=message "(?P<usage>\\d+)%"
  | eval usage_num=tonumber(usage)
  | where usage_num > 80
  | table timestamp hostname usage
```

#### Memory Leaks

```
search message~"memory" OR message~"oom"
  | timechart span=1h count by hostname
```

#### Network Traffic Analysis

```
search protocol=* source_ip=*
  | stats count as connections,
          sum(bytes) as total_bytes
  by source_ip, dest_ip, protocol
  | sort desc total_bytes
  | limit 50
```

---

## Command Reference

### Quick Reference Table

| Command | Purpose | Example |
|---------|---------|---------|
| `search` | Filter logs | `search host=router severity>=3` |
| `filter`, `where` | Additional filtering | `filter app_name=nginx` |
| `stats` | Aggregate data | `stats count by hostname` |
| `eval` | Create computed fields | `eval total=sent + received` |
| `table` | Select fields | `table timestamp host message` |
| `fields` | Include/exclude fields | `fields timestamp hostname` |
| `rename` | Rename fields | `rename host as server` |
| `sort` | Order results | `sort desc count` |
| `limit`, `head` | Limit results | `limit 100` |
| `tail` | Last N results | `tail 50` |
| `dedup` | Remove duplicates | `dedup hostname` |
| `top` | Top N values | `top 10 hostname` |
| `rare` | Rarest N values | `rare 10 app_name` |
| `bin` | Create buckets | `bin span=1h timestamp` |
| `timechart` | Time-based aggregation | `timechart span=5m count` |
| `rex` | Regex extraction | `rex "user=(?P<user>\\w+)"` |

### Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `=` | Equal | `severity=3` |
| `!=` | Not equal | `severity!=7` |
| `<` | Less than | `severity<4` |
| `<=` | Less than or equal | `severity<=3` |
| `>` | Greater than | `severity>4` |
| `>=` | Greater than or equal | `severity>=warning` |
| `~` | Contains/regex | `message~"error"` |
| `AND` | Logical AND | `host=a AND severity=3` |
| `OR` | Logical OR | `severity=0 OR severity=1` |
| `NOT` | Logical NOT | `NOT message~"debug"` |

---

## Function Reference

### Aggregation Functions

| Function | Description | Example |
|----------|-------------|---------|
| `count()` | Count events | `stats count` |
| `sum(field)` | Sum values | `stats sum(bytes)` |
| `avg(field)` | Average | `stats avg(response_time)` |
| `min(field)` | Minimum | `stats min(timestamp)` |
| `max(field)` | Maximum | `stats max(bytes)` |
| `dc(field)` | Distinct count | `stats dc(hostname)` |
| `values(field)` | Unique values | `stats values(app_name)` |
| `list(field)` | All values | `stats list(message)` |
| `earliest(field)` | First by time | `stats earliest(message)` |
| `latest(field)` | Last by time | `stats latest(message)` |
| `first(field)` | First by order | `stats first(value)` |
| `last(field)` | Last by order | `stats last(value)` |
| `median(field)` | Median value | `stats median(latency)` |
| `mode(field)` | Most common | `stats mode(severity)` |
| `stddev(field)` | Standard deviation | `stats stddev(response)` |
| `variance(field)` | Variance | `stats variance(bytes)` |
| `range(field)` | Max - min | `stats range(temperature)` |
| `p50(field)` | 50th percentile | `stats p50(latency)` |
| `p90(field)` | 90th percentile | `stats p90(latency)` |
| `p95(field)` | 95th percentile | `stats p95(latency)` |
| `p99(field)` | 99th percentile | `stats p99(latency)` |

### Math Functions

| Function | Description | Example |
|----------|-------------|---------|
| `abs(x)` | Absolute value | `eval a=abs(-5)` |
| `round(x[,n])` | Round to n decimals | `eval r=round(3.7, 1)` |
| `floor(x)` | Round down | `eval f=floor(3.9)` |
| `ceil(x)` | Round up | `eval c=ceil(3.1)` |
| `sqrt(x)` | Square root | `eval s=sqrt(16)` |
| `pow(x,y)` | Power | `eval p=pow(2, 3)` |
| `log(x)` | Natural log | `eval l=log(10)` |
| `log10(x)` | Base-10 log | `eval l=log10(100)` |
| `exp(x)` | e^x | `eval e=exp(2)` |

### String Functions

| Function | Description | Example |
|----------|-------------|---------|
| `len(s)` | String length | `eval l=len(message)` |
| `lower(s)` | Lowercase | `eval l=lower(host)` |
| `upper(s)` | Uppercase | `eval u=upper(app)` |
| `substr(s,pos[,len])` | Substring | `eval sub=substr(msg,0,10)` |
| `trim(s)` | Trim whitespace | `eval t=trim(message)` |
| `ltrim(s)` | Trim left | `eval t=ltrim(msg)` |
| `rtrim(s)` | Trim right | `eval t=rtrim(msg)` |
| `replace(s,old,new)` | Replace text | `eval r=replace(m,"a","b")` |
| `split(s,delim,idx)` | Split and get element | `eval w=split(msg," ",0)` |
| `concat(s1,s2,...)` | Concatenate | `eval f=concat(a," ",b)` |

### Conditional Functions

| Function | Description | Example |
|----------|-------------|---------|
| `if(cond,then,else)` | Conditional | `eval x=if(a>5,"high","low")` |
| `coalesce(v1,v2,...)` | First non-null | `eval h=coalesce(host,"unknown")` |
| `nullif(v1,v2)` | Null if equal | `eval x=nullif(current,0)` |
| `case(field,v1,r1,...)` | Multi-condition | `eval c=case(code,200,"ok","err")` |

---

## Best Practices

1. **Start specific, then broaden**: Begin with `search host=X` then add pipes
2. **Use limits in development**: Add `| limit 10` while building queries
3. **Leverage time ranges**: Filter by time in the UI for better performance
4. **Name your aggregations**: Use `as` to give meaningful names
5. **Combine stats wisely**: Multiple aggregations in one `stats` is more efficient
6. **Use dedup carefully**: It can be expensive on large datasets
7. **Test regex patterns**: Use rex carefully and test patterns thoroughly
8. **Mind the order**: `stats` changes data shape, use before final `sort`
9. **Cache common queries**: Save frequently used searches
10. **Monitor performance**: Check generated SQL with `/search/parse` endpoint

---

## Performance Tips

- **Index usage**: Queries filtering on `timestamp`, `hostname`, or `app_name` use indexes
- **Avoid SELECT ***: Use `table` or `fields` to select only needed columns
- **Limit early**: Apply filters and limits before expensive operations
- **Use timechart wisely**: Large time spans with small buckets can be expensive
- **Batch processing**: For large exports, use API with pagination
- **Aggregation order**: Filter → Stats → Sort → Limit is optimal

---

## Troubleshooting

### Query Returns No Results

- Check time range in UI
- Verify field names (use autocomplete)
- Test simpler version: `search *` then add filters
- Check for typos in field values

### Parse Errors

- Ensure quotes match: `"text"` or `'text'`
- Close all parentheses: `(...)`
- Use `\` to escape special chars in regex
- Check operator spacing

### Slow Queries

- Add time range filters
- Reduce result set with `limit`
- Avoid `search *` without filters
- Use indexed fields in WHERE clauses
- Check generated SQL: POST to `/search/parse`

---

## Additional Resources

- **API Documentation**: See `/api` endpoint for programmatic access
- **Examples**: Check the Knowledge page for saved searches
- **Community**: Join discussions on GitHub
- **Support**: Open issues for bugs or feature requests

---

**Happy Querying!**

For questions or feedback, visit: https://github.com/machinekinglabs/lognog
