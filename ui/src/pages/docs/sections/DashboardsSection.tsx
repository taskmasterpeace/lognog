import { ChevronRight } from 'lucide-react';
import CodeBlock from '../components/CodeBlock';

export default function DashboardsSection() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Dashboards Overview</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Dashboards transform raw log data into actionable insights. Create visualizations,
          track metrics, and monitor your systems in real-time.
        </p>

        <div className="card p-4 bg-honey-50 border-honey-200 dark:from-honey-900/20 dark:to-honey-900/20 dark:border-honey-800 mb-6">
          <p className="text-honey-800 dark:text-honey-300">
            <strong>The 5-Second Rule:</strong> If someone cannot understand a panel's message within 5 seconds,
            it is too complicated. Simplify your visualizations for maximum impact.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Creating a Dashboard</h2>
        <div className="space-y-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">1. Create New Dashboard</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-2">
              Navigate to <strong>Dashboards</strong> in the sidebar and click <strong>New Dashboard</strong>.
              Enter a name and optional description.
            </p>
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">2. Add Panels</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-2">
              Click <strong>Add Panel</strong> to create visualizations. Each panel needs a title, query, and visualization type.
            </p>
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">3. Arrange Layout</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-2">
              Use <strong>Edit Layout</strong> mode to drag and resize panels. The dashboard uses a 12-column grid.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Panel Types</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Choose the right visualization for your data:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 flex items-center gap-2 mb-2">
              <span className="w-2 h-2 bg-honey-500 rounded-full"></span>
              Table
            </h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-2">
              Display detailed data in rows and columns. Best for raw logs and detailed breakdowns.
            </p>
            <CodeBlock code={`search severity<=3
  | sort desc timestamp
  | table timestamp hostname message
  | limit 50`} />
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 flex items-center gap-2 mb-2">
              <span className="w-2 h-2 bg-honey-500 rounded-full"></span>
              Bar Chart
            </h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-2">
              Compare values across categories. Great for top-N lists and comparisons.
            </p>
            <CodeBlock code={`search *
  | stats count by hostname
  | sort desc count
  | limit 10`} />
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 flex items-center gap-2 mb-2">
              <span className="w-2 h-2 bg-honey-500 rounded-full"></span>
              Pie Chart
            </h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-2">
              Show distribution and proportions. Ideal for severity breakdowns.
            </p>
            <CodeBlock code={`search *
  | stats count by severity`} />
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 flex items-center gap-2 mb-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              Area Chart (Line)
            </h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-2">
              Display trends over time. Perfect for time-series data.
            </p>
            <CodeBlock code={`search *
  | timechart span=1h count`} />
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 flex items-center gap-2 mb-2">
              <span className="w-2 h-2 bg-red-500 rounded-full"></span>
              Single Stat
            </h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-2">
              Display one important number prominently. Great for KPIs.
            </p>
            <CodeBlock code={`search severity<=3 | stats count`} />
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 flex items-center gap-2 mb-2">
              <span className="w-2 h-2 bg-honey-500 rounded-full"></span>
              Gauge
            </h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-2">
              Display a metric with visual thresholds. Shows status at a glance.
            </p>
            <CodeBlock code={`search * | stats count`} />
          </div>

          <div className="card p-4 dark:bg-nog-800 md:col-span-2">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 flex items-center gap-2 mb-2">
              <span className="w-2 h-2 bg-honey-500 rounded-full"></span>
              Heatmap
            </h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-2">
              Visualize patterns in 2D data. Perfect for time-of-day activity patterns.
            </p>
            <CodeBlock code={`search * | stats count by hour(timestamp) day(timestamp)`} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Time Range Controls</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Control the time window for all panels in your dashboard:
        </p>

        <div className="overflow-x-auto">
          <table className="table card dark:bg-nog-800">
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

        <div className="card p-4 bg-honey-50 border-honey-200 dark:bg-honey-900/20 dark:border-honey-800 mt-4">
          <p className="text-honey-800 dark:text-honey-300 text-sm">
            <strong>Auto-Refresh:</strong> Enable auto-refresh (30 seconds to 5 minutes) for real-time
            monitoring dashboards. Disable for investigation dashboards.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Dashboard Variables</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Variables make dashboards dynamic and reusable. Add dropdown filters that apply to all panels.
        </p>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Variable Types</h3>
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

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Using Variables in Queries</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-2">
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

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Query-Based Variables</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-2">
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
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Drag-and-Drop Layout</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Arrange panels with the visual editor:
        </p>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Entering Edit Mode</h3>
            <ol className="text-sm text-nog-600 dark:text-nog-400 space-y-1 list-decimal list-inside">
              <li>Open a dashboard</li>
              <li>Click the Settings dropdown (gear icon)</li>
              <li>Select <strong>Edit Layout</strong></li>
              <li>A yellow banner confirms edit mode is active</li>
            </ol>
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Layout Grid</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-2">
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
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Sharing and Exporting</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Public Sharing</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-2">
              Share dashboards publicly without requiring login:
            </p>
            <ol className="text-sm text-nog-600 dark:text-nog-400 space-y-1 list-decimal list-inside">
              <li>Open Settings dropdown</li>
              <li>Click <strong>Share</strong></li>
              <li>Toggle <strong>Enable Public Sharing</strong></li>
              <li>Copy the public URL</li>
            </ol>
            <p className="text-xs text-nog-500 dark:text-nog-400 mt-2">
              Great for NOC status boards and team dashboards.
            </p>
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Export Dashboard</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-2">
              Export dashboards as JSON for backup or sharing:
            </p>
            <ol className="text-sm text-nog-600 dark:text-nog-400 space-y-1 list-decimal list-inside">
              <li>Open Settings dropdown</li>
              <li>Click <strong>Export</strong></li>
              <li>Save the JSON file</li>
            </ol>
            <p className="text-xs text-nog-500 dark:text-nog-400 mt-2">
              Import via the Dashboards page.
            </p>
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Branding</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-2">
              Customize dashboards with your own branding:
            </p>
            <ul className="text-sm text-nog-600 dark:text-nog-400 space-y-1 list-disc list-inside">
              <li>Custom logo (120x120px recommended)</li>
              <li>Accent color</li>
              <li>Header background color</li>
              <li>Description text</li>
            </ul>
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Duplicate Dashboard</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-2">
              Create a copy of any dashboard:
            </p>
            <ol className="text-sm text-nog-600 dark:text-nog-400 space-y-1 list-decimal list-inside">
              <li>Open Settings dropdown</li>
              <li>Click <strong>Duplicate</strong></li>
              <li>New dashboard opens automatically</li>
            </ol>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Click-to-Drilldown</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Click any chart element to navigate to a filtered search:
        </p>

        <div className="overflow-x-auto">
          <table className="table card dark:bg-nog-800">
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
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">AI Insights (Ollama)</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Enable AI-powered insights for your dashboards using a local Ollama instance:
        </p>

        <div className="card p-4 dark:bg-nog-800">
          <ol className="text-sm text-nog-600 dark:text-nog-400 space-y-2 list-decimal list-inside">
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
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Best Practices</h2>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Layout Guidelines</h3>
            <ul className="text-sm text-nog-600 dark:text-nog-400 space-y-2">
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-honey-500 mt-0.5 flex-shrink-0" />
                <span>Place most important metrics at top-left (users scan in F-pattern)</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-honey-500 mt-0.5 flex-shrink-0" />
                <span>Use gauges and stats for KPIs in the top row</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-honey-500 mt-0.5 flex-shrink-0" />
                <span>Put time series charts full-width below the KPIs</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-honey-500 mt-0.5 flex-shrink-0" />
                <span>Detail tables go at the bottom</span>
              </li>
            </ul>
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Query Optimization</h3>
            <ul className="text-sm text-nog-600 dark:text-nog-400 space-y-2">
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-honey-500 mt-0.5 flex-shrink-0" />
                <span>Always use <code className="code">limit</code> for bar charts and tables</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-honey-500 mt-0.5 flex-shrink-0" />
                <span>Put filters in <code className="code">search</code>, not <code className="code">filter</code></span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-honey-500 mt-0.5 flex-shrink-0" />
                <span>Use shorter time ranges for real-time dashboards</span>
              </li>
              <li className="flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-honey-500 mt-0.5 flex-shrink-0" />
                <span>Pre-aggregate data with <code className="code">stats</code> before sorting</span>
              </li>
            </ul>
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Color Guidelines</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                <span className="text-nog-600 dark:text-nog-400">Green: Good, healthy</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 bg-honey-500 rounded-full"></span>
                <span className="text-nog-600 dark:text-nog-400">Yellow: Warning</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                <span className="text-nog-600 dark:text-nog-400">Red: Error, critical</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 bg-honey-500 rounded-full"></span>
                <span className="text-nog-600 dark:text-nog-400">Blue: Information</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 bg-honey-500 rounded-full"></span>
                <span className="text-nog-600 dark:text-nog-400">Purple: Distinct</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 bg-nog-500 rounded-full"></span>
                <span className="text-nog-600 dark:text-nog-400">Gray: Secondary</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Example Dashboard Layout</h2>
        <div className="card p-4 bg-nog-50 dark:bg-nog-800/50">
          <pre className="text-sm text-nog-600 dark:text-nog-300 overflow-x-auto">{`
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
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Quick Reference Queries</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Gauge Panels</h3>
            <CodeBlock code={`# Error count
search severity<=3 | stats count

# Unique hosts
search * | stats dc(hostname)

# Active connections
search action=accept | stats count`} />
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Bar Charts</h3>
            <CodeBlock code={`# Top hosts by volume
search *
  | stats count by hostname
  | sort desc count
  | limit 10`} />
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Time Series</h3>
            <CodeBlock code={`# Log volume over time
search *
  | timechart span=1h count

# Multiple series
search *
  | timechart span=1h count by hostname`} />
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Tables</h3>
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
