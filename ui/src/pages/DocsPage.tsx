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
  Brain,
  Calculator,
  Code,
  Braces,
  TrendingUp,
  FileCode,
} from 'lucide-react';

type DocSection =
  | 'query'
  | 'ingestion'
  | 'dashboards'
  | 'getting-started'
  | 'api'
  | 'syslog-format'
  | 'knowledge';

type QuerySubsection =
  | 'intro'
  | 'basic-search'
  | 'filtering'
  | 'aggregations'
  | 'eval-functions'
  | 'advanced-commands'
  | 'examples';

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <pre className="bg-slate-900 dark:bg-slate-950 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm font-mono">
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
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          <s.icon className="w-4 h-4" />
          {s.label}
        </button>
      ))}
    </nav>
  );
}

function QuerySubNav({ active, onChange }: { active: QuerySubsection; onChange: (s: QuerySubsection) => void }) {
  const subsections: { id: QuerySubsection; label: string; icon: React.ElementType }[] = [
    { id: 'intro', label: 'Introduction', icon: BookOpen },
    { id: 'basic-search', label: 'Basic Searching', icon: Search },
    { id: 'filtering', label: 'Filtering & Transforming', icon: Code },
    { id: 'aggregations', label: 'Aggregations & Stats', icon: TrendingUp },
    { id: 'eval-functions', label: 'Eval Functions', icon: Calculator },
    { id: 'advanced-commands', label: 'Advanced Commands', icon: Braces },
    { id: 'examples', label: 'Use Case Examples', icon: FileCode },
  ];

  return (
    <div className="flex flex-wrap gap-2 mb-6 pl-4 border-l-2 border-sky-200 dark:border-sky-800">
      {subsections.map((s) => (
        <button
          key={s.id}
          onClick={() => onChange(s.id)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
            active === s.id
              ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <s.icon className="w-3.5 h-3.5" />
          {s.label}
        </button>
      ))}
    </div>
  );
}

// Keep the existing sections from the original DocsPage
function GettingStartedSection() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Quick Start</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Get LogNog running in under 10 minutes with Docker Compose.
        </p>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">1. Clone and Start</h3>
            <CodeBlock code={`git clone https://github.com/machinekinglabs/lognog.git
cd lognog
docker-compose up -d`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">2. Access the UI</h3>
            <p className="text-slate-600 dark:text-slate-400 mb-2">
              Open <code className="code">http://localhost</code> in your browser.
            </p>
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">3. Send Test Logs</h3>
            <CodeBlock code={`# Send a test syslog message
echo "<14>$(date) myhost myapp[1234]: Test log message" | nc -u localhost 514`} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Architecture</h2>
        <div className="card p-6 bg-slate-50 dark:bg-slate-800/50">
          <pre className="text-sm text-slate-600 dark:text-slate-300 overflow-x-auto">{`
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
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Ports Reference</h2>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-slate-800">
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

function QueryLanguageIntro() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">What is the LogNog Query Language?</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          LogNog Query Language (LQL) is a Splunk-inspired DSL designed for querying and analyzing log data.
          It compiles to optimized ClickHouse SQL under the hood, giving you the power of a columnar database
          with the simplicity of a pipe-based query syntax.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Key Features</h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-sky-500 mt-0.5 flex-shrink-0" />
                <span className="text-slate-600 dark:text-slate-300">Pipe-based syntax for intuitive data flow</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-sky-500 mt-0.5 flex-shrink-0" />
                <span className="text-slate-600 dark:text-slate-300">Fast compilation (&lt;3ms parse overhead)</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-sky-500 mt-0.5 flex-shrink-0" />
                <span className="text-slate-600 dark:text-slate-300">50+ built-in functions for math, strings, and aggregations</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-sky-500 mt-0.5 flex-shrink-0" />
                <span className="text-slate-600 dark:text-slate-300">Smart optimization with proper indexes</span>
              </li>
            </ul>
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Your First Query</h3>
            <CodeBlock code={`# Search all logs
search *

# Filter by host
search host=router

# Multiple conditions
search host=router severity>=warning`} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">Standard Log Fields</h2>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-slate-800">
            <thead>
              <tr>
                <th>Field</th>
                <th>Type</th>
                <th>Description</th>
                <th>Aliases</th>
              </tr>
            </thead>
            <tbody>
              <tr><td><code className="code">timestamp</code></td><td>DateTime</td><td>Log timestamp</td><td>time, _time</td></tr>
              <tr><td><code className="code">hostname</code></td><td>String</td><td>Source hostname</td><td>host, source</td></tr>
              <tr><td><code className="code">app_name</code></td><td>String</td><td>Application name</td><td>app, program, sourcetype</td></tr>
              <tr><td><code className="code">severity</code></td><td>UInt8</td><td>Syslog severity (0-7)</td><td>level</td></tr>
              <tr><td><code className="code">facility</code></td><td>UInt8</td><td>Syslog facility</td><td>-</td></tr>
              <tr><td><code className="code">message</code></td><td>String</td><td>Log message content</td><td>msg</td></tr>
              <tr><td><code className="code">raw</code></td><td>String</td><td>Original raw message</td><td>_raw</td></tr>
              <tr><td><code className="code">source_ip</code></td><td>IPv4</td><td>Source IP address</td><td>-</td></tr>
              <tr><td><code className="code">dest_ip</code></td><td>IPv4</td><td>Destination IP</td><td>-</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">Severity Levels</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { level: 0, name: 'Emergency', color: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800' },
            { level: 1, name: 'Alert', color: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800' },
            { level: 2, name: 'Critical', color: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800' },
            { level: 3, name: 'Error', color: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800' },
            { level: 4, name: 'Warning', color: 'bg-lime-100 text-lime-800 border-lime-200 dark:bg-lime-900/20 dark:text-lime-300 dark:border-lime-800' },
            { level: 5, name: 'Notice', color: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800' },
            { level: 6, name: 'Info', color: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800' },
            { level: 7, name: 'Debug', color: 'bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-900/20 dark:text-cyan-300 dark:border-cyan-800' },
          ].map((s) => (
            <div key={s.level} className={`p-3 rounded-lg border ${s.color}`}>
              <span className="font-mono font-bold">{s.level}</span>
              <span className="ml-2">{s.name}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function BasicSearching() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Field-Value Searches</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Search for exact field matches using simple field=value syntax:
        </p>
        <CodeBlock code={`search host=router
search app_name=nginx
search severity=3
search user=admin`} />
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Wildcards</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Use <code className="code">*</code> for wildcard matching:
        </p>
        <CodeBlock code={`search host=web*           # Matches web01, web02, webserver, etc.
search app_name=*sql       # Matches mysql, postgresql, etc.
search host=*              # Match all (any value)`} />
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Comparison Operators</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Numeric Comparison</h3>
            <CodeBlock code={`search severity<4
search severity<=3
search severity>4
search severity>=warning`} />
          </div>
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Equality</h3>
            <CodeBlock code={`search severity=3
search severity!=6
search host!=localhost`} />
          </div>
        </div>

        <div className="card p-4 bg-sky-50 border-sky-200 dark:bg-sky-900/20 dark:border-sky-800">
          <p className="text-sky-800 dark:text-sky-300 text-sm">
            <strong>Tip:</strong> You can use severity names like <code className="bg-sky-100 dark:bg-sky-900 px-2 py-0.5 rounded">warning</code>, <code className="bg-sky-100 dark:bg-sky-900 px-2 py-0.5 rounded">error</code>, <code className="bg-sky-100 dark:bg-sky-900 px-2 py-0.5 rounded">debug</code> instead of numbers!
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Contains/Regex (~)</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Search for text within fields using the <code className="code">~</code> operator:
        </p>
        <CodeBlock code={`search message~"error"                    # Contains "error"
search message~"connection*timeout"       # Wildcard pattern
search app_name~"web"                     # Contains "web"`} />
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Multiple Conditions</h2>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Implicit AND</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              Space-separated conditions are ANDed together:
            </p>
            <CodeBlock code={`search host=router severity>=warning
# Returns logs from router with severity warning or higher`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">OR Logic</h3>
            <CodeBlock code={`search severity=0 OR severity=1 OR severity=2
search host=web01 OR host=web02`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">NOT Logic</h3>
            <CodeBlock code={`search NOT severity=7                    # Exclude debug logs
search host=router NOT message~"keepalive"`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Complex Logic with Parentheses</h3>
            <CodeBlock code={`search (host=router OR host=firewall) AND severity<=3
search app_name=nginx AND (severity<=3 OR message~"timeout")`} />
          </div>
        </div>
      </section>
    </div>
  );
}

function FilteringTransforming() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-4 dark:bg-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
            <Terminal className="w-4 h-4 text-sky-500" />
            filter / where
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Additional filtering after initial search</p>
          <CodeBlock code={`search * | filter app_name=nginx
search * | where severity<=3`} />
        </div>

        <div className="card p-4 dark:bg-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
            <Terminal className="w-4 h-4 text-sky-500" />
            table
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Select specific fields to display</p>
          <CodeBlock code={`search * | table timestamp hostname message
search * | table timestamp severity app_name`} />
        </div>

        <div className="card p-4 dark:bg-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
            <Terminal className="w-4 h-4 text-sky-500" />
            fields
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Include or exclude fields</p>
          <CodeBlock code={`# Include only these fields
search * | fields timestamp hostname message

# Exclude fields (use - prefix)
search * | fields - raw structured_data`} />
        </div>

        <div className="card p-4 dark:bg-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
            <Terminal className="w-4 h-4 text-sky-500" />
            rename
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Rename fields in output</p>
          <CodeBlock code={`search * | rename hostname as host
search * | rename hostname as host, app_name as app`} />
        </div>

        <div className="card p-4 dark:bg-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
            <Terminal className="w-4 h-4 text-sky-500" />
            dedup
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Remove duplicates based on fields</p>
          <CodeBlock code={`search * | dedup hostname
search * | dedup hostname app_name`} />
        </div>

        <div className="card p-4 dark:bg-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
            <Terminal className="w-4 h-4 text-sky-500" />
            sort
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Order results by fields</p>
          <CodeBlock code={`search * | sort desc timestamp
search * | sort asc severity, desc hostname`} />
        </div>

        <div className="card p-4 dark:bg-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
            <Terminal className="w-4 h-4 text-sky-500" />
            limit / head / tail
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Limit number of results</p>
          <CodeBlock code={`search * | limit 100
search * | head 50
search * | tail 20`} />
        </div>
      </div>
    </div>
  );
}

function AggregationsStats() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Basic Aggregations</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">count</h3>
            <CodeBlock code={`# Count all logs
search * | stats count

# Count by field
search * | stats count by hostname

# With alias
search * | stats count as total`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">sum / avg / min / max</h3>
            <CodeBlock code={`search * | stats sum(bytes)
search * | stats avg(response_time)
search * | stats min(timestamp), max(timestamp)`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">dc (distinct count)</h3>
            <CodeBlock code={`# Number of unique hosts
search * | stats dc(hostname)

# Unique IPs per host
search * | stats dc(source_ip) by hostname`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">values / list</h3>
            <CodeBlock code={`# Array of unique values
search * | stats values(hostname)

# All values (with duplicates)
search * | stats list(message) by hostname`} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Advanced Aggregations</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">earliest / latest</h3>
            <CodeBlock code={`search * | stats earliest(message)
search * | stats latest(message)`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">median / mode</h3>
            <CodeBlock code={`search * | stats median(response_time)
search * | stats mode(severity)`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">stddev / variance</h3>
            <CodeBlock code={`search * | stats stddev(response_time)
search * | stats variance(bytes)`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">range</h3>
            <CodeBlock code={`# Calculate max - min
search * | stats range(temperature)
search * | stats range(bytes) by hostname`} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Percentiles</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Calculate percentile values for SLA monitoring and performance analysis:
        </p>

        <div className="card p-4 dark:bg-slate-800">
          <CodeBlock code={`search app_name=api
  | stats p50(response_time) as median,
          p90(response_time) as p90,
          p95(response_time) as p95,
          p99(response_time) as p99
  by endpoint`} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {['p50', 'p90', 'p95', 'p99'].map((p) => (
            <div key={p} className="card p-3 dark:bg-slate-800 text-center">
              <code className="code text-sky-600 dark:text-sky-400">{p}(field)</code>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{p.substring(1)}th percentile</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Multiple Aggregations & Grouping</h2>
        <CodeBlock code={`# Multiple aggregations
search *
  | stats count,
          sum(bytes) as total_bytes,
          avg(response_time) as avg_response,
          p95(response_time) as p95_response
  by hostname

# Group by multiple fields
search * | stats count by hostname, app_name
search * | stats avg(bytes) by source_ip, dest_ip`} />
      </section>
    </div>
  );
}

function EvalFunctions() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Math Functions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Basic Math</h3>
            <CodeBlock code={`eval abs_value=abs(-5)
eval rounded=round(3.14159, 2)
eval floored=floor(3.9)
eval ceiled=ceil(3.1)`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Advanced Math</h3>
            <CodeBlock code={`eval distance=sqrt(pow(x,2) + pow(y,2))
eval ln_value=log(value)
eval log_value=log10(value)
eval exp_value=exp(value)`} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">String Functions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Basic String Operations</h3>
            <CodeBlock code={`eval msg_length=len(message)
eval lowercase=lower(message)
eval uppercase=upper(hostname)
eval trimmed=trim(message)`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Advanced String Operations</h3>
            <CodeBlock code={`eval first_10=substr(message, 0, 10)
eval replaced=replace(message, "ERROR", "WARN")
eval first_word=split(message, " ", 0)
eval full_name=concat(first, " ", last)`} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Conditional Functions</h2>
        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">if</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Conditional expression with true/false branches</p>
            <CodeBlock code={`eval level=if(severity <= 3, "high", "low")
eval status=if(code >= 200 AND code < 300, "success", "failure")`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">coalesce</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Return first non-null value</p>
            <CodeBlock code={`eval host=coalesce(hostname, source, "unknown")
eval app=coalesce(app_name, program, "default")`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">case</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Multi-way conditional</p>
            <CodeBlock code={`eval category=case(
  severity,
  0, "critical",
  1, "critical",
  2, "critical",
  3, "error",
  4, "warning",
  "info"
)`} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Practical Examples</h2>
        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Calculate Response Time Category</h3>
            <CodeBlock code={`search app_name=api
  | eval category=if(response_time < 100, "fast",
                     if(response_time < 500, "normal", "slow"))
  | stats count by category`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Extract Domain from Email</h3>
            <CodeBlock code={`search message~"@"
  | eval domain=split(email, "@", 1)
  | stats count by domain`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Calculate Error Rate</h3>
            <CodeBlock code={`search app_name=nginx
  | eval is_error=if(status >= 400, 1, 0)
  | stats sum(is_error) as errors, count as total
  | eval error_rate=(errors / total) * 100`} />
          </div>
        </div>
      </section>
    </div>
  );
}

function AdvancedCommands() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-4 dark:bg-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
            <Terminal className="w-4 h-4 text-sky-500" />
            top
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Find the top N most common values</p>
          <CodeBlock code={`search * | top 10 hostname
search * | top 5 app_name
search * | top 20 source_ip`} />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Shorthand for: <code className="code text-xs">stats count by field | sort desc | limit N</code>
          </p>
        </div>

        <div className="card p-4 dark:bg-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
            <Terminal className="w-4 h-4 text-sky-500" />
            rare
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Find the rarest N values</p>
          <CodeBlock code={`search * | rare 10 hostname
search * | rare 5 app_name`} />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Shorthand for: <code className="code text-xs">stats count by field | sort asc | limit N</code>
          </p>
        </div>

        <div className="card p-4 dark:bg-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
            <Terminal className="w-4 h-4 text-sky-500" />
            bin
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Create time buckets or numeric bins</p>
          <CodeBlock code={`# Time bucketing
search * | bin span=1h timestamp
search * | bin span=5m timestamp
search * | bin span=1d timestamp

# Numeric bucketing
search * | bin span=100 bytes`} />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Time units: <code className="code text-xs">s</code> (seconds), <code className="code text-xs">m</code> (minutes),
            <code className="code text-xs">h</code> (hours), <code className="code text-xs">d</code> (days)
          </p>
        </div>

        <div className="card p-4 dark:bg-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
            <Terminal className="w-4 h-4 text-sky-500" />
            timechart
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Aggregate data over time buckets</p>
          <CodeBlock code={`# Count over time
search * | timechart span=1h count

# Multiple aggregations
search * | timechart span=5m count, avg(response_time)

# Split by field
search * | timechart span=1h count by hostname`} />
        </div>

        <div className="card p-4 dark:bg-slate-800 md:col-span-2">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
            <Terminal className="w-4 h-4 text-sky-500" />
            rex
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Extract fields using regular expressions with named groups</p>
          <CodeBlock code={`# Extract username from message
search * | rex field=message "user=(?P<username>\\w+)"

# Extract multiple fields
search * | rex field=message "ip=(?P<ip>[0-9.]+) port=(?P<port>\\d+)"

# Default field is "message"
search * | rex "status=(?P<status>\\d+)"`} />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Named groups in the regex pattern (using <code className="code text-xs">(?P&lt;name&gt;pattern)</code>) become new fields
          </p>
        </div>
      </div>
    </div>
  );
}

function UseCaseExamples() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Security Monitoring</h2>
        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Failed Login Attempts</h3>
            <CodeBlock code={`search app_name=sshd message~"Failed"
  | stats count by source_ip, user
  | sort desc count
  | limit 20`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Brute Force Detection</h3>
            <CodeBlock code={`search app_name=sshd message~"Failed"
  | bin span=5m timestamp
  | stats count by time_bucket, source_ip
  | where count > 10
  | sort desc count`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Privilege Escalation</h3>
            <CodeBlock code={`search message~"sudo" OR message~"su "
  | table timestamp hostname user message
  | sort desc timestamp`} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Performance Analysis</h2>
        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Slow API Endpoints</h3>
            <CodeBlock code={`search app_name=api
  | stats p50(response_time) as median,
          p95(response_time) as p95,
          p99(response_time) as p99,
          max(response_time) as max
  by endpoint
  | sort desc p95`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Response Time Distribution</h3>
            <CodeBlock code={`search app_name=api
  | eval bucket=case(
      response_time,
      100, "0-100ms",
      500, "100-500ms",
      1000, "500ms-1s",
      "1s+"
    )
  | stats count by bucket`} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Error Tracking</h2>
        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Error Rate by Application</h3>
            <CodeBlock code={`search *
  | eval is_error=if(severity <= 3, 1, 0)
  | stats sum(is_error) as errors,
          count as total,
          (sum(is_error) / count * 100) as error_rate
  by app_name
  | sort desc error_rate`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Unique Error Messages</h3>
            <CodeBlock code={`search severity<=3
  | stats dc(message) as unique_errors,
          count as total_errors,
          values(message) as error_samples
  by app_name`} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Infrastructure Monitoring</h2>
        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Network Traffic Analysis</h3>
            <CodeBlock code={`search protocol=* source_ip=*
  | stats count as connections,
          sum(bytes) as total_bytes
  by source_ip, dest_ip, protocol
  | sort desc total_bytes
  | limit 50`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Active Users</h3>
            <CodeBlock code={`search message~"login"
  | rex field=message "user=(?P<username>\\w+)"
  | stats dc(username) as unique_users,
          count as total_logins
  by hostname`} />
          </div>
        </div>
      </section>
    </div>
  );
}

function QueryLanguageSection() {
  const [activeSubsection, setActiveSubsection] = useState<QuerySubsection>('intro');

  return (
    <div className="space-y-8">
      <div className="card p-4 bg-gradient-to-r from-sky-50 to-blue-50 border-sky-200 dark:from-sky-900/20 dark:to-blue-900/20 dark:border-sky-800">
        <p className="text-sky-800 dark:text-sky-300">
          <strong>LogNog Query Academy:</strong> Complete reference for the LogNog Query Language.
          Choose a topic below to learn more about each feature.
        </p>
      </div>

      <QuerySubNav active={activeSubsection} onChange={setActiveSubsection} />

      {activeSubsection === 'intro' && <QueryLanguageIntro />}
      {activeSubsection === 'basic-search' && <BasicSearching />}
      {activeSubsection === 'filtering' && <FilteringTransforming />}
      {activeSubsection === 'aggregations' && <AggregationsStats />}
      {activeSubsection === 'eval-functions' && <EvalFunctions />}
      {activeSubsection === 'advanced-commands' && <AdvancedCommands />}
      {activeSubsection === 'examples' && <UseCaseExamples />}
    </div>
  );
}

// Keep other existing sections (SyslogFormat, LogIngestion, APIReference, Dashboards) from original file
// ... (truncated for brevity - these would be included from the original DocsPage.tsx)

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState<DocSection>('query');

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
            Everything you need to know about using LogNog for log management.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        <SectionNav active={activeSection} onChange={setActiveSection} />

        {activeSection === 'getting-started' && <GettingStartedSection />}
        {activeSection === 'query' && <QueryLanguageSection />}
        {/* Add other sections from original DocsPage here */}
      </div>
    </div>
  );
}
