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
  Bot,
} from 'lucide-react';

type DocSection =
  | 'query'
  | 'ingestion'
  | 'dashboards'
  | 'getting-started'
  | 'api'
  | 'syslog-format'
  | 'knowledge'
  | 'mcp';

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
      <pre className="bg-slate-900 dark:bg-slate-950 text-slate-100 p-3 sm:p-4 rounded-lg overflow-x-auto text-xs sm:text-sm font-mono">
        <code>{code}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-1.5 sm:top-2 right-1.5 sm:right-2 p-1.5 sm:p-2 bg-slate-800 rounded-md opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-slate-700"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-400" />
        ) : (
          <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
        )}
      </button>
    </div>
  );
}

function SectionNav({ active, onChange }: { active: DocSection; onChange: (s: DocSection) => void }) {
  const sections: { id: DocSection; label: string; shortLabel: string; icon: React.ElementType }[] = [
    { id: 'getting-started', label: 'Getting Started', shortLabel: 'Start', icon: BookOpen },
    { id: 'syslog-format', label: 'Syslog Format', shortLabel: 'Syslog', icon: FileText },
    { id: 'ingestion', label: 'Sending Logs', shortLabel: 'Ingest', icon: Server },
    { id: 'query', label: 'Query Language', shortLabel: 'Query', icon: Search },
    { id: 'knowledge', label: 'Knowledge Objects', shortLabel: 'Knowledge', icon: Brain },
    { id: 'dashboards', label: 'Dashboards', shortLabel: 'Dash', icon: FileText },
    { id: 'mcp', label: 'Claude AI (MCP)', shortLabel: 'AI', icon: Bot },
    { id: 'api', label: 'API Reference', shortLabel: 'API', icon: Terminal },
  ];

  return (
    <nav className="flex flex-wrap gap-1.5 sm:gap-2 mb-4 sm:mb-8 -mx-1 px-1 overflow-x-auto pb-2 scrollbar-hide">
      {sections.map((s) => (
        <button
          key={s.id}
          onClick={() => onChange(s.id)}
          className={`flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm sm:text-base font-medium transition-all whitespace-nowrap flex-shrink-0 ${
            active === s.id
              ? 'bg-amber-500 text-white shadow-md shadow-amber-500/25'
              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          <s.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span className="hidden sm:inline">{s.label}</span>
          <span className="sm:hidden">{s.shortLabel}</span>
        </button>
      ))}
    </nav>
  );
}

function QuerySubNav({ active, onChange }: { active: QuerySubsection; onChange: (s: QuerySubsection) => void }) {
  const subsections: { id: QuerySubsection; label: string; shortLabel: string; icon: React.ElementType }[] = [
    { id: 'intro', label: 'Introduction', shortLabel: 'Intro', icon: BookOpen },
    { id: 'basic-search', label: 'Basic Searching', shortLabel: 'Search', icon: Search },
    { id: 'filtering', label: 'Filtering & Transforming', shortLabel: 'Filter', icon: Code },
    { id: 'aggregations', label: 'Aggregations & Stats', shortLabel: 'Stats', icon: TrendingUp },
    { id: 'eval-functions', label: 'Eval Functions', shortLabel: 'Eval', icon: Calculator },
    { id: 'advanced-commands', label: 'Advanced Commands', shortLabel: 'Advanced', icon: Braces },
    { id: 'examples', label: 'Use Case Examples', shortLabel: 'Examples', icon: FileCode },
  ];

  return (
    <div className="flex flex-nowrap sm:flex-wrap gap-1.5 sm:gap-2 mb-4 sm:mb-6 pl-2 sm:pl-4 border-l-2 border-amber-200 dark:border-amber-800 overflow-x-auto pb-2 scrollbar-hide -mr-4 pr-4">
      {subsections.map((s) => (
        <button
          key={s.id}
          onClick={() => onChange(s.id)}
          className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${
            active === s.id
              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <s.icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          <span className="hidden sm:inline">{s.label}</span>
          <span className="sm:hidden">{s.shortLabel}</span>
        </button>
      ))}
    </div>
  );
}

// Keep the existing sections from the original DocsPage
function GettingStartedSection() {
  return (
    <div className="space-y-6 sm:space-y-8">
      <section>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 mb-3 sm:mb-4">Quick Start</h2>
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
                <ChevronRight className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <span className="text-slate-600 dark:text-slate-300">Pipe-based syntax for intuitive data flow</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <span className="text-slate-600 dark:text-slate-300">Fast compilation (&lt;3ms parse overhead)</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <span className="text-slate-600 dark:text-slate-300">50+ built-in functions for math, strings, and aggregations</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
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
            { level: 6, name: 'Info', color: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800' },
            { level: 7, name: 'Debug', color: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800' },
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

        <div className="card p-4 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
          <p className="text-amber-800 dark:text-amber-300 text-sm">
            <strong>Tip:</strong> You can use severity names like <code className="bg-amber-100 dark:bg-amber-900 px-2 py-0.5 rounded">warning</code>, <code className="bg-amber-100 dark:bg-amber-900 px-2 py-0.5 rounded">error</code>, <code className="bg-amber-100 dark:bg-amber-900 px-2 py-0.5 rounded">debug</code> instead of numbers!
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
            <Terminal className="w-4 h-4 text-amber-500" />
            filter / where
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Additional filtering after initial search</p>
          <CodeBlock code={`search * | filter app_name=nginx
search * | where severity<=3`} />
        </div>

        <div className="card p-4 dark:bg-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
            <Terminal className="w-4 h-4 text-amber-500" />
            table
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Select specific fields to display</p>
          <CodeBlock code={`search * | table timestamp hostname message
search * | table timestamp severity app_name`} />
        </div>

        <div className="card p-4 dark:bg-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
            <Terminal className="w-4 h-4 text-amber-500" />
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
            <Terminal className="w-4 h-4 text-amber-500" />
            rename
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Rename fields in output</p>
          <CodeBlock code={`search * | rename hostname as host
search * | rename hostname as host, app_name as app`} />
        </div>

        <div className="card p-4 dark:bg-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
            <Terminal className="w-4 h-4 text-amber-500" />
            dedup
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Remove duplicates based on fields</p>
          <CodeBlock code={`search * | dedup hostname
search * | dedup hostname app_name`} />
        </div>

        <div className="card p-4 dark:bg-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
            <Terminal className="w-4 h-4 text-amber-500" />
            sort
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Order results by fields</p>
          <CodeBlock code={`search * | sort desc timestamp
search * | sort asc severity, desc hostname`} />
        </div>

        <div className="card p-4 dark:bg-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
            <Terminal className="w-4 h-4 text-amber-500" />
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
              <code className="code text-amber-600 dark:text-amber-400">{p}(field)</code>
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
            <Terminal className="w-4 h-4 text-amber-500" />
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
            <Terminal className="w-4 h-4 text-amber-500" />
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
            <Terminal className="w-4 h-4 text-amber-500" />
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
            <Terminal className="w-4 h-4 text-amber-500" />
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
            <Terminal className="w-4 h-4 text-amber-500" />
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
      <div className="card p-4 bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200 dark:from-amber-900/20 dark:to-orange-900/20 dark:border-amber-800">
        <p className="text-amber-800 dark:text-amber-300">
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

function MCPSection() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Claude Desktop Integration (MCP)</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Connect LogNog to Claude Desktop for AI-powered log management. Ask Claude to search your logs,
          create dashboards, set up alerts, and more using natural language.
        </p>

        <div className="card p-4 bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200 dark:from-amber-900/20 dark:to-orange-900/20 dark:border-amber-800 mb-6">
          <p className="text-amber-800 dark:text-amber-300">
            <strong>Model Context Protocol (MCP)</strong> is an open standard that allows AI assistants like Claude
            to securely interact with external tools and data sources - all while keeping your data on your own infrastructure.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Quick Start</h2>
        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">1. Generate an API Key</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              Go to <strong>Settings → API Keys</strong> and create a new key for Claude Desktop.
            </p>
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">2. Configure Claude Desktop</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              Add this to your <code className="code">claude_desktop_config.json</code>:
            </p>
            <CodeBlock code={`{
  "mcpServers": {
    "lognog": {
      "command": "curl",
      "args": [
        "-N",
        "-H", "X-API-Key: YOUR_API_KEY_HERE",
        "http://localhost:4000/mcp/sse"
      ]
    }
  }
}`} />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              <strong>macOS:</strong> ~/Library/Application Support/Claude/claude_desktop_config.json<br />
              <strong>Windows:</strong> %APPDATA%\Claude\claude_desktop_config.json
            </p>
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">3. Restart Claude Desktop</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Close and reopen Claude Desktop. You should see LogNog in the MCP servers list.
            </p>
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">4. Start Chatting!</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Try these example prompts:</p>
            <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
              <li>• "Show me error logs from the last hour"</li>
              <li>• "Create a dashboard for nginx traffic"</li>
              <li>• "Set up an alert for failed SSH logins"</li>
              <li>• "What are the top 10 hosts by log volume?"</li>
            </ul>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Available Tools</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Claude can use these tools to interact with LogNog:
        </p>

        <div className="overflow-x-auto">
          <table className="table card dark:bg-slate-800">
            <thead>
              <tr>
                <th>Tool</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code className="code">search_logs</code></td>
                <td>Execute DSL queries to search and analyze logs</td>
              </tr>
              <tr>
                <td><code className="code">create_dashboard</code></td>
                <td>Create new dashboards with panels</td>
              </tr>
              <tr>
                <td><code className="code">update_dashboard</code></td>
                <td>Modify existing dashboards</td>
              </tr>
              <tr>
                <td><code className="code">add_dashboard_panel</code></td>
                <td>Add panels to dashboards</td>
              </tr>
              <tr>
                <td><code className="code">create_alert</code></td>
                <td>Create alert rules with conditions</td>
              </tr>
              <tr>
                <td><code className="code">silence_alert</code></td>
                <td>Silence alerts temporarily</td>
              </tr>
              <tr>
                <td><code className="code">ingest_logs</code></td>
                <td>Add new log entries</td>
              </tr>
              <tr>
                <td><code className="code">generate_report</code></td>
                <td>Generate reports from dashboards or queries</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Available Resources</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Claude can read these resources from LogNog:
        </p>

        <div className="overflow-x-auto">
          <table className="table card dark:bg-slate-800">
            <thead>
              <tr>
                <th>Resource URI</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code className="code">lognog://logs/recent</code></td>
                <td>Recent 100 log entries</td>
              </tr>
              <tr>
                <td><code className="code">lognog://dashboards</code></td>
                <td>All dashboard configurations</td>
              </tr>
              <tr>
                <td><code className="code">lognog://alerts</code></td>
                <td>All alert rules</td>
              </tr>
              <tr>
                <td><code className="code">lognog://silences</code></td>
                <td>Active alert silences</td>
              </tr>
              <tr>
                <td><code className="code">lognog://stats</code></td>
                <td>System statistics</td>
              </tr>
              <tr>
                <td><code className="code">lognog://templates</code></td>
                <td>Log source templates</td>
              </tr>
              <tr>
                <td><code className="code">lognog://saved-searches</code></td>
                <td>Saved search queries</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Example Conversations</h2>
        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Investigating an Issue</h3>
            <div className="space-y-2 text-sm">
              <p className="text-slate-600 dark:text-slate-400">
                <strong>You:</strong> "I'm seeing slow response times. Can you check the logs for any errors in the last 30 minutes?"
              </p>
              <p className="text-slate-600 dark:text-slate-400">
                <strong>Claude:</strong> <em>Searches logs for severity ≤ 3 in the last 30 minutes, summarizes findings</em>
              </p>
              <p className="text-slate-600 dark:text-slate-400">
                <strong>You:</strong> "Create a dashboard so I can monitor this going forward"
              </p>
              <p className="text-slate-600 dark:text-slate-400">
                <strong>Claude:</strong> <em>Creates a dashboard with relevant panels for monitoring</em>
              </p>
            </div>
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Setting Up Alerting</h3>
            <div className="space-y-2 text-sm">
              <p className="text-slate-600 dark:text-slate-400">
                <strong>You:</strong> "Set up an alert for when there are more than 10 failed SSH logins from the same IP in 5 minutes"
              </p>
              <p className="text-slate-600 dark:text-slate-400">
                <strong>Claude:</strong> <em>Creates an alert with the appropriate DSL query and threshold</em>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">API Endpoints</h2>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-slate-800">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code className="code">GET /mcp/sse</code></td>
                <td>SSE connection for MCP communication</td>
              </tr>
              <tr>
                <td><code className="code">POST /mcp/messages</code></td>
                <td>Handle messages from SSE clients</td>
              </tr>
              <tr>
                <td><code className="code">GET /mcp/status</code></td>
                <td>MCP server status and capabilities</td>
              </tr>
              <tr>
                <td><code className="code">GET /mcp/health</code></td>
                <td>Health check endpoint</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="card p-4 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
          <p className="text-amber-800 dark:text-amber-300 text-sm">
            <strong>Full Documentation:</strong> For more details, troubleshooting, and advanced configuration,
            see the <a href="https://github.com/machinekinglabs/lognog/blob/main/docs/MCP-INTEGRATION.md" className="underline hover:no-underline" target="_blank" rel="noopener noreferrer">MCP Integration Guide</a> on GitHub.
          </p>
        </div>
      </section>
    </div>
  );
}

function SyslogFormatSection() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Understanding Syslog</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Syslog is a standard protocol for message logging. LogNog supports both major syslog formats:
          RFC 3164 (BSD syslog) and RFC 5424 (modern syslog). Understanding these formats helps you
          parse logs correctly and write effective queries.
        </p>
        <div className="card p-4 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
          <p className="text-amber-800 dark:text-amber-300 text-sm">
            <strong>LogNog Auto-Detection:</strong> LogNog automatically detects and parses both RFC 3164 and RFC 5424
            formats. You do not need to configure anything - just send your logs!
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Priority Value (PRI)</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Both syslog formats begin with a priority value enclosed in angle brackets. The priority is calculated as:
        </p>
        <div className="card p-4 dark:bg-slate-800 mb-4">
          <div className="text-center">
            <code className="text-lg font-mono text-amber-600 dark:text-amber-400">
              Priority = (Facility x 8) + Severity
            </code>
          </div>
        </div>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
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
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Severity Levels (0-7)</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Syslog defines 8 severity levels, from most severe (0) to least severe (7):
        </p>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-slate-800">
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
              <tr className="bg-orange-50 dark:bg-orange-900/20">
                <td><code className="code">2</code></td>
                <td><strong>Critical</strong></td>
                <td>Critical conditions</td>
                <td>Hardware errors, failed backups</td>
              </tr>
              <tr className="bg-orange-50 dark:bg-orange-900/20">
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
              <tr className="bg-amber-50 dark:bg-amber-900/20">
                <td><code className="code">6</code></td>
                <td><strong>Informational</strong></td>
                <td>Informational messages</td>
                <td>User login, request processed</td>
              </tr>
              <tr className="bg-slate-50 dark:bg-slate-800">
                <td><code className="code">7</code></td>
                <td><strong>Debug</strong></td>
                <td>Debug-level messages</td>
                <td>Detailed troubleshooting info</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="card p-4 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 mt-4">
          <p className="text-amber-800 dark:text-amber-300 text-sm">
            <strong>Query Tip:</strong> Use severity names in your queries! LogNog understands both numeric codes and names:<br />
            <code className="bg-amber-100 dark:bg-amber-900 px-2 py-0.5 rounded">search severity&lt;=warning</code> is equivalent to <code className="bg-amber-100 dark:bg-amber-900 px-2 py-0.5 rounded">search severity&lt;=4</code>
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Facility Codes (0-23)</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Facility codes indicate the type of program or system that generated the message:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">System Facilities (0-11)</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span>0 - kernel</span><span className="text-slate-500">Kernel messages</span></div>
              <div className="flex justify-between"><span>1 - user</span><span className="text-slate-500">User-level messages</span></div>
              <div className="flex justify-between"><span>2 - mail</span><span className="text-slate-500">Mail system</span></div>
              <div className="flex justify-between"><span>3 - daemon</span><span className="text-slate-500">System daemons</span></div>
              <div className="flex justify-between"><span>4 - auth</span><span className="text-slate-500">Security/auth</span></div>
              <div className="flex justify-between"><span>5 - syslog</span><span className="text-slate-500">Syslogd internal</span></div>
              <div className="flex justify-between"><span>6 - lpr</span><span className="text-slate-500">Printing</span></div>
              <div className="flex justify-between"><span>7 - news</span><span className="text-slate-500">Network news</span></div>
              <div className="flex justify-between"><span>8 - uucp</span><span className="text-slate-500">UUCP</span></div>
              <div className="flex justify-between"><span>9 - cron</span><span className="text-slate-500">Clock daemon</span></div>
              <div className="flex justify-between"><span>10 - authpriv</span><span className="text-slate-500">Private auth</span></div>
              <div className="flex justify-between"><span>11 - ftp</span><span className="text-slate-500">FTP daemon</span></div>
            </div>
          </div>
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Local Facilities (16-23)</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span>16 - local0</span><span className="text-slate-500">Custom use</span></div>
              <div className="flex justify-between"><span>17 - local1</span><span className="text-slate-500">Custom use</span></div>
              <div className="flex justify-between"><span>18 - local2</span><span className="text-slate-500">Custom use</span></div>
              <div className="flex justify-between"><span>19 - local3</span><span className="text-slate-500">Custom use</span></div>
              <div className="flex justify-between"><span>20 - local4</span><span className="text-slate-500">Custom use</span></div>
              <div className="flex justify-between"><span>21 - local5</span><span className="text-slate-500">Custom use</span></div>
              <div className="flex justify-between"><span>22 - local6</span><span className="text-slate-500">Custom use</span></div>
              <div className="flex justify-between"><span>23 - local7</span><span className="text-slate-500">Custom use</span></div>
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Local facilities (local0-local7) are commonly used for custom applications, network devices, and third-party software.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">RFC 3164 (BSD Syslog)</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          RFC 3164 is the traditional BSD syslog format, widely used by Unix/Linux systems and network devices.
          It is simple but has limitations like no timezone support and ambiguous parsing.
        </p>
        <div className="card p-4 dark:bg-slate-800 mb-4">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Format Structure</h3>
          <CodeBlock code={`<PRI>TIMESTAMP HOSTNAME TAG: MESSAGE

Components:
  PRI       = Priority value (0-191)
  TIMESTAMP = "Mmm dd HH:MM:SS" (no year, no timezone)
  HOSTNAME  = Hostname or IP address
  TAG       = Program name, often with PID: "program[pid]"
  MESSAGE   = The actual log message`} />
        </div>
        <div className="card p-4 dark:bg-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Example Messages</h3>
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
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">RFC 5424 (Modern Syslog)</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          RFC 5424 is the modern syslog standard with improved structure, ISO 8601 timestamps with timezone,
          structured data support, and better parsing reliability.
        </p>
        <div className="card p-4 dark:bg-slate-800 mb-4">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Format Structure</h3>
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
        <div className="card p-4 dark:bg-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Example Messages</h3>
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
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Structured Data (SD) Elements</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          RFC 5424 supports structured data elements - key-value pairs that can be parsed automatically.
          LogNog extracts these into queryable fields.
        </p>
        <div className="card p-4 dark:bg-slate-800 mb-4">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">SD-ELEMENT Format</h3>
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
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">How LogNog Parses Syslog</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          LogNog uses Vector for syslog ingestion and automatically parses incoming messages into structured fields:
        </p>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-slate-800">
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
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Sending Test Messages</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Use these commands to send test syslog messages to LogNog:
        </p>
        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Using netcat (nc)</h3>
            <CodeBlock code={`# RFC 3164 format (UDP)
echo "<14>$(date +'%b %d %H:%M:%S') $(hostname) myapp[$$]: Test message from LogNog" | nc -u localhost 514

# RFC 3164 format (TCP)
echo "<14>$(date +'%b %d %H:%M:%S') $(hostname) myapp[$$]: Test message from LogNog" | nc localhost 514

# RFC 5424 format
echo "<14>1 $(date -u +'%Y-%m-%dT%H:%M:%SZ') $(hostname) myapp $$ TEST - Test message RFC 5424" | nc -u localhost 514`} />
          </div>
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Using logger (Linux/macOS)</h3>
            <CodeBlock code={`# Local syslog (forwarded to LogNog if configured)
logger -p local0.info "Test message from logger"

# Send directly to LogNog
logger -n localhost -P 514 -p user.notice "Direct test to LogNog"

# With tag/program name
logger -t myapp -p local0.warning "Warning from myapp"`} />
          </div>
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">PowerShell (Windows)</h3>
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
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Common Device Formats</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Many network devices and applications have their own syslog message formats. Here are some common examples:
        </p>
        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Cisco IOS</h3>
            <CodeBlock code={`<189>Jan 15 10:30:45 router01 %SYS-5-CONFIG_I: Configured from console by admin
<190>Jan 15 10:30:46 router01 %LINEPROTO-5-UPDOWN: Line protocol on Interface GigabitEthernet0/1, changed state to up
<187>Jan 15 10:30:47 router01 %SEC-6-IPACCESSLOGP: list 101 denied tcp 10.0.0.1(12345) -> 192.168.1.1(80), 1 packet`} />
          </div>
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Linux sshd</h3>
            <CodeBlock code={`<38>Jan 15 10:30:45 server sshd[12345]: Accepted publickey for admin from 10.0.0.50 port 52413 ssh2: RSA SHA256:abc123...
<38>Jan 15 10:30:46 server sshd[12346]: Failed password for invalid user test from 192.168.1.100 port 54321 ssh2
<86>Jan 15 10:30:47 server sshd[12345]: pam_unix(sshd:session): session opened for user admin by (uid=0)`} />
          </div>
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">nginx</h3>
            <CodeBlock code={`<134>Jan 15 10:30:45 webserver nginx: 192.168.1.100 - - [15/Jan/2024:10:30:45 +0000] "GET /api/users HTTP/1.1" 200 1234 "-" "Mozilla/5.0"
<131>Jan 15 10:30:46 webserver nginx: 2024/01/15 10:30:46 [error] 1234#0: *5678 connect() failed (111: Connection refused)`} />
          </div>
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">pfSense/OPNsense Firewall</h3>
            <CodeBlock code={`<134>Jan 15 10:30:45 firewall filterlog[12345]: 5,,,1000000103,em0,match,block,in,4,0x0,,64,12345,0,DF,6,tcp,60,192.168.1.100,10.0.0.1,54321,22,0,S,1234567890,,65535,,`} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Troubleshooting</h2>
        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Logs Not Appearing?</h3>
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <span>Check that Vector is running: <code className="code">docker-compose ps vector</code></span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <span>Verify port 514 is accessible: <code className="code">nc -vz localhost 514</code></span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <span>Check Vector logs: <code className="code">docker-compose logs vector</code></span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <span>Ensure firewall allows UDP/TCP 514</span>
              </li>
            </ul>
          </div>
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Parsing Issues?</h3>
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <span>Check the <code className="code">raw</code> field to see the original message</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <span>Verify the priority value is enclosed in angle brackets</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <span>Ensure timestamp format matches RFC 3164 or 5424</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <span>Use <code className="code">rex</code> command to extract custom fields from non-standard formats</span>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

function APIReferenceSection() {
  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Overview */}
      <section>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 mb-3 sm:mb-4">API Overview</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          LogNog provides a RESTful API for all operations. All endpoints are prefixed with <code className="code">/api</code>.
        </p>
        <div className="card p-4 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 mb-4">
          <p className="text-amber-800 dark:text-amber-300 text-sm">
            <strong>Base URL:</strong> <code className="bg-amber-100 dark:bg-amber-900 px-2 py-0.5 rounded">http://localhost/api</code> (or your LogNog server address)
          </p>
        </div>
      </section>

      {/* Authentication */}
      <section>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">Authentication</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          LogNog uses JWT tokens for user authentication and API keys for programmatic access.
        </p>
        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">JWT Token Authentication</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">For UI/interactive sessions</p>
            <CodeBlock code={`Authorization: Bearer <jwt_token>`} />
          </div>
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">API Key Authentication</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">For agents and integrations</p>
            <CodeBlock code={`X-API-Key: <your_api_key>
# OR
Authorization: Bearer <your_api_key>`} />
          </div>
        </div>
        <div className="overflow-x-auto mt-4">
          <table className="table card dark:bg-slate-800">
            <thead><tr><th>Endpoint</th><th>Method</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code className="code">/auth/setup-required</code></td><td>GET</td><td>Check if initial setup is needed</td></tr>
              <tr><td><code className="code">/auth/setup</code></td><td>POST</td><td>Create first admin user</td></tr>
              <tr><td><code className="code">/auth/login</code></td><td>POST</td><td>Authenticate and get tokens</td></tr>
              <tr><td><code className="code">/auth/refresh</code></td><td>POST</td><td>Refresh access token</td></tr>
              <tr><td><code className="code">/auth/logout</code></td><td>POST</td><td>Revoke refresh tokens</td></tr>
              <tr><td><code className="code">/auth/me</code></td><td>GET</td><td>Get current user info</td></tr>
              <tr><td><code className="code">/auth/api-keys</code></td><td>GET/POST</td><td>List/create API keys</td></tr>
              <tr><td><code className="code">/auth/api-keys/:id/revoke</code></td><td>POST</td><td>Revoke an API key</td></tr>
              <tr><td><code className="code">/auth/users</code></td><td>GET/POST</td><td>List/create users (admin)</td></tr>
              <tr><td><code className="code">/auth/audit-log</code></td><td>GET</td><td>Get audit log (admin)</td></tr>
            </tbody>
          </table>
        </div>
        <div className="card p-4 dark:bg-slate-800 mt-4">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Login Example</h3>
          <CodeBlock code={`curl -X POST http://localhost/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"username": "admin", "password": "your_password"}'

# Response:
{
  "user": {"id": "...", "username": "admin", "role": "admin"},
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}`} />
        </div>
      </section>

      {/* Search API */}
      <section>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">Search API</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">Execute DSL queries and manage saved searches.</p>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-slate-800">
            <thead><tr><th>Endpoint</th><th>Method</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code className="code">/search/query</code></td><td>POST</td><td>Execute a DSL query</td></tr>
              <tr><td><code className="code">/search/parse</code></td><td>POST</td><td>Parse query to AST (debug)</td></tr>
              <tr><td><code className="code">/search/validate</code></td><td>POST</td><td>Validate a query</td></tr>
              <tr><td><code className="code">/search/ai</code></td><td>POST</td><td>Natural language search</td></tr>
              <tr><td><code className="code">/search/fields</code></td><td>GET</td><td>Get available fields</td></tr>
              <tr><td><code className="code">/search/fields/discover</code></td><td>GET</td><td>Discover all fields</td></tr>
              <tr><td><code className="code">/search/fields/:field/values</code></td><td>GET</td><td>Get unique values for field</td></tr>
              <tr><td><code className="code">/search/saved</code></td><td>GET/POST</td><td>List/create saved searches</td></tr>
              <tr><td><code className="code">/search/saved/:id</code></td><td>GET/PUT/DELETE</td><td>Manage saved search</td></tr>
            </tbody>
          </table>
        </div>
        <div className="card p-4 dark:bg-slate-800 mt-4">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Query Example</h3>
          <CodeBlock code={`curl -X POST http://localhost/api/search/query \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <token>" \\
  -d '{"query": "search severity<=3 | stats count by app_name", "earliest": "-24h"}'`} />
        </div>
      </section>

      {/* Ingestion API */}
      <section>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">Ingestion API</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">Send logs to LogNog via HTTP. Requires API key.</p>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-slate-800">
            <thead><tr><th>Endpoint</th><th>Method</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code className="code">/ingest/agent</code></td><td>POST</td><td>LogNog In agent events</td></tr>
              <tr><td><code className="code">/ingest/http</code></td><td>POST</td><td>Generic HTTP JSON logs</td></tr>
              <tr><td><code className="code">/ingest/otlp/v1/logs</code></td><td>POST</td><td>OpenTelemetry logs</td></tr>
              <tr><td><code className="code">/ingest/supabase</code></td><td>POST</td><td>Supabase Log Drains</td></tr>
              <tr><td><code className="code">/ingest/vercel</code></td><td>POST</td><td>Vercel Log Drains</td></tr>
              <tr><td><code className="code">/ingest/nextjs</code></td><td>POST</td><td>Next.js application logs</td></tr>
              <tr><td><code className="code">/ingest/smartthings</code></td><td>POST</td><td>SmartThings IoT events</td></tr>
              <tr><td><code className="code">/ingest/health</code></td><td>GET</td><td>Health check for agents</td></tr>
              <tr><td><code className="code">/ingest/validate</code></td><td>POST</td><td>Validate payload without storing</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Dashboards API */}
      <section>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">Dashboards API</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">Manage dashboards, panels, variables, and annotations.</p>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-slate-800">
            <thead><tr><th>Endpoint</th><th>Method</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code className="code">/dashboards</code></td><td>GET/POST</td><td>List/create dashboards</td></tr>
              <tr><td><code className="code">/dashboards/:id</code></td><td>GET/PUT/DELETE</td><td>Manage dashboard</td></tr>
              <tr><td><code className="code">/dashboards/:id/panels</code></td><td>POST</td><td>Add panel</td></tr>
              <tr><td><code className="code">/dashboards/:id/panels/:panelId</code></td><td>PUT/DELETE</td><td>Manage panel</td></tr>
              <tr><td><code className="code">/dashboards/:id/layout</code></td><td>PUT</td><td>Update panel positions</td></tr>
              <tr><td><code className="code">/dashboards/:id/share</code></td><td>POST/DELETE</td><td>Enable/disable sharing</td></tr>
              <tr><td><code className="code">/dashboards/:id/variables</code></td><td>GET/POST</td><td>Manage variables</td></tr>
              <tr><td><code className="code">/dashboards/:id/duplicate</code></td><td>POST</td><td>Duplicate dashboard</td></tr>
              <tr><td><code className="code">/dashboards/import</code></td><td>POST</td><td>Import from template</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Alerts API */}
      <section>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">Alerts API</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">Create and manage alert rules with various trigger conditions.</p>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-slate-800">
            <thead><tr><th>Endpoint</th><th>Method</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code className="code">/alerts</code></td><td>GET/POST</td><td>List/create alerts</td></tr>
              <tr><td><code className="code">/alerts/:id</code></td><td>GET/PUT/DELETE</td><td>Manage alert</td></tr>
              <tr><td><code className="code">/alerts/:id/toggle</code></td><td>POST</td><td>Enable/disable alert</td></tr>
              <tr><td><code className="code">/alerts/:id/evaluate</code></td><td>POST</td><td>Manually evaluate alert</td></tr>
              <tr><td><code className="code">/alerts/test</code></td><td>POST</td><td>Test alert without saving</td></tr>
              <tr><td><code className="code">/alerts/templates</code></td><td>GET</td><td>Get alert templates</td></tr>
              <tr><td><code className="code">/alerts/history</code></td><td>GET</td><td>Get alert history</td></tr>
              <tr><td><code className="code">/alerts/history/:id/acknowledge</code></td><td>POST</td><td>Acknowledge alert</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Silences API */}
      <section>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">Silences API</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">Temporarily silence alerts at global, host, or alert level.</p>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-slate-800">
            <thead><tr><th>Endpoint</th><th>Method</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code className="code">/silences</code></td><td>GET/POST</td><td>List/create silences</td></tr>
              <tr><td><code className="code">/silences/:id</code></td><td>GET/DELETE</td><td>Get/remove silence</td></tr>
              <tr><td><code className="code">/silences/check</code></td><td>GET</td><td>Check if alert is silenced</td></tr>
              <tr><td><code className="code">/silences/cleanup</code></td><td>POST</td><td>Remove expired silences</td></tr>
            </tbody>
          </table>
        </div>
        <div className="card p-4 dark:bg-slate-800 mt-4">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Silence Levels</h3>
          <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
            <li><strong>global</strong> - Silence all alerts</li>
            <li><strong>host</strong> - Silence alerts for specific hostname</li>
            <li><strong>alert</strong> - Silence a specific alert</li>
          </ul>
          <p className="text-xs text-slate-500 mt-2">Duration formats: 1h, 4h, 8h, 12h, 24h, 2d, 3d, 1w, indefinite</p>
        </div>
      </section>

      {/* GeoIP & IP Utils */}
      <section>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">GeoIP & IP Utilities</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">IP geolocation and classification endpoints.</p>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-slate-800">
            <thead><tr><th>Endpoint</th><th>Method</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code className="code">/geoip/status</code></td><td>GET</td><td>GeoIP service status</td></tr>
              <tr><td><code className="code">/geoip/lookup/:ip</code></td><td>GET</td><td>Lookup single IP</td></tr>
              <tr><td><code className="code">/geoip/lookup</code></td><td>POST</td><td>Batch lookup (max 1000)</td></tr>
              <tr><td><code className="code">/geoip/cache/stats</code></td><td>GET</td><td>Cache statistics</td></tr>
              <tr><td><code className="code">/utils/classify-ip</code></td><td>GET/POST</td><td>Classify IP type</td></tr>
              <tr><td><code className="code">/utils/classify-ips</code></td><td>POST</td><td>Batch classify IPs</td></tr>
              <tr><td><code className="code">/utils/ip-info</code></td><td>GET</td><td>Comprehensive IP info</td></tr>
            </tbody>
          </table>
        </div>
        <div className="card p-4 dark:bg-slate-800 mt-4">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">IP Classification Types</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <code className="code">private</code>
            <code className="code">public</code>
            <code className="code">loopback</code>
            <code className="code">link-local</code>
            <code className="code">multicast</code>
            <code className="code">broadcast</code>
            <code className="code">cgnat</code>
            <code className="code">documentation</code>
          </div>
        </div>
      </section>

      {/* Statistics API */}
      <section>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">Statistics API</h2>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-slate-800">
            <thead><tr><th>Endpoint</th><th>Method</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code className="code">/stats/overview</code></td><td>GET</td><td>Log counts, top hosts/apps</td></tr>
              <tr><td><code className="code">/stats/timeseries</code></td><td>GET</td><td>Time series data for charts</td></tr>
              <tr><td><code className="code">/stats/severity</code></td><td>GET</td><td>Severity distribution</td></tr>
              <tr><td><code className="code">/stats/indexes</code></td><td>GET</td><td>Index sizes</td></tr>
              <tr><td><code className="code">/stats/sources</code></td><td>GET</td><td>Active data sources</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Settings API */}
      <section>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">Settings API</h2>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-slate-800">
            <thead><tr><th>Endpoint</th><th>Method</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code className="code">/settings/preferences</code></td><td>GET/PUT</td><td>User preferences</td></tr>
              <tr><td><code className="code">/settings/system</code></td><td>GET/PUT</td><td>System settings (admin)</td></tr>
              <tr><td><code className="code">/settings/system/stats</code></td><td>GET</td><td>System stats (admin)</td></tr>
              <tr><td><code className="code">/settings/ai</code></td><td>GET/PUT</td><td>AI configuration (admin)</td></tr>
              <tr><td><code className="code">/settings/ai/test</code></td><td>POST</td><td>Test AI connection (admin)</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* AI API */}
      <section>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">AI API</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">AI-powered features via Ollama or OpenRouter.</p>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-slate-800">
            <thead><tr><th>Endpoint</th><th>Method</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code className="code">/ai/status</code></td><td>GET</td><td>AI provider availability</td></tr>
              <tr><td><code className="code">/ai/generate-query</code></td><td>POST</td><td>Natural language to DSL</td></tr>
              <tr><td><code className="code">/ai/insights</code></td><td>POST</td><td>Generate dashboard insights</td></tr>
              <tr><td><code className="code">/ai/chat</code></td><td>POST</td><td>Chat with log context</td></tr>
              <tr><td><code className="code">/ai/interview/start</code></td><td>POST</td><td>Start codebase interview</td></tr>
              <tr><td><code className="code">/ai/interview/:id/respond</code></td><td>POST</td><td>Submit interview responses</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Error Codes */}
      <section>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">Error Codes</h2>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-slate-800">
            <thead><tr><th>Code</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code className="code">200</code></td><td>Success</td></tr>
              <tr><td><code className="code">201</code></td><td>Created successfully</td></tr>
              <tr><td><code className="code">204</code></td><td>Deleted successfully (no content)</td></tr>
              <tr><td><code className="code">400</code></td><td>Bad request / validation error</td></tr>
              <tr><td><code className="code">401</code></td><td>Unauthorized / invalid credentials</td></tr>
              <tr><td><code className="code">403</code></td><td>Forbidden / insufficient permissions</td></tr>
              <tr><td><code className="code">404</code></td><td>Resource not found</td></tr>
              <tr><td><code className="code">429</code></td><td>Rate limit exceeded</td></tr>
              <tr><td><code className="code">500</code></td><td>Internal server error</td></tr>
            </tbody>
          </table>
        </div>
        <div className="card p-4 dark:bg-slate-800 mt-4">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Error Response Format</h3>
          <CodeBlock code={`{
  "error": "Short error description",
  "message": "Detailed error message"
}`} />
        </div>
      </section>

      {/* Rate Limiting */}
      <section>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4">Rate Limiting</h2>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-slate-800">
            <thead><tr><th>Endpoint</th><th>Limit</th></tr></thead>
            <tbody>
              <tr><td><code className="code">/auth/login</code></td><td>10 requests/minute</td></tr>
              <tr><td><code className="code">/auth/setup</code></td><td>5 requests/minute</td></tr>
              <tr><td><code className="code">/auth/refresh</code></td><td>30 requests/minute</td></tr>
              <tr><td><code className="code">/search/query</code></td><td>120 requests/minute</td></tr>
              <tr><td><code className="code">/geoip/lookup (batch)</code></td><td>30 requests/minute</td></tr>
              <tr><td><code className="code">/utils/classify-ips</code></td><td>30 requests/minute</td></tr>
            </tbody>
          </table>
        </div>
        <div className="card p-4 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 mt-4">
          <p className="text-amber-800 dark:text-amber-300 text-sm">
            <strong>Note:</strong> When rate limited, you will receive a 429 status code. Wait before retrying.
          </p>
        </div>
      </section>
    </div>
  );
}

function LogIngestionSection() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Sending Logs to LogNog</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          LogNog supports multiple ingestion methods to accommodate different log sources and use cases.
          Choose the method that best fits your infrastructure.
        </p>

        <div className="overflow-x-auto mb-6">
          <table className="table card dark:bg-slate-800">
            <thead>
              <tr>
                <th>Method</th>
                <th>Endpoint/Port</th>
                <th>Format</th>
                <th>Auth Required</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Syslog (UDP)</td><td><code className="code">514/udp</code></td><td>RFC 3164 & 5424</td><td>No</td></tr>
              <tr><td>Syslog (TCP)</td><td><code className="code">514/tcp</code></td><td>RFC 3164 & 5424</td><td>No</td></tr>
              <tr><td>HTTP API</td><td><code className="code">POST /api/ingest/http</code></td><td>JSON array</td><td>API Key</td></tr>
              <tr><td>OTLP</td><td><code className="code">POST /api/ingest/otlp/v1/logs</code></td><td>OpenTelemetry JSON</td><td>Optional</td></tr>
              <tr><td>Supabase</td><td><code className="code">POST /api/ingest/supabase</code></td><td>Supabase Log Drains</td><td>API Key</td></tr>
              <tr><td>Vercel</td><td><code className="code">POST /api/ingest/vercel</code></td><td>NDJSON</td><td>API Key</td></tr>
              <tr><td>SmartThings</td><td><code className="code">POST /api/ingest/smartthings</code></td><td>Webhook</td><td>API Key</td></tr>
              <tr><td>LogNog In Agent</td><td><code className="code">POST /api/ingest</code></td><td>Agent batches</td><td>API Key</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Syslog Ingestion</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          LogNog accepts syslog messages on port 514 via both UDP and TCP. This is the simplest way to send logs
          from network devices, servers, and applications that support syslog output.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">UDP Syslog (Recommended)</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              Fast, fire-and-forget delivery. Best for high-volume logging where occasional message loss is acceptable.
            </p>
            <CodeBlock code={`# Send a test message via UDP
echo "<14>Test message from LogNog" | nc -u localhost 514

# With timestamp and hostname
echo "<14>$(date +"%b %d %H:%M:%S") myhost myapp[1234]: Test log" | nc -u localhost 514`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">TCP Syslog</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              Reliable delivery with connection-oriented protocol. Use when you need guaranteed delivery.
            </p>
            <CodeBlock code={`# Send a test message via TCP
echo "<14>Test message from LogNog" | nc localhost 514

# Using logger command
logger -n localhost -P 514 -T "Test message from logger"`} />
          </div>
        </div>

        <div className="card p-4 dark:bg-slate-800 mb-4">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Configure rsyslog to Forward Logs</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
            Add this to your <code className="code">/etc/rsyslog.conf</code> or <code className="code">/etc/rsyslog.d/lognog.conf</code>:
          </p>
          <CodeBlock code={`# Forward all logs to LogNog via UDP
*.* @lognog-server:514

# Forward all logs to LogNog via TCP
*.* @@lognog-server:514

# Forward only auth logs
auth,authpriv.* @lognog-server:514`} />
        </div>

        <div className="card p-4 dark:bg-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Configure syslog-ng to Forward Logs</h3>
          <CodeBlock code={`# Add to syslog-ng.conf
destination d_lognog {
    network("lognog-server" port(514) transport("udp"));
};

log {
    source(s_local);
    destination(d_lognog);
};`} />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">HTTP API Ingestion</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Send logs directly via HTTP POST requests. Requires an API key for authentication.
        </p>

        <div className="card p-4 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 mb-4">
          <p className="text-amber-800 dark:text-amber-300 text-sm">
            <strong>API Key Required:</strong> Generate an API key from <strong>Settings &rarr; API Keys</strong> before using HTTP ingestion endpoints.
          </p>
        </div>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Generic HTTP Endpoint</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              <code className="code">POST /api/ingest/http</code> - Accept JSON array of log entries
            </p>
            <CodeBlock code={`curl -X POST http://localhost/api/ingest/http \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: your-api-key-here" \\
  -d '[
    {
      "timestamp": "2024-01-15T10:30:00Z",
      "hostname": "web-server-01",
      "app_name": "nginx",
      "severity": 6,
      "message": "GET /api/health 200 15ms"
    },
    {
      "timestamp": "2024-01-15T10:30:01Z",
      "hostname": "web-server-01",
      "app_name": "nginx",
      "severity": 3,
      "message": "POST /api/login 500 Internal Server Error"
    }
  ]'`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Log Entry Fields</h3>
            <div className="overflow-x-auto">
              <table className="table w-full">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Type</th>
                    <th>Required</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  <tr><td><code className="code">message</code></td><td>string</td><td>Yes</td><td>The log message content</td></tr>
                  <tr><td><code className="code">timestamp</code></td><td>ISO 8601</td><td>No</td><td>Defaults to current time</td></tr>
                  <tr><td><code className="code">hostname</code></td><td>string</td><td>No</td><td>Source hostname</td></tr>
                  <tr><td><code className="code">app_name</code></td><td>string</td><td>No</td><td>Application name</td></tr>
                  <tr><td><code className="code">severity</code></td><td>0-7</td><td>No</td><td>Syslog severity level (default: 6)</td></tr>
                  <tr><td><code className="code">facility</code></td><td>0-23</td><td>No</td><td>Syslog facility (default: 1)</td></tr>
                  <tr><td><code className="code">source_ip</code></td><td>IPv4</td><td>No</td><td>Source IP address</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">OTLP Ingestion (OpenTelemetry)</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          LogNog supports OpenTelemetry Protocol (OTLP) for logs. This allows integration with OpenTelemetry
          collectors and instrumented applications.
        </p>

        <div className="card p-4 dark:bg-slate-800 mb-4">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">OTLP HTTP Endpoint</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
            <code className="code">POST /api/ingest/otlp/v1/logs</code>
          </p>
          <CodeBlock code={`curl -X POST http://localhost/api/ingest/otlp/v1/logs \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: your-api-key-here" \\
  -d '{
    "resourceLogs": [{
      "resource": {
        "attributes": [
          {"key": "service.name", "value": {"stringValue": "my-service"}}
        ]
      },
      "scopeLogs": [{
        "logRecords": [{
          "timeUnixNano": "1705315200000000000",
          "severityNumber": 9,
          "body": {"stringValue": "Application started successfully"}
        }]
      }]
    }]
  }'`} />
        </div>

        <div className="card p-4 dark:bg-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">OpenTelemetry Collector Configuration</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
            Configure your OTEL Collector to export logs to LogNog:
          </p>
          <CodeBlock code={`exporters:
  otlphttp:
    endpoint: "http://lognog-server/api/ingest/otlp"
    headers:
      X-API-Key: "your-api-key-here"

service:
  pipelines:
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlphttp]`} />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Supabase Log Drains</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Ingest logs from your Supabase projects including database, auth, storage, and edge functions.
        </p>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Setup Instructions</h3>
            <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-2 list-decimal list-inside">
              <li>Go to your Supabase Dashboard &rarr; Settings &rarr; Log Drains</li>
              <li>Click "Add destination" and select "Generic HTTP"</li>
              <li>Set the URL to: <code className="code">https://your-lognog-server/api/ingest/supabase</code></li>
              <li>Add header: <code className="code">X-API-Key: your-lognog-api-key</code></li>
              <li>Save and logs will start flowing (batched, up to 250 per request)</li>
            </ol>
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Endpoint Details</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              <code className="code">POST /api/ingest/supabase</code>
            </p>
            <CodeBlock code={`# Test with sample Supabase log format
curl -X POST http://localhost/api/ingest/supabase \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: your-api-key-here" \\
  -d '[
    {
      "id": "abc123",
      "timestamp": 1705315200,
      "event_message": "SELECT * FROM users WHERE id = 1",
      "metadata": {
        "project": "my-project",
        "source": "database"
      }
    }
  ]'`} />
          </div>

          <div className="card p-4 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
            <p className="text-amber-800 dark:text-amber-300 text-sm">
              <strong>Log Types:</strong> Supabase sends logs from PostgreSQL, PostgREST, GoTrue (auth), Storage,
              Realtime, and Edge Functions - all automatically categorized by source.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Vercel Log Drains</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Stream logs from your Vercel deployments including serverless functions, edge functions, and builds.
        </p>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Setup Instructions</h3>
            <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-2 list-decimal list-inside">
              <li>Go to Vercel Dashboard &rarr; Project Settings &rarr; Integrations</li>
              <li>Navigate to the Log Drains section</li>
              <li>Set the URL to: <code className="code">https://your-lognog-server/api/ingest/vercel</code></li>
              <li>Add header: <code className="code">X-API-Key: your-lognog-api-key</code></li>
              <li>Logs arrive as NDJSON in real-time (~1-2s latency)</li>
            </ol>
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Endpoint Details</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              <code className="code">POST /api/ingest/vercel</code> - Accepts NDJSON format
            </p>
            <CodeBlock code={`# Vercel sends logs in NDJSON format (newline-delimited JSON)
# Each line is a separate JSON object

{"id":"log1","message":"Function invoked","timestamp":1705315200,"source":"lambda"}
{"id":"log2","message":"Response sent","timestamp":1705315201,"source":"lambda"}`} />
          </div>

          <div className="card p-4 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
            <p className="text-green-800 dark:text-green-300 text-sm">
              <strong>Log Sources:</strong> Serverless functions (lambda), Edge functions (edge),
              Static assets (static), Build logs (build), and Runtime errors.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">SmartThings Integration</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Collect IoT device events from Samsung SmartThings for home automation monitoring.
        </p>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Setup Instructions</h3>
            <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-2 list-decimal list-inside">
              <li>Create a SmartApp in SmartThings Developer Workspace</li>
              <li>Register a Webhook SmartApp pointing to: <code className="code">https://your-lognog-server/api/ingest/smartthings</code></li>
              <li>Add header: <code className="code">X-API-Key: your-lognog-api-key</code></li>
              <li>Subscribe to device events, health events, and lifecycle events</li>
            </ol>
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Event Types Captured</h3>
            <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
              <li><strong>Device events:</strong> capability.attribute = value (e.g., switch.on, temperature.72)</li>
              <li><strong>Device lifecycle:</strong> add, remove, update operations</li>
              <li><strong>Device health:</strong> online, offline, unhealthy status changes</li>
              <li><strong>Hub health:</strong> Hub connectivity and status events</li>
            </ul>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">LogNog In Agent</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          The LogNog In agent is a lightweight collector that runs on Windows, Linux, and macOS to collect
          log files, Windows Event Logs, and file integrity monitoring (FIM) events.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Features</h3>
            <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
              <li>Watch directories for new log files</li>
              <li>Windows Event Log collection (Security, System, Application)</li>
              <li>File Integrity Monitoring (FIM)</li>
              <li>System tray GUI (Windows)</li>
              <li>Batched shipping (100 logs / 5 seconds)</li>
              <li>Retry with exponential backoff</li>
            </ul>
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Installation</h3>
            <CodeBlock code={`# Install from source
cd agent
pip install -e ".[dev]"

# Run the agent
python -m lognog_in

# Build Windows EXE
python build.py`} />
          </div>
        </div>

        <div className="card p-4 dark:bg-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Agent Configuration</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
            Configure the agent with a <code className="code">config.yaml</code> file:
          </p>
          <CodeBlock code={`# LogNog In Agent Configuration
server:
  url: http://lognog-server
  api_key: your-api-key-here

collectors:
  # Log file collection
  files:
    - path: /var/log/syslog
    - path: /var/log/nginx/*.log
    - path: C:\\inetpub\\logs\\*.log

  # Windows Event Logs (Windows only)
  windows_events:
    channels:
      - Security
      - System
      - Application

  # File Integrity Monitoring
  fim:
    paths:
      - /etc
      - C:\\Windows\\System32\\config`} />
        </div>

        <div className="card p-4 dark:bg-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Agent API Endpoint</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
            <code className="code">POST /api/ingest</code> - Used by the LogNog In agent
          </p>
          <CodeBlock code={`curl -X POST http://localhost/api/ingest \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: your-api-key-here" \\
  -d '{
    "logs": [
      {
        "timestamp": "2024-01-15T10:30:00Z",
        "hostname": "workstation-01",
        "app_name": "lognog-in",
        "message": "File modified: /etc/passwd",
        "source_type": "fim"
      }
    ]
  }'`} />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Authentication</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          All HTTP ingestion endpoints (except syslog) require API key authentication.
        </p>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Creating an API Key</h3>
            <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-2 list-decimal list-inside">
              <li>Navigate to <strong>Settings &rarr; API Keys</strong></li>
              <li>Click "Create API Key"</li>
              <li>Give it a descriptive name (e.g., "Vercel Log Drain", "Production Agent")</li>
              <li>Copy the key immediately - it won't be shown again</li>
            </ol>
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Using API Keys</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              Include the API key in the <code className="code">X-API-Key</code> header:
            </p>
            <CodeBlock code={`# Header format
X-API-Key: lnog_abc123xyz...

# Example curl request
curl -X POST http://localhost/api/ingest/http \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: lnog_abc123xyz..." \\
  -d '[{"message": "Test log"}]'`} />
          </div>

          <div className="card p-4 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800">
            <p className="text-red-800 dark:text-red-300 text-sm">
              <strong>Security Note:</strong> Keep your API keys secure. Never commit them to version control
              or expose them in client-side code. Use environment variables for configuration.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Quick Reference: curl Examples</h2>
        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Send a Single Log</h3>
            <CodeBlock code={`curl -X POST http://localhost/api/ingest/http \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '[{"message": "Application started", "severity": 6, "app_name": "myapp"}]'`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Send Error Log</h3>
            <CodeBlock code={`curl -X POST http://localhost/api/ingest/http \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '[{
    "message": "Database connection failed: timeout after 30s",
    "severity": 3,
    "hostname": "db-server-01",
    "app_name": "postgres"
  }]'`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Send Batch of Logs</h3>
            <CodeBlock code={`curl -X POST http://localhost/api/ingest/http \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '[
    {"message": "Request received", "severity": 6},
    {"message": "Processing complete", "severity": 6},
    {"message": "Response sent", "severity": 6}
  ]'`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Test Syslog via netcat</h3>
            <CodeBlock code={`# UDP
echo "<14>Jan 15 10:30:00 myhost myapp: Test message" | nc -u localhost 514

# TCP
echo "<14>Jan 15 10:30:00 myhost myapp: Test message" | nc localhost 514`} />
          </div>
        </div>
      </section>
    </div>
  );
}

function DashboardsSection() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Dashboards Overview</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Dashboards transform raw log data into actionable insights. Create visualizations,
          track metrics, and monitor your systems in real-time.
        </p>

        <div className="card p-4 bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200 dark:from-amber-900/20 dark:to-orange-900/20 dark:border-amber-800 mb-6">
          <p className="text-amber-800 dark:text-amber-300">
            <strong>The 5-Second Rule:</strong> If someone cannot understand a panel's message within 5 seconds,
            it is too complicated. Simplify your visualizations for maximum impact.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Creating a Dashboard</h2>
        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">1. Create New Dashboard</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              Navigate to <strong>Dashboards</strong> in the sidebar and click <strong>New Dashboard</strong>.
              Enter a name and optional description.
            </p>
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">2. Add Panels</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              Click <strong>Add Panel</strong> to create visualizations. Each panel needs a title, query, and visualization type.
            </p>
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">3. Arrange Layout</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              Use <strong>Edit Layout</strong> mode to drag and resize panels. The dashboard uses a 12-column grid.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Panel Types</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Choose the right visualization for your data:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
              <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
              Table
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              Display detailed data in rows and columns. Best for raw logs and detailed breakdowns.
            </p>
            <CodeBlock code={`search severity<=3
  | sort desc timestamp
  | table timestamp hostname message
  | limit 50`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
              <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
              Bar Chart
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              Compare values across categories. Great for top-N lists and comparisons.
            </p>
            <CodeBlock code={`search *
  | stats count by hostname
  | sort desc count
  | limit 10`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
              <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
              Pie Chart
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              Show distribution and proportions. Ideal for severity breakdowns.
            </p>
            <CodeBlock code={`search *
  | stats count by severity`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              Area Chart (Line)
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              Display trends over time. Perfect for time-series data.
            </p>
            <CodeBlock code={`search *
  | timechart span=1h count`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
              <span className="w-2 h-2 bg-red-500 rounded-full"></span>
              Single Stat
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              Display one important number prominently. Great for KPIs.
            </p>
            <CodeBlock code={`search severity<=3 | stats count`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
              <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
              Gauge
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              Display a metric with visual thresholds. Shows status at a glance.
            </p>
            <CodeBlock code={`search * | stats count`} />
          </div>

          <div className="card p-4 dark:bg-slate-800 md:col-span-2">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
              <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
              Heatmap
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              Visualize patterns in 2D data. Perfect for time-of-day activity patterns.
            </p>
            <CodeBlock code={`search * | stats count by hour(timestamp) day(timestamp)`} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Time Range Controls</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Control the time window for all panels in your dashboard:
        </p>

        <div className="overflow-x-auto">
          <table className="table card dark:bg-slate-800">
            <thead>
              <tr>
                <th>Preset</th>
                <th>Value</th>
                <th>Best For</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Last 15 minutes</td><td><code className="code">-15m</code></td><td>Real-time monitoring</td></tr>
              <tr><td>Last hour</td><td><code className="code">-1h</code></td><td>Recent activity</td></tr>
              <tr><td>Last 4 hours</td><td><code className="code">-4h</code></td><td>Shift overview</td></tr>
              <tr><td>Last 24 hours</td><td><code className="code">-24h</code></td><td>Daily patterns</td></tr>
              <tr><td>Last 7 days</td><td><code className="code">-7d</code></td><td>Weekly trends</td></tr>
            </tbody>
          </table>
        </div>

        <div className="card p-4 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 mt-4">
          <p className="text-amber-800 dark:text-amber-300 text-sm">
            <strong>Auto-Refresh:</strong> Enable auto-refresh (30 seconds to 5 minutes) for real-time
            monitoring dashboards. Disable for investigation dashboards.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Dashboard Variables</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Variables make dashboards dynamic and reusable. Add dropdown filters that apply to all panels.
        </p>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Variable Types</h3>
            <div className="overflow-x-auto">
              <table className="table w-full">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Example</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td><code className="code">Query</code></td><td>Values from a search</td><td>Hostnames from logs</td></tr>
                  <tr><td><code className="code">Custom</code></td><td>Static list of values</td><td>prod, staging, dev</td></tr>
                  <tr><td><code className="code">Textbox</code></td><td>Free-text input</td><td>Custom IP address</td></tr>
                  <tr><td><code className="code">Interval</code></td><td>Time intervals</td><td>5m, 1h, 1d</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Using Variables in Queries</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              Reference variables with <code className="code">$variable$</code> syntax:
            </p>
            <CodeBlock code={`# Filter by selected hostname
search hostname=$host$ | stats count by app_name

# Use multiple variables
search hostname=$host$ severity>=$severity$
  | table timestamp message

# With time intervals
search * | timechart span=$interval$ count`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Query-Based Variables</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              For Query-type variables, use searches that return distinct values:
            </p>
            <CodeBlock code={`# Get all hostnames
search * | stats count by hostname | table hostname

# Get all applications
search * | stats count by app_name | table app_name

# Get severity levels
search * | stats count by severity | table severity`} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Drag-and-Drop Layout</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Arrange panels with the visual editor:
        </p>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Entering Edit Mode</h3>
            <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-1 list-decimal list-inside">
              <li>Open a dashboard</li>
              <li>Click the Settings dropdown (gear icon)</li>
              <li>Select <strong>Edit Layout</strong></li>
              <li>A yellow banner confirms edit mode is active</li>
            </ol>
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Layout Grid</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              The dashboard uses a 12-column grid:
            </p>
            <div className="overflow-x-auto">
              <table className="table w-full">
                <thead>
                  <tr>
                    <th>Panel Width</th>
                    <th>Columns</th>
                    <th>Use Case</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>Small</td><td>3-4</td><td>Gauges, stats</td></tr>
                  <tr><td>Medium</td><td>6</td><td>Charts, tables</td></tr>
                  <tr><td>Full width</td><td>12</td><td>Time series, large tables</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Sharing and Exporting</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Public Sharing</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              Share dashboards publicly without requiring login:
            </p>
            <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-1 list-decimal list-inside">
              <li>Open Settings dropdown</li>
              <li>Click <strong>Share</strong></li>
              <li>Toggle <strong>Enable Public Sharing</strong></li>
              <li>Copy the public URL</li>
            </ol>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Great for NOC status boards and team dashboards.
            </p>
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Export Dashboard</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              Export dashboards as JSON for backup or sharing:
            </p>
            <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-1 list-decimal list-inside">
              <li>Open Settings dropdown</li>
              <li>Click <strong>Export</strong></li>
              <li>Save the JSON file</li>
            </ol>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Import via the Dashboards page.
            </p>
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Branding</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              Customize dashboards with your own branding:
            </p>
            <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
              <li>Custom logo (120x120px recommended)</li>
              <li>Accent color</li>
              <li>Header background color</li>
              <li>Description text</li>
            </ul>
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Duplicate Dashboard</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              Create a copy of any dashboard:
            </p>
            <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-1 list-decimal list-inside">
              <li>Open Settings dropdown</li>
              <li>Click <strong>Duplicate</strong></li>
              <li>New dashboard opens automatically</li>
            </ol>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Click-to-Drilldown</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Click any chart element to navigate to a filtered search:
        </p>

        <div className="overflow-x-auto">
          <table className="table card dark:bg-slate-800">
            <thead>
              <tr>
                <th>Chart Type</th>
                <th>Drilldown Action</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Bar Chart</td><td>Filter by category value (clicked bar)</td></tr>
              <tr><td>Pie Chart</td><td>Filter by slice value</td></tr>
              <tr><td>Table</td><td>Filter by first column value (clicked row)</td></tr>
              <tr><td>Time Series</td><td>Filter by clicked time range</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">AI Insights (Ollama)</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Enable AI-powered insights for your dashboards using a local Ollama instance:
        </p>

        <div className="card p-4 dark:bg-slate-800">
          <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-2 list-decimal list-inside">
            <li>Ensure Ollama is running (<code className="code">ollama serve</code>)</li>
            <li>Open Settings dropdown on any dashboard</li>
            <li>Click <strong>AI Insights</strong></li>
            <li>The AI analyzes your panel data and provides:
              <ul className="ml-6 mt-1 space-y-1 list-disc">
                <li>Anomaly detection (unusual patterns)</li>
                <li>Trend analysis (changes over time)</li>
                <li>Suggestions (recommended actions)</li>
              </ul>
            </li>
          </ol>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Best Practices</h2>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Layout Guidelines</h3>
            <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <span>Place most important metrics at top-left (users scan in F-pattern)</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <span>Use gauges and stats for KPIs in the top row</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <span>Put time series charts full-width below the KPIs</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <span>Detail tables go at the bottom</span>
              </li>
            </ul>
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Query Optimization</h3>
            <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <span>Always use <code className="code">limit</code> for bar charts and tables</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <span>Put filters in <code className="code">search</code>, not <code className="code">filter</code></span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <span>Use shorter time ranges for real-time dashboards</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <span>Pre-aggregate data with <code className="code">stats</code> before sorting</span>
              </li>
            </ul>
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Color Guidelines</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                <span className="text-slate-600 dark:text-slate-400">Green: Good, healthy</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 bg-amber-500 rounded-full"></span>
                <span className="text-slate-600 dark:text-slate-400">Yellow: Warning</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                <span className="text-slate-600 dark:text-slate-400">Red: Error, critical</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 bg-amber-500 rounded-full"></span>
                <span className="text-slate-600 dark:text-slate-400">Blue: Information</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 bg-orange-500 rounded-full"></span>
                <span className="text-slate-600 dark:text-slate-400">Purple: Distinct</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 bg-gray-500 rounded-full"></span>
                <span className="text-slate-600 dark:text-slate-400">Gray: Secondary</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Example Dashboard Layout</h2>
        <div className="card p-4 bg-slate-50 dark:bg-slate-800/50">
          <pre className="text-sm text-slate-600 dark:text-slate-300 overflow-x-auto">{`
+-------------+-------------+-------------+-------------+
|  CRITICAL   |  AUTH       |  FIREWALL   |  UNIQUE     |
|  EVENTS     |  FAILURES   |  BLOCKS     |  SOURCES    |
|  (Gauge)    |  (Gauge)    |  (Gauge)    |  (Gauge)    |
+-------------+-------------+-------------+-------------+
|                                                       |
|        EVENTS OVER TIME (Area Chart)                  |
|                                                       |
+---------------------------+---------------------------+
|   TOP HOSTS               |   SEVERITY DISTRIBUTION   |
|   (Bar Chart)             |   (Pie Chart)             |
+---------------------------+---------------------------+
|                                                       |
|            RECENT EVENTS (Table)                      |
|                                                       |
+-------------------------------------------------------+
`}</pre>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Quick Reference Queries</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Gauge Panels</h3>
            <CodeBlock code={`# Error count
search severity<=3 | stats count

# Unique hosts
search * | stats dc(hostname)

# Active connections
search action=accept | stats count`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Bar Charts</h3>
            <CodeBlock code={`# Top hosts by volume
search *
  | stats count by hostname
  | sort desc count
  | limit 10`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Time Series</h3>
            <CodeBlock code={`# Log volume over time
search *
  | timechart span=1h count

# Multiple series
search *
  | timechart span=1h count by hostname`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Tables</h3>
            <CodeBlock code={`# Recent errors
search severity<=3
  | sort desc timestamp
  | table timestamp hostname message
  | limit 50`} />
          </div>
        </div>
      </section>
    </div>
  );
}

function KnowledgeSection() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">What are Knowledge Objects?</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Knowledge Objects are reusable components that enrich your log data and enhance your search workflows.
          They allow you to define patterns, lookups, classifications, and actions that can be applied across
          all your searches and dashboards.
        </p>

        <div className="card p-4 bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200 dark:from-amber-900/20 dark:to-orange-900/20 dark:border-amber-800 mb-6">
          <p className="text-amber-800 dark:text-amber-300">
            <strong>Power Tip:</strong> Knowledge Objects are the key to transforming raw log data into
            actionable intelligence. Master them to unlock the full potential of LogNog.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Lookups</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Enrich events with external data (IP to location, user to department, etc.)
            </p>
          </div>
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Field Extractions</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Extract structured fields from unstructured log messages using patterns
            </p>
          </div>
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Event Types</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Categorize events based on search criteria for easier classification
            </p>
          </div>
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Tags</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Label field values for quick categorization and filtering
            </p>
          </div>
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Saved Searches</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Store frequently used queries for quick access and reuse
            </p>
          </div>
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Workflow Actions</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Define custom actions triggered from search results (links, scripts)
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Lookups</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Lookups are enrichment tables that add context to your log events. For example,
          you can map IP addresses to locations, usernames to departments, or error codes to descriptions.
        </p>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Lookup Types</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium text-slate-800 dark:text-slate-200 mb-1">Manual Lookups</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Store data directly in the database. Best for small, frequently updated datasets.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-slate-800 dark:text-slate-200 mb-1">CSV Lookups</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Reference external CSV files. Best for large, static datasets.
                </p>
              </div>
            </div>
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Creating a Lookup</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              Create a manual lookup to map IP addresses to their locations:
            </p>
            <CodeBlock code={`POST /api/knowledge/lookups
{
  "name": "IP to Location",
  "type": "manual",
  "key_field": "ip_address",
  "output_fields": ["location", "datacenter", "region"],
  "data": [
    {
      "ip_address": "192.168.1.1",
      "location": "Office - New York",
      "datacenter": "NYC-DC1",
      "region": "us-east"
    },
    {
      "ip_address": "192.168.1.2",
      "location": "Office - San Francisco",
      "datacenter": "SFO-DC1",
      "region": "us-west"
    }
  ]
}`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Searching a Lookup</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              Query the lookup to retrieve enrichment data:
            </p>
            <CodeBlock code={`GET /api/knowledge/lookups/:id/search?key=192.168.1.1

Response:
{
  "key": "192.168.1.1",
  "found": true,
  "data": {
    "location": "Office - New York",
    "datacenter": "NYC-DC1",
    "region": "us-east"
  }
}`} />
          </div>

          <div className="card p-4 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
            <p className="text-amber-800 dark:text-amber-300 text-sm">
              <strong>Use Cases:</strong> IP geolocation, user-to-department mapping,
              asset inventory enrichment, error code descriptions, severity mappings.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Field Extractions</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Field extractions parse structured data from unstructured log messages. Define patterns
          using Grok or regular expressions to automatically extract fields like usernames, IPs,
          error codes, and more.
        </p>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Pattern Types</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium text-slate-800 dark:text-slate-200 mb-1">Grok Patterns</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                  Use predefined patterns for common log formats. Easier to read and maintain.
                </p>
                <code className="code text-xs">%{'{'}COMBINEDAPACHELOG{'}'}</code>
              </div>
              <div>
                <h4 className="font-medium text-slate-800 dark:text-slate-200 mb-1">Regex Patterns</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                  Use JavaScript regular expressions with named capture groups.
                </p>
                <code className="code text-xs">{'(?<username>\\w+)'}</code>
              </div>
            </div>
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Creating a Field Extraction</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              Extract fields from Apache access logs:
            </p>
            <CodeBlock code={`POST /api/knowledge/field-extractions
{
  "name": "Apache Access Log",
  "source_type": "apache:access",
  "field_name": "request_info",
  "pattern": "%{COMBINEDAPACHELOG}",
  "pattern_type": "grok",
  "priority": 100,
  "enabled": true
}`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Testing Extractions</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              Test your pattern against a sample log line before deploying:
            </p>
            <CodeBlock code={`POST /api/knowledge/field-extractions/:id/test
{
  "log_line": "127.0.0.1 - - [10/Oct/2000:13:55:36 -0700] \\"GET /index.html HTTP/1.0\\" 200 2326"
}

Response:
{
  "success": true,
  "extracted_fields": {
    "clientip": "127.0.0.1",
    "verb": "GET",
    "request": "/index.html",
    "httpversion": "1.0",
    "response": "200",
    "bytes": "2326"
  }
}`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Common Grok Patterns</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left py-2 pr-4 font-medium text-slate-700 dark:text-slate-300">Pattern</th>
                    <th className="text-left py-2 font-medium text-slate-700 dark:text-slate-300">Matches</th>
                  </tr>
                </thead>
                <tbody className="text-slate-600 dark:text-slate-400">
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-4"><code className="code text-xs">%{'{'}IP{'}'}</code></td>
                    <td className="py-2">IPv4 or IPv6 address</td>
                  </tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-4"><code className="code text-xs">%{'{'}WORD{'}'}</code></td>
                    <td className="py-2">Single word (no spaces)</td>
                  </tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-4"><code className="code text-xs">%{'{'}NUMBER{'}'}</code></td>
                    <td className="py-2">Integer or decimal number</td>
                  </tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-4"><code className="code text-xs">%{'{'}TIMESTAMP_ISO8601{'}'}</code></td>
                    <td className="py-2">ISO8601 timestamp</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4"><code className="code text-xs">%{'{'}GREEDYDATA{'}'}</code></td>
                    <td className="py-2">Any characters (greedy)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Event Types</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Event types automatically categorize and classify events based on search criteria.
          When an event matches the search string, it gets tagged with the event type.
        </p>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Creating an Event Type</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              Define an event type to identify failed SSH login attempts:
            </p>
            <CodeBlock code={`POST /api/knowledge/event-types
{
  "name": "Failed SSH Login",
  "search_string": "app=sshd message~\\"Failed password\\"",
  "description": "Identifies failed SSH login attempts",
  "priority": 80,
  "enabled": true
}`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Priority System</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              Event types are evaluated in priority order (lower number = higher priority).
              This allows more specific event types to match before general ones.
            </p>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="text-center p-2 bg-red-50 dark:bg-red-900/20 rounded">
                <span className="font-mono font-bold text-red-600 dark:text-red-400">1-50</span>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Critical events</p>
              </div>
              <div className="text-center p-2 bg-amber-50 dark:bg-amber-900/20 rounded">
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">51-100</span>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Standard events</p>
              </div>
              <div className="text-center p-2 bg-green-50 dark:bg-green-900/20 rounded">
                <span className="font-mono font-bold text-green-600 dark:text-green-400">101+</span>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">Catch-all events</p>
              </div>
            </div>
          </div>

          <div className="card p-4 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
            <p className="text-amber-800 dark:text-amber-300 text-sm">
              <strong>Examples:</strong> Authentication failures, successful logins, service restarts,
              configuration changes, error conditions, security events.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Tags</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Tags let you label specific field values for quick categorization. Unlike event types,
          tags are applied to specific field-value pairs rather than search criteria.
        </p>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Creating Tags</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              Tag the sshd application as a security-related service:
            </p>
            <CodeBlock code={`POST /api/knowledge/tags
{
  "tag_name": "security",
  "field": "app_name",
  "value": "sshd"
}

# Tag multiple applications with the same tag
POST /api/knowledge/tags
{
  "tag_name": "security",
  "field": "app_name",
  "value": "pam_unix"
}`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Querying Tags</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              Find all tags applied to a specific field value:
            </p>
            <CodeBlock code={`GET /api/knowledge/tags/by-value?field=app_name&value=sshd

Response:
[
  {
    "id": "uuid",
    "tag_name": "security",
    "field": "app_name",
    "value": "sshd",
    "created_at": "2025-01-15T10:30:00Z"
  }
]`} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Saved Searches</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Save frequently used queries for quick access. Saved searches can be shared
          across dashboards and used as the basis for alerts.
        </p>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Creating a Saved Search</h3>
            <CodeBlock code={`POST /api/search/saved
{
  "name": "Failed Logins Last Hour",
  "query": "search app_name=sshd message~\\"Failed\\" | stats count by source_ip | sort desc count",
  "description": "Shows failed SSH login attempts grouped by source IP"
}`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Managing Saved Searches</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left py-2 pr-4 font-medium text-slate-700 dark:text-slate-300">Endpoint</th>
                    <th className="text-left py-2 font-medium text-slate-700 dark:text-slate-300">Description</th>
                  </tr>
                </thead>
                <tbody className="text-slate-600 dark:text-slate-400">
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-4"><code className="code text-xs">GET /api/search/saved</code></td>
                    <td className="py-2">List all saved searches</td>
                  </tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-4"><code className="code text-xs">GET /api/search/saved/:id</code></td>
                    <td className="py-2">Get a specific saved search</td>
                  </tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-4"><code className="code text-xs">PUT /api/search/saved/:id</code></td>
                    <td className="py-2">Update a saved search</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4"><code className="code text-xs">DELETE /api/search/saved/:id</code></td>
                    <td className="py-2">Delete a saved search</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Workflow Actions</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Workflow actions define custom actions that can be triggered from search results.
          When you click on a field value in search results, these actions become available.
        </p>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Action Types</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <h4 className="font-medium text-slate-800 dark:text-slate-200 mb-1">Link Actions</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Open external URLs with field values substituted into the URL.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-slate-800 dark:text-slate-200 mb-1">Search Actions</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Run a new search query with field values as parameters.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-slate-800 dark:text-slate-200 mb-1">Script Actions</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Execute custom Python scripts with field context.
                </p>
              </div>
            </div>
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Creating a Link Action</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              Check an IP address on VirusTotal:
            </p>
            <CodeBlock code={`POST /api/knowledge/workflow-actions
{
  "name": "Search IP in VirusTotal",
  "label": "Check VirusTotal",
  "field": "source_ip",
  "action_type": "link",
  "action_value": "https://www.virustotal.com/gui/ip-address/$source_ip$",
  "enabled": true
}`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Creating a Search Action</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              Find related events by username:
            </p>
            <CodeBlock code={`POST /api/knowledge/workflow-actions
{
  "name": "Find User Activity",
  "label": "Search User Events",
  "field": "username",
  "action_type": "search",
  "action_value": "search user=$username$ | stats count by hostname, app_name",
  "enabled": true
}`} />
          </div>

          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Variable Substitution</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
              Use <code className="code">$field_name$</code> syntax to insert field values:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left py-2 pr-4 font-medium text-slate-700 dark:text-slate-300">Variable</th>
                    <th className="text-left py-2 font-medium text-slate-700 dark:text-slate-300">Description</th>
                  </tr>
                </thead>
                <tbody className="text-slate-600 dark:text-slate-400">
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-4"><code className="code text-xs">$value$</code></td>
                    <td className="py-2">The value of the field the action is attached to</td>
                  </tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-4"><code className="code text-xs">$field_name$</code></td>
                    <td className="py-2">Any field from the event context (e.g., $source_ip$, $hostname$)</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4"><code className="code text-xs">$timestamp$</code></td>
                    <td className="py-2">The event timestamp</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">API Reference</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Complete API endpoints for managing knowledge objects:
        </p>

        <div className="overflow-x-auto">
          <table className="table card dark:bg-slate-800">
            <thead>
              <tr>
                <th>Category</th>
                <th>Base Path</th>
                <th>Operations</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Lookups</td>
                <td><code className="code text-xs">/api/knowledge/lookups</code></td>
                <td>GET, POST, PUT, DELETE, search</td>
              </tr>
              <tr>
                <td>Field Extractions</td>
                <td><code className="code text-xs">/api/knowledge/field-extractions</code></td>
                <td>GET, POST, PUT, DELETE, test</td>
              </tr>
              <tr>
                <td>Event Types</td>
                <td><code className="code text-xs">/api/knowledge/event-types</code></td>
                <td>GET, POST, PUT, DELETE</td>
              </tr>
              <tr>
                <td>Tags</td>
                <td><code className="code text-xs">/api/knowledge/tags</code></td>
                <td>GET, POST, DELETE, by-value</td>
              </tr>
              <tr>
                <td>Workflow Actions</td>
                <td><code className="code text-xs">/api/knowledge/workflow-actions</code></td>
                <td>GET, POST, PUT, DELETE, execute</td>
              </tr>
              <tr>
                <td>Saved Searches</td>
                <td><code className="code text-xs">/api/search/saved</code></td>
                <td>GET, POST, PUT, DELETE</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">Best Practices</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Naming Conventions</h3>
            <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
              <li>- Use descriptive, action-oriented names</li>
              <li>- Include the source or category in the name</li>
              <li>- Use consistent prefixes for related objects</li>
            </ul>
          </div>
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Organization</h3>
            <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
              <li>- Group related knowledge objects together</li>
              <li>- Use priority to control matching order</li>
              <li>- Document the purpose of each object</li>
            </ul>
          </div>
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Testing</h3>
            <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
              <li>- Always test field extractions before enabling</li>
              <li>- Verify lookup data is correctly formatted</li>
              <li>- Test workflow actions with sample data</li>
            </ul>
          </div>
          <div className="card p-4 dark:bg-slate-800">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Performance</h3>
            <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
              <li>- Keep lookup tables reasonably sized</li>
              <li>- Use specific source_type filters for extractions</li>
              <li>- Disable unused knowledge objects</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState<DocSection>('query');

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
          <div className="flex items-center gap-2 sm:gap-3 mb-2">
            <div className="p-1.5 sm:p-2 bg-amber-50 dark:bg-amber-900/30 rounded-lg">
              <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-900 dark:text-slate-100">Documentation</h1>
          </div>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
            Everything you need to know about using LogNog for log management.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        <SectionNav active={activeSection} onChange={setActiveSection} />

        {activeSection === 'getting-started' && <GettingStartedSection />}
        {activeSection === 'syslog-format' && <SyslogFormatSection />}
        {activeSection === 'ingestion' && <LogIngestionSection />}
        {activeSection === 'query' && <QueryLanguageSection />}
        {activeSection === 'knowledge' && <KnowledgeSection />}
        {activeSection === 'dashboards' && <DashboardsSection />}
        {activeSection === 'mcp' && <MCPSection />}
        {activeSection === 'api' && <APIReferenceSection />}
      </div>
    </div>
  );
}
