/**
 * Built-in Source Templates
 *
 * Pre-configured templates for common log sources with field extraction patterns,
 * setup instructions, and sample configurations.
 */

import { FieldExtractionPattern, SourceCategory, createSourceTemplate, getSourceTemplateByType } from '../db/sqlite.js';

interface TemplateConfig {
  name: string;
  sourceType: string;
  category: SourceCategory;
  description: string;
  setupInstructions: string;
  agentConfigExample?: string;
  syslogConfigExample?: string;
  fieldExtractions: FieldExtractionPattern[];
  defaultIndex: string;
  defaultSeverity: number;
  sampleLog: string;
  sampleQuery: string;
  icon: string;
}

const templates: TemplateConfig[] = [
  // MySQL Error Log
  {
    name: 'MySQL Error Log',
    sourceType: 'mysql_error',
    category: 'database',
    description: 'MySQL server error log including startup, shutdown, and error messages.',
    setupInstructions: `## MySQL Error Log Setup

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

### Restart MySQL
\`\`\`bash
sudo systemctl restart mysql
\`\`\``,
    agentConfigExample: `watch_paths:
  - path: /var/log/mysql/
    pattern: "*.log"
    source_type: mysql_error`,
    fieldExtractions: [
      {
        field_name: 'timestamp',
        pattern: '^(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d+Z?)',
        pattern_type: 'regex',
        description: 'ISO 8601 timestamp',
        required: true,
      },
      {
        field_name: 'thread_id',
        pattern: '\\[(\\d+)\\]',
        pattern_type: 'regex',
        description: 'MySQL thread ID',
      },
      {
        field_name: 'level',
        pattern: '\\[([A-Z]+)\\]',
        pattern_type: 'regex',
        description: 'Log level (Warning, Error, Note)',
      },
      {
        field_name: 'error_code',
        pattern: '\\[MY-(\\d+)\\]',
        pattern_type: 'regex',
        description: 'MySQL error code',
      },
      {
        field_name: 'subsystem',
        pattern: '\\[([A-Za-z]+)\\](?:\\s|$)',
        pattern_type: 'regex',
        description: 'MySQL subsystem (Server, InnoDB, etc.)',
      },
    ],
    defaultIndex: 'database',
    defaultSeverity: 6,
    sampleLog: "2025-01-15T10:23:45.123456Z 0 [Warning] [MY-010055] [Server] IP address '192.168.1.100' could not be resolved.",
    sampleQuery: 'search index=database source_type=mysql_error level=Error | stats count by error_code',
    icon: 'database',
  },

  // MySQL Slow Query Log
  {
    name: 'MySQL Slow Query Log',
    sourceType: 'mysql_slow',
    category: 'database',
    description: 'MySQL slow query log for performance analysis and optimization.',
    setupInstructions: `## MySQL Slow Query Log Setup

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

### Verify Configuration
\`\`\`sql
SHOW VARIABLES LIKE 'slow_query%';
SHOW VARIABLES LIKE 'long_query_time';
\`\`\``,
    agentConfigExample: `watch_paths:
  - path: /var/log/mysql/
    pattern: "slow.log"
    source_type: mysql_slow
    multiline: true`,
    fieldExtractions: [
      {
        field_name: 'query_time',
        pattern: 'Query_time:\\s+([\\d.]+)',
        pattern_type: 'regex',
        description: 'Total query execution time in seconds',
        required: true,
      },
      {
        field_name: 'lock_time',
        pattern: 'Lock_time:\\s+([\\d.]+)',
        pattern_type: 'regex',
        description: 'Lock wait time in seconds',
      },
      {
        field_name: 'rows_sent',
        pattern: 'Rows_sent:\\s+(\\d+)',
        pattern_type: 'regex',
        description: 'Number of rows returned',
      },
      {
        field_name: 'rows_examined',
        pattern: 'Rows_examined:\\s+(\\d+)',
        pattern_type: 'regex',
        description: 'Number of rows scanned',
      },
      {
        field_name: 'database',
        pattern: 'use\\s+(\\w+);',
        pattern_type: 'regex',
        description: 'Database name',
      },
      {
        field_name: 'user',
        pattern: 'User@Host:\\s+(\\S+)',
        pattern_type: 'regex',
        description: 'MySQL user',
      },
    ],
    defaultIndex: 'database',
    defaultSeverity: 6,
    sampleLog: '# Time: 2025-01-15T10:23:45.123456Z\n# User@Host: root[root] @ localhost []\n# Query_time: 5.123  Lock_time: 0.000  Rows_sent: 1000  Rows_examined: 1000000\nSELECT * FROM large_table WHERE status = "pending";',
    sampleQuery: 'search index=database source_type=mysql_slow | stats avg(query_time) p95(query_time) by database',
    icon: 'clock',
  },

  // PostgreSQL
  {
    name: 'PostgreSQL',
    sourceType: 'postgresql',
    category: 'database',
    description: 'PostgreSQL server logs including queries, errors, and connection events.',
    setupInstructions: `## PostgreSQL Log Setup

### Option 1: Syslog (Recommended)
In \`postgresql.conf\`:
\`\`\`
log_destination = 'syslog'
syslog_facility = 'LOCAL0'
syslog_ident = 'postgres'
\`\`\`

Then configure rsyslog to forward LOCAL0 to LogNog.

### Option 2: File-based Logging
\`\`\`
logging_collector = on
log_directory = '/var/log/postgresql'
log_filename = 'postgresql-%Y-%m-%d.log'
log_statement = 'all'           # or 'ddl', 'mod', 'none'
log_min_duration_statement = 1000  # Log queries > 1 second
log_line_prefix = '%t [%p] %u@%d '
\`\`\`

### Restart PostgreSQL
\`\`\`bash
sudo systemctl restart postgresql
\`\`\``,
    agentConfigExample: `watch_paths:
  - path: /var/log/postgresql/
    pattern: "postgresql-*.log"
    source_type: postgresql`,
    fieldExtractions: [
      {
        field_name: 'timestamp',
        pattern: '^(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2})',
        pattern_type: 'regex',
        description: 'Log timestamp',
        required: true,
      },
      {
        field_name: 'pid',
        pattern: '\\[(\\d+)\\]',
        pattern_type: 'regex',
        description: 'Process ID',
      },
      {
        field_name: 'user',
        pattern: 'user=(\\w+)',
        pattern_type: 'regex',
        description: 'Database user',
      },
      {
        field_name: 'database',
        pattern: 'db=(\\w+)',
        pattern_type: 'regex',
        description: 'Database name',
      },
      {
        field_name: 'level',
        pattern: '(LOG|ERROR|WARNING|FATAL|PANIC|DEBUG)',
        pattern_type: 'regex',
        description: 'Log severity level',
      },
      {
        field_name: 'duration',
        pattern: 'duration:\\s+([\\d.]+)\\s+ms',
        pattern_type: 'regex',
        description: 'Query duration in milliseconds',
      },
    ],
    defaultIndex: 'database',
    defaultSeverity: 6,
    sampleLog: '2025-01-15 10:23:45.123 UTC [12345] user=appuser,db=mydb LOG:  duration: 1523.456 ms  statement: SELECT * FROM users WHERE status = $1',
    sampleQuery: 'search index=database source_type=postgresql level=ERROR | stats count by database',
    icon: 'database',
  },

  // MongoDB
  {
    name: 'MongoDB',
    sourceType: 'mongodb',
    category: 'database',
    description: 'MongoDB server logs (JSON format, MongoDB 4.4+).',
    setupInstructions: `## MongoDB Log Setup

MongoDB 4.4+ outputs structured JSON logs by default.

### Log Location
- **Linux**: \`/var/log/mongodb/mongod.log\`
- **Docker**: Use \`docker logs\` or mount log volume

### Increase Log Verbosity (optional)
Connect to MongoDB and run:
\`\`\`javascript
db.setLogLevel(1, "command")
db.setLogLevel(1, "query")
\`\`\`

Or in \`mongod.conf\`:
\`\`\`yaml
systemLog:
  verbosity: 1
  component:
    query:
      verbosity: 1
    command:
      verbosity: 1
\`\`\``,
    agentConfigExample: `watch_paths:
  - path: /var/log/mongodb/
    pattern: "mongod.log"
    source_type: mongodb`,
    fieldExtractions: [
      {
        field_name: 'timestamp',
        pattern: '$.t.$date',
        pattern_type: 'json_path',
        description: 'Timestamp from JSON log',
        required: true,
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
        description: 'MongoDB component',
      },
      {
        field_name: 'context',
        pattern: '$.ctx',
        pattern_type: 'json_path',
        description: 'Context/connection ID',
      },
      {
        field_name: 'message',
        pattern: '$.msg',
        pattern_type: 'json_path',
        description: 'Log message',
      },
      {
        field_name: 'duration_ms',
        pattern: '$.attr.durationMillis',
        pattern_type: 'json_path',
        description: 'Operation duration',
      },
    ],
    defaultIndex: 'database',
    defaultSeverity: 6,
    sampleLog: '{"t":{"$date":"2025-01-15T10:23:45.123+00:00"},"s":"I","c":"COMMAND","ctx":"conn123","msg":"Slow query","attr":{"durationMillis":1523}}',
    sampleQuery: 'search index=database source_type=mongodb severity=E | stats count by component',
    icon: 'database',
  },

  // Apache Access Log
  {
    name: 'Apache Access Log',
    sourceType: 'apache_access',
    category: 'web',
    description: 'Apache HTTP Server access logs (Common/Combined Log Format).',
    setupInstructions: `## Apache Access Log Setup

### Default Configuration
Apache access logs are enabled by default.

### Location
- **Debian/Ubuntu**: \`/var/log/apache2/access.log\`
- **RHEL/CentOS**: \`/var/log/httpd/access_log\`

### Custom Log Format
In \`apache2.conf\` or \`httpd.conf\`:
\`\`\`apache
LogFormat "%h %l %u %t \\"%r\\" %>s %b \\"%{Referer}i\\" \\"%{User-Agent}i\\"" combined
CustomLog /var/log/apache2/access.log combined
\`\`\``,
    agentConfigExample: `watch_paths:
  - path: /var/log/apache2/
    pattern: "access.log"
    source_type: apache_access`,
    fieldExtractions: [
      {
        field_name: 'client_ip',
        pattern: '^([\\d.]+)',
        pattern_type: 'regex',
        description: 'Client IP address',
        required: true,
      },
      {
        field_name: 'timestamp',
        pattern: '\\[([^\\]]+)\\]',
        pattern_type: 'regex',
        description: 'Request timestamp',
      },
      {
        field_name: 'method',
        pattern: '\\"(GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH)',
        pattern_type: 'regex',
        description: 'HTTP method',
      },
      {
        field_name: 'uri',
        pattern: '\\"(?:GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH) ([^ ]+)',
        pattern_type: 'regex',
        description: 'Request URI',
      },
      {
        field_name: 'status',
        pattern: '\\" (\\d{3})',
        pattern_type: 'regex',
        description: 'HTTP status code',
      },
      {
        field_name: 'bytes',
        pattern: '\\" \\d{3} (\\d+|-)',
        pattern_type: 'regex',
        description: 'Response size in bytes',
      },
      {
        field_name: 'user_agent',
        pattern: '\\"([^"]*)\\"$',
        pattern_type: 'regex',
        description: 'User agent string',
      },
    ],
    defaultIndex: 'web',
    defaultSeverity: 6,
    sampleLog: '192.168.1.100 - - [15/Jan/2025:10:23:45 +0000] "GET /api/users HTTP/1.1" 200 1234 "-" "Mozilla/5.0"',
    sampleQuery: 'search index=web source_type=apache_access status>=400 | stats count by status, uri',
    icon: 'globe',
  },

  // Nginx Access Log
  {
    name: 'Nginx Access Log',
    sourceType: 'nginx_access',
    category: 'web',
    description: 'Nginx access logs with request details and response metrics.',
    setupInstructions: `## Nginx Access Log Setup

### Default Configuration
Nginx logs are enabled by default.

### Location
- **Most systems**: \`/var/log/nginx/access.log\`

### Custom Log Format
In \`nginx.conf\`:
\`\`\`nginx
log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                '$status $body_bytes_sent "$http_referer" '
                '"$http_user_agent" "$http_x_forwarded_for"';

access_log /var/log/nginx/access.log main;
\`\`\`

### With Response Time
\`\`\`nginx
log_format timed '$remote_addr - $remote_user [$time_local] "$request" '
                 '$status $body_bytes_sent "$http_referer" '
                 '"$http_user_agent" rt=$request_time';

access_log /var/log/nginx/access.log timed;
\`\`\``,
    agentConfigExample: `watch_paths:
  - path: /var/log/nginx/
    pattern: "access.log"
    source_type: nginx_access`,
    fieldExtractions: [
      {
        field_name: 'client_ip',
        pattern: '^([\\d.]+)',
        pattern_type: 'regex',
        description: 'Client IP address',
        required: true,
      },
      {
        field_name: 'timestamp',
        pattern: '\\[([^\\]]+)\\]',
        pattern_type: 'regex',
        description: 'Request timestamp',
      },
      {
        field_name: 'method',
        pattern: '\\"(GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH)',
        pattern_type: 'regex',
        description: 'HTTP method',
      },
      {
        field_name: 'uri',
        pattern: '\\"(?:GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH) ([^ ]+)',
        pattern_type: 'regex',
        description: 'Request URI',
      },
      {
        field_name: 'status',
        pattern: '\\" (\\d{3})',
        pattern_type: 'regex',
        description: 'HTTP status code',
      },
      {
        field_name: 'bytes',
        pattern: '\\" \\d{3} (\\d+|-)',
        pattern_type: 'regex',
        description: 'Response size in bytes',
      },
      {
        field_name: 'response_time',
        pattern: 'rt=([\\d.]+)',
        pattern_type: 'regex',
        description: 'Response time in seconds',
      },
    ],
    defaultIndex: 'web',
    defaultSeverity: 6,
    sampleLog: '192.168.1.100 - - [15/Jan/2025:10:23:45 +0000] "GET /api/users HTTP/1.1" 200 1234 "-" "Mozilla/5.0" rt=0.123',
    sampleQuery: 'search index=web source_type=nginx_access | stats avg(response_time) p95(response_time) by uri',
    icon: 'globe',
  },

  // Windows Security Events
  {
    name: 'Windows Security Events',
    sourceType: 'windows_security',
    category: 'security',
    description: 'Windows Security Event Log - authentication, authorization, and audit events.',
    setupInstructions: `## Windows Security Events Setup

### Using LogNog In Agent (Recommended)
The LogNog In agent can collect Windows Event Logs directly.

In agent configuration:
\`\`\`yaml
windows_events_enabled: true
windows_event_channels:
  - channel: Security
    enabled: true
    # High-value security events
    event_ids: [4624, 4625, 4634, 4648, 4672, 4688, 4698, 4720, 4726, 4740, 1102]
\`\`\`

### Key Event IDs
- **4624**: Successful logon
- **4625**: Failed logon attempt
- **4634**: Logoff
- **4672**: Special privileges assigned
- **4688**: Process created
- **4698-4702**: Scheduled task changes
- **4720**: User account created
- **4740**: Account locked out
- **1102**: Audit log cleared (security event)`,
    agentConfigExample: `windows_events_enabled: true
windows_event_channels:
  - channel: Security
    enabled: true
    event_ids: [4624, 4625, 4634, 4648, 4672, 4688]`,
    fieldExtractions: [
      {
        field_name: 'event_id',
        pattern: 'EventID>(\\d+)<',
        pattern_type: 'regex',
        description: 'Windows Event ID',
        required: true,
      },
      {
        field_name: 'computer',
        pattern: 'Computer>([^<]+)<',
        pattern_type: 'regex',
        description: 'Computer name',
      },
      {
        field_name: 'user_sid',
        pattern: 'Security UserID=\\"([^"]+)\\"',
        pattern_type: 'regex',
        description: 'User Security Identifier',
      },
      {
        field_name: 'logon_type',
        pattern: 'LogonType>(\\d+)<',
        pattern_type: 'regex',
        description: 'Logon type (2=Interactive, 3=Network, etc.)',
      },
    ],
    defaultIndex: 'security',
    defaultSeverity: 6,
    sampleLog: '<Event><System><EventID>4624</EventID><Computer>DESKTOP-PC</Computer></System><EventData><Data Name="LogonType">2</Data></EventData></Event>',
    sampleQuery: 'search index=security source_type=windows_security event_id=4625 | stats count by computer',
    icon: 'shield',
  },

  // IIS Access Log
  {
    name: 'IIS Access Log (W3C)',
    sourceType: 'iis_access',
    category: 'web',
    description: 'Microsoft IIS Web Server access logs in W3C Extended Log Format.',
    setupInstructions: `## IIS Access Log Setup

### Enable Logging
1. Open IIS Manager
2. Select your site
3. Double-click "Logging"
4. Ensure logging is enabled

### Log Location
Default: \`C:\\inetpub\\logs\\LogFiles\\W3SVC1\\\`

### W3C Extended Format Fields (Recommended)
Select these fields:
- Date (date)
- Time (time)
- Client IP (c-ip)
- User Name (cs-username)
- Method (cs-method)
- URI Stem (cs-uri-stem)
- URI Query (cs-uri-query)
- Protocol Status (sc-status)
- Bytes Sent (sc-bytes)
- Time Taken (time-taken)
- User Agent (cs(User-Agent))`,
    agentConfigExample: `watch_paths:
  - path: C:\\inetpub\\logs\\LogFiles\\W3SVC1\\
    pattern: "*.log"
    source_type: iis_access`,
    fieldExtractions: [
      {
        field_name: 'client_ip',
        pattern: '^\\S+ \\S+ (\\S+)',
        pattern_type: 'regex',
        description: 'Client IP address',
      },
      {
        field_name: 'method',
        pattern: '^\\S+ \\S+ \\S+ \\S+ \\S+ (\\S+)',
        pattern_type: 'regex',
        description: 'HTTP method',
      },
      {
        field_name: 'uri',
        pattern: '^\\S+ \\S+ \\S+ \\S+ \\S+ \\S+ (\\S+)',
        pattern_type: 'regex',
        description: 'URI stem',
      },
      {
        field_name: 'status',
        pattern: '^\\S+ \\S+ \\S+ \\S+ \\S+ \\S+ \\S+ \\S+ (\\d+)',
        pattern_type: 'regex',
        description: 'HTTP status code',
      },
    ],
    defaultIndex: 'web',
    defaultSeverity: 6,
    sampleLog: '2025-01-15 10:23:45 192.168.1.100 GET /api/users - 200 0 0 1234 123 - Mozilla/5.0',
    sampleQuery: 'search index=web source_type=iis_access status>=500 | stats count by uri',
    icon: 'globe',
  },

  // Supabase Log Drains
  {
    name: 'Supabase Log Drains',
    sourceType: 'supabase',
    category: 'application',
    description: 'Supabase platform logs including database, auth, storage, realtime, and edge functions.',
    setupInstructions: `## Supabase Log Drains Setup

### Prerequisites
- Supabase project on Team or Enterprise plan
- LogNog API key with write permissions

### Configure Log Drain
1. Go to Supabase Dashboard → Settings → Log Drains
2. Click "Add destination"
3. Select "HTTP / Generic HTTP endpoint"
4. Configure:

**Endpoint URL:**
\`\`\`
https://your-lognog-server/api/ingest/supabase
\`\`\`

**Headers:**
\`\`\`
X-API-Key: your-lognog-api-key
Content-Type: application/json
\`\`\`

5. Click "Save"

### Log Types Captured
- **Postgres**: Database queries, errors, slow queries
- **Auth**: Login attempts, token refreshes, password resets
- **Storage**: File uploads, downloads, deletions
- **Realtime**: WebSocket connections, channel subscriptions
- **Edge Functions**: Function invocations, errors, cold starts

### Notes
- Logs are batched (up to 250 per request)
- Supports gzip compression
- Logs may have ~1 minute latency`,
    fieldExtractions: [
      {
        field_name: 'supabase_component',
        pattern: 'supabase-([a-z-]+)',
        pattern_type: 'regex',
        description: 'Supabase component (postgres, auth, storage, etc.)',
        required: true,
      },
      {
        field_name: 'supabase_project',
        pattern: '"project":"([^"]+)"',
        pattern_type: 'regex',
        description: 'Supabase project identifier',
      },
      {
        field_name: 'db_name',
        pattern: '"database_name":"([^"]+)"',
        pattern_type: 'regex',
        description: 'PostgreSQL database name',
      },
      {
        field_name: 'db_user',
        pattern: '"user_name":"([^"]+)"',
        pattern_type: 'regex',
        description: 'PostgreSQL user name',
      },
      {
        field_name: 'error_severity',
        pattern: '"error_severity":"([^"]+)"',
        pattern_type: 'regex',
        description: 'PostgreSQL error severity',
      },
      {
        field_name: 'function_id',
        pattern: '"function_id":"([^"]+)"',
        pattern_type: 'regex',
        description: 'Edge Function ID',
      },
      {
        field_name: 'http_status',
        pattern: '"status":(\\d+)',
        pattern_type: 'regex',
        description: 'HTTP response status code',
      },
    ],
    defaultIndex: 'supabase',
    defaultSeverity: 6,
    sampleLog: '{"timestamp":1705312345000,"event_message":"duration: 15.234 ms  statement: SELECT * FROM users WHERE id = $1","metadata":{"project":"myproject","parsed":{"database_name":"postgres","user_name":"authenticator","error_severity":"LOG"}}}',
    sampleQuery: 'search index=supabase app_name=supabase-postgres error_severity=ERROR | stats count by db_name, db_user',
    icon: 'database',
  },

  // Supabase Auth
  {
    name: 'Supabase Auth',
    sourceType: 'supabase_auth',
    category: 'security',
    description: 'Supabase authentication service logs - signups, logins, token management.',
    setupInstructions: `## Supabase Auth Logs

Auth logs are automatically captured when you configure Supabase Log Drains.

### Key Events
- User signups and deletions
- Login attempts (success/failure)
- Token refresh operations
- Password reset requests
- OAuth provider authentications

### Filtering Auth Logs
\`\`\`
search index=supabase app_name=supabase-auth
\`\`\`

### Security Monitoring
\`\`\`
# Failed login attempts
search index=supabase app_name=supabase-auth message~"invalid" OR message~"failed"
  | stats count by http_path

# OAuth activity
search index=supabase app_name=supabase-auth http_path~"/authorize"
  | timechart span=1h count
\`\`\``,
    fieldExtractions: [
      {
        field_name: 'auth_action',
        pattern: '/auth/v1/([a-z]+)',
        pattern_type: 'regex',
        description: 'Auth action (signup, token, logout, etc.)',
      },
      {
        field_name: 'http_method',
        pattern: '"method":"([A-Z]+)"',
        pattern_type: 'regex',
        description: 'HTTP request method',
      },
      {
        field_name: 'http_path',
        pattern: '"path":"([^"]+)"',
        pattern_type: 'regex',
        description: 'Request path',
      },
    ],
    defaultIndex: 'supabase',
    defaultSeverity: 6,
    sampleLog: '{"timestamp":1705312345000,"event_message":"POST /auth/v1/token completed with status 200","metadata":{"method":"POST","path":"/auth/v1/token","status":200,"component":"auth"}}',
    sampleQuery: 'search index=supabase app_name=supabase-auth http_status>=400 | stats count by http_path, http_status',
    icon: 'shield',
  },

  // Supabase Edge Functions
  {
    name: 'Supabase Edge Functions',
    sourceType: 'supabase_functions',
    category: 'application',
    description: 'Supabase Edge Functions (Deno) execution logs, errors, and performance metrics.',
    setupInstructions: `## Supabase Edge Functions Logs

Edge Function logs are automatically captured when you configure Supabase Log Drains.

### Log Contents
- Function invocation start/end
- Console.log() output
- Errors and stack traces
- Cold start indicators
- Execution duration

### Filtering Function Logs
\`\`\`
search index=supabase app_name=supabase-edge-functions
\`\`\`

### Performance Analysis
\`\`\`
# Function execution stats
search index=supabase app_name=supabase-edge-functions
  | stats count, avg(execution_time) as avg_ms by function_id

# Cold starts
search index=supabase app_name=supabase-edge-functions message~"cold start"
  | timechart span=1h count
\`\`\`

### Error Tracking
\`\`\`
search index=supabase app_name=supabase-edge-functions severity<=3
  | stats count by function_id
  | sort desc count
\`\`\``,
    fieldExtractions: [
      {
        field_name: 'function_id',
        pattern: '"function_id":"([^"]+)"',
        pattern_type: 'regex',
        description: 'Edge Function identifier',
        required: true,
      },
      {
        field_name: 'execution_id',
        pattern: '"execution_id":"([^"]+)"',
        pattern_type: 'regex',
        description: 'Unique execution identifier',
      },
      {
        field_name: 'deployment_id',
        pattern: '"deployment_id":"([^"]+)"',
        pattern_type: 'regex',
        description: 'Function deployment ID',
      },
      {
        field_name: 'function_version',
        pattern: '"version":"([^"]+)"',
        pattern_type: 'regex',
        description: 'Function version',
      },
    ],
    defaultIndex: 'supabase',
    defaultSeverity: 6,
    sampleLog: '{"timestamp":1705312345000,"event_message":"Function completed in 45ms","metadata":{"function_id":"hello-world","execution_id":"exec_123","deployment_id":"deploy_456","level":"info"}}',
    sampleQuery: 'search index=supabase app_name=supabase-edge-functions | stats count, avg(execution_time) by function_id',
    icon: 'code',
  },

  // Vercel Log Drains
  {
    name: 'Vercel Log Drains',
    sourceType: 'vercel',
    category: 'application',
    description: 'Vercel platform logs including serverless functions, edge functions, static files, and build logs.',
    setupInstructions: `## Vercel Log Drains Setup

### Prerequisites
- Vercel project on Pro or Enterprise plan
- LogNog API key with write permissions

### Configure Log Drain
1. Go to [Vercel Dashboard](https://vercel.com/dashboard) → Project Settings
2. Navigate to **Integrations** → **Log Drains**
3. Click **Add Log Drain**
4. Configure:

**Delivery URL:**
\`\`\`
https://your-lognog-server/api/ingest/vercel
\`\`\`

**Headers:**
\`\`\`
X-API-Key: your-lognog-api-key
Content-Type: application/x-ndjson
\`\`\`

**Log Sources (select all):**
- Static
- Lambda (Serverless Functions)
- Edge (Edge Functions)
- Build
- External

5. Click **Add Log Drain**

### Log Types Captured
- **Static**: CDN requests for static assets
- **Lambda**: Serverless function executions
- **Edge**: Edge function requests (Edge Runtime)
- **Build**: Deployment build logs
- **External**: External rewrites and redirects

### Notes
- Logs are sent as NDJSON (newline-delimited JSON)
- Real-time delivery (~1-2 second latency)
- Logs include request/response metadata and function output`,
    fieldExtractions: [
      {
        field_name: 'vercel_source',
        pattern: '"source":"([^"]+)"',
        pattern_type: 'regex',
        description: 'Log source (static, lambda, edge, build, external)',
        required: true,
      },
      {
        field_name: 'deployment_id',
        pattern: '"deploymentId":"([^"]+)"',
        pattern_type: 'regex',
        description: 'Vercel deployment identifier',
      },
      {
        field_name: 'project_id',
        pattern: '"projectId":"([^"]+)"',
        pattern_type: 'regex',
        description: 'Vercel project identifier',
      },
      {
        field_name: 'http_method',
        pattern: '"method":"([^"]+)"',
        pattern_type: 'regex',
        description: 'HTTP request method',
      },
      {
        field_name: 'http_path',
        pattern: '"path":"([^"]+)"',
        pattern_type: 'regex',
        description: 'Request path',
      },
      {
        field_name: 'http_status',
        pattern: '"statusCode":(\\d+)',
        pattern_type: 'regex',
        description: 'HTTP response status code',
      },
      {
        field_name: 'duration_ms',
        pattern: '"duration":(\\d+)',
        pattern_type: 'regex',
        description: 'Request duration in milliseconds',
      },
      {
        field_name: 'region',
        pattern: '"region":"([^"]+)"',
        pattern_type: 'regex',
        description: 'Vercel edge region',
      },
      {
        field_name: 'lambda_id',
        pattern: '"lambdaId":"([^"]+)"',
        pattern_type: 'regex',
        description: 'Serverless function identifier',
      },
      {
        field_name: 'cold_start',
        pattern: '"coldStart":(true|false)',
        pattern_type: 'regex',
        description: 'Whether this was a cold start',
      },
    ],
    defaultIndex: 'vercel',
    defaultSeverity: 6,
    sampleLog: '{"id":"req_abc123","timestamp":1705312345000,"source":"lambda","deploymentId":"dpl_xyz","projectId":"prj_123","message":"GET /api/users 200","method":"GET","path":"/api/users","statusCode":200,"duration":123,"region":"iad1","lambdaId":"api-users"}',
    sampleQuery: 'search index=vercel vercel_source=lambda | stats avg(duration_ms) p95(duration_ms) by lambda_id',
    icon: 'globe',
  },

  // Vercel Serverless Functions
  {
    name: 'Vercel Serverless Functions',
    sourceType: 'vercel_functions',
    category: 'application',
    description: 'Vercel Serverless Functions (Lambda) execution logs, errors, and performance metrics.',
    setupInstructions: `## Vercel Serverless Functions Logs

Serverless Function logs are automatically captured when you configure Vercel Log Drains.

### Log Contents
- Function invocations (start/end)
- Console.log/error output
- Uncaught exceptions
- Cold start indicators
- Request/response details
- Execution duration

### Filtering Function Logs
\`\`\`
search index=vercel vercel_source=lambda
\`\`\`

### Performance Analysis
\`\`\`
# Function execution stats
search index=vercel vercel_source=lambda
  | stats count, avg(duration_ms) as avg_ms, p95(duration_ms) as p95_ms by lambda_id

# Cold starts
search index=vercel vercel_source=lambda cold_start=true
  | stats count by lambda_id
  | sort desc count

# Slowest requests
search index=vercel vercel_source=lambda
  | sort desc duration_ms
  | head 20
  | table timestamp, lambda_id, http_path, duration_ms, http_status
\`\`\`

### Error Tracking
\`\`\`
# Function errors
search index=vercel vercel_source=lambda http_status>=500
  | stats count by lambda_id, http_status

# Timeout errors
search index=vercel vercel_source=lambda message~"timeout"
  | table timestamp, lambda_id, http_path, message
\`\`\`

### Regional Analysis
\`\`\`
# Traffic by region
search index=vercel vercel_source=lambda
  | stats count, avg(duration_ms) by region
  | sort desc count
\`\`\``,
    fieldExtractions: [
      {
        field_name: 'lambda_id',
        pattern: '"lambdaId":"([^"]+)"',
        pattern_type: 'regex',
        description: 'Serverless function identifier',
        required: true,
      },
      {
        field_name: 'duration_ms',
        pattern: '"duration":(\\d+)',
        pattern_type: 'regex',
        description: 'Execution duration in milliseconds',
      },
      {
        field_name: 'cold_start',
        pattern: '"coldStart":(true|false)',
        pattern_type: 'regex',
        description: 'Whether this was a cold start',
      },
      {
        field_name: 'http_method',
        pattern: '"method":"([^"]+)"',
        pattern_type: 'regex',
        description: 'HTTP request method',
      },
      {
        field_name: 'http_path',
        pattern: '"path":"([^"]+)"',
        pattern_type: 'regex',
        description: 'Request path',
      },
      {
        field_name: 'http_status',
        pattern: '"statusCode":(\\d+)',
        pattern_type: 'regex',
        description: 'HTTP response status code',
      },
      {
        field_name: 'region',
        pattern: '"region":"([^"]+)"',
        pattern_type: 'regex',
        description: 'Vercel edge region',
      },
      {
        field_name: 'memory_mb',
        pattern: '"memory":(\\d+)',
        pattern_type: 'regex',
        description: 'Function memory limit in MB',
      },
    ],
    defaultIndex: 'vercel',
    defaultSeverity: 6,
    sampleLog: '{"timestamp":1705312345000,"source":"lambda","lambdaId":"api-users","method":"GET","path":"/api/users","statusCode":200,"duration":123,"coldStart":false,"region":"iad1","memory":1024}',
    sampleQuery: 'search index=vercel vercel_source=lambda | stats count, avg(duration_ms), sum(cold_start=true) as cold_starts by lambda_id',
    icon: 'code',
  },
  // Next.js Application Logs
  {
    name: 'Next.js Application',
    sourceType: 'nextjs',
    category: 'application',
    description: 'Next.js application logs including API calls, user actions, performance metrics, and errors.',
    setupInstructions: `## Next.js Integration

### Quick Start
1. Create API key in LogNog Settings with write permission
2. Set environment variables:
   - LOGNOG_ENDPOINT=https://your-lognog/api/ingest/nextjs
   - LOGNOG_API_KEY=your-key

### Usage
\\\`\\\`\\\`typescript
// Track API calls
logger.api({ route: '/api/generate', method: 'POST', statusCode: 200, durationMs: 1523, integration: 'replicate' });

// Track user actions
logger.action({ name: 'button_click', component: 'GenerateButton', page: '/dashboard' });

// Track performance
logger.performance({ metric: 'LCP', value: 1200, page: '/home' });

// Track errors
logger.error({ message: 'Failed to generate', stack: error.stack, component: 'GenerateAPI' });
\\\`\\\`\\\``,
    fieldExtractions: [
      { field_name: 'nextjs_type', pattern: '"type":"([^"]+)"', pattern_type: 'regex', description: 'Log type (api, action, performance, error)', required: true },
      { field_name: 'http_route', pattern: '"route":"([^"]+)"', pattern_type: 'regex', description: 'API route path' },
      { field_name: 'http_status', pattern: '"status_code":(\\d+)', pattern_type: 'regex', description: 'HTTP status code' },
      { field_name: 'api_duration_ms', pattern: '"duration_ms":(\\d+)', pattern_type: 'regex', description: 'API call duration in milliseconds' },
      { field_name: 'integration_name', pattern: '"integration":"([^"]+)"', pattern_type: 'regex', description: 'External integration (replicate, supabase, stripe)' },
      { field_name: 'action_name', pattern: '"name":"([^"]+)"', pattern_type: 'regex', description: 'User action name' },
      { field_name: 'perf_metric', pattern: '"metric":"([^"]+)"', pattern_type: 'regex', description: 'Performance metric (LCP, FID, CLS)' },
    ],
    defaultIndex: 'nextjs',
    defaultSeverity: 6,
    sampleLog: '{"timestamp":1705312345000,"type":"api","environment":"production","api":{"route":"/api/generate","method":"POST","status_code":200,"duration_ms":1523,"integration":"replicate"}}',
    sampleQuery: 'search index=nextjs nextjs_type=api | stats avg(api_duration_ms) p95(api_duration_ms) by http_route',
    icon: 'code',
  },
];

/**
 * Seed built-in templates to database if they don't exist.
 */
export function seedBuiltinTemplates(): void {
  console.log('Seeding built-in source templates...');

  let seeded = 0;
  let skipped = 0;

  for (const template of templates) {
    const existing = getSourceTemplateByType(template.sourceType);

    if (!existing) {
      createSourceTemplate(template.name, template.sourceType, template.category, {
        description: template.description,
        setup_instructions: template.setupInstructions,
        agent_config_example: template.agentConfigExample,
        syslog_config_example: template.syslogConfigExample,
        field_extractions: template.fieldExtractions,
        default_index: template.defaultIndex,
        default_severity: template.defaultSeverity,
        sample_log: template.sampleLog,
        sample_query: template.sampleQuery,
        icon: template.icon,
        enabled: true,
        built_in: true,
      });
      seeded++;
      console.log(`  ✓ Created template: ${template.name}`);
    } else {
      skipped++;
    }
  }

  console.log(`Seeded ${seeded} templates, skipped ${skipped} existing templates.`);
}
