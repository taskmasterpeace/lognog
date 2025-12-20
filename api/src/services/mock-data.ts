/**
 * Mock Data Generator Service
 *
 * Generates realistic log data for testing, demos, and screenshots.
 */

interface MockLogOptions {
  count: number;
  timeRange: {
    start: string; // e.g., '-24h' or ISO timestamp
    end: string;   // e.g., 'now' or ISO timestamp
  };
  types?: LogType[];
  hostnames?: string[];
  severity?: number[];
}

type LogType = 'syslog' | 'nginx' | 'auth' | 'app' | 'firewall' | 'database';

// Default hostnames for mock data
const DEFAULT_HOSTNAMES = [
  'web-server-01', 'web-server-02', 'web-server-03',
  'db-primary', 'db-replica-01', 'db-replica-02',
  'firewall-01', 'router-01', 'router-02',
  'nas-01', 'backup-server',
  'k8s-master-01', 'k8s-worker-01', 'k8s-worker-02',
  'proxy-01', 'cache-01',
  'monitoring-01', 'log-collector-01',
  'vpn-gateway', 'pihole-01',
];

// Realistic IP addresses for mock data
const INTERNAL_IPS = [
  '192.168.1.10', '192.168.1.20', '192.168.1.30',
  '10.0.0.5', '10.0.0.10', '10.0.1.5',
  '172.16.0.10', '172.16.0.20',
];

const EXTERNAL_IPS = [
  '8.8.8.8', '1.1.1.1', '203.0.113.42', '198.51.100.23',
  '185.234.219.1', '45.33.32.156', // Some potentially malicious
  '91.121.87.10', '23.94.5.133',
];

// Nginx access log patterns
const NGINX_PATHS = [
  '/', '/api/users', '/api/posts', '/api/auth/login', '/api/auth/logout',
  '/static/app.js', '/static/style.css', '/static/logo.png',
  '/dashboard', '/settings', '/profile', '/admin',
  '/health', '/metrics', '/api/v1/data',
];

const NGINX_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
  'curl/7.68.0',
  'Go-http-client/1.1',
  'python-requests/2.28.0',
];

// Authentication messages
const AUTH_SUCCESS_MESSAGES = [
  'Accepted password for {user} from {ip} port {port} ssh2',
  'pam_unix(sshd:session): session opened for user {user}',
  'User {user} logged in successfully',
  'Authentication succeeded for user {user}',
  'Successful login for {user} from {ip}',
];

const AUTH_FAILURE_MESSAGES = [
  'Failed password for {user} from {ip} port {port} ssh2',
  'Failed password for invalid user {user} from {ip} port {port} ssh2',
  'pam_unix(sshd:auth): authentication failure; user={user}',
  'Invalid user {user} from {ip}',
  'Connection closed by authenticating user {user} {ip} port {port} [preauth]',
  'Authentication failed for user {user}',
  'Failed login attempt for user {user} from {ip}',
];

const USERNAMES = [
  'admin', 'root', 'deploy', 'www-data', 'postgres',
  'nginx', 'ubuntu', 'jenkins', 'docker', 'gitlab',
  'john.smith', 'alice.jones', 'bob.wilson', 'mary.taylor',
];

// Application log messages
const APP_INFO_MESSAGES = [
  'Application started successfully',
  'Worker process {pid} started',
  'Connected to database successfully',
  'Cache initialized with {count} entries',
  'Request processed in {ms}ms',
  'Background job completed: {job}',
  'Health check passed',
  'Configuration reloaded',
  'Service ready to accept connections',
];

const APP_WARNING_MESSAGES = [
  'High memory usage: {pct}% of available memory',
  'Slow query detected: {ms}ms',
  'Rate limit approaching for client {ip}',
  'Connection pool nearly exhausted ({count}/{max})',
  'Retry attempt {n} for operation {operation}',
  'Cache miss rate above threshold: {pct}%',
  'Deprecated API endpoint called: {endpoint}',
  'SSL certificate expires in {days} days',
];

const APP_ERROR_MESSAGES = [
  'Database connection timeout after {ms}ms',
  'Failed to connect to upstream server',
  'Out of memory error in worker {pid}',
  'Uncaught exception: {error}',
  'Service unavailable: {service}',
  'Deadlock detected in transaction {id}',
  'Request timeout for {endpoint}',
  'Failed to write to disk: {error}',
];

// Firewall messages
const FIREWALL_MESSAGES = [
  '[UFW BLOCK] IN=eth0 SRC={src_ip} DST={dst_ip} PROTO=TCP DPT={port}',
  '[UFW ALLOW] IN=eth0 SRC={src_ip} DST={dst_ip} PROTO=TCP DPT={port}',
  'Blocked incoming connection from {ip} to port {port}',
  'Port scan detected from {ip}',
  'Suspicious traffic from {ip}: {packets} packets/sec',
  'GeoIP block: Connection from {country} ({ip})',
  'Rate limit exceeded for {ip}',
  'Intrusion attempt detected from {ip}',
];

// Database log messages
const DB_INFO_MESSAGES = [
  'Connection received: host={host} user={user} database={db}',
  'Statement: SELECT * FROM users WHERE id = {id}',
  'Query completed in {ms}ms',
  'Checkpoint starting',
  'Checkpoint complete',
  'Autovacuum on table {table} completed',
  'Backup started',
  'Backup completed successfully',
];

const DB_WARNING_MESSAGES = [
  'Long-running query: {ms}ms',
  'Connection pool approaching maximum capacity',
  'Slow query: SELECT * FROM {table} WHERE {condition}',
  'Lock timeout on table {table}',
  'Temporary file created: {size}MB',
];

const DB_ERROR_MESSAGES = [
  'Connection lost to client at {ip}',
  'Deadlock detected: Process {pid1} and {pid2}',
  'Error: duplicate key value violates unique constraint',
  'Error: relation "{table}" does not exist',
  'Connection timeout',
  'Out of shared memory',
  'Could not obtain lock on relation {table}',
];

/**
 * Parse relative time string to date
 */
function parseRelativeTime(timeStr: string): Date {
  const now = new Date();

  if (timeStr === 'now') {
    return now;
  }

  const match = timeStr.match(/^-(\d+)([mhdw])$/);
  if (!match) {
    // Try parsing as ISO date
    return new Date(timeStr);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'm':
      return new Date(now.getTime() - value * 60 * 1000);
    case 'h':
      return new Date(now.getTime() - value * 60 * 60 * 1000);
    case 'd':
      return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
    case 'w':
      return new Date(now.getTime() - value * 7 * 24 * 60 * 60 * 1000);
    default:
      return now;
  }
}

/**
 * Random choice from array
 */
function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Random integer between min and max (inclusive)
 */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Fill template string with random values
 */
function fillTemplate(template: string): string {
  return template
    .replace(/{user}/g, randomChoice(USERNAMES))
    .replace(/{ip}/g, Math.random() > 0.7 ? randomChoice(EXTERNAL_IPS) : randomChoice(INTERNAL_IPS))
    .replace(/{src_ip}/g, randomChoice(EXTERNAL_IPS))
    .replace(/{dst_ip}/g, randomChoice(INTERNAL_IPS))
    .replace(/{port}/g, String(randomChoice([22, 80, 443, 3306, 5432, 6379, 8080, 8443, 9200])))
    .replace(/{ms}/g, String(randomInt(10, 5000)))
    .replace(/{pct}/g, String(randomInt(60, 95)))
    .replace(/{count}/g, String(randomInt(10, 1000)))
    .replace(/{max}/g, String(randomInt(100, 1000)))
    .replace(/{pid}/g, String(randomInt(1000, 65535)))
    .replace(/{pid1}/g, String(randomInt(1000, 65535)))
    .replace(/{pid2}/g, String(randomInt(1000, 65535)))
    .replace(/{n}/g, String(randomInt(1, 5)))
    .replace(/{days}/g, String(randomInt(7, 90)))
    .replace(/{id}/g, String(randomInt(1000, 99999)))
    .replace(/{job}/g, randomChoice(['email-sender', 'data-sync', 'cleanup', 'report-gen']))
    .replace(/{operation}/g, randomChoice(['database-write', 'cache-update', 'api-call', 'file-upload']))
    .replace(/{endpoint}/g, randomChoice(NGINX_PATHS))
    .replace(/{service}/g, randomChoice(['redis', 'postgres', 'elasticsearch', 'rabbitmq']))
    .replace(/{error}/g, randomChoice(['disk full', 'permission denied', 'network unreachable']))
    .replace(/{table}/g, randomChoice(['users', 'posts', 'sessions', 'logs', 'products']))
    .replace(/{condition}/g, 'status = \'active\'')
    .replace(/{size}/g, String(randomInt(10, 1000)))
    .replace(/{host}/g, randomChoice(DEFAULT_HOSTNAMES))
    .replace(/{db}/g, randomChoice(['production', 'staging', 'analytics', 'cache']))
    .replace(/{country}/g, randomChoice(['CN', 'RU', 'KP', 'IR', 'BR', 'IN']))
    .replace(/{packets}/g, String(randomInt(100, 10000)));
}

/**
 * Generate a random timestamp within the given range
 */
function randomTimestamp(startDate: Date, endDate: Date): string {
  const start = startDate.getTime();
  const end = endDate.getTime();
  const timestamp = start + Math.random() * (end - start);
  return new Date(timestamp).toISOString();
}

/**
 * Generate mock Nginx access log
 */
function generateNginxLog(timestamp: string, hostname: string): Record<string, unknown> {
  const method = randomChoice(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
  const path = randomChoice(NGINX_PATHS);
  const status = randomChoice([200, 200, 200, 200, 201, 204, 301, 302, 304, 400, 401, 403, 404, 500, 502, 503]);
  const bytes = randomInt(200, 50000);
  const responseTime = randomInt(10, 2000) / 1000;
  const ip = randomChoice([...INTERNAL_IPS, ...EXTERNAL_IPS]);
  const userAgent = randomChoice(NGINX_USER_AGENTS);

  let severity = 6; // info
  if (status >= 500) severity = 3; // error
  else if (status >= 400) severity = 4; // warning

  const message = `${ip} - - [${timestamp}] "${method} ${path} HTTP/1.1" ${status} ${bytes} "-" "${userAgent}"`;

  return {
    timestamp,
    received_at: new Date().toISOString(),
    hostname,
    app_name: 'nginx',
    severity,
    facility: 1,
    priority: (1 * 8) + severity,
    message,
    raw: message,
    structured_data: JSON.stringify({
      method,
      path,
      status,
      bytes,
      response_time: responseTime,
      client_ip: ip,
      user_agent: userAgent,
    }),
    index_name: 'web',
    protocol: 'http',
    source_ip: ip,
  };
}

/**
 * Generate mock authentication log
 */
function generateAuthLog(timestamp: string, hostname: string): Record<string, unknown> {
  const isSuccess = Math.random() > 0.3; // 70% success rate
  const messages = isSuccess ? AUTH_SUCCESS_MESSAGES : AUTH_FAILURE_MESSAGES;
  const message = fillTemplate(randomChoice(messages));
  const severity = isSuccess ? 6 : 4; // info or warning

  return {
    timestamp,
    received_at: new Date().toISOString(),
    hostname,
    app_name: 'sshd',
    severity,
    facility: 10, // security
    priority: (10 * 8) + severity,
    message,
    raw: message,
    structured_data: JSON.stringify({
      auth_result: isSuccess ? 'success' : 'failure',
      service: 'ssh',
    }),
    index_name: 'security',
  };
}

/**
 * Generate mock application log
 */
function generateAppLog(timestamp: string, hostname: string): Record<string, unknown> {
  const roll = Math.random();
  let severity: number;
  let messages: string[];
  let level: string;

  if (roll < 0.6) {
    severity = 6;
    messages = APP_INFO_MESSAGES;
    level = 'info';
  } else if (roll < 0.85) {
    severity = 4;
    messages = APP_WARNING_MESSAGES;
    level = 'warning';
  } else {
    severity = 3;
    messages = APP_ERROR_MESSAGES;
    level = 'error';
  }

  const message = fillTemplate(randomChoice(messages));
  const appName = randomChoice(['api-server', 'worker', 'scheduler', 'processor', 'gateway']);

  return {
    timestamp,
    received_at: new Date().toISOString(),
    hostname,
    app_name: appName,
    severity,
    facility: 1,
    priority: (1 * 8) + severity,
    message,
    raw: message,
    structured_data: JSON.stringify({
      level,
      component: appName,
    }),
    index_name: 'app',
  };
}

/**
 * Generate mock firewall log
 */
function generateFirewallLog(timestamp: string, hostname: string): Record<string, unknown> {
  const message = fillTemplate(randomChoice(FIREWALL_MESSAGES));
  const isBlock = message.includes('BLOCK') || message.includes('Blocked') || message.includes('block');
  const severity = isBlock ? 4 : 5; // warning or notice

  return {
    timestamp,
    received_at: new Date().toISOString(),
    hostname,
    app_name: 'firewall',
    severity,
    facility: 13, // security
    priority: (13 * 8) + severity,
    message,
    raw: message,
    structured_data: JSON.stringify({
      action: isBlock ? 'block' : 'allow',
      type: 'firewall',
    }),
    index_name: 'security',
  };
}

/**
 * Generate mock database log
 */
function generateDatabaseLog(timestamp: string, hostname: string): Record<string, unknown> {
  const roll = Math.random();
  let severity: number;
  let messages: string[];
  let level: string;

  if (roll < 0.7) {
    severity = 6;
    messages = DB_INFO_MESSAGES;
    level = 'LOG';
  } else if (roll < 0.9) {
    severity = 4;
    messages = DB_WARNING_MESSAGES;
    level = 'WARNING';
  } else {
    severity = 3;
    messages = DB_ERROR_MESSAGES;
    level = 'ERROR';
  }

  const message = fillTemplate(randomChoice(messages));
  const dbType = randomChoice(['postgres', 'mysql', 'mongodb', 'redis']);

  return {
    timestamp,
    received_at: new Date().toISOString(),
    hostname,
    app_name: dbType,
    severity,
    facility: 1,
    priority: (1 * 8) + severity,
    message,
    raw: message,
    structured_data: JSON.stringify({
      level,
      database_type: dbType,
    }),
    index_name: 'database',
  };
}

/**
 * Generate mock syslog message
 */
function generateSyslogLog(timestamp: string, hostname: string): Record<string, unknown> {
  const messages = [
    'systemd[1]: Started Daily apt download activities.',
    'systemd[1]: Starting Daily apt upgrade and clean activities...',
    'CRON[{pid}]: (root) CMD (test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.daily ))',
    'kernel: [UFW BLOCK] IN=eth0 OUT= MAC=00:00:00:00:00:00',
    'systemd[1]: Reloading.',
    'syslog: rsyslogd was HUPed',
  ];

  const message = fillTemplate(randomChoice(messages));
  const app = message.split('[')[0].trim();

  return {
    timestamp,
    received_at: new Date().toISOString(),
    hostname,
    app_name: app || 'syslog',
    severity: 6,
    facility: 1,
    priority: (1 * 8) + 6,
    message,
    raw: message,
    structured_data: '{}',
    index_name: 'main',
  };
}

/**
 * Generate mock logs based on options
 */
export function generateMockLogs(options: MockLogOptions): Record<string, unknown>[] {
  const {
    count,
    timeRange,
    types = ['syslog', 'nginx', 'auth', 'app', 'firewall', 'database'],
    hostnames = DEFAULT_HOSTNAMES,
  } = options;

  const startDate = parseRelativeTime(timeRange.start);
  const endDate = parseRelativeTime(timeRange.end);

  const logs: Record<string, unknown>[] = [];

  for (let i = 0; i < count; i++) {
    const timestamp = randomTimestamp(startDate, endDate);
    const hostname = randomChoice(hostnames);
    const logType = randomChoice(types);

    let log: Record<string, unknown>;

    switch (logType) {
      case 'nginx':
        log = generateNginxLog(timestamp, hostname);
        break;
      case 'auth':
        log = generateAuthLog(timestamp, hostname);
        break;
      case 'app':
        log = generateAppLog(timestamp, hostname);
        break;
      case 'firewall':
        log = generateFirewallLog(timestamp, hostname);
        break;
      case 'database':
        log = generateDatabaseLog(timestamp, hostname);
        break;
      case 'syslog':
      default:
        log = generateSyslogLog(timestamp, hostname);
        break;
    }

    logs.push(log);
  }

  // Sort by timestamp
  logs.sort((a, b) => {
    const timeA = new Date(a.timestamp as string).getTime();
    const timeB = new Date(b.timestamp as string).getTime();
    return timeA - timeB;
  });

  return logs;
}

/**
 * Export logs to JSON format
 */
export function exportLogsToJSON(logs: Record<string, unknown>[]): string {
  return JSON.stringify(logs, null, 2);
}

/**
 * Import logs from JSON format
 */
export function importLogsFromJSON(json: string): Record<string, unknown>[] {
  const data = JSON.parse(json);

  if (!Array.isArray(data)) {
    throw new Error('Invalid format: expected array of log objects');
  }

  // Validate log structure
  for (const log of data) {
    if (!log.timestamp || !log.hostname || !log.message) {
      throw new Error('Invalid log format: missing required fields (timestamp, hostname, message)');
    }
  }

  return data;
}
