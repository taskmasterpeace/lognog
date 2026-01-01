# LogNog Log Generator

A realistic log generator for testing the LogNog homelab log management system. Generates diverse, realistic syslog messages that simulate a real homelab/small company environment.

## Features

### Diverse Log Types

The generator produces logs from various services commonly found in homelab environments:

- **Apache access logs** - Standard Apache combined log format
- **Nginx access logs** - With request timing and user agents
- **Kubernetes pod logs** - JSON-structured logs from K8s deployments
- **AWS CloudWatch logs** - Lambda, ECS, and EC2 style logs
- **Security logs** - Failed logins, brute force attempts, permission denials, SQL injection attempts
- **Database logs** - MySQL and PostgreSQL with query durations, slow query warnings, connection errors
- **Application logs** - Structured logs with correlation IDs and multi-line stack traces (Java, Python, Node.js)
- **SSH/Authentication logs** - Login attempts, session events
- **Docker logs** - Container lifecycle and health events
- **Firewall logs** - UFW/iptables style packet filtering
- **System logs** - Kernel messages, systemd events, cron jobs

### Realistic Patterns

- **Time-based patterns**: More API/web traffic during business hours (9am-5pm), more batch jobs and maintenance at night
- **Bursty traffic**: Simulates traffic spikes and quiet periods (0.2x to 5x normal rate)
- **Error cascades**: Generates realistic failure scenarios where one error triggers related errors across multiple systems
- **Correlated events**: Login followed by API activity with shared session/correlation IDs
- **Realistic distributions**: Web servers generate more traffic than kernel logs

### Rich Data

- **Kubernetes pod names**: Realistic deployment/statefulset naming
- **AWS instance IDs**: EC2 instance identifiers
- **Multiple IP ranges**: Internal (192.168.x.x), DMZ (10.0.x.x), external IPs
- **HTTP paths**: Mix of legitimate API endpoints and attack attempts (/.env, /phpMyAdmin)
- **User agents**: Browsers, curl, Prometheus, monitoring tools
- **Correlation IDs**: Request tracing across services
- **Stack traces**: Multi-line Java/Python/Node.js exception traces

## Usage

### Basic Usage

```bash
# Generate 10 logs per second (default)
node generator.js

# Custom rate
node generator.js --rate 100

# High error rate
node generator.js --rate 50 --error-rate 25

# Bursty traffic
node generator.js --rate 30 --burst

# Run for specific duration
node generator.js --rate 20 --duration 60

# See all generated logs
node generator.js --rate 5 --verbose
```

### Command Line Options

```
--rate N          Logs per second (default: 10)
--error-rate N    Percentage of errors (default: 10)
--burst           Enable bursty traffic patterns
--host HOST       Syslog host (default: localhost)
--port PORT       Syslog port (default: 514)
--duration N      Run for N seconds (default: infinite)
--verbose, -v     Print all generated logs
--help, -h        Show this help message
```

### Environment Variables

```bash
# Connect to remote syslog server
SYSLOG_HOST=remote.local node generator.js --rate 50

# Use TCP instead of UDP
SYSLOG_PROTOCOL=tcp node generator.js

# Combine environment and CLI options
LOG_RATE=100 node generator.js --burst --error-rate 20
```

## Examples

### Generate realistic homelab traffic

```bash
# Simulate typical homelab with occasional errors
node generator.js --rate 20 --error-rate 10 --burst
```

### Stress test your log system

```bash
# High volume with many errors
node generator.js --rate 1000 --error-rate 25 --burst
```

### Test error handling

```bash
# Mostly errors to test alerting
node generator.js --rate 50 --error-rate 50 --verbose
```

### Short test run

```bash
# Generate logs for 2 minutes then stop
node generator.js --rate 30 --duration 120
```

## Sample Output

```
<134>Dec 11 18:14:36 web-server-03 nginx[9856]: 198.51.100.88 - - "PATCH /api/v1/users HTTP/1.1" 201 43952 "-" "curl/7.68.0" rt=0.803

<158>Dec 11 18:14:52 k8s-node-02 k8s/production/api-deployment-7d9f8c6b4-x7k2m[123]: {"level":"info","ts":"2025-12-11T23:14:52.326Z","logger":"api","msg":"HTTP request completed","method":"POST","path":"/api/v1/users","status":201,"duration":145,"correlation_id":"1765494893345-3ea"}

<147>Dec 11 18:14:53 app-server-01 myapp[1767]: [ERROR] [database] [1765494893687-3eb] Unhandled exception:
Error: Database connection timeout
    at Connection.connect (/app/node_modules/pg/lib/connection.js:142)
    at Client._connect (/app/node_modules/pg/lib/client.js:67)
    at Database.query (/app/src/database.js:42)

<84>Dec 11 18:14:51 gateway-01 security[2454]: Failed login attempt for user 'admin' from 185.220.101.45 - account locked after 5 attempts
```

## Log Patterns

### Error Cascade Example

When an error cascade is triggered, you might see:

1. Database connection failure on db-server-01
2. Multiple app servers failing to connect to the database (same correlation ID)
3. Load balancer reporting upstream failures
4. All events share the same correlation ID for easy tracing

### Correlated Events Example

When a user logs in, you'll see:

1. Login event with correlation ID and session ID
2. 3-8 API requests with the same session ID
3. Optional logout event with session duration

These patterns help test your log analysis and correlation capabilities.

## Technical Details

- Uses standard syslog RFC format with priority, timestamp, hostname, app name, and message
- Supports both UDP (default) and TCP syslog protocols
- Generates ~15 different log types with realistic distributions
- Time-aware: Adjusts traffic patterns based on hour of day
- Business hours (9am-5pm): 2x more web/API traffic
- Night time (10pm-6am): 3x more cron jobs, less web traffic
- Burst mode: Changes traffic rate every 10-30 seconds

## Integration

The generator sends logs via syslog (UDP port 514 by default), which integrates seamlessly with:

- **Vector**: Default log ingestion in LogNog
- **rsyslog**: Traditional syslog daemon
- **syslog-ng**: Alternative syslog implementation
- **Fluentd**: Log collection and forwarding
- Any syslog-compatible receiver

## Performance

- Lightweight: Pure Node.js, no external dependencies
- Can sustain 1000+ logs/second on modest hardware
- Minimal CPU usage even with verbose mode
- Works well for long-running tests
