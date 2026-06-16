import { ChevronRight } from 'lucide-react';
import CodeBlock from '../components/CodeBlock';

export default function SyslogFormatSection() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Understanding Syslog</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Syslog is a standard protocol for message logging. LogNog supports both major syslog formats:
          RFC 3164 (BSD syslog) and RFC 5424 (modern syslog). Understanding these formats helps you
          parse logs correctly and write effective queries.
        </p>
        <div className="card p-4 bg-honey-50 border-honey-200 dark:bg-honey-900/20 dark:border-honey-800">
          <p className="text-honey-800 dark:text-honey-300 text-sm">
            <strong>LogNog Auto-Detection:</strong> LogNog automatically detects and parses both RFC 3164 and RFC 5424
            formats. You do not need to configure anything - just send your logs!
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Priority Value (PRI)</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Both syslog formats begin with a priority value enclosed in angle brackets. The priority is calculated as:
        </p>
        <div className="card p-4 dark:bg-nog-800 mb-4">
          <div className="text-center">
            <code className="text-lg font-mono text-honey-600 dark:text-honey-400">
              Priority = (Facility x 8) + Severity
            </code>
          </div>
        </div>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          For example, a local0 facility (16) with warning severity (4) produces priority 132:
        </p>
        <CodeBlock code={`# Priority calculation example
Facility: local0 = 16
Severity: warning = 4
Priority: (16 x 8) + 4 = 132

# In a syslog message:
<132>Jan 15 10:30:00 myhost myapp: Warning message here`} />
      </section>

      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Severity Levels (0-7)</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Syslog defines 8 severity levels, from most severe (0) to least severe (7):
        </p>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-nog-800">
            <thead>
              <tr>
                <th>Code</th>
                <th>Severity</th>
                <th>Description</th>
                <th>Example Use Case</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-red-50 dark:bg-red-900/20">
                <td><code className="code">0</code></td>
                <td><strong>Emergency</strong></td>
                <td>System is unusable</td>
                <td>Complete system failure, kernel panic</td>
              </tr>
              <tr className="bg-red-50 dark:bg-red-900/20">
                <td><code className="code">1</code></td>
                <td><strong>Alert</strong></td>
                <td>Immediate action required</td>
                <td>Database corruption, loss of connectivity</td>
              </tr>
              <tr className="bg-honey-50 dark:bg-honey-900/20">
                <td><code className="code">2</code></td>
                <td><strong>Critical</strong></td>
                <td>Critical conditions</td>
                <td>Hardware errors, failed backups</td>
              </tr>
              <tr className="bg-honey-50 dark:bg-honey-900/20">
                <td><code className="code">3</code></td>
                <td><strong>Error</strong></td>
                <td>Error conditions</td>
                <td>Application errors, failed operations</td>
              </tr>
              <tr className="bg-yellow-50 dark:bg-yellow-900/20">
                <td><code className="code">4</code></td>
                <td><strong>Warning</strong></td>
                <td>Warning conditions</td>
                <td>Disk space low, deprecated feature usage</td>
              </tr>
              <tr className="bg-green-50 dark:bg-green-900/20">
                <td><code className="code">5</code></td>
                <td><strong>Notice</strong></td>
                <td>Normal but significant</td>
                <td>Service started, configuration changed</td>
              </tr>
              <tr className="bg-honey-50 dark:bg-honey-900/20">
                <td><code className="code">6</code></td>
                <td><strong>Informational</strong></td>
                <td>Informational messages</td>
                <td>User login, request processed</td>
              </tr>
              <tr className="bg-nog-50 dark:bg-nog-800">
                <td><code className="code">7</code></td>
                <td><strong>Debug</strong></td>
                <td>Debug-level messages</td>
                <td>Detailed troubleshooting info</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="card p-4 bg-honey-50 border-honey-200 dark:bg-honey-900/20 dark:border-honey-800 mt-4">
          <p className="text-honey-800 dark:text-honey-300 text-sm">
            <strong>Query Tip:</strong> Use severity names in your queries! LogNog understands both numeric codes and names:<br />
            <code className="bg-honey-100 dark:bg-honey-900 px-2 py-0.5 rounded">search severity&lt;=warning</code> is equivalent to <code className="bg-honey-100 dark:bg-honey-900 px-2 py-0.5 rounded">search severity&lt;=4</code>
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Facility Codes (0-23)</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Facility codes indicate the type of program or system that generated the message:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-3">System Facilities (0-11)</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span>0 - kernel</span><span className="text-nog-500">Kernel messages</span></div>
              <div className="flex justify-between"><span>1 - user</span><span className="text-nog-500">User-level messages</span></div>
              <div className="flex justify-between"><span>2 - mail</span><span className="text-nog-500">Mail system</span></div>
              <div className="flex justify-between"><span>3 - daemon</span><span className="text-nog-500">System daemons</span></div>
              <div className="flex justify-between"><span>4 - auth</span><span className="text-nog-500">Security/auth</span></div>
              <div className="flex justify-between"><span>5 - syslog</span><span className="text-nog-500">Syslogd internal</span></div>
              <div className="flex justify-between"><span>6 - lpr</span><span className="text-nog-500">Printing</span></div>
              <div className="flex justify-between"><span>7 - news</span><span className="text-nog-500">Network news</span></div>
              <div className="flex justify-between"><span>8 - uucp</span><span className="text-nog-500">UUCP</span></div>
              <div className="flex justify-between"><span>9 - cron</span><span className="text-nog-500">Clock daemon</span></div>
              <div className="flex justify-between"><span>10 - authpriv</span><span className="text-nog-500">Private auth</span></div>
              <div className="flex justify-between"><span>11 - ftp</span><span className="text-nog-500">FTP daemon</span></div>
            </div>
          </div>
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-3">Local Facilities (16-23)</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span>16 - local0</span><span className="text-nog-500">Custom use</span></div>
              <div className="flex justify-between"><span>17 - local1</span><span className="text-nog-500">Custom use</span></div>
              <div className="flex justify-between"><span>18 - local2</span><span className="text-nog-500">Custom use</span></div>
              <div className="flex justify-between"><span>19 - local3</span><span className="text-nog-500">Custom use</span></div>
              <div className="flex justify-between"><span>20 - local4</span><span className="text-nog-500">Custom use</span></div>
              <div className="flex justify-between"><span>21 - local5</span><span className="text-nog-500">Custom use</span></div>
              <div className="flex justify-between"><span>22 - local6</span><span className="text-nog-500">Custom use</span></div>
              <div className="flex justify-between"><span>23 - local7</span><span className="text-nog-500">Custom use</span></div>
            </div>
            <p className="text-xs text-nog-500 mt-3">
              Local facilities (local0-local7) are commonly used for custom applications, network devices, and third-party software.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">RFC 3164 (BSD Syslog)</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          RFC 3164 is the traditional BSD syslog format, widely used by Unix/Linux systems and network devices.
          It is simple but has limitations like no timezone support and ambiguous parsing.
        </p>
        <div className="card p-4 dark:bg-nog-800 mb-4">
          <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Format Structure</h3>
          <CodeBlock code={`<PRI>TIMESTAMP HOSTNAME TAG: MESSAGE

Components:
  PRI       = Priority value (0-191)
  TIMESTAMP = "Mmm dd HH:MM:SS" (no year, no timezone)
  HOSTNAME  = Hostname or IP address
  TAG       = Program name, often with PID: "program[pid]"
  MESSAGE   = The actual log message`} />
        </div>
        <div className="card p-4 dark:bg-nog-800">
          <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Example Messages</h3>
          <CodeBlock code={`# Basic message from sshd
<38>Jan 15 10:30:45 server01 sshd[12345]: Accepted password for user from 192.168.1.100 port 52413

# Kernel message
<0>Jan 15 10:30:46 server01 kernel: Out of memory: Kill process 1234

# Cron daemon
<78>Jan 15 10:31:00 server01 CRON[5678]: (root) CMD (/usr/local/bin/backup.sh)

# Network device (Cisco router)
<134>Jan 15 10:31:15 router01 %SYS-5-CONFIG_I: Configured from console by admin

# Breaking down the first example:
# <38> = Priority: facility=4 (auth), severity=6 (info) => (4*8)+6=38
# Jan 15 10:30:45 = Timestamp
# server01 = Hostname
# sshd[12345] = Program name with PID
# Accepted password... = Message`} />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">RFC 5424 (Modern Syslog)</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          RFC 5424 is the modern syslog standard with improved structure, ISO 8601 timestamps with timezone,
          structured data support, and better parsing reliability.
        </p>
        <div className="card p-4 dark:bg-nog-800 mb-4">
          <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Format Structure</h3>
          <CodeBlock code={`<PRI>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID STRUCTURED-DATA MSG

Components:
  PRI             = Priority value (0-191)
  VERSION         = Syslog protocol version (typically "1")
  TIMESTAMP       = ISO 8601 format with timezone
  HOSTNAME        = FQDN, hostname, or IP
  APP-NAME        = Application name (max 48 chars)
  PROCID          = Process ID or "-" if unknown
  MSGID           = Message type identifier or "-"
  STRUCTURED-DATA = Key-value pairs in brackets, or "-"
  MSG             = UTF-8 message content (optional BOM)`} />
        </div>
        <div className="card p-4 dark:bg-nog-800">
          <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Example Messages</h3>
          <CodeBlock code={`# Basic RFC 5424 message
<34>1 2024-01-15T10:30:45.123Z server01.example.com sshd 12345 AUTH_SUCCESS - User admin logged in

# With structured data
<165>1 2024-01-15T10:30:45.123-05:00 webserver nginx 8080 REQ_LOG [req@12345 method="GET" path="/api/users" status="200" duration="45ms"] Request completed

# Multiple structured data blocks
<134>1 2024-01-15T10:30:45Z firewall iptables - DROP [origin@12345 ip="192.168.1.100" port="22"][meta@12345 seq="12345"] Blocked SSH attempt

# Minimal message (using "-" for unknown fields)
<14>1 2024-01-15T10:30:45Z - myapp - - - Application started

# Breaking down the second example:
# <165> = Priority: facility=20 (local4), severity=5 (notice)
# 1 = Version
# 2024-01-15T10:30:45.123-05:00 = ISO 8601 timestamp with timezone
# webserver = Hostname
# nginx = App name
# 8080 = Process ID
# REQ_LOG = Message ID
# [req@12345...] = Structured data with IANA enterprise number
# Request completed = Message text`} />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Structured Data (SD) Elements</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          RFC 5424 supports structured data elements - key-value pairs that can be parsed automatically.
          LogNog extracts these into queryable fields.
        </p>
        <div className="card p-4 dark:bg-nog-800 mb-4">
          <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">SD-ELEMENT Format</h3>
          <CodeBlock code={`[SD-ID PARAM-NAME="PARAM-VALUE" ...]

SD-ID Format:
  name@enterprise_number  (e.g., "req@12345")
  OR
  IANA-registered name    (e.g., "timeQuality", "origin", "meta")

Examples:
  [timeQuality tzKnown="1" isSynced="1"]
  [origin ip="192.168.1.100" enterpriseId="12345"]
  [meta sequenceId="1234" sysUpTime="123456"]
  [myapp@32473 user="admin" action="login" result="success"]`} />
        </div>
        <div className="card p-4 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
          <p className="text-green-800 dark:text-green-300 text-sm">
            <strong>LogNog Feature:</strong> Structured data is automatically extracted and stored as JSON in the
            <code className="bg-green-100 dark:bg-green-900 px-2 py-0.5 rounded mx-1">structured_data</code> field.
            Query it using: <code className="bg-green-100 dark:bg-green-900 px-2 py-0.5 rounded">search structured_data~"user=admin"</code>
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">How LogNog Parses Syslog</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          LogNog uses Vector for syslog ingestion and automatically parses incoming messages into structured fields:
        </p>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-nog-800">
            <thead>
              <tr>
                <th>Syslog Component</th>
                <th>LogNog Field</th>
                <th>Example Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Priority (calculated severity)</td>
                <td><code className="code">severity</code></td>
                <td>3 (error)</td>
              </tr>
              <tr>
                <td>Priority (calculated facility)</td>
                <td><code className="code">facility</code></td>
                <td>4 (auth)</td>
              </tr>
              <tr>
                <td>Timestamp</td>
                <td><code className="code">timestamp</code></td>
                <td>2024-01-15T10:30:45.000Z</td>
              </tr>
              <tr>
                <td>Hostname</td>
                <td><code className="code">hostname</code></td>
                <td>server01.example.com</td>
              </tr>
              <tr>
                <td>Application/Tag</td>
                <td><code className="code">app_name</code></td>
                <td>sshd</td>
              </tr>
              <tr>
                <td>Process ID</td>
                <td><code className="code">proc_id</code></td>
                <td>12345</td>
              </tr>
              <tr>
                <td>Message ID (5424 only)</td>
                <td><code className="code">msg_id</code></td>
                <td>AUTH_SUCCESS</td>
              </tr>
              <tr>
                <td>Structured Data (5424 only)</td>
                <td><code className="code">structured_data</code></td>
                <td>{`{"user": "admin", ...}`}</td>
              </tr>
              <tr>
                <td>Message Content</td>
                <td><code className="code">message</code></td>
                <td>User admin logged in</td>
              </tr>
              <tr>
                <td>Original Message</td>
                <td><code className="code">raw</code></td>
                <td>(full original line)</td>
              </tr>
              <tr>
                <td>Source IP</td>
                <td><code className="code">source_ip</code></td>
                <td>192.168.1.50</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Sending Test Messages</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Use these commands to send test syslog messages to LogNog:
        </p>
        <div className="space-y-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Using netcat (nc)</h3>
            <CodeBlock code={`# RFC 3164 format (UDP)
echo "<14>$(date +'%b %d %H:%M:%S') $(hostname) myapp[$$]: Test message from LogNog" | nc -u localhost 514

# RFC 3164 format (TCP)
echo "<14>$(date +'%b %d %H:%M:%S') $(hostname) myapp[$$]: Test message from LogNog" | nc localhost 514

# RFC 5424 format
echo "<14>1 $(date -u +'%Y-%m-%dT%H:%M:%SZ') $(hostname) myapp $$ TEST - Test message RFC 5424" | nc -u localhost 514`} />
          </div>
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Using logger (Linux/macOS)</h3>
            <CodeBlock code={`# Local syslog (forwarded to LogNog if configured)
logger -p local0.info "Test message from logger"

# Send directly to LogNog
logger -n localhost -P 514 -p user.notice "Direct test to LogNog"

# With tag/program name
logger -t myapp -p local0.warning "Warning from myapp"`} />
          </div>
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">PowerShell (Windows)</h3>
            <CodeBlock code={`# Send UDP syslog message
$message = "<14>Jan 15 10:30:00 $(hostname) myapp[1234]: Test from PowerShell"
$udpClient = New-Object System.Net.Sockets.UdpClient
$bytes = [System.Text.Encoding]::ASCII.GetBytes($message)
$udpClient.Send($bytes, $bytes.Length, "localhost", 514)
$udpClient.Close()`} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Common Device Formats</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Many network devices and applications have their own syslog message formats. Here are some common examples:
        </p>
        <div className="space-y-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Cisco IOS</h3>
            <CodeBlock code={`<189>Jan 15 10:30:45 router01 %SYS-5-CONFIG_I: Configured from console by admin
<190>Jan 15 10:30:46 router01 %LINEPROTO-5-UPDOWN: Line protocol on Interface GigabitEthernet0/1, changed state to up
<187>Jan 15 10:30:47 router01 %SEC-6-IPACCESSLOGP: list 101 denied tcp 10.0.0.1(12345) -> 192.168.1.1(80), 1 packet`} />
          </div>
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Linux sshd</h3>
            <CodeBlock code={`<38>Jan 15 10:30:45 server sshd[12345]: Accepted publickey for admin from 10.0.0.50 port 52413 ssh2: RSA SHA256:abc123...
<38>Jan 15 10:30:46 server sshd[12346]: Failed password for invalid user test from 192.168.1.100 port 54321 ssh2
<86>Jan 15 10:30:47 server sshd[12345]: pam_unix(sshd:session): session opened for user admin by (uid=0)`} />
          </div>
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">nginx</h3>
            <CodeBlock code={`<134>Jan 15 10:30:45 webserver nginx: 192.168.1.100 - - [15/Jan/2024:10:30:45 +0000] "GET /api/users HTTP/1.1" 200 1234 "-" "Mozilla/5.0"
<131>Jan 15 10:30:46 webserver nginx: 2024/01/15 10:30:46 [error] 1234#0: *5678 connect() failed (111: Connection refused)`} />
          </div>
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">pfSense/OPNsense Firewall</h3>
            <CodeBlock code={`<134>Jan 15 10:30:45 firewall filterlog[12345]: 5,,,1000000103,em0,match,block,in,4,0x0,,64,12345,0,DF,6,tcp,60,192.168.1.100,10.0.0.1,54321,22,0,S,1234567890,,65535,,`} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Troubleshooting</h2>
        <div className="space-y-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Logs Not Appearing?</h3>
            <ul className="space-y-2 text-sm text-nog-600 dark:text-nog-400">
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-honey-500 mt-0.5 flex-shrink-0" />
                <span>Check that Vector is running: <code className="code">docker-compose ps vector</code></span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-honey-500 mt-0.5 flex-shrink-0" />
                <span>Verify port 514 is accessible: <code className="code">nc -vz localhost 514</code></span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-honey-500 mt-0.5 flex-shrink-0" />
                <span>Check Vector logs: <code className="code">docker-compose logs vector</code></span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-honey-500 mt-0.5 flex-shrink-0" />
                <span>Ensure firewall allows UDP/TCP 514</span>
              </li>
            </ul>
          </div>
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Parsing Issues?</h3>
            <ul className="space-y-2 text-sm text-nog-600 dark:text-nog-400">
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-honey-500 mt-0.5 flex-shrink-0" />
                <span>Check the <code className="code">raw</code> field to see the original message</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-honey-500 mt-0.5 flex-shrink-0" />
                <span>Verify the priority value is enclosed in angle brackets</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-honey-500 mt-0.5 flex-shrink-0" />
                <span>Ensure timestamp format matches RFC 3164 or 5424</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-honey-500 mt-0.5 flex-shrink-0" />
                <span>Use <code className="code">rex</code> command to extract custom fields from non-standard formats</span>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
