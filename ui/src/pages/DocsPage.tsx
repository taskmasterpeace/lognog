import { useState } from 'react';
import {
  BookOpen,
  Search,
  Terminal,
  Server,
  FileText,
  ChevronRight,
  Copy,
  Check,
  Cpu,
  Network,
  Shield,
  Container,
  Brain,
} from 'lucide-react';

type DocSection = 'query' | 'ingestion' | 'dashboards' | 'getting-started' | 'api' | 'syslog-format' | 'knowledge';

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm font-mono">
        <code>{code}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-2 bg-slate-800 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-700"
      >
        {copied ? (
          <Check className="w-4 h-4 text-green-400" />
        ) : (
          <Copy className="w-4 h-4 text-slate-400" />
        )}
      </button>
    </div>
  );
}

function SectionNav({ active, onChange }: { active: DocSection; onChange: (s: DocSection) => void }) {
  const sections: { id: DocSection; label: string; icon: React.ElementType }[] = [
    { id: 'getting-started', label: 'Getting Started', icon: BookOpen },
    { id: 'syslog-format', label: 'Syslog Format', icon: FileText },
    { id: 'ingestion', label: 'Sending Logs', icon: Server },
    { id: 'query', label: 'Query Language', icon: Search },
    { id: 'knowledge', label: 'Knowledge Objects', icon: Brain },
    { id: 'dashboards', label: 'Dashboards', icon: FileText },
    { id: 'api', label: 'API Reference', icon: Terminal },
  ];

  return (
    <nav className="flex flex-wrap gap-2 mb-8">
      {sections.map((s) => (
        <button
          key={s.id}
          onClick={() => onChange(s.id)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
            active === s.id
              ? 'bg-sky-500 text-white shadow-md shadow-sky-500/25'
              : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          <s.icon className="w-4 h-4" />
          {s.label}
        </button>
      ))}
    </nav>
  );
}

function GettingStartedSection() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold text-slate-900 mb-4">Quick Start</h2>
        <p className="text-slate-600 mb-4">
          Get Spunk running in under 10 minutes with Docker Compose.
        </p>

        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="font-semibold text-slate-900 mb-2">1. Clone and Start</h3>
            <CodeBlock code={`git clone https://github.com/yourusername/spunk.git
cd spunk
docker-compose up -d`} />
          </div>

          <div className="card p-4">
            <h3 className="font-semibold text-slate-900 mb-2">2. Access the UI</h3>
            <p className="text-slate-600 mb-2">
              Open <code className="code">http://localhost</code> in your browser.
            </p>
          </div>

          <div className="card p-4">
            <h3 className="font-semibold text-slate-900 mb-2">3. Send Test Logs</h3>
            <CodeBlock code={`# Send a test syslog message
echo "<14>$(date) myhost myapp[1234]: Test log message" | nc -u localhost 514`} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 mb-4">Architecture</h2>
        <div className="card p-6 bg-slate-50">
          <pre className="text-sm text-slate-600 overflow-x-auto">{`
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Syslog     │────▶│   Vector     │────▶│  ClickHouse  │
│   Clients    │     │   (ingest)   │     │   (storage)  │
└──────────────┘     └──────────────┘     └──────────────┘
                                                 │
┌──────────────┐     ┌──────────────┐            │
│   React UI   │◀────│    Nginx     │◀───────────┤
│   (Vite)     │     │   (proxy)    │            │
└──────────────┘     └──────────────┘            ▼
                                          ┌──────────────┐
                                          │  Node.js API │
                                          │  (DSL Parser)│
                                          └──────────────┘
`}</pre>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 mb-4">Ports Reference</h2>
        <div className="overflow-x-auto">
          <table className="table card">
            <thead>
              <tr>
                <th>Service</th>
                <th>Port</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Nginx</td><td><code className="code">80</code></td><td>Web UI and API proxy</td></tr>
              <tr><td>Vector</td><td><code className="code">514/udp</code></td><td>Syslog UDP ingestion</td></tr>
              <tr><td>Vector</td><td><code className="code">514/tcp</code></td><td>Syslog TCP ingestion</td></tr>
              <tr><td>API</td><td><code className="code">4000</code></td><td>REST API (internal)</td></tr>
              <tr><td>ClickHouse</td><td><code className="code">8123</code></td><td>HTTP interface</td></tr>
              <tr><td>ClickHouse</td><td><code className="code">9000</code></td><td>Native interface</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function QueryLanguageSection() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold text-slate-900 mb-4">Spunk Query Language (SQL)</h2>
        <p className="text-slate-600 mb-4">
          Spunk uses a Splunk-like query language that compiles to ClickHouse SQL.
          Queries are pipe-delimited commands that filter, transform, and aggregate your logs.
        </p>

        <div className="card p-4 bg-sky-50 border-sky-200">
          <p className="text-sky-800">
            <strong>Basic syntax:</strong> <code className="bg-sky-100 px-2 py-0.5 rounded">command arguments | command arguments | ...</code>
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Commands Reference</h2>

        {/* Search */}
        <div className="card mb-4">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-sky-500" />
              search
            </h3>
            <p className="text-sm text-slate-600 mt-1">Filter logs by field values. Usually the first command.</p>
          </div>
          <div className="p-4 bg-slate-50 space-y-3">
            <CodeBlock code={`# Match all logs
search *

# Filter by hostname
search host=myserver

# Multiple conditions (AND)
search host=myserver severity>=warning

# Contains match (regex)
search message~"error"

# Wildcard matching
search host=router*`} />
          </div>
        </div>

        {/* Filter */}
        <div className="card mb-4">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-sky-500" />
              filter / where
            </h3>
            <p className="text-sm text-slate-600 mt-1">Additional filtering after initial search.</p>
          </div>
          <div className="p-4 bg-slate-50">
            <CodeBlock code={`search * | filter app_name=nginx
search * | where severity<=3`} />
          </div>
        </div>

        {/* Stats */}
        <div className="card mb-4">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-sky-500" />
              stats
            </h3>
            <p className="text-sm text-slate-600 mt-1">Aggregate data with functions. Group results by fields.</p>
          </div>
          <div className="p-4 bg-slate-50 space-y-3">
            <CodeBlock code={`# Count all logs
search * | stats count

# Count by field
search * | stats count by hostname

# Multiple aggregations
search * | stats count sum(bytes) avg(duration) by hostname

# Available functions:
# count, sum, avg, min, max, dc (distinct count), values`} />
          </div>
        </div>

        {/* Sort */}
        <div className="card mb-4">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-sky-500" />
              sort
            </h3>
            <p className="text-sm text-slate-600 mt-1">Order results by fields.</p>
          </div>
          <div className="p-4 bg-slate-50">
            <CodeBlock code={`search * | sort desc timestamp
search * | stats count by hostname | sort desc count`} />
          </div>
        </div>

        {/* Limit */}
        <div className="card mb-4">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-sky-500" />
              limit / head
            </h3>
            <p className="text-sm text-slate-600 mt-1">Limit the number of results returned.</p>
          </div>
          <div className="p-4 bg-slate-50">
            <CodeBlock code={`search * | limit 100
search * | head 50`} />
          </div>
        </div>

        {/* Table */}
        <div className="card mb-4">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-sky-500" />
              table / fields
            </h3>
            <p className="text-sm text-slate-600 mt-1">Select specific fields to display.</p>
          </div>
          <div className="p-4 bg-slate-50">
            <CodeBlock code={`search * | table timestamp hostname message
search * | fields timestamp hostname severity`} />
          </div>
        </div>

        {/* Dedup */}
        <div className="card mb-4">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-sky-500" />
              dedup
            </h3>
            <p className="text-sm text-slate-600 mt-1">Remove duplicate results based on fields.</p>
          </div>
          <div className="p-4 bg-slate-50">
            <CodeBlock code={`search * | dedup hostname app_name`} />
          </div>
        </div>

        {/* Rename */}
        <div className="card mb-4">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-sky-500" />
              rename
            </h3>
            <p className="text-sm text-slate-600 mt-1">Rename fields in output.</p>
          </div>
          <div className="p-4 bg-slate-50">
            <CodeBlock code={`search * | rename hostname as host, app_name as application`} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Field Reference</h2>
        <div className="overflow-x-auto">
          <table className="table card">
            <thead>
              <tr>
                <th>Field</th>
                <th>Aliases</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr><td><code className="code">timestamp</code></td><td>time, _time</td><td>Log timestamp</td></tr>
              <tr><td><code className="code">hostname</code></td><td>host, source</td><td>Source hostname</td></tr>
              <tr><td><code className="code">app_name</code></td><td>app, program, sourcetype</td><td>Application name</td></tr>
              <tr><td><code className="code">severity</code></td><td>level</td><td>Syslog severity (0-7)</td></tr>
              <tr><td><code className="code">facility</code></td><td>-</td><td>Syslog facility</td></tr>
              <tr><td><code className="code">message</code></td><td>msg</td><td>Log message content</td></tr>
              <tr><td><code className="code">raw</code></td><td>_raw</td><td>Original raw message</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Severity Levels</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { level: 0, name: 'Emergency', color: 'bg-red-100 text-red-800 border-red-200' },
            { level: 1, name: 'Alert', color: 'bg-orange-100 text-orange-800 border-orange-200' },
            { level: 2, name: 'Critical', color: 'bg-amber-100 text-amber-800 border-amber-200' },
            { level: 3, name: 'Error', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
            { level: 4, name: 'Warning', color: 'bg-lime-100 text-lime-800 border-lime-200' },
            { level: 5, name: 'Notice', color: 'bg-green-100 text-green-800 border-green-200' },
            { level: 6, name: 'Info', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
            { level: 7, name: 'Debug', color: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
          ].map((s) => (
            <div key={s.level} className={`p-3 rounded-lg border ${s.color}`}>
              <span className="font-mono font-bold">{s.level}</span>
              <span className="ml-2">{s.name}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Example Queries</h2>
        <div className="space-y-3">
          {[
            { name: 'Find errors in the last hour', query: 'search severity<=3 | sort desc timestamp | limit 100' },
            { name: 'Top 10 hosts by log volume', query: 'search * | stats count by hostname | sort desc | limit 10' },
            { name: 'Authentication failures', query: 'search app_name=sshd message~"Failed" | stats count by hostname' },
            { name: 'Firewall blocks', query: 'search app_name=firewall action=block | stats count by source_ip | sort desc' },
            { name: 'Error rate by application', query: 'search * | stats count countif(severity<=3) as errors by app_name' },
          ].map((ex) => (
            <div key={ex.name} className="card p-4">
              <p className="font-medium text-slate-900 mb-2">{ex.name}</p>
              <CodeBlock code={ex.query} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function LogIngestionSection() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold text-slate-900 mb-4">Supported Log Sources</h2>
        <p className="text-slate-600 mb-6">
          Spunk accepts logs via Syslog (RFC 3164 and RFC 5424) on port 514 (UDP/TCP).
          Configure your devices and applications to send logs to your Spunk server.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { icon: Server, name: 'Linux Servers', desc: 'rsyslog, syslog-ng, journald' },
            { icon: Network, name: 'Network Devices', desc: 'Routers, switches, firewalls' },
            { icon: Container, name: 'Docker', desc: 'Container logs via syslog driver' },
            { icon: Shield, name: 'Security', desc: 'Firewalls, IDS/IPS, authentication' },
            { icon: Cpu, name: 'Applications', desc: 'Any app with syslog output' },
            { icon: Server, name: 'NAS/Storage', desc: 'TrueNAS, Synology, QNAP' },
          ].map((item) => (
            <div key={item.name} className="card p-4 flex items-start gap-3">
              <div className="p-2 bg-sky-50 rounded-lg">
                <item.icon className="w-5 h-5 text-sky-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">{item.name}</h3>
                <p className="text-sm text-slate-500">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Linux (rsyslog)</h2>
        <p className="text-slate-600 mb-4">
          Configure rsyslog to forward logs to Spunk. Edit <code className="code">/etc/rsyslog.conf</code> or create
          a new file in <code className="code">/etc/rsyslog.d/</code>.
        </p>
        <CodeBlock code={`# /etc/rsyslog.d/50-spunk.conf

# Forward all logs to Spunk via UDP
*.* @spunk-server:514

# Or use TCP for reliable delivery
*.* @@spunk-server:514

# Restart rsyslog
sudo systemctl restart rsyslog`} />
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Linux (systemd-journald)</h2>
        <p className="text-slate-600 mb-4">
          Forward journald logs to syslog, then to Spunk.
        </p>
        <CodeBlock code={`# /etc/systemd/journald.conf
[Journal]
ForwardToSyslog=yes

# Restart journald
sudo systemctl restart systemd-journald`} />
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Docker Containers</h2>
        <p className="text-slate-600 mb-4">
          Configure Docker to send container logs to Spunk using the syslog driver.
        </p>
        <CodeBlock code={`# Run a container with syslog logging
docker run -d \\
  --log-driver=syslog \\
  --log-opt syslog-address=udp://spunk-server:514 \\
  --log-opt tag="{{.Name}}" \\
  nginx

# Or configure in docker-compose.yml
services:
  myapp:
    image: myapp:latest
    logging:
      driver: syslog
      options:
        syslog-address: "udp://spunk-server:514"
        tag: "myapp"`} />
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-4">pfSense / OPNsense</h2>
        <p className="text-slate-600 mb-4">
          Configure your firewall to send logs to Spunk.
        </p>
        <div className="card p-4 space-y-2">
          <p><strong>pfSense:</strong></p>
          <ol className="list-decimal list-inside text-slate-600 space-y-1">
            <li>Go to <strong>Status → System Logs → Settings</strong></li>
            <li>Check <strong>Enable Remote Logging</strong></li>
            <li>Enter Spunk server IP in <strong>Remote log servers</strong></li>
            <li>Select which logs to send (firewall, system, etc.)</li>
            <li>Save and apply</li>
          </ol>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-4">TrueNAS</h2>
        <p className="text-slate-600 mb-4">
          Configure TrueNAS to send logs to Spunk.
        </p>
        <div className="card p-4 space-y-2">
          <ol className="list-decimal list-inside text-slate-600 space-y-1">
            <li>Go to <strong>System → Advanced</strong></li>
            <li>Set <strong>Syslog Server</strong> to your Spunk server IP</li>
            <li>Set <strong>Syslog Transport</strong> to UDP or TCP</li>
            <li>Save</li>
          </ol>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Synology NAS</h2>
        <CodeBlock code={`# SSH into Synology and edit syslog config
sudo vi /etc/syslog-ng/syslog-ng.conf

# Add destination
destination d_spunk { udp("spunk-server" port(514)); };

# Add log statement
log { source(s_sys); destination(d_spunk); };

# Restart syslog
sudo synoservice --restart syslog-ng`} />
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Windows (NXLog)</h2>
        <p className="text-slate-600 mb-4">
          Use NXLog Community Edition to forward Windows Event Logs.
        </p>
        <CodeBlock code={`# C:\\Program Files\\nxlog\\conf\\nxlog.conf

<Input eventlog>
    Module      im_msvistalog
    Query       <QueryList>\\
                    <Query Id="0">\\
                        <Select Path="Application">*</Select>\\
                        <Select Path="System">*</Select>\\
                        <Select Path="Security">*</Select>\\
                    </Query>\\
                </QueryList>
</Input>

<Output syslog>
    Module      om_udp
    Host        spunk-server
    Port        514
    Exec        to_syslog_bsd();
</Output>

<Route 1>
    Path        eventlog => syslog
</Route>`} />
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Test Your Setup</h2>
        <p className="text-slate-600 mb-4">
          Send a test message to verify connectivity.
        </p>
        <CodeBlock code={`# From Linux
echo "<14>$(date '+%b %d %H:%M:%S') testhost testapp[$$]: Test message" | nc -u spunk-server 514

# Using logger
logger -n spunk-server -P 514 -d "Test message from $(hostname)"`} />
      </section>
    </div>
  );
}

function SyslogFormatSection() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold text-slate-900 mb-4">Syslog Message Format</h2>
        <p className="text-slate-600 mb-4">
          Spunk accepts logs via standard Syslog protocol (RFC 3164 and RFC 5424) on port 514.
          Understanding the message format helps you send properly structured logs from your applications.
        </p>

        <div className="card p-4 bg-sky-50 border-sky-200 mb-6">
          <p className="text-sky-800">
            <strong>Quick Reference:</strong> Send to <code className="bg-sky-100 px-2 py-0.5 rounded">your-spunk-server:514</code> via UDP or TCP
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-4">RFC 3164 (BSD Syslog) - Recommended</h2>
        <p className="text-slate-600 mb-4">
          The traditional syslog format. Simple and widely supported.
        </p>

        <div className="card p-4 mb-4">
          <h3 className="font-semibold text-slate-900 mb-2">Message Structure</h3>
          <CodeBlock code={`<PRIORITY>TIMESTAMP HOSTNAME APP-NAME[PID]: MESSAGE

Example:
<134>Dec 11 14:30:00 web-server-01 nginx[1234]: 192.168.1.100 - - "GET /api/users HTTP/1.1" 200 1234`} />
        </div>

        <div className="overflow-x-auto mb-4">
          <table className="table card">
            <thead>
              <tr>
                <th>Component</th>
                <th>Format</th>
                <th>Example</th>
                <th>Required</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code className="code">PRIORITY</code></td>
                <td>&lt;facility * 8 + severity&gt;</td>
                <td><code className="code">&lt;134&gt;</code></td>
                <td>Yes</td>
              </tr>
              <tr>
                <td><code className="code">TIMESTAMP</code></td>
                <td>Mmm dd HH:MM:SS</td>
                <td><code className="code">Dec 11 14:30:00</code></td>
                <td>Yes</td>
              </tr>
              <tr>
                <td><code className="code">HOSTNAME</code></td>
                <td>hostname or IP</td>
                <td><code className="code">web-server-01</code></td>
                <td>Yes</td>
              </tr>
              <tr>
                <td><code className="code">APP-NAME</code></td>
                <td>application name</td>
                <td><code className="code">nginx</code></td>
                <td>Recommended</td>
              </tr>
              <tr>
                <td><code className="code">PID</code></td>
                <td>process ID in brackets</td>
                <td><code className="code">[1234]</code></td>
                <td>Optional</td>
              </tr>
              <tr>
                <td><code className="code">MESSAGE</code></td>
                <td>free-form text</td>
                <td>Your log content</td>
                <td>Yes</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Priority Calculation</h2>
        <p className="text-slate-600 mb-4">
          Priority = (Facility × 8) + Severity. For example, local0 (16) + info (6) = 134.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold text-slate-900 mb-3">Facility Codes</h3>
            <div className="overflow-x-auto">
              <table className="table card text-sm">
                <thead>
                  <tr><th>Code</th><th>Facility</th><th>Use Case</th></tr>
                </thead>
                <tbody>
                  <tr><td>0</td><td>kern</td><td>Kernel messages</td></tr>
                  <tr><td>1</td><td>user</td><td>User-level messages</td></tr>
                  <tr><td>3</td><td>daemon</td><td>System daemons</td></tr>
                  <tr><td>4</td><td>auth</td><td>Security/auth</td></tr>
                  <tr><td>10</td><td>authpriv</td><td>Private auth</td></tr>
                  <tr><td>16</td><td>local0</td><td>Custom use</td></tr>
                  <tr><td>17</td><td>local1</td><td>Custom use</td></tr>
                  <tr><td>18</td><td>local2</td><td>Custom use</td></tr>
                  <tr><td>19</td><td>local3</td><td>Custom use</td></tr>
                  <tr><td>20</td><td>local4</td><td>Custom use</td></tr>
                  <tr><td>21</td><td>local5</td><td>Custom use</td></tr>
                  <tr><td>22</td><td>local6</td><td>Custom use</td></tr>
                  <tr><td>23</td><td>local7</td><td>Custom use</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-slate-900 mb-3">Severity Levels</h3>
            <div className="overflow-x-auto">
              <table className="table card text-sm">
                <thead>
                  <tr><th>Code</th><th>Severity</th><th>Description</th></tr>
                </thead>
                <tbody>
                  <tr><td className="text-red-600 font-bold">0</td><td>Emergency</td><td>System unusable</td></tr>
                  <tr><td className="text-red-500 font-bold">1</td><td>Alert</td><td>Immediate action needed</td></tr>
                  <tr><td className="text-orange-500 font-bold">2</td><td>Critical</td><td>Critical conditions</td></tr>
                  <tr><td className="text-amber-500 font-bold">3</td><td>Error</td><td>Error conditions</td></tr>
                  <tr><td className="text-yellow-500 font-bold">4</td><td>Warning</td><td>Warning conditions</td></tr>
                  <tr><td className="text-green-600 font-bold">5</td><td>Notice</td><td>Normal but significant</td></tr>
                  <tr><td className="text-sky-600 font-bold">6</td><td>Info</td><td>Informational</td></tr>
                  <tr><td className="text-slate-500 font-bold">7</td><td>Debug</td><td>Debug messages</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="card p-4 mt-4">
          <h3 className="font-semibold text-slate-900 mb-2">Common Priority Values</h3>
          <CodeBlock code={`# Application logs (local0 facility)
<134>  # local0.info  (16*8 + 6 = 134) - General info
<131>  # local0.err   (16*8 + 3 = 131) - Errors
<130>  # local0.crit  (16*8 + 2 = 130) - Critical

# Auth logs (auth facility)
<38>   # auth.info    (4*8 + 6 = 38)
<35>   # auth.err     (4*8 + 3 = 35)

# Daemon logs
<30>   # daemon.info  (3*8 + 6 = 30)
<27>   # daemon.err   (3*8 + 3 = 27)`} />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-4">RFC 5424 (Modern Syslog)</h2>
        <p className="text-slate-600 mb-4">
          Enhanced format with structured data support. Use this for richer metadata.
        </p>

        <div className="card p-4 mb-4">
          <h3 className="font-semibold text-slate-900 mb-2">Message Structure</h3>
          <CodeBlock code={`<PRIORITY>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID [STRUCTURED-DATA] MESSAGE

Example:
<134>1 2025-12-11T14:30:00.123Z web-server-01 myapp 1234 REQ001 [meta env="prod" version="1.2.3"] User login successful`} />
        </div>

        <div className="overflow-x-auto">
          <table className="table card">
            <thead>
              <tr>
                <th>Component</th>
                <th>Format</th>
                <th>Example</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code className="code">VERSION</code></td>
                <td>Always "1"</td>
                <td><code className="code">1</code></td>
              </tr>
              <tr>
                <td><code className="code">TIMESTAMP</code></td>
                <td>ISO 8601</td>
                <td><code className="code">2025-12-11T14:30:00.123Z</code></td>
              </tr>
              <tr>
                <td><code className="code">PROCID</code></td>
                <td>Process ID or "-"</td>
                <td><code className="code">1234</code></td>
              </tr>
              <tr>
                <td><code className="code">MSGID</code></td>
                <td>Message type or "-"</td>
                <td><code className="code">REQ001</code></td>
              </tr>
              <tr>
                <td><code className="code">STRUCTURED-DATA</code></td>
                <td>[id key="val"...] or "-"</td>
                <td><code className="code">[meta env="prod"]</code></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Code Examples: Sending Logs</h2>

        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="font-semibold text-slate-900 mb-2">Python</h3>
            <CodeBlock code={`import socket
import datetime

class SyslogClient:
    def __init__(self, host='localhost', port=514):
        self.host = host
        self.port = port
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

    def send(self, message, severity=6, facility=16, app_name='myapp', hostname=None):
        """Send a syslog message. Default: local0.info"""
        if hostname is None:
            hostname = socket.gethostname()

        priority = facility * 8 + severity
        timestamp = datetime.datetime.now().strftime('%b %d %H:%M:%S')

        # RFC 3164 format
        syslog_msg = f"<{priority}>{timestamp} {hostname} {app_name}: {message}"
        self.sock.sendto(syslog_msg.encode(), (self.host, self.port))

# Usage
logger = SyslogClient('spunk-server', 514)
logger.send("User login successful", severity=6)  # Info
logger.send("Database connection failed", severity=3)  # Error
logger.send("Request processed in 45ms", severity=7)  # Debug`} />
          </div>

          <div className="card p-4">
            <h3 className="font-semibold text-slate-900 mb-2">Node.js / TypeScript</h3>
            <CodeBlock code={`import dgram from 'dgram';
import os from 'os';

class SyslogClient {
  private client: dgram.Socket;
  private host: string;
  private port: number;

  constructor(host = 'localhost', port = 514) {
    this.client = dgram.createSocket('udp4');
    this.host = host;
    this.port = port;
  }

  send(message: string, options: {
    severity?: number;  // 0-7
    facility?: number;  // 0-23
    appName?: string;
    hostname?: string;
  } = {}) {
    const { severity = 6, facility = 16, appName = 'myapp', hostname = os.hostname() } = options;
    const priority = facility * 8 + severity;
    const timestamp = new Date().toLocaleString('en-US', {
      month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).replace(',', '');

    const syslogMsg = \`<\${priority}>\${timestamp} \${hostname} \${appName}: \${message}\`;
    this.client.send(syslogMsg, this.port, this.host);
  }

  info(msg: string) { this.send(msg, { severity: 6 }); }
  warn(msg: string) { this.send(msg, { severity: 4 }); }
  error(msg: string) { this.send(msg, { severity: 3 }); }
}

// Usage
const logger = new SyslogClient('spunk-server', 514);
logger.info('Application started');
logger.error('Failed to connect to database');`} />
          </div>

          <div className="card p-4">
            <h3 className="font-semibold text-slate-900 mb-2">Go</h3>
            <CodeBlock code={`package main

import (
    "fmt"
    "net"
    "os"
    "time"
)

type SyslogClient struct {
    conn *net.UDPConn
    host string
}

func NewSyslogClient(host string, port int) (*SyslogClient, error) {
    addr, err := net.ResolveUDPAddr("udp", fmt.Sprintf("%s:%d", host, port))
    if err != nil {
        return nil, err
    }
    conn, err := net.DialUDP("udp", nil, addr)
    if err != nil {
        return nil, err
    }
    return &SyslogClient{conn: conn, host: host}, nil
}

func (c *SyslogClient) Send(message string, severity, facility int, appName string) error {
    hostname, _ := os.Hostname()
    priority := facility*8 + severity
    timestamp := time.Now().Format("Jan 02 15:04:05")

    msg := fmt.Sprintf("<%d>%s %s %s: %s", priority, timestamp, hostname, appName, message)
    _, err := c.conn.Write([]byte(msg))
    return err
}

func main() {
    logger, _ := NewSyslogClient("spunk-server", 514)
    logger.Send("Service started successfully", 6, 16, "myservice")
    logger.Send("Connection timeout", 3, 16, "myservice")
}`} />
          </div>

          <div className="card p-4">
            <h3 className="font-semibold text-slate-900 mb-2">Bash / Shell</h3>
            <CodeBlock code={`#!/bin/bash
SPUNK_SERVER="spunk-server"
SPUNK_PORT=514
HOSTNAME=$(hostname)
APP_NAME="myapp"

# Function to send syslog message
send_log() {
    local severity=$1  # 0-7
    local message=$2
    local facility=16  # local0
    local priority=$((facility * 8 + severity))
    local timestamp=$(date '+%b %d %H:%M:%S')

    echo "<\${priority}>\${timestamp} \${HOSTNAME} \${APP_NAME}: \${message}" | \\
        nc -u -w1 $SPUNK_SERVER $SPUNK_PORT
}

# Usage
send_log 6 "Script started"           # Info
send_log 4 "Disk space low: 85%"      # Warning
send_log 3 "Backup failed"            # Error

# Or use logger command (requires rsyslog)
logger -n $SPUNK_SERVER -P $SPUNK_PORT -d "Test message from script"`} />
          </div>

          <div className="card p-4">
            <h3 className="font-semibold text-slate-900 mb-2">Java</h3>
            <CodeBlock code={`import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

public class SyslogClient {
    private final String host;
    private final int port;
    private final DatagramSocket socket;

    public SyslogClient(String host, int port) throws Exception {
        this.host = host;
        this.port = port;
        this.socket = new DatagramSocket();
    }

    public void send(String message, int severity, int facility, String appName) throws Exception {
        int priority = facility * 8 + severity;
        String timestamp = LocalDateTime.now().format(
            DateTimeFormatter.ofPattern("MMM dd HH:mm:ss")
        );
        String hostname = InetAddress.getLocalHost().getHostName();

        String syslogMsg = String.format("<%d>%s %s %s: %s",
            priority, timestamp, hostname, appName, message);

        byte[] data = syslogMsg.getBytes();
        DatagramPacket packet = new DatagramPacket(
            data, data.length, InetAddress.getByName(host), port);
        socket.send(packet);
    }

    public void info(String msg) throws Exception { send(msg, 6, 16, "myapp"); }
    public void error(String msg) throws Exception { send(msg, 3, 16, "myapp"); }
}

// Usage
SyslogClient logger = new SyslogClient("spunk-server", 514);
logger.info("Application initialized");
logger.error("Database query failed");`} />
          </div>

          <div className="card p-4">
            <h3 className="font-semibold text-slate-900 mb-2">C# / .NET</h3>
            <CodeBlock code={`using System;
using System.Net;
using System.Net.Sockets;
using System.Text;

public class SyslogClient : IDisposable
{
    private readonly UdpClient _client;
    private readonly string _host;
    private readonly int _port;

    public SyslogClient(string host = "localhost", int port = 514)
    {
        _host = host;
        _port = port;
        _client = new UdpClient();
    }

    public void Send(string message, int severity = 6, int facility = 16, string appName = "myapp")
    {
        int priority = facility * 8 + severity;
        string timestamp = DateTime.Now.ToString("MMM dd HH:mm:ss");
        string hostname = Dns.GetHostName();

        string syslogMsg = $"<{priority}>{timestamp} {hostname} {appName}: {message}";
        byte[] data = Encoding.UTF8.GetBytes(syslogMsg);
        _client.Send(data, data.Length, _host, _port);
    }

    public void Info(string msg) => Send(msg, severity: 6);
    public void Warn(string msg) => Send(msg, severity: 4);
    public void Error(string msg) => Send(msg, severity: 3);

    public void Dispose() => _client.Dispose();
}

// Usage
using var logger = new SyslogClient("spunk-server", 514);
logger.Info("Service started");
logger.Error("Connection refused");`} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Best Practices</h2>
        <ul className="space-y-2">
          {[
            'Use local0-local7 facilities (16-23) for custom applications',
            'Include meaningful app names to filter logs by application',
            'Use appropriate severity levels - dont log everything as error',
            'Include request IDs or correlation IDs for distributed tracing',
            'Keep messages under 1024 bytes for UDP compatibility',
            'Use structured data (RFC 5424) for machine-parseable metadata',
            'Test your syslog integration before deploying to production',
          ].map((tip, i) => (
            <li key={i} className="flex items-start gap-2 text-slate-600">
              <ChevronRight className="w-4 h-4 text-sky-500 mt-1 flex-shrink-0" />
              {tip}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function APIReferenceSection() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold text-slate-900 mb-4">REST API Reference</h2>
        <p className="text-slate-600 mb-4">
          Spunk provides a REST API for querying logs, managing dashboards, and accessing statistics.
          The API is available at <code className="code">http://your-server:4000</code> or via nginx at <code className="code">http://your-server/api</code>.
        </p>

        <div className="card p-4 bg-sky-50 border-sky-200 mb-6">
          <p className="text-sky-800">
            <strong>Base URL:</strong> <code className="bg-sky-100 px-2 py-0.5 rounded">http://localhost:4000</code>
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Health Check</h2>
        <div className="card mb-4">
          <div className="p-4 border-b border-slate-100 flex items-center gap-3">
            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-bold rounded">GET</span>
            <code className="text-slate-900">/health</code>
          </div>
          <div className="p-4">
            <p className="text-slate-600 mb-3">Check API and database connectivity.</p>
            <CodeBlock code={`curl http://localhost:4000/health

# Response
{
  "status": "healthy",
  "timestamp": "2025-12-11T14:30:00.000Z",
  "services": {
    "api": "ok",
    "clickhouse": "ok"
  }
}`} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Search API</h2>

        <div className="card mb-4">
          <div className="p-4 border-b border-slate-100 flex items-center gap-3">
            <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded">POST</span>
            <code className="text-slate-900">/search/query</code>
          </div>
          <div className="p-4">
            <p className="text-slate-600 mb-3">Execute a search query using Spunk Query Language.</p>
            <CodeBlock code={`curl -X POST http://localhost:4000/search/query \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "search nginx | where hostname = '\\''web-server-01'\\'' | limit 10",
    "timeRange": {
      "start": "2025-12-11T00:00:00Z",
      "end": "2025-12-12T00:00:00Z"
    }
  }'

# Response
{
  "query": "search nginx | where hostname = 'web-server-01' | limit 10",
  "sql": "SELECT ... FROM spunk.logs ...",
  "results": [
    {
      "timestamp": "2025-12-11 14:30:00",
      "hostname": "web-server-01",
      "app_name": "nginx",
      "severity": 6,
      "message": "192.168.1.100 - - \\"GET /api HTTP/1.1\\" 200 1234"
    }
  ],
  "count": 10
}`} />
          </div>
        </div>

        <div className="card mb-4">
          <div className="p-4 border-b border-slate-100 flex items-center gap-3">
            <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded">POST</span>
            <code className="text-slate-900">/search/parse</code>
          </div>
          <div className="p-4">
            <p className="text-slate-600 mb-3">Parse a query without executing it. Returns the generated SQL.</p>
            <CodeBlock code={`curl -X POST http://localhost:4000/search/parse \\
  -H "Content-Type: application/json" \\
  -d '{"query": "search | stats count by hostname"}'

# Response
{
  "sql": "SELECT hostname, count() AS count_all FROM spunk.logs GROUP BY hostname",
  "ast": { ... }
}`} />
          </div>
        </div>

        <div className="card mb-4">
          <div className="p-4 border-b border-slate-100 flex items-center gap-3">
            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-bold rounded">GET</span>
            <code className="text-slate-900">/search/fields</code>
          </div>
          <div className="p-4">
            <p className="text-slate-600 mb-3">Get available fields and their types.</p>
            <CodeBlock code={`curl http://localhost:4000/search/fields

# Response
{
  "fields": [
    {"name": "timestamp", "type": "DateTime"},
    {"name": "hostname", "type": "String"},
    {"name": "app_name", "type": "String"},
    {"name": "severity", "type": "UInt8"},
    {"name": "message", "type": "String"}
  ]
}`} />
          </div>
        </div>

        <div className="card mb-4">
          <div className="p-4 border-b border-slate-100 flex items-center gap-3">
            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-bold rounded">GET</span>
            <code className="text-slate-900">/search/fields/:field/values</code>
          </div>
          <div className="p-4">
            <p className="text-slate-600 mb-3">Get unique values for a specific field.</p>
            <CodeBlock code={`curl http://localhost:4000/search/fields/hostname/values

# Response
{
  "field": "hostname",
  "values": ["web-server-01", "web-server-02", "db-server-01", ...]
}`} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Statistics API</h2>

        <div className="card mb-4">
          <div className="p-4 border-b border-slate-100 flex items-center gap-3">
            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-bold rounded">GET</span>
            <code className="text-slate-900">/stats/overview</code>
          </div>
          <div className="p-4">
            <p className="text-slate-600 mb-3">Get overall log statistics.</p>
            <CodeBlock code={`curl http://localhost:4000/stats/overview

# Response
{
  "totalLogs": "15234",
  "last24Hours": "2341",
  "bySeverity": [
    {"severity": 6, "count": "12000"},
    {"severity": 3, "count": "234"}
  ],
  "topHosts": [
    {"hostname": "web-server-01", "count": "5000"},
    ...
  ],
  "topApps": [
    {"app_name": "nginx", "count": "8000"},
    ...
  ]
}`} />
          </div>
        </div>

        <div className="card mb-4">
          <div className="p-4 border-b border-slate-100 flex items-center gap-3">
            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-bold rounded">GET</span>
            <code className="text-slate-900">/stats/timeseries</code>
          </div>
          <div className="p-4">
            <p className="text-slate-600 mb-3">Get log counts over time.</p>
            <CodeBlock code={`curl "http://localhost:4000/stats/timeseries?interval=hour&hours=24"

# Response
{
  "data": [
    {"time": "2025-12-11 00:00:00", "count": "234"},
    {"time": "2025-12-11 01:00:00", "count": "456"},
    ...
  ]
}`} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Dashboards API</h2>

        <div className="card mb-4">
          <div className="p-4 border-b border-slate-100 flex items-center gap-3">
            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-bold rounded">GET</span>
            <code className="text-slate-900">/dashboards</code>
          </div>
          <div className="p-4">
            <p className="text-slate-600 mb-3">List all dashboards.</p>
          </div>
        </div>

        <div className="card mb-4">
          <div className="p-4 border-b border-slate-100 flex items-center gap-3">
            <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded">POST</span>
            <code className="text-slate-900">/dashboards</code>
          </div>
          <div className="p-4">
            <p className="text-slate-600 mb-3">Create a new dashboard.</p>
            <CodeBlock code={`curl -X POST http://localhost:4000/dashboards \\
  -H "Content-Type: application/json" \\
  -d '{"name": "My Dashboard", "description": "Overview of system logs"}'

# Response
{
  "id": "abc123",
  "name": "My Dashboard",
  "description": "Overview of system logs",
  "created_at": "2025-12-11 14:30:00"
}`} />
          </div>
        </div>

        <div className="card mb-4">
          <div className="p-4 border-b border-slate-100 flex items-center gap-3">
            <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded">POST</span>
            <code className="text-slate-900">/dashboards/:id/panels</code>
          </div>
          <div className="p-4">
            <p className="text-slate-600 mb-3">Add a panel to a dashboard.</p>
            <CodeBlock code={`curl -X POST http://localhost:4000/dashboards/abc123/panels \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Logs by Host",
    "query": "search | stats count by hostname | sort desc | limit 10",
    "type": "bar"
  }'`} />
          </div>
        </div>

        <div className="card mb-4">
          <div className="p-4 border-b border-slate-100 flex items-center gap-3">
            <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-bold rounded">DELETE</span>
            <code className="text-slate-900">/dashboards/:id</code>
          </div>
          <div className="p-4">
            <p className="text-slate-600 mb-3">Delete a dashboard.</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-4">ClickHouse Schema</h2>
        <p className="text-slate-600 mb-4">
          Logs are stored in the <code className="code">spunk.logs</code> table with the following schema:
        </p>
        <CodeBlock code={`CREATE TABLE spunk.logs (
    timestamp     DateTime DEFAULT now(),
    received_at   DateTime DEFAULT now(),
    facility      UInt8 DEFAULT 1,
    severity      UInt8 DEFAULT 6,
    priority      UInt16 DEFAULT 14,
    hostname      LowCardinality(String) DEFAULT '',
    app_name      LowCardinality(String) DEFAULT '',
    proc_id       String DEFAULT '',
    msg_id        String DEFAULT '',
    message       String,
    raw           String DEFAULT '',
    structured_data String DEFAULT '{}',
    source_ip     IPv4 DEFAULT toIPv4('0.0.0.0'),
    dest_ip       IPv4 DEFAULT toIPv4('0.0.0.0'),
    source_port   UInt16 DEFAULT 0,
    dest_port     UInt16 DEFAULT 0,
    protocol      LowCardinality(String) DEFAULT '',
    action        LowCardinality(String) DEFAULT '',
    user          LowCardinality(String) DEFAULT '',
    index_name    LowCardinality(String) DEFAULT 'main',
    message_tokens Array(String) DEFAULT []
) ENGINE = MergeTree()
ORDER BY (timestamp, hostname, app_name)
TTL timestamp + INTERVAL 30 DAY;`} />
      </section>
    </div>
  );
}

function DashboardsSection() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold text-slate-900 mb-4">Creating Dashboards</h2>
        <p className="text-slate-600 mb-4">
          Dashboards let you visualize your log data with charts, tables, and metrics.
          Create custom dashboards to monitor your infrastructure at a glance.
        </p>

        <div className="card p-4 bg-amber-50 border-amber-200 mb-6">
          <p className="text-amber-800">
            <strong>Tip:</strong> Start with a saved search, then add it to a dashboard as a panel.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Dashboard Panels</h2>
        <p className="text-slate-600 mb-4">
          Each panel displays the results of a query with a visualization type.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { name: 'Table', desc: 'Raw log data or aggregated results in tabular format', query: 'search * | table timestamp hostname message | limit 20' },
            { name: 'Line Chart', desc: 'Time-series data for trends over time', query: 'search * | stats count by timestamp' },
            { name: 'Bar Chart', desc: 'Compare values across categories', query: 'search * | stats count by hostname | sort desc | limit 10' },
            { name: 'Pie Chart', desc: 'Show distribution of values', query: 'search * | stats count by severity' },
            { name: 'Single Value', desc: 'Display a single metric prominently', query: 'search severity<=3 | stats count' },
            { name: 'Gauge', desc: 'Show progress toward a threshold', query: 'search * | stats count as total' },
          ].map((viz) => (
            <div key={viz.name} className="card p-4">
              <h3 className="font-semibold text-slate-900">{viz.name}</h3>
              <p className="text-sm text-slate-500 mb-2">{viz.desc}</p>
              <code className="text-xs text-sky-600 block">{viz.query}</code>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Starter Dashboard Ideas</h2>

        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="font-semibold text-slate-900 mb-3">System Overview Dashboard</h3>
            <div className="space-y-2">
              <CodeBlock code={`# Total logs today
search * | stats count

# Logs by severity
search * | stats count by severity

# Top hosts by volume
search * | stats count by hostname | sort desc | limit 5

# Error rate over time
search severity<=3 | stats count by timestamp`} />
            </div>
          </div>

          <div className="card p-4">
            <h3 className="font-semibold text-slate-900 mb-3">Security Dashboard</h3>
            <div className="space-y-2">
              <CodeBlock code={`# Failed logins
search app_name=sshd message~"Failed" | stats count by hostname

# Firewall blocks
search app_name~"firewall" action=block | stats count by source_ip | sort desc

# Authentication events
search facility=4 OR facility=10 | table timestamp hostname message`} />
            </div>
          </div>

          <div className="card p-4">
            <h3 className="font-semibold text-slate-900 mb-3">Network Dashboard</h3>
            <div className="space-y-2">
              <CodeBlock code={`# Traffic by protocol
search * | stats count by protocol

# Top talkers
search * | stats count by source_ip | sort desc | limit 10

# Connection states
search app_name~"firewall" | stats count by action`} />
            </div>
          </div>

          <div className="card p-4">
            <h3 className="font-semibold text-slate-900 mb-3">Application Dashboard</h3>
            <div className="space-y-2">
              <CodeBlock code={`# Logs by application
search * | stats count by app_name | sort desc

# Application errors
search severity<=3 | stats count by app_name | sort desc

# Response times (if logged)
search app_name=nginx | stats avg(response_time) by endpoint`} />
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900 mb-4">Best Practices</h2>
        <ul className="space-y-2">
          {[
            'Use time filters to focus on relevant data and improve performance',
            'Limit results in panels to avoid overwhelming the UI',
            'Use aggregations (stats) instead of raw logs for overview dashboards',
            'Group related panels together for logical organization',
            'Set up alerts for critical metrics (coming soon)',
            'Use consistent naming conventions for saved searches and dashboards',
          ].map((tip, i) => (
            <li key={i} className="flex items-start gap-2 text-slate-600">
              <ChevronRight className="w-4 h-4 text-sky-500 mt-1 flex-shrink-0" />
              {tip}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState<DocSection>('getting-started');

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-sky-50 dark:bg-sky-900/30 rounded-lg">
              <BookOpen className="w-6 h-6 text-sky-600 dark:text-sky-400" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Documentation</h1>
          </div>
          <p className="text-slate-600 dark:text-slate-400">
            Everything you need to know about using Spunk for log management.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        <SectionNav active={activeSection} onChange={setActiveSection} />

        {activeSection === 'getting-started' && <GettingStartedSection />}
        {activeSection === 'syslog-format' && <SyslogFormatSection />}
        {activeSection === 'ingestion' && <LogIngestionSection />}
        {activeSection === 'api' && <APIReferenceSection />}
        {activeSection === 'query' && <QueryLanguageSection />}
        {activeSection === 'dashboards' && <DashboardsSection />}
      </div>
    </div>
  );
}
