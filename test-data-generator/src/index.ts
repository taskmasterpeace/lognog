#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs';
import * as dgram from 'dgram';
import * as net from 'net';

// =============================================================================
// CONFIGURATION & TYPES
// =============================================================================

interface LogEvent {
  timestamp: Date;
  facility: number;
  severity: number;
  hostname: string;
  appName: string;
  pid?: number;
  message: string;
}

interface Scenario {
  name: string;
  description: string;
  generate: (baseTime: Date, duration: number) => LogEvent[];
}

// Severity levels
const SEV = {
  EMERGENCY: 0,
  ALERT: 1,
  CRITICAL: 2,
  ERROR: 3,
  WARNING: 4,
  NOTICE: 5,
  INFO: 6,
  DEBUG: 7,
};

// Facility codes
const FAC = {
  KERN: 0,
  USER: 1,
  MAIL: 2,
  DAEMON: 3,
  AUTH: 4,
  SYSLOG: 5,
  LPR: 6,
  NEWS: 7,
  UUCP: 8,
  CRON: 9,
  AUTHPRIV: 10,
  FTP: 11,
  LOCAL0: 16,
  LOCAL1: 17,
  LOCAL2: 18,
  LOCAL3: 19,
  LOCAL4: 20,
  LOCAL5: 21,
  LOCAL6: 22,
  LOCAL7: 23,
};

// =============================================================================
// INFRASTRUCTURE DEFINITIONS
// =============================================================================

const INFRASTRUCTURE = {
  webServers: ['web-prod-01', 'web-prod-02', 'web-prod-03', 'web-staging-01'],
  appServers: ['app-prod-01', 'app-prod-02', 'app-prod-03'],
  dbServers: ['db-primary-01', 'db-replica-01', 'db-replica-02'],
  cacheServers: ['redis-01', 'redis-02', 'memcached-01'],
  loadBalancers: ['lb-prod-01', 'lb-prod-02'],
  firewalls: ['fw-edge-01', 'fw-internal-01'],
  vpnGateways: ['vpn-gateway-01'],
  mailServers: ['mail-01'],
  dnsServers: ['dns-01', 'dns-02'],
  monitoringServers: ['prometheus-01', 'grafana-01'],
  k8sNodes: ['k8s-node-01', 'k8s-node-02', 'k8s-node-03'],
  jumpHosts: ['bastion-01'],
};

const ALL_HOSTS = Object.values(INFRASTRUCTURE).flat();

const USERS = ['admin', 'deploy', 'john.doe', 'jane.smith', 'mike.wilson', 'sarah.jones', 'root', 'www-data', 'nginx', 'postgres'];
const INTERNAL_IPS = ['10.0.1.10', '10.0.1.11', '10.0.1.20', '10.0.2.50', '10.0.2.51', '192.168.1.100', '192.168.1.101'];
const EXTERNAL_IPS = ['203.0.113.42', '198.51.100.23', '192.0.2.100', '8.8.8.8', '1.1.1.1', '185.220.101.1', '45.33.32.156'];
const MALICIOUS_IPS = ['185.220.101.1', '45.33.32.156', '91.121.87.18', '23.129.64.100'];
const API_ENDPOINTS = ['/api/users', '/api/orders', '/api/products', '/api/auth/login', '/api/auth/logout', '/api/health', '/api/metrics', '/api/webhook', '/api/v2/search'];
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
const HTTP_CODES = [200, 200, 200, 200, 201, 204, 301, 302, 400, 401, 403, 404, 500, 502, 503];

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function formatTimestamp(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const day = String(date.getDate()).padStart(2, ' ');
  const time = date.toTimeString().slice(0, 8);
  return `${month} ${day} ${time}`;
}

function toSyslog(event: LogEvent): string {
  const priority = event.facility * 8 + event.severity;
  const timestamp = formatTimestamp(event.timestamp);
  const pid = event.pid ? `[${event.pid}]` : '';
  return `<${priority}>${timestamp} ${event.hostname} ${event.appName}${pid}: ${event.message}`;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

function generateTimeSpread(baseTime: Date, durationMinutes: number, count: number): Date[] {
  const times: Date[] = [];
  for (let i = 0; i < count; i++) {
    const offset = Math.random() * durationMinutes * 60 * 1000;
    times.push(new Date(baseTime.getTime() + offset));
  }
  return times.sort((a, b) => a.getTime() - b.getTime());
}

// =============================================================================
// LOG GENERATORS BY TYPE
// =============================================================================

function generateNginxAccess(time: Date, hostname: string): LogEvent {
  const ip = Math.random() > 0.3 ? randomItem(EXTERNAL_IPS) : randomItem(INTERNAL_IPS);
  const method = randomItem(HTTP_METHODS);
  const endpoint = randomItem(API_ENDPOINTS);
  const code = randomItem(HTTP_CODES);
  const bytes = randomInt(100, 50000);
  const responseTime = randomFloat(0.001, 2.5);

  return {
    timestamp: time,
    facility: FAC.LOCAL0,
    severity: code >= 500 ? SEV.ERROR : code >= 400 ? SEV.WARNING : SEV.INFO,
    hostname,
    appName: 'nginx',
    pid: randomInt(1000, 9999),
    message: `${ip} - - "${method} ${endpoint} HTTP/1.1" ${code} ${bytes} "-" "Mozilla/5.0" rt=${responseTime.toFixed(3)}`,
  };
}

function generateNginxError(time: Date, hostname: string): LogEvent {
  const errors = [
    'upstream timed out (110: Connection timed out)',
    'connect() failed (111: Connection refused)',
    'no live upstreams while connecting to upstream',
    'recv() failed (104: Connection reset by peer)',
    'SSL_do_handshake() failed',
    'client intended to send too large body',
  ];
  return {
    timestamp: time,
    facility: FAC.LOCAL0,
    severity: SEV.ERROR,
    hostname,
    appName: 'nginx',
    pid: randomInt(1000, 9999),
    message: `*${randomInt(1, 999)} ${randomItem(errors)}, client: ${randomItem(EXTERNAL_IPS)}, server: ${hostname}`,
  };
}

function generateSSHAuth(time: Date, hostname: string, success: boolean, user?: string): LogEvent {
  const actualUser = user || randomItem(USERS);
  const ip = success ? randomItem(INTERNAL_IPS) : randomItem(EXTERNAL_IPS);
  const port = randomInt(40000, 65000);

  if (success) {
    return {
      timestamp: time,
      facility: FAC.AUTHPRIV,
      severity: SEV.INFO,
      hostname,
      appName: 'sshd',
      pid: randomInt(1000, 9999),
      message: `Accepted publickey for ${actualUser} from ${ip} port ${port} ssh2: RSA SHA256:${randomString(43)}`,
    };
  } else {
    const failTypes = [
      `Failed password for ${actualUser} from ${ip} port ${port} ssh2`,
      `Invalid user ${actualUser} from ${ip} port ${port}`,
      `Connection closed by authenticating user ${actualUser} ${ip} port ${port} [preauth]`,
      `Disconnected from authenticating user ${actualUser} ${ip} port ${port} [preauth]`,
    ];
    return {
      timestamp: time,
      facility: FAC.AUTHPRIV,
      severity: SEV.WARNING,
      hostname,
      appName: 'sshd',
      pid: randomInt(1000, 9999),
      message: randomItem(failTypes),
    };
  }
}

function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function generatePostgresLog(time: Date, hostname: string): LogEvent {
  const messages = [
    `connection received: host=${randomItem(INTERNAL_IPS)} port=${randomInt(40000, 65000)}`,
    `connection authorized: user=app database=production`,
    `disconnection: session time: 0:${randomInt(0, 59)}:${randomInt(0, 59)}.${randomInt(100, 999)}`,
    `checkpoint starting: time`,
    `checkpoint complete: wrote ${randomInt(100, 1000)} buffers (${randomFloat(1, 10).toFixed(1)}%)`,
    `automatic vacuum of table "production.public.events"`,
    `automatic analyze of table "production.public.users"`,
    `duration: ${randomInt(100, 5000)}.${randomInt(100, 999)} ms statement: SELECT * FROM users WHERE id = ${randomInt(1, 10000)}`,
  ];
  return {
    timestamp: time,
    facility: FAC.LOCAL0,
    severity: SEV.INFO,
    hostname,
    appName: 'postgres',
    pid: randomInt(1000, 9999),
    message: randomItem(messages),
  };
}

function generatePostgresError(time: Date, hostname: string): LogEvent {
  const errors = [
    'FATAL: too many connections for role "app"',
    'ERROR: deadlock detected',
    'ERROR: canceling statement due to lock timeout',
    'PANIC: could not write to file "pg_wal/xlogtemp.123": No space left on device',
    'ERROR: duplicate key value violates unique constraint',
    'ERROR: relation "users" does not exist',
  ];
  return {
    timestamp: time,
    facility: FAC.LOCAL0,
    severity: SEV.ERROR,
    hostname,
    appName: 'postgres',
    pid: randomInt(1000, 9999),
    message: randomItem(errors),
  };
}

function generateDockerLog(time: Date, hostname: string): LogEvent {
  const messages = [
    `Container ${randomItem(['api', 'web', 'worker', 'redis', 'postgres'])} started`,
    `Container ${randomItem(['api', 'web', 'worker'])} health check passed`,
    `Container ${randomItem(['api', 'web', 'worker'])} health check failed`,
    `Pulling image ${randomItem(['nginx:latest', 'postgres:15', 'redis:7', 'node:20'])}`,
    `Container ${randomItem(['api', 'web', 'worker'])} exited with code ${randomItem([0, 1, 137])}`,
    `Network bridge created`,
    `Volume ${randomItem(['data', 'logs', 'config'])}_volume mounted`,
  ];
  return {
    timestamp: time,
    facility: FAC.DAEMON,
    severity: SEV.INFO,
    hostname,
    appName: 'dockerd',
    pid: randomInt(1000, 9999),
    message: randomItem(messages),
  };
}

function generateKernelLog(time: Date, hostname: string): LogEvent {
  const messages = [
    `[UFW BLOCK] IN=eth0 OUT= MAC=${randomMac()} SRC=${randomItem(EXTERNAL_IPS)} DST=10.0.1.1 PROTO=TCP SPT=${randomInt(1024, 65535)} DPT=${randomItem([22, 23, 3389, 445, 1433])}`,
    `[UFW ALLOW] IN=eth0 OUT= MAC=${randomMac()} SRC=${randomItem(INTERNAL_IPS)} DST=10.0.1.1 PROTO=TCP SPT=${randomInt(1024, 65535)} DPT=${randomItem([80, 443, 22])}`,
    `eth0: link up, 1000Mbps, full-duplex`,
    `Out of memory: Kill process ${randomInt(1000, 9999)} (java) score ${randomInt(100, 999)}`,
    `CPU${randomInt(0, 7)}: Temperature above threshold, cpu clock throttled`,
    `EXT4-fs (sda1): mounted filesystem with ordered data mode`,
    `TCP: request_sock_TCP: Possible SYN flooding on port ${randomItem([80, 443])}. Sending cookies.`,
  ];
  return {
    timestamp: time,
    facility: FAC.KERN,
    severity: Math.random() > 0.7 ? SEV.WARNING : SEV.INFO,
    hostname,
    appName: 'kernel',
    message: randomItem(messages),
  };
}

function randomMac(): string {
  return Array.from({ length: 6 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
  ).join(':');
}

function generateFirewallLog(time: Date, hostname: string): LogEvent {
  const srcIp = Math.random() > 0.5 ? randomItem(EXTERNAL_IPS) : randomItem(MALICIOUS_IPS);
  const dstPort = randomItem([22, 23, 80, 443, 3306, 5432, 6379, 8080, 27017]);
  const action = Math.random() > 0.3 ? 'BLOCK' : 'ALLOW';
  const proto = randomItem(['TCP', 'UDP', 'ICMP']);

  return {
    timestamp: time,
    facility: FAC.LOCAL0,
    severity: action === 'BLOCK' ? SEV.WARNING : SEV.INFO,
    hostname,
    appName: 'firewalld',
    message: `${action} ${proto} src=${srcIp} dst=10.0.1.${randomInt(1, 254)} sport=${randomInt(1024, 65535)} dport=${dstPort} rule=default`,
  };
}

function generateSystemdLog(time: Date, hostname: string): LogEvent {
  const services = ['nginx.service', 'postgresql.service', 'docker.service', 'sshd.service', 'cron.service', 'redis.service'];
  const actions = [
    `Started ${randomItem(services)}`,
    `Stopped ${randomItem(services)}`,
    `Reloading ${randomItem(services)}`,
    `${randomItem(services)}: Main process exited, code=exited, status=0/SUCCESS`,
    `${randomItem(services)}: Failed with result 'exit-code'`,
    `${randomItem(services)}: Watchdog timeout (limit 30s)!`,
  ];
  return {
    timestamp: time,
    facility: FAC.DAEMON,
    severity: SEV.INFO,
    hostname,
    appName: 'systemd',
    pid: 1,
    message: randomItem(actions),
  };
}

function generateAppLog(time: Date, hostname: string): LogEvent {
  const components = ['api', 'worker', 'scheduler', 'cache', 'auth', 'payment', 'notification'];
  const severities = [SEV.INFO, SEV.INFO, SEV.INFO, SEV.WARNING, SEV.ERROR, SEV.DEBUG];
  const severity = randomItem(severities);

  const messages: Record<number, string[]> = {
    [SEV.INFO]: [
      `Request processed in ${randomInt(10, 500)}ms`,
      `User ${randomInt(1000, 99999)} logged in successfully`,
      `Cache hit for key: user:${randomInt(1, 1000)}`,
      `Job ${randomInt(10000, 99999)} completed successfully`,
      `Processed ${randomInt(100, 10000)} events in batch`,
      `Connection pool: ${randomInt(5, 50)} active, ${randomInt(0, 10)} idle`,
    ],
    [SEV.WARNING]: [
      `Slow query detected: ${randomInt(1000, 5000)}ms`,
      `Rate limit approaching for user ${randomInt(1000, 9999)}`,
      `Retry attempt ${randomInt(1, 5)} for job ${randomInt(10000, 99999)}`,
      `Memory usage at ${randomInt(75, 95)}%`,
      `Connection pool exhausted, waiting for available connection`,
    ],
    [SEV.ERROR]: [
      `Failed to process payment: timeout after 30s`,
      `Database connection lost, attempting reconnect`,
      `Unhandled exception: NullPointerException at UserService.java:${randomInt(50, 500)}`,
      `Redis connection refused: ECONNREFUSED`,
      `API rate limit exceeded for client ${randomItem(EXTERNAL_IPS)}`,
    ],
    [SEV.DEBUG]: [
      `Entering method processOrder with params: {orderId: ${randomInt(10000, 99999)}}`,
      `SQL: SELECT * FROM orders WHERE id = ${randomInt(1, 10000)}`,
      `HTTP request headers: {"Authorization": "Bearer ***", "Content-Type": "application/json"}`,
    ],
  };

  return {
    timestamp: time,
    facility: FAC.LOCAL1,
    severity,
    hostname,
    appName: 'app',
    pid: randomInt(1000, 9999),
    message: `[${randomItem(components)}] ${randomItem(messages[severity] || messages[SEV.INFO])}`,
  };
}

function generateCronLog(time: Date, hostname: string): LogEvent {
  const jobs = [
    '(/usr/bin/backup.sh)',
    '(/usr/bin/cleanup-logs.sh)',
    '(/usr/bin/health-check.sh)',
    '(/usr/bin/sync-data.sh)',
    '(/usr/bin/rotate-keys.sh)',
  ];
  const users = ['root', 'www-data', 'postgres'];
  return {
    timestamp: time,
    facility: FAC.CRON,
    severity: SEV.INFO,
    hostname,
    appName: 'CRON',
    pid: randomInt(1000, 9999),
    message: `(${randomItem(users)}) CMD ${randomItem(jobs)}`,
  };
}

// =============================================================================
// SCENARIOS
// =============================================================================

const scenarios: Scenario[] = [
  {
    name: 'normal-operations',
    description: 'Normal day-to-day operations with typical log patterns',
    generate: (baseTime: Date, duration: number): LogEvent[] => {
      const events: LogEvent[] = [];
      const times = generateTimeSpread(baseTime, duration, duration * 10); // ~10 logs per minute

      for (const time of times) {
        const rand = Math.random();
        if (rand < 0.4) {
          events.push(generateNginxAccess(time, randomItem(INFRASTRUCTURE.webServers)));
        } else if (rand < 0.55) {
          events.push(generateAppLog(time, randomItem(INFRASTRUCTURE.appServers)));
        } else if (rand < 0.65) {
          events.push(generatePostgresLog(time, randomItem(INFRASTRUCTURE.dbServers)));
        } else if (rand < 0.75) {
          events.push(generateDockerLog(time, randomItem(INFRASTRUCTURE.k8sNodes)));
        } else if (rand < 0.82) {
          events.push(generateKernelLog(time, randomItem(ALL_HOSTS)));
        } else if (rand < 0.88) {
          events.push(generateFirewallLog(time, randomItem(INFRASTRUCTURE.firewalls)));
        } else if (rand < 0.93) {
          events.push(generateSSHAuth(time, randomItem(ALL_HOSTS), true));
        } else if (rand < 0.97) {
          events.push(generateSystemdLog(time, randomItem(ALL_HOSTS)));
        } else {
          events.push(generateCronLog(time, randomItem(ALL_HOSTS)));
        }
      }

      return events;
    },
  },

  {
    name: 'brute-force-attack',
    description: 'SSH brute force attack from malicious IP',
    generate: (baseTime: Date, duration: number): LogEvent[] => {
      const events: LogEvent[] = [];
      const attackerIp = randomItem(MALICIOUS_IPS);
      const targetHost = randomItem(INFRASTRUCTURE.jumpHosts.concat(INFRASTRUCTURE.webServers));
      const attackDuration = Math.min(duration, 30); // 30 minute attack

      // Rapid-fire failed attempts
      for (let i = 0; i < attackDuration * 20; i++) { // ~20 attempts per minute
        const time = addSeconds(baseTime, i * 3 + Math.random() * 2);
        const user = randomItem(['root', 'admin', 'administrator', 'user', 'test', 'guest', 'ubuntu', 'centos']);
        events.push({
          timestamp: time,
          facility: FAC.AUTHPRIV,
          severity: SEV.WARNING,
          hostname: targetHost,
          appName: 'sshd',
          pid: randomInt(1000, 9999),
          message: `Failed password for invalid user ${user} from ${attackerIp} port ${randomInt(40000, 65535)} ssh2`,
        });
      }

      // Firewall eventually blocks
      events.push({
        timestamp: addMinutes(baseTime, attackDuration),
        facility: FAC.AUTHPRIV,
        severity: SEV.NOTICE,
        hostname: targetHost,
        appName: 'fail2ban',
        message: `Ban ${attackerIp}`,
      });

      // Add some normal background traffic
      const normalTimes = generateTimeSpread(baseTime, duration, duration * 3);
      for (const time of normalTimes) {
        events.push(generateNginxAccess(time, randomItem(INFRASTRUCTURE.webServers)));
      }

      return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    },
  },

  {
    name: 'database-outage',
    description: 'Database failure causing cascading errors',
    generate: (baseTime: Date, duration: number): LogEvent[] => {
      const events: LogEvent[] = [];
      const dbHost = INFRASTRUCTURE.dbServers[0];
      const outageStart = 5; // minutes into scenario
      const outageDuration = Math.min(15, duration - outageStart); // 15 minute outage

      // Normal operations before outage
      const normalTimes = generateTimeSpread(baseTime, outageStart, outageStart * 10);
      for (const time of normalTimes) {
        events.push(generatePostgresLog(time, dbHost));
        events.push(generateAppLog(time, randomItem(INFRASTRUCTURE.appServers)));
      }

      // Database crashes
      const crashTime = addMinutes(baseTime, outageStart);
      events.push({
        timestamp: crashTime,
        facility: FAC.LOCAL0,
        severity: SEV.EMERGENCY,
        hostname: dbHost,
        appName: 'postgres',
        pid: 1234,
        message: 'PANIC: could not write to file "pg_wal/xlogtemp.123": No space left on device',
      });
      events.push({
        timestamp: addSeconds(crashTime, 1),
        facility: FAC.DAEMON,
        severity: SEV.ERROR,
        hostname: dbHost,
        appName: 'systemd',
        pid: 1,
        message: 'postgresql.service: Main process exited, code=killed, status=6/ABRT',
      });

      // Cascading errors during outage
      for (let i = 0; i < outageDuration * 30; i++) {
        const time = addSeconds(crashTime, i * 2 + Math.random());
        const appHost = randomItem(INFRASTRUCTURE.appServers);

        events.push({
          timestamp: time,
          facility: FAC.LOCAL1,
          severity: SEV.ERROR,
          hostname: appHost,
          appName: 'app',
          pid: randomInt(1000, 9999),
          message: `[database] Connection refused: ECONNREFUSED ${dbHost}:5432`,
        });

        if (i % 3 === 0) {
          events.push({
            timestamp: time,
            facility: FAC.LOCAL0,
            severity: SEV.ERROR,
            hostname: randomItem(INFRASTRUCTURE.webServers),
            appName: 'nginx',
            pid: randomInt(1000, 9999),
            message: `*${randomInt(1, 999)} upstream timed out (110: Connection timed out) while connecting to upstream`,
          });
        }
      }

      // Recovery
      const recoveryTime = addMinutes(crashTime, outageDuration);
      events.push({
        timestamp: recoveryTime,
        facility: FAC.DAEMON,
        severity: SEV.INFO,
        hostname: dbHost,
        appName: 'systemd',
        pid: 1,
        message: 'Started PostgreSQL database server.',
      });
      events.push({
        timestamp: addSeconds(recoveryTime, 5),
        facility: FAC.LOCAL0,
        severity: SEV.INFO,
        hostname: dbHost,
        appName: 'postgres',
        pid: randomInt(1000, 9999),
        message: 'database system is ready to accept connections',
      });

      // Normal operations resume
      const postRecoveryTimes = generateTimeSpread(recoveryTime, duration - outageStart - outageDuration, 50);
      for (const time of postRecoveryTimes) {
        events.push(generateAppLog(time, randomItem(INFRASTRUCTURE.appServers)));
      }

      return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    },
  },

  {
    name: 'ddos-attack',
    description: 'DDoS attack overwhelming web servers',
    generate: (baseTime: Date, duration: number): LogEvent[] => {
      const events: LogEvent[] = [];
      const attackStart = 3;
      const attackDuration = Math.min(20, duration - attackStart);

      // Normal traffic before attack
      const normalTimes = generateTimeSpread(baseTime, attackStart, attackStart * 10);
      for (const time of normalTimes) {
        events.push(generateNginxAccess(time, randomItem(INFRASTRUCTURE.webServers)));
      }

      // DDoS attack - massive traffic spike
      const attackStartTime = addMinutes(baseTime, attackStart);
      for (let i = 0; i < attackDuration * 100; i++) { // 100 requests per minute
        const time = addSeconds(attackStartTime, i * 0.6 + Math.random() * 0.3);
        const webHost = randomItem(INFRASTRUCTURE.webServers);
        const attackerIp = `${randomInt(1, 254)}.${randomInt(1, 254)}.${randomInt(1, 254)}.${randomInt(1, 254)}`;

        events.push({
          timestamp: time,
          facility: FAC.LOCAL0,
          severity: SEV.WARNING,
          hostname: webHost,
          appName: 'nginx',
          pid: randomInt(1000, 9999),
          message: `${attackerIp} - - "GET / HTTP/1.1" 503 197 "-" "-" rt=30.000`,
        });

        if (i % 50 === 0) {
          events.push({
            timestamp: time,
            facility: FAC.KERN,
            severity: SEV.WARNING,
            hostname: webHost,
            appName: 'kernel',
            message: `TCP: request_sock_TCP: Possible SYN flooding on port 80. Sending cookies.`,
          });
        }
      }

      // Load balancer struggles
      for (let i = 0; i < attackDuration * 5; i++) {
        const time = addSeconds(attackStartTime, i * 12);
        events.push({
          timestamp: time,
          facility: FAC.LOCAL0,
          severity: SEV.ERROR,
          hostname: randomItem(INFRASTRUCTURE.loadBalancers),
          appName: 'haproxy',
          message: `backend web_servers has no server available!`,
        });
      }

      // Firewall starts blocking
      const mitigationTime = addMinutes(attackStartTime, 5);
      events.push({
        timestamp: mitigationTime,
        facility: FAC.LOCAL0,
        severity: SEV.NOTICE,
        hostname: INFRASTRUCTURE.firewalls[0],
        appName: 'firewalld',
        message: `Rate limiting enabled: max 100 connections per IP`,
      });

      return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    },
  },

  {
    name: 'deployment',
    description: 'Application deployment with rolling updates',
    generate: (baseTime: Date, duration: number): LogEvent[] => {
      const events: LogEvent[] = [];
      const deployVersion = `v${randomInt(1, 5)}.${randomInt(0, 20)}.${randomInt(0, 100)}`;

      // Deployment starts
      events.push({
        timestamp: baseTime,
        facility: FAC.LOCAL1,
        severity: SEV.NOTICE,
        hostname: INFRASTRUCTURE.k8sNodes[0],
        appName: 'kubectl',
        message: `Deployment app-deployment updated: image=app:${deployVersion}`,
      });

      // Rolling update across nodes
      for (let i = 0; i < INFRASTRUCTURE.k8sNodes.length; i++) {
        const nodeTime = addMinutes(baseTime, i * 2);
        const node = INFRASTRUCTURE.k8sNodes[i];

        events.push({
          timestamp: nodeTime,
          facility: FAC.DAEMON,
          severity: SEV.INFO,
          hostname: node,
          appName: 'dockerd',
          message: `Pulling image app:${deployVersion}`,
        });
        events.push({
          timestamp: addSeconds(nodeTime, 30),
          facility: FAC.DAEMON,
          severity: SEV.INFO,
          hostname: node,
          appName: 'dockerd',
          message: `Container app-${randomInt(1000, 9999)} stopping`,
        });
        events.push({
          timestamp: addSeconds(nodeTime, 35),
          facility: FAC.DAEMON,
          severity: SEV.INFO,
          hostname: node,
          appName: 'dockerd',
          message: `Container app-${randomInt(1000, 9999)} started`,
        });
        events.push({
          timestamp: addSeconds(nodeTime, 45),
          facility: FAC.LOCAL1,
          severity: SEV.INFO,
          hostname: node,
          appName: 'app',
          pid: randomInt(1000, 9999),
          message: `[startup] Application ${deployVersion} started successfully`,
        });
        events.push({
          timestamp: addSeconds(nodeTime, 50),
          facility: FAC.LOCAL1,
          severity: SEV.INFO,
          hostname: node,
          appName: 'app',
          pid: randomInt(1000, 9999),
          message: `[startup] Health check passed, ready to serve traffic`,
        });
      }

      // Deployment complete
      events.push({
        timestamp: addMinutes(baseTime, INFRASTRUCTURE.k8sNodes.length * 2 + 1),
        facility: FAC.LOCAL1,
        severity: SEV.NOTICE,
        hostname: INFRASTRUCTURE.k8sNodes[0],
        appName: 'kubectl',
        message: `Deployment app-deployment successfully rolled out`,
      });

      // Normal traffic after deployment
      const normalTimes = generateTimeSpread(addMinutes(baseTime, 10), duration - 10, (duration - 10) * 8);
      for (const time of normalTimes) {
        events.push(generateNginxAccess(time, randomItem(INFRASTRUCTURE.webServers)));
        if (Math.random() > 0.5) {
          events.push(generateAppLog(time, randomItem(INFRASTRUCTURE.appServers)));
        }
      }

      return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    },
  },

  {
    name: 'security-incident',
    description: 'Unauthorized access attempt and data exfiltration',
    generate: (baseTime: Date, duration: number): LogEvent[] => {
      const events: LogEvent[] = [];
      const attackerIp = randomItem(MALICIOUS_IPS);
      const compromisedHost = randomItem(INFRASTRUCTURE.appServers);

      // Initial reconnaissance - port scanning
      for (let i = 0; i < 50; i++) {
        const time = addSeconds(baseTime, i * 2);
        const port = [22, 23, 80, 443, 3306, 5432, 6379, 8080, 9000][i % 9];
        events.push({
          timestamp: time,
          facility: FAC.LOCAL0,
          severity: SEV.WARNING,
          hostname: INFRASTRUCTURE.firewalls[0],
          appName: 'firewalld',
          message: `BLOCK TCP src=${attackerIp} dst=10.0.1.1 sport=${randomInt(40000, 65535)} dport=${port} flags=S`,
        });
      }

      // Successful SSH after many failures (compromised credentials)
      const sshAttemptTime = addMinutes(baseTime, 5);
      for (let i = 0; i < 20; i++) {
        events.push(generateSSHAuth(addSeconds(sshAttemptTime, i * 3), compromisedHost, false, 'admin'));
      }
      events.push({
        timestamp: addSeconds(sshAttemptTime, 65),
        facility: FAC.AUTHPRIV,
        severity: SEV.INFO,
        hostname: compromisedHost,
        appName: 'sshd',
        pid: randomInt(1000, 9999),
        message: `Accepted password for admin from ${attackerIp} port ${randomInt(40000, 65535)} ssh2`,
      });

      // Privilege escalation attempts
      const privEscTime = addMinutes(baseTime, 8);
      events.push({
        timestamp: privEscTime,
        facility: FAC.AUTHPRIV,
        severity: SEV.WARNING,
        hostname: compromisedHost,
        appName: 'sudo',
        message: `admin : TTY=pts/0 ; PWD=/home/admin ; USER=root ; COMMAND=/bin/cat /etc/shadow`,
      });
      events.push({
        timestamp: addSeconds(privEscTime, 30),
        facility: FAC.AUTHPRIV,
        severity: SEV.ALERT,
        hostname: compromisedHost,
        appName: 'sudo',
        message: `admin : 3 incorrect password attempts ; TTY=pts/0 ; PWD=/home/admin ; USER=root ; COMMAND=/bin/su -`,
      });

      // Data exfiltration attempt
      const exfilTime = addMinutes(baseTime, 12);
      events.push({
        timestamp: exfilTime,
        facility: FAC.LOCAL0,
        severity: SEV.WARNING,
        hostname: INFRASTRUCTURE.firewalls[0],
        appName: 'firewalld',
        message: `ALERT: Large outbound transfer detected src=${compromisedHost} dst=${attackerIp} bytes=50000000`,
      });

      // IDS alert
      events.push({
        timestamp: addSeconds(exfilTime, 5),
        facility: FAC.LOCAL0,
        severity: SEV.ALERT,
        hostname: INFRASTRUCTURE.monitoringServers[0],
        appName: 'suricata',
        message: `[1:2024792:1] ET POLICY Outbound Large File Transfer - Possible Data Exfiltration [Classification: Potential Corporate Privacy Violation] [Priority: 1] {TCP} ${compromisedHost}:${randomInt(40000, 65535)} -> ${attackerIp}:443`,
      });

      // Add background noise
      const bgTimes = generateTimeSpread(baseTime, duration, duration * 5);
      for (const time of bgTimes) {
        events.push(generateNginxAccess(time, randomItem(INFRASTRUCTURE.webServers)));
      }

      return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    },
  },

  {
    name: 'memory-leak',
    description: 'Application memory leak causing OOM kills',
    generate: (baseTime: Date, duration: number): LogEvent[] => {
      const events: LogEvent[] = [];
      const affectedHost = randomItem(INFRASTRUCTURE.appServers);

      // Gradual memory increase warnings
      const warningIntervals = [0, 10, 18, 24, 28, 30];
      const memoryPercents = [75, 82, 88, 93, 97, 99];

      for (let i = 0; i < warningIntervals.length && warningIntervals[i] < duration; i++) {
        const time = addMinutes(baseTime, warningIntervals[i]);
        events.push({
          timestamp: time,
          facility: FAC.LOCAL1,
          severity: i < 3 ? SEV.WARNING : SEV.ERROR,
          hostname: affectedHost,
          appName: 'app',
          pid: 12345,
          message: `[monitor] Memory usage at ${memoryPercents[i]}% (${Math.round(memoryPercents[i] * 160 / 100)}GB / 16GB)`,
        });

        // GC pressure
        if (i >= 2) {
          events.push({
            timestamp: addSeconds(time, 5),
            facility: FAC.LOCAL1,
            severity: SEV.WARNING,
            hostname: affectedHost,
            appName: 'app',
            pid: 12345,
            message: `[gc] Full GC triggered, pause time: ${randomInt(500, 3000)}ms`,
          });
        }
      }

      // OOM kill
      if (duration >= 32) {
        const oomTime = addMinutes(baseTime, 32);
        events.push({
          timestamp: oomTime,
          facility: FAC.KERN,
          severity: SEV.CRITICAL,
          hostname: affectedHost,
          appName: 'kernel',
          message: `Out of memory: Kill process 12345 (java) score 950 or sacrifice child`,
        });
        events.push({
          timestamp: addSeconds(oomTime, 1),
          facility: FAC.KERN,
          severity: SEV.CRITICAL,
          hostname: affectedHost,
          appName: 'kernel',
          message: `Killed process 12345 (java) total-vm:18234567kB, anon-rss:16234567kB`,
        });
        events.push({
          timestamp: addSeconds(oomTime, 2),
          facility: FAC.DAEMON,
          severity: SEV.ERROR,
          hostname: affectedHost,
          appName: 'systemd',
          pid: 1,
          message: `app.service: Main process exited, code=killed, status=9/KILL`,
        });

        // Service restart
        events.push({
          timestamp: addSeconds(oomTime, 10),
          facility: FAC.DAEMON,
          severity: SEV.INFO,
          hostname: affectedHost,
          appName: 'systemd',
          pid: 1,
          message: `app.service: Scheduled restart job, restart counter is at 1.`,
        });
      }

      // Background traffic
      const bgTimes = generateTimeSpread(baseTime, duration, duration * 5);
      for (const time of bgTimes) {
        events.push(generateNginxAccess(time, randomItem(INFRASTRUCTURE.webServers)));
      }

      return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    },
  },
];

// =============================================================================
// OUTPUT FUNCTIONS
// =============================================================================

function outputToFile(events: LogEvent[], filename: string): void {
  const lines = events.map(e => toSyslog(e)).join('\n');
  fs.writeFileSync(filename, lines + '\n');
  console.log(`Wrote ${events.length} events to ${filename}`);
}

function outputToStdout(events: LogEvent[]): void {
  for (const event of events) {
    console.log(toSyslog(event));
  }
}

async function sendToSyslog(events: LogEvent[], host: string, port: number, protocol: 'udp' | 'tcp'): Promise<void> {
  if (protocol === 'udp') {
    const client = dgram.createSocket('udp4');
    for (const event of events) {
      const msg = Buffer.from(toSyslog(event));
      await new Promise<void>((resolve, reject) => {
        client.send(msg, port, host, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      // Small delay to avoid overwhelming
      await new Promise(r => setTimeout(r, 10));
    }
    client.close();
  } else {
    const client = new net.Socket();
    await new Promise<void>((resolve, reject) => {
      client.connect(port, host, () => resolve());
      client.on('error', reject);
    });
    for (const event of events) {
      client.write(toSyslog(event) + '\n');
      await new Promise(r => setTimeout(r, 10));
    }
    client.end();
  }
  console.log(`Sent ${events.length} events to ${host}:${port} via ${protocol.toUpperCase()}`);
}

// =============================================================================
// CLI
// =============================================================================

const program = new Command();

program
  .name('spunk-test-data')
  .description('Generate realistic syslog test data for Spunk')
  .version('1.0.0');

program
  .command('list')
  .description('List available scenarios')
  .action(() => {
    console.log('\nAvailable Scenarios:\n');
    for (const scenario of scenarios) {
      console.log(`  ${scenario.name.padEnd(25)} ${scenario.description}`);
    }
    console.log();
  });

program
  .command('generate')
  .description('Generate test data')
  .option('-s, --scenario <name>', 'Scenario to generate (or "all")', 'normal-operations')
  .option('-d, --duration <minutes>', 'Duration in minutes', '60')
  .option('-o, --output <file>', 'Output file (omit for stdout)')
  .option('--start-time <iso>', 'Start time (ISO format, default: now)')
  .option('--syslog-host <host>', 'Send to syslog host instead of file')
  .option('--syslog-port <port>', 'Syslog port', '514')
  .option('--syslog-protocol <proto>', 'Protocol: udp or tcp', 'udp')
  .action(async (options) => {
    const duration = parseInt(options.duration);
    const startTime = options.startTime ? new Date(options.startTime) : new Date();

    let selectedScenarios: Scenario[];
    if (options.scenario === 'all') {
      selectedScenarios = scenarios;
    } else {
      const found = scenarios.find(s => s.name === options.scenario);
      if (!found) {
        console.error(`Unknown scenario: ${options.scenario}`);
        console.error('Use "list" command to see available scenarios');
        process.exit(1);
      }
      selectedScenarios = [found];
    }

    let allEvents: LogEvent[] = [];
    for (const scenario of selectedScenarios) {
      console.error(`Generating scenario: ${scenario.name}`);
      const events = scenario.generate(startTime, duration);
      allEvents = allEvents.concat(events);
    }

    // Sort all events by timestamp
    allEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    console.error(`Generated ${allEvents.length} total events`);

    if (options.syslogHost) {
      await sendToSyslog(
        allEvents,
        options.syslogHost,
        parseInt(options.syslogPort),
        options.syslogProtocol as 'udp' | 'tcp'
      );
    } else if (options.output) {
      outputToFile(allEvents, options.output);
    } else {
      outputToStdout(allEvents);
    }
  });

program
  .command('replay')
  .description('Replay a log file to syslog in real-time')
  .argument('<file>', 'Log file to replay')
  .option('--host <host>', 'Syslog host', 'localhost')
  .option('--port <port>', 'Syslog port', '514')
  .option('--speed <multiplier>', 'Speed multiplier (1=realtime, 10=10x faster)', '1')
  .action(async (file, options) => {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    console.log(`Replaying ${lines.length} events at ${options.speed}x speed`);

    const client = dgram.createSocket('udp4');
    const speed = parseFloat(options.speed);

    // Extract timestamps and calculate delays
    const timestampRegex = /^<\d+>(\w{3}\s+\d+\s+\d+:\d+:\d+)/;
    let lastTime: Date | null = null;

    for (const line of lines) {
      const match = line.match(timestampRegex);
      if (match) {
        // Parse the timestamp (assume current year)
        const now = new Date();
        const parsed = new Date(`${match[1]} ${now.getFullYear()}`);

        if (lastTime) {
          const delay = (parsed.getTime() - lastTime.getTime()) / speed;
          if (delay > 0 && delay < 60000) {
            await new Promise(r => setTimeout(r, delay));
          }
        }
        lastTime = parsed;
      }

      const msg = Buffer.from(line);
      client.send(msg, parseInt(options.port), options.host);
    }

    client.close();
    console.log('Replay complete');
  });

program.parse();
