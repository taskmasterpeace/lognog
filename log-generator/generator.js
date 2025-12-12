#!/usr/bin/env node

/**
 * Spunk Log Generator
 * Generates realistic syslog messages for testing
 */

import dgram from 'dgram';
import net from 'net';

// Parse command line arguments
const args = process.argv.slice(2);
const parseArgs = () => {
  const parsed = {
    host: process.env.SYSLOG_HOST || 'localhost',
    port: parseInt(process.env.SYSLOG_PORT || '514'),
    protocol: process.env.SYSLOG_PROTOCOL || 'udp',
    rate: parseInt(process.env.LOG_RATE || '10'),
    duration: parseInt(process.env.DURATION || '0'),
    verbose: process.env.VERBOSE === 'true',
    errorRate: 10, // percentage
    burst: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--rate' && args[i + 1]) {
      parsed.rate = parseInt(args[++i]);
    } else if (args[i] === '--error-rate' && args[i + 1]) {
      parsed.errorRate = parseInt(args[++i]);
    } else if (args[i] === '--burst') {
      parsed.burst = true;
    } else if (args[i] === '--host' && args[i + 1]) {
      parsed.host = args[++i];
    } else if (args[i] === '--port' && args[i + 1]) {
      parsed.port = parseInt(args[++i]);
    } else if (args[i] === '--duration' && args[i + 1]) {
      parsed.duration = parseInt(args[++i]);
    } else if (args[i] === '--verbose' || args[i] === '-v') {
      parsed.verbose = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Spunk Log Generator - Generate realistic syslog messages for testing

Usage: node generator.js [options]

Options:
  --rate N          Logs per second (default: 10)
  --error-rate N    Percentage of errors (default: 10)
  --burst           Enable bursty traffic patterns
  --host HOST       Syslog host (default: localhost)
  --port PORT       Syslog port (default: 514)
  --duration N      Run for N seconds (default: infinite)
  --verbose, -v     Print all generated logs
  --help, -h        Show this help message

Environment Variables:
  SYSLOG_HOST       Same as --host
  SYSLOG_PORT       Same as --port
  SYSLOG_PROTOCOL   udp or tcp (default: udp)
  LOG_RATE          Same as --rate
  DURATION          Same as --duration
  VERBOSE           Same as --verbose

Examples:
  node generator.js --rate 100 --error-rate 15 --burst
  node generator.js --rate 50 --duration 60
  SYSLOG_HOST=remote.local node generator.js --rate 20
      `);
      process.exit(0);
    }
  }

  return parsed;
};

const CONFIG = parseArgs();

// Syslog facilities
const FACILITIES = {
  kern: 0, user: 1, mail: 2, daemon: 3, auth: 4, syslog: 5,
  lpr: 6, news: 7, uucp: 8, cron: 9, authpriv: 10, ftp: 11,
  local0: 16, local1: 17, local2: 18, local3: 19,
  local4: 20, local5: 21, local6: 22, local7: 23,
};

// Syslog severities
const SEVERITIES = {
  emergency: 0, alert: 1, critical: 2, error: 3,
  warning: 4, notice: 5, info: 6, debug: 7,
};

// Sample data
const HOSTNAMES = [
  'web-server-01', 'web-server-02', 'web-server-03',
  'db-server-01', 'db-server-02', 'cache-server-01', 'cache-server-02',
  'app-server-01', 'app-server-02', 'app-server-03',
  'gateway-01', 'firewall-01', 'nas-01', 'proxmox-01',
  'docker-host-01', 'docker-host-02',
  'k8s-master-01', 'k8s-node-01', 'k8s-node-02', 'k8s-node-03',
  'nginx-ingress-01', 'load-balancer-01',
];

const K8S_PODS = [
  'api-deployment-7d9f8c6b4-x7k2m',
  'api-deployment-7d9f8c6b4-9qw3p',
  'web-deployment-5c8a7b2d1-h4n8v',
  'web-deployment-5c8a7b2d1-k2m5t',
  'worker-deployment-4b6c9d3e2-p8q1r',
  'redis-statefulset-0',
  'postgres-statefulset-0',
  'nginx-ingress-controller-6d8f5c7b9-w3x2z',
];

const AWS_INSTANCES = [
  'i-0a1b2c3d4e5f6g7h8',
  'i-9j8k7l6m5n4o3p2q1',
  'i-1r2s3t4u5v6w7x8y9',
];

const USERS = ['admin', 'root', 'john', 'jane', 'deploy', 'backup', 'www-data', 'nobody', 'jenkins', 'gitlab-runner'];

// More realistic IP ranges
const INTERNAL_IPS = Array.from({ length: 20 }, (_, i) => `192.168.1.${100 + i}`);
const DMZ_IPS = Array.from({ length: 10 }, (_, i) => `10.0.10.${10 + i}`);
const EXTERNAL_IPS = [
  '203.0.113.42', '198.51.100.23', '192.0.2.15', '198.51.100.88',
  '8.8.8.8', '1.1.1.1', // DNS servers
  '185.220.101.45', '91.199.119.15', // Suspicious IPs
];
const IP_ADDRESSES = [...INTERNAL_IPS, ...DMZ_IPS, ...EXTERNAL_IPS];

const PORTS = [22, 80, 443, 3306, 5432, 6379, 8080, 8443, 9000, 9090, 27017, 5672, 9200];

const HTTP_PATHS = [
  '/', '/index.html', '/favicon.ico',
  '/api/v1/users', '/api/v1/users/123', '/api/v1/login', '/api/v1/logout',
  '/api/v1/products', '/api/v1/products/search', '/api/v1/orders',
  '/api/v1/checkout', '/api/v1/payment/webhook',
  '/api/v2/users', '/api/v2/analytics',
  '/health', '/healthz', '/ready', '/metrics', '/status',
  '/static/js/app.bundle.js', '/static/js/vendor.bundle.js',
  '/static/css/main.css', '/images/logo.png', '/images/hero.jpg',
  '/admin', '/admin/dashboard', '/admin/users',
  '/webhooks/github', '/webhooks/stripe',
  '/.env', '/admin.php', '/wp-login.php', '/phpMyAdmin', // Attack attempts
];

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];
const HTTP_CODES = [
  200, 200, 200, 200, 200, // Most requests succeed
  201, 204, 301, 302, 304,
  400, 401, 403, 404, 422,
  500, 502, 503, 504,
];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
  'curl/7.68.0',
  'python-requests/2.28.1',
  'Go-http-client/1.1',
  'Prometheus/2.37.0',
];

// Correlation IDs for request tracing
let correlationIdCounter = 1000;
const generateCorrelationId = () => {
  return `${Date.now()}-${(correlationIdCounter++).toString(16)}`;
};

// Log generators for different services

const generators = {
  // SSH/Authentication logs
  sshd: () => {
    const templates = [
      () => {
        const user = pick(USERS);
        const ip = pick(IP_ADDRESSES);
        const port = randomInt(40000, 60000);
        return {
          facility: 'authpriv',
          severity: 'info',
          app: 'sshd',
          pid: randomInt(1000, 9999),
          message: `Accepted publickey for ${user} from ${ip} port ${port} ssh2: RSA SHA256:${randomHash(43)}`,
        };
      },
      () => {
        const user = pick(USERS);
        const ip = pick(IP_ADDRESSES);
        const port = randomInt(40000, 60000);
        return {
          facility: 'authpriv',
          severity: 'warning',
          app: 'sshd',
          pid: randomInt(1000, 9999),
          message: `Failed password for ${user} from ${ip} port ${port} ssh2`,
        };
      },
      () => {
        const ip = pick(IP_ADDRESSES);
        return {
          facility: 'authpriv',
          severity: 'error',
          app: 'sshd',
          pid: randomInt(1000, 9999),
          message: `Invalid user admin from ${ip} port ${randomInt(40000, 60000)}`,
        };
      },
      () => {
        const user = pick(USERS);
        return {
          facility: 'authpriv',
          severity: 'info',
          app: 'sshd',
          pid: randomInt(1000, 9999),
          message: `session opened for user ${user} by (uid=0)`,
        };
      },
      () => {
        const user = pick(USERS);
        return {
          facility: 'authpriv',
          severity: 'info',
          app: 'sshd',
          pid: randomInt(1000, 9999),
          message: `session closed for user ${user}`,
        };
      },
    ];
    return pick(templates)();
  },

  // Apache access logs (proper format)
  apache: () => {
    const ip = pick(IP_ADDRESSES);
    const user = Math.random() > 0.9 ? pick(USERS) : '-';
    const method = pick(HTTP_METHODS);
    const path = pick(HTTP_PATHS);
    const code = pick(HTTP_CODES);
    const bytes = code === 304 ? 0 : randomInt(100, 50000);
    const userAgent = pick(USER_AGENTS);
    const referer = Math.random() > 0.5 ? `http://example.com${pick(HTTP_PATHS)}` : '-';
    const now = new Date();
    const timestamp = `${String(now.getDate()).padStart(2, '0')}/${now.toLocaleString('en', { month: 'short' })}/${now.getFullYear()}:${now.toTimeString().split(' ')[0]} +0000`;
    const severity = code >= 500 ? 'error' : code >= 400 ? 'warning' : 'info';

    return {
      facility: 'local0',
      severity,
      app: 'apache',
      pid: randomInt(1000, 9999),
      message: `${ip} - ${user} [${timestamp}] "${method} ${path} HTTP/1.1" ${code} ${bytes} "${referer}" "${userAgent}"`,
    };
  },

  // Nginx access logs
  nginx: () => {
    const ip = pick(IP_ADDRESSES);
    const method = pick(HTTP_METHODS);
    const path = pick(HTTP_PATHS);
    const code = pick(HTTP_CODES);
    const bytes = code === 304 ? 0 : randomInt(100, 50000);
    const time = (Math.random() * 2).toFixed(3);
    const userAgent = pick(USER_AGENTS);
    const referer = Math.random() > 0.5 ? `http://example.com${pick(HTTP_PATHS)}` : '-';
    const severity = code >= 500 ? 'error' : code >= 400 ? 'warning' : 'info';

    return {
      facility: 'local0',
      severity,
      app: 'nginx',
      pid: randomInt(1000, 9999),
      message: `${ip} - - "${method} ${path} HTTP/1.1" ${code} ${bytes} "${referer}" "${userAgent}" rt=${time}`,
    };
  },

  // Docker container logs
  docker: () => {
    const containers = ['api', 'web', 'worker', 'redis', 'postgres', 'nginx'];
    const container = pick(containers);
    const templates = [
      () => ({
        severity: 'info',
        message: `Container ${container} started`,
      }),
      () => ({
        severity: 'info',
        message: `Container ${container} health check passed`,
      }),
      () => ({
        severity: 'warning',
        message: `Container ${container} high memory usage: ${randomInt(70, 95)}%`,
      }),
      () => ({
        severity: 'error',
        message: `Container ${container} exited with code ${pick([1, 137, 143])}`,
      }),
      () => ({
        severity: 'info',
        message: `Pulling image ${container}:latest`,
      }),
    ];
    const log = pick(templates)();
    return {
      facility: 'daemon',
      app: 'dockerd',
      pid: randomInt(1000, 5000),
      ...log,
    };
  },

  // Firewall logs (iptables/nftables style)
  firewall: () => {
    const actions = ['ACCEPT', 'ACCEPT', 'ACCEPT', 'DROP', 'REJECT'];
    const protocols = ['TCP', 'UDP', 'ICMP'];
    const action = pick(actions);
    const proto = pick(protocols);
    const srcIp = pick(IP_ADDRESSES);
    const dstIp = '192.168.1.1';
    const srcPort = randomInt(1024, 65535);
    const dstPort = pick(PORTS);

    return {
      facility: 'kern',
      severity: action === 'DROP' || action === 'REJECT' ? 'warning' : 'info',
      app: 'kernel',
      pid: null,
      message: `[UFW ${action}] IN=eth0 OUT= MAC=00:00:00:00:00:00 SRC=${srcIp} DST=${dstIp} PROTO=${proto} SPT=${srcPort} DPT=${dstPort}`,
    };
  },

  // System/kernel logs
  kernel: () => {
    const templates = [
      () => ({
        severity: 'info',
        message: `[${randomInt(1000, 9999)}.${randomInt(100, 999)}] eth0: link up, 1000Mbps, full-duplex`,
      }),
      () => ({
        severity: 'warning',
        message: `[${randomInt(1000, 9999)}.${randomInt(100, 999)}] CPU${randomInt(0, 7)}: Temperature above threshold, cpu clock throttled`,
      }),
      () => ({
        severity: 'info',
        message: `[${randomInt(1000, 9999)}.${randomInt(100, 999)}] usb 2-1: new high-speed USB device number ${randomInt(2, 10)}`,
      }),
      () => ({
        severity: 'error',
        message: `[${randomInt(1000, 9999)}.${randomInt(100, 999)}] EXT4-fs error (device sda1): ext4_find_entry: reading directory lblock 0`,
      }),
      () => ({
        severity: 'notice',
        message: `[${randomInt(1000, 9999)}.${randomInt(100, 999)}] Out of memory: Killed process ${randomInt(1000, 9999)} (java)`,
      }),
    ];
    const log = pick(templates)();
    return {
      facility: 'kern',
      app: 'kernel',
      pid: null,
      ...log,
    };
  },

  // Cron jobs
  cron: () => {
    const user = pick(['root', 'www-data', 'backup']);
    const commands = [
      '/usr/bin/backup.sh',
      '/opt/scripts/cleanup.py',
      '/usr/local/bin/certbot renew',
      'logrotate /etc/logrotate.conf',
    ];
    const templates = [
      () => ({
        severity: 'info',
        message: `(${user}) CMD (${pick(commands)})`,
      }),
      () => ({
        severity: 'info',
        message: `(${user}) CMDEND (${pick(commands)})`,
      }),
      () => ({
        severity: 'error',
        message: `(${user}) FAILED to execute ${pick(commands)}`,
      }),
    ];
    const log = pick(templates)();
    return {
      facility: 'cron',
      app: 'CRON',
      pid: randomInt(10000, 30000),
      ...log,
    };
  },

  // Database logs (PostgreSQL style)
  postgres: () => {
    const templates = [
      () => ({
        severity: 'info',
        message: `connection received: host=${pick(IP_ADDRESSES)} port=${randomInt(40000, 60000)}`,
      }),
      () => ({
        severity: 'info',
        message: `connection authorized: user=app database=production`,
      }),
      () => ({
        severity: 'warning',
        message: `duration: ${randomInt(1000, 10000)}.${randomInt(100, 999)} ms statement: SELECT * FROM users WHERE id = ${randomInt(1, 10000)}`,
      }),
      () => ({
        severity: 'error',
        message: `ERROR: duplicate key value violates unique constraint "users_email_key"`,
      }),
      () => ({
        severity: 'info',
        message: `checkpoint complete: wrote ${randomInt(100, 1000)} buffers (${randomInt(1, 10)}.${randomInt(0, 9)}%)`,
      }),
      () => ({
        severity: 'warning',
        message: `temporary file: path "base/pgsql_tmp/pgsql_tmp${randomInt(1000, 9999)}.0", size ${randomInt(10000, 100000)}`,
      }),
    ];
    const log = pick(templates)();
    return {
      facility: 'local1',
      app: 'postgres',
      pid: randomInt(1000, 5000),
      ...log,
    };
  },

  // Kubernetes pod logs (JSON structured)
  kubernetes: () => {
    const pod = pick(K8S_PODS);
    const namespace = pick(['default', 'production', 'staging', 'monitoring']);
    const container = pod.split('-')[0];
    const correlationId = generateCorrelationId();

    const templates = [
      () => ({
        severity: 'info',
        message: JSON.stringify({
          level: 'info',
          ts: new Date().toISOString(),
          logger: container,
          msg: 'HTTP request completed',
          method: pick(HTTP_METHODS),
          path: pick(HTTP_PATHS),
          status: pick([200, 201, 204]),
          duration: randomInt(10, 500),
          correlation_id: correlationId,
        }),
      }),
      () => ({
        severity: 'warning',
        message: JSON.stringify({
          level: 'warn',
          ts: new Date().toISOString(),
          logger: container,
          msg: 'Slow query detected',
          query: 'SELECT * FROM users WHERE active = true',
          duration_ms: randomInt(1000, 5000),
          correlation_id: correlationId,
        }),
      }),
      () => ({
        severity: 'error',
        message: JSON.stringify({
          level: 'error',
          ts: new Date().toISOString(),
          logger: container,
          msg: 'Database connection failed',
          error: 'ECONNREFUSED',
          host: 'postgres-statefulset-0.postgres',
          port: 5432,
          correlation_id: correlationId,
        }),
      }),
      () => ({
        severity: 'info',
        message: JSON.stringify({
          level: 'info',
          ts: new Date().toISOString(),
          logger: container,
          msg: 'Health check passed',
          checks: { database: 'ok', redis: 'ok', disk: 'ok' },
        }),
      }),
    ];
    const log = pick(templates)();
    return {
      facility: 'local3',
      app: `k8s/${namespace}/${pod}`,
      pid: randomInt(1, 999),
      ...log,
    };
  },

  // AWS CloudWatch style logs
  aws: () => {
    const instanceId = pick(AWS_INSTANCES);
    const logGroup = pick(['/aws/lambda/api', '/aws/ecs/production', '/aws/ec2/application']);
    const correlationId = generateCorrelationId();

    const templates = [
      () => ({
        severity: 'info',
        message: JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'INFO',
          requestId: correlationId,
          message: 'Lambda function executed successfully',
          duration: randomInt(100, 3000),
          memoryUsed: randomInt(128, 512),
          memoryLimit: 512,
        }),
      }),
      () => ({
        severity: 'error',
        message: JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'ERROR',
          requestId: correlationId,
          message: 'Lambda function timeout',
          duration: 30000,
          error: 'Task timed out after 30.00 seconds',
        }),
      }),
      () => ({
        severity: 'info',
        message: JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'INFO',
          instanceId,
          message: 'EC2 instance status check passed',
          checks: { system: 'ok', instance: 'ok' },
        }),
      }),
    ];
    const log = pick(templates)();
    return {
      facility: 'local4',
      app: 'aws-cloudwatch',
      pid: null,
      ...log,
    };
  },

  // Security logs (authentication, authorization)
  security: () => {
    const ip = pick(IP_ADDRESSES);
    const user = pick(USERS);
    const correlationId = generateCorrelationId();

    const templates = [
      () => ({
        severity: 'warning',
        message: `Failed login attempt for user '${user}' from ${ip} - invalid password`,
      }),
      () => ({
        severity: 'warning',
        message: `Failed login attempt for user '${user}' from ${ip} - account locked after ${randomInt(3, 5)} attempts`,
      }),
      () => ({
        severity: 'error',
        message: `Brute force attack detected from ${ip} - ${randomInt(10, 50)} failed attempts in ${randomInt(1, 5)} minutes`,
      }),
      () => ({
        severity: 'warning',
        message: `Permission denied for user '${user}' accessing ${pick(HTTP_PATHS)} - insufficient privileges`,
      }),
      () => ({
        severity: 'error',
        message: `SQL injection attempt detected from ${ip} - query: "SELECT * FROM users WHERE id='1' OR '1'='1'"`,
      }),
      () => ({
        severity: 'warning',
        message: `Suspicious activity: User '${user}' logged in from ${ip} (${pick(['China', 'Russia', 'Unknown'])}) - unusual location`,
      }),
      () => ({
        severity: 'info',
        message: `User '${user}' logged in successfully from ${ip} - correlation_id: ${correlationId}`,
      }),
      () => ({
        severity: 'info',
        message: `User '${user}' logged out - session duration: ${randomInt(5, 120)} minutes`,
      }),
      () => ({
        severity: 'warning',
        message: `API rate limit exceeded for ${ip} - ${randomInt(100, 1000)} requests in 1 minute`,
      }),
    ];
    const log = pick(templates)();
    return {
      facility: 'authpriv',
      app: 'security',
      pid: randomInt(1000, 9999),
      ...log,
    };
  },

  // Database query logs with durations
  mysql: () => {
    const user = pick(['app', 'readonly', 'admin']);
    const db = pick(['production', 'analytics', 'users']);
    const correlationId = generateCorrelationId();

    const queries = [
      'SELECT * FROM users WHERE id = ?',
      'SELECT * FROM orders WHERE user_id = ? AND status = ?',
      'UPDATE users SET last_login = NOW() WHERE id = ?',
      'INSERT INTO audit_log (user_id, action, timestamp) VALUES (?, ?, ?)',
      'SELECT COUNT(*) FROM products WHERE category = ?',
      'DELETE FROM sessions WHERE expired_at < NOW()',
      'SELECT u.*, p.* FROM users u JOIN profiles p ON u.id = p.user_id WHERE u.email = ?',
    ];

    const templates = [
      () => ({
        severity: 'info',
        message: `[${correlationId}] ${user}@${db} Query: "${pick(queries)}" Time: ${randomInt(1, 100)}ms Rows: ${randomInt(1, 1000)}`,
      }),
      () => ({
        severity: 'warning',
        message: `[${correlationId}] ${user}@${db} Slow query (${randomInt(1000, 10000)}ms): "${pick(queries)}"`,
      }),
      () => ({
        severity: 'error',
        message: `[${correlationId}] ${user}@${db} Query failed: Deadlock found when trying to get lock; try restarting transaction`,
      }),
      () => ({
        severity: 'error',
        message: `[${correlationId}] ${user}@${db} Query failed: Table 'users' doesn't exist`,
      }),
      () => ({
        severity: 'warning',
        message: `[${correlationId}] ${user}@${db} Connection limit reached: max_connections=${randomInt(100, 200)}`,
      }),
    ];
    const log = pick(templates)();
    return {
      facility: 'local1',
      app: 'mysql',
      pid: randomInt(1000, 9999),
      ...log,
    };
  },

  // Application logs with stack traces
  appWithErrors: () => {
    const modules = ['api', 'auth', 'database', 'cache', 'worker', 'queue'];
    const correlationId = generateCorrelationId();

    const stackTraces = {
      java: () => `java.lang.NullPointerException: Cannot invoke method on null object
        at com.example.service.UserService.getUser(UserService.java:${randomInt(50, 200)})
        at com.example.controller.UserController.handleRequest(UserController.java:${randomInt(30, 100)})
        at com.example.framework.RequestDispatcher.dispatch(RequestDispatcher.java:${randomInt(100, 300)})
        at com.example.framework.Filter.doFilter(Filter.java:${randomInt(20, 80)})
        at org.apache.tomcat.websocket.server.WsFilter.doFilter(WsFilter.java:52)
        at java.base/java.lang.Thread.run(Thread.java:829)`,

      python: () => `Traceback (most recent call last):
  File "/app/main.py", line ${randomInt(50, 200)}, in handle_request
    result = process_user_data(user_id)
  File "/app/services/user.py", line ${randomInt(30, 100)}, in process_user_data
    user = User.query.get(user_id)
  File "/usr/local/lib/python3.9/site-packages/sqlalchemy/orm/query.py", line ${randomInt(500, 1000)}, in get
    return self._get_impl(ident, loading.load_on_ident)
AttributeError: 'NoneType' object has no attribute 'id'`,

      nodejs: () => `Error: Database connection timeout
    at Connection.connect (/app/node_modules/pg/lib/connection.js:${randomInt(50, 200)})
    at Client._connect (/app/node_modules/pg/lib/client.js:${randomInt(30, 100)})
    at Client.connect (/app/node_modules/pg/lib/client.js:${randomInt(20, 80)})
    at Database.query (/app/src/database.js:${randomInt(10, 50)})
    at UserService.getUser (/app/src/services/user.js:${randomInt(40, 120)})
    at async /app/src/controllers/user.js:${randomInt(15, 60)}`,
    };

    const templates = [
      () => ({
        severity: 'info',
        message: `[INFO] [${pick(modules)}] [${correlationId}] Request processed in ${randomInt(10, 500)}ms`,
      }),
      () => ({
        severity: 'debug',
        message: `[DEBUG] [${pick(modules)}] [${correlationId}] Cache hit for key: user:${randomInt(1, 1000)}`,
      }),
      () => ({
        severity: 'warning',
        message: `[WARN] [${pick(modules)}] [${correlationId}] Retrying failed operation, attempt ${randomInt(2, 5)}`,
      }),
      () => ({
        severity: 'error',
        message: `[ERROR] [${pick(modules)}] [${correlationId}] Connection timeout after ${randomInt(5000, 30000)}ms`,
      }),
      () => ({
        severity: 'error',
        message: `[ERROR] [${pick(modules)}] [${correlationId}] Unhandled exception:\n${pick([stackTraces.java, stackTraces.python, stackTraces.nodejs])()}`,
      }),
      () => ({
        severity: 'info',
        message: `[INFO] [${pick(modules)}] [${correlationId}] User ${randomInt(1000, 9999)} logged in successfully`,
      }),
    ];
    const log = pick(templates)();
    return {
      facility: 'local2',
      app: 'myapp',
      pid: randomInt(1000, 9999),
      ...log,
    };
  },

  // systemd/init logs
  systemd: () => {
    const services = ['nginx', 'docker', 'postgresql', 'redis', 'sshd', 'cron'];
    const service = pick(services);
    const templates = [
      () => ({
        severity: 'info',
        message: `Started ${service}.service - ${service} daemon`,
      }),
      () => ({
        severity: 'info',
        message: `Stopped ${service}.service - ${service} daemon`,
      }),
      () => ({
        severity: 'info',
        message: `Reloading ${service}.service - ${service} daemon`,
      }),
      () => ({
        severity: 'error',
        message: `${service}.service: Failed with result 'exit-code'`,
      }),
      () => ({
        severity: 'warning',
        message: `${service}.service: Watchdog timeout (limit ${randomInt(30, 120)}s)!`,
      }),
    ];
    const log = pick(templates)();
    return {
      facility: 'daemon',
      app: 'systemd',
      pid: 1,
      ...log,
    };
  },
};

// Helper functions
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomHash(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length }, () => chars[randomInt(0, chars.length - 1)]).join('');
}

function formatTimestamp() {
  const now = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[now.getMonth()];
  const day = String(now.getDate()).padStart(2, ' ');
  const time = now.toTimeString().split(' ')[0];
  return `${month} ${day} ${time}`;
}

function buildSyslogMessage(hostname, log) {
  const facility = FACILITIES[log.facility] ?? 1;
  const severity = SEVERITIES[log.severity] ?? 6;
  const priority = facility * 8 + severity;
  const timestamp = formatTimestamp();
  const pid = log.pid ? `[${log.pid}]` : '';

  return `<${priority}>${timestamp} ${hostname} ${log.app}${pid}: ${log.message}`;
}

// Main generator
class LogGenerator {
  constructor() {
    this.socket = null;
    this.sent = 0;
    this.startTime = Date.now();
  }

  async connect() {
    if (CONFIG.protocol === 'tcp') {
      return new Promise((resolve, reject) => {
        this.socket = new net.Socket();
        this.socket.connect(CONFIG.port, CONFIG.host, () => {
          console.log(`Connected to ${CONFIG.host}:${CONFIG.port} via TCP`);
          resolve();
        });
        this.socket.on('error', reject);
      });
    } else {
      this.socket = dgram.createSocket('udp4');
      console.log(`Ready to send to ${CONFIG.host}:${CONFIG.port} via UDP`);
    }
  }

  send(message) {
    if (CONFIG.protocol === 'tcp') {
      this.socket.write(message + '\n');
    } else {
      const buffer = Buffer.from(message);
      this.socket.send(buffer, 0, buffer.length, CONFIG.port, CONFIG.host);
    }
    this.sent++;

    if (CONFIG.verbose) {
      console.log(message);
    }
  }

  generateLog() {
    const hostname = pick(HOSTNAMES);

    // Time-based patterns: simulate business hours activity
    const hour = new Date().getHours();
    const isBusinessHours = hour >= 9 && hour < 17;
    const isNightTime = hour < 6 || hour >= 22;

    // Weight certain generators higher for realistic distribution
    let weights = {
      nginx: 25,
      apache: 10,
      appWithErrors: 20,
      kubernetes: 15,
      sshd: 8,
      security: 8,
      docker: 8,
      firewall: 8,
      mysql: 8,
      postgres: 5,
      aws: 5,
      systemd: 4,
      kernel: 3,
      cron: 2,
    };

    // Adjust weights based on time of day
    if (isBusinessHours) {
      // More API/app traffic during business hours
      weights.nginx *= 2;
      weights.apache *= 2;
      weights.appWithErrors *= 2;
      weights.kubernetes *= 2;
      weights.mysql *= 1.5;
      weights.postgres *= 1.5;
    } else if (isNightTime) {
      // More batch jobs and maintenance at night
      weights.cron *= 3;
      weights.systemd *= 2;
      weights.docker *= 1.5;
      // Less user traffic
      weights.nginx *= 0.5;
      weights.apache *= 0.5;
    }

    // Adjust weights based on error rate
    const errorGenerators = ['appWithErrors', 'security', 'mysql', 'kubernetes'];
    const normalGenerators = ['nginx', 'apache', 'sshd', 'docker'];

    if (Math.random() * 100 < CONFIG.errorRate) {
      // Boost error generators
      errorGenerators.forEach(gen => {
        if (weights[gen]) weights[gen] *= 2;
      });
    } else {
      // Boost normal generators
      normalGenerators.forEach(gen => {
        if (weights[gen]) weights[gen] *= 1.5;
      });
    }

    const weighted = [];
    for (const [name, weight] of Object.entries(weights)) {
      for (let i = 0; i < Math.round(weight); i++) {
        weighted.push(name);
      }
    }

    const generatorName = pick(weighted);
    const generator = generators[generatorName];
    const log = generator();

    return buildSyslogMessage(hostname, log);
  }

  // Simulate error cascades - one error triggers related errors
  generateErrorCascade() {
    const cascades = [
      // Database connection failure cascade
      () => {
        const messages = [];
        const correlationId = generateCorrelationId();
        messages.push(buildSyslogMessage('db-server-01', {
          facility: 'local1',
          severity: 'error',
          app: 'postgres',
          pid: randomInt(1000, 5000),
          message: `[${correlationId}] FATAL: connection limit exceeded for non-superusers`,
        }));

        // App servers start failing
        for (let i = 0; i < 3; i++) {
          messages.push(buildSyslogMessage(`app-server-0${i + 1}`, {
            facility: 'local2',
            severity: 'error',
            app: 'myapp',
            pid: randomInt(1000, 9999),
            message: `[ERROR] [database] [${correlationId}] Failed to connect to database: ECONNREFUSED`,
          }));
        }

        // Load balancer reports backend failures
        messages.push(buildSyslogMessage('nginx-ingress-01', {
          facility: 'local0',
          severity: 'error',
          app: 'nginx',
          pid: randomInt(1000, 9999),
          message: `[${correlationId}] upstream server temporarily unavailable while connecting to upstream`,
        }));

        return messages;
      },

      // Memory exhaustion cascade
      () => {
        const messages = [];
        const hostname = pick(HOSTNAMES);
        const correlationId = generateCorrelationId();

        messages.push(buildSyslogMessage(hostname, {
          facility: 'kern',
          severity: 'warning',
          app: 'kernel',
          pid: null,
          message: `[${correlationId}] Out of memory: Kill process ${randomInt(1000, 9999)} (java) score ${randomInt(500, 900)} or sacrifice child`,
        }));

        messages.push(buildSyslogMessage(hostname, {
          facility: 'local2',
          severity: 'error',
          app: 'myapp',
          pid: randomInt(1000, 9999),
          message: `[ERROR] [worker] [${correlationId}] Process terminated unexpectedly - exit code 137 (SIGKILL)`,
        }));

        messages.push(buildSyslogMessage(hostname, {
          facility: 'daemon',
          severity: 'error',
          app: 'systemd',
          pid: 1,
          message: `[${correlationId}] myapp.service: Main process exited, code=killed, status=9/KILL`,
        }));

        return messages;
      },

      // Network issue cascade
      () => {
        const messages = [];
        const correlationId = generateCorrelationId();

        messages.push(buildSyslogMessage('gateway-01', {
          facility: 'kern',
          severity: 'warning',
          app: 'kernel',
          pid: null,
          message: `[${correlationId}] eth0: link down`,
        }));

        // Multiple services can't reach external resources
        ['app-server-01', 'app-server-02', 'web-server-01'].forEach(host => {
          messages.push(buildSyslogMessage(host, {
            facility: 'local2',
            severity: 'error',
            app: 'myapp',
            pid: randomInt(1000, 9999),
            message: `[ERROR] [api] [${correlationId}] Network unreachable: Failed to reach external service`,
          }));
        });

        return messages;
      },
    ];

    return pick(cascades)();
  }

  // Generate correlated events (e.g., login followed by activity)
  generateCorrelatedEvents() {
    const events = [];
    const user = pick(USERS);
    const ip = pick(IP_ADDRESSES);
    const correlationId = generateCorrelationId();
    const sessionId = randomHash(32);

    // Login
    events.push(buildSyslogMessage('gateway-01', {
      facility: 'authpriv',
      severity: 'info',
      app: 'security',
      pid: randomInt(1000, 9999),
      message: `User '${user}' logged in successfully from ${ip} - correlation_id: ${correlationId}, session_id: ${sessionId}`,
    }));

    // API activity
    const numRequests = randomInt(3, 8);
    for (let i = 0; i < numRequests; i++) {
      events.push(buildSyslogMessage('web-server-01', {
        facility: 'local0',
        severity: 'info',
        app: 'nginx',
        pid: randomInt(1000, 9999),
        message: `${ip} - ${user} "${pick(HTTP_METHODS)} ${pick(HTTP_PATHS)} HTTP/1.1" ${pick([200, 200, 200, 201, 204])} ${randomInt(100, 5000)} "-" "${pick(USER_AGENTS)}" rt=${(Math.random() * 0.5).toFixed(3)} session=${sessionId}`,
      }));
    }

    // Optional logout
    if (Math.random() > 0.3) {
      events.push(buildSyslogMessage('gateway-01', {
        facility: 'authpriv',
        severity: 'info',
        app: 'security',
        pid: randomInt(1000, 9999),
        message: `User '${user}' logged out - session duration: ${randomInt(5, 60)} minutes, session_id: ${sessionId}`,
      }));
    }

    return events;
  }

  async run() {
    await this.connect();

    let currentRate = CONFIG.rate;
    const baseInterval = 1000 / CONFIG.rate;

    console.log(`\nGenerating ${CONFIG.rate} logs/second...`);
    if (CONFIG.burst) {
      console.log('Bursty traffic mode enabled');
    }
    console.log(`Error rate: ${CONFIG.errorRate}%`);
    console.log(`Press Ctrl+C to stop\n`);

    let burstMultiplier = 1;
    let lastBurstChange = Date.now();

    const generateAndSend = () => {
      // Bursty traffic simulation
      if (CONFIG.burst) {
        const now = Date.now();
        // Change burst state every 10-30 seconds
        if (now - lastBurstChange > randomInt(10000, 30000)) {
          // Random burst: 0.2x to 5x normal rate
          const burstLevels = [0.2, 0.5, 1, 1, 1, 1.5, 2, 3, 5];
          burstMultiplier = pick(burstLevels);
          lastBurstChange = now;

          if (CONFIG.verbose || burstMultiplier > 2) {
            console.log(`\n[Burst] Rate multiplier: ${burstMultiplier}x`);
          }
        }
      }

      currentRate = CONFIG.rate * burstMultiplier;

      // Occasionally generate correlated events (5% chance)
      if (Math.random() < 0.05) {
        const correlatedEvents = this.generateCorrelatedEvents();
        correlatedEvents.forEach(msg => this.send(msg));
      }
      // Occasionally generate error cascades (2% chance)
      else if (Math.random() < 0.02) {
        const cascadeEvents = this.generateErrorCascade();
        cascadeEvents.forEach(msg => this.send(msg));
      }
      // Normal log generation
      else {
        const message = this.generateLog();
        this.send(message);
      }

      if (this.sent % 100 === 0) {
        const elapsed = (Date.now() - this.startTime) / 1000;
        const rate = (this.sent / elapsed).toFixed(1);
        const burstIndicator = CONFIG.burst && burstMultiplier !== 1 ? ` [${burstMultiplier}x]` : '';
        process.stdout.write(`\rSent: ${this.sent} logs (${rate}/s)${burstIndicator}  `);
      }

      if (CONFIG.duration > 0 && Date.now() - this.startTime >= CONFIG.duration * 1000) {
        this.stop();
      }
    };

    // Use setInterval for base rate, but adjust dynamically
    const timer = setInterval(generateAndSend, baseInterval);

    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
  }

  stop() {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    console.log(`\n\nStopped. Sent ${this.sent} logs in ${elapsed}s`);
    process.exit(0);
  }
}

// Run
console.log('Spunk Log Generator');
console.log('===================');
console.log(`Host:       ${CONFIG.host}:${CONFIG.port} (${CONFIG.protocol.toUpperCase()})`);
console.log(`Rate:       ${CONFIG.rate} logs/second`);
console.log(`Error rate: ${CONFIG.errorRate}%`);
console.log(`Burst mode: ${CONFIG.burst ? 'enabled' : 'disabled'}`);
if (CONFIG.duration > 0) {
  console.log(`Duration:   ${CONFIG.duration} seconds`);
}

const generator = new LogGenerator();
generator.run().catch(console.error);
