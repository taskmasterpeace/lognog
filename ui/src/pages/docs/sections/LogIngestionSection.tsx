import CodeBlock from '../components/CodeBlock';

export default function LogIngestionSection() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Sending Logs to LogNog</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          LogNog supports multiple ingestion methods to accommodate different log sources and use cases.
          Choose the method that best fits your infrastructure.
        </p>

        <div className="overflow-x-auto mb-6">
          <table className="table card dark:bg-nog-800">
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
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Syslog Ingestion</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          LogNog accepts syslog messages on port 514 via both UDP and TCP. This is the simplest way to send logs
          from network devices, servers, and applications that support syslog output.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">UDP Syslog (Recommended)</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-3">
              Fast, fire-and-forget delivery. Best for high-volume logging where occasional message loss is acceptable.
            </p>
            <CodeBlock code={`# Send a test message via UDP
echo "<14>Test message from LogNog" | nc -u localhost 514

# With timestamp and hostname
echo "<14>$(date +"%b %d %H:%M:%S") myhost myapp[1234]: Test log" | nc -u localhost 514`} />
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">TCP Syslog</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-3">
              Reliable delivery with connection-oriented protocol. Use when you need guaranteed delivery.
            </p>
            <CodeBlock code={`# Send a test message via TCP
echo "<14>Test message from LogNog" | nc localhost 514

# Using logger command
logger -n localhost -P 514 -T "Test message from logger"`} />
          </div>
        </div>

        <div className="card p-4 dark:bg-nog-800 mb-4">
          <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Configure rsyslog to Forward Logs</h3>
          <p className="text-sm text-nog-600 dark:text-nog-400 mb-3">
            Add this to your <code className="code">/etc/rsyslog.conf</code> or <code className="code">/etc/rsyslog.d/lognog.conf</code>:
          </p>
          <CodeBlock code={`# Forward all logs to LogNog via UDP
*.* @lognog-server:514

# Forward all logs to LogNog via TCP
*.* @@lognog-server:514

# Forward only auth logs
auth,authpriv.* @lognog-server:514`} />
        </div>

        <div className="card p-4 dark:bg-nog-800">
          <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Configure syslog-ng to Forward Logs</h3>
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
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">HTTP API Ingestion</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Send logs directly via HTTP POST requests. Requires an API key for authentication.
        </p>

        <div className="card p-4 bg-honey-50 border-honey-200 dark:bg-honey-900/20 dark:border-honey-800 mb-4">
          <p className="text-honey-800 dark:text-honey-300 text-sm">
            <strong>API Key Required:</strong> Generate an API key from <strong>Settings &rarr; API Keys</strong> before using HTTP ingestion endpoints.
          </p>
        </div>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Generic HTTP Endpoint</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-3">
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

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Log Entry Fields</h3>
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
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">OTLP Ingestion (OpenTelemetry)</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          LogNog supports OpenTelemetry Protocol (OTLP) for logs. This allows integration with OpenTelemetry
          collectors and instrumented applications.
        </p>

        <div className="card p-4 dark:bg-nog-800 mb-4">
          <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">OTLP HTTP Endpoint</h3>
          <p className="text-sm text-nog-600 dark:text-nog-400 mb-3">
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

        <div className="card p-4 dark:bg-nog-800">
          <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">OpenTelemetry Collector Configuration</h3>
          <p className="text-sm text-nog-600 dark:text-nog-400 mb-3">
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
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Supabase Log Drains</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Ingest logs from your Supabase projects including database, auth, storage, and edge functions.
        </p>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Setup Instructions</h3>
            <ol className="text-sm text-nog-600 dark:text-nog-400 space-y-2 list-decimal list-inside">
              <li>Go to your Supabase Dashboard &rarr; Settings &rarr; Log Drains</li>
              <li>Click "Add destination" and select "Generic HTTP"</li>
              <li>Set the URL to: <code className="code">https://your-lognog-server/api/ingest/supabase</code></li>
              <li>Add header: <code className="code">X-API-Key: your-lognog-api-key</code></li>
              <li>Save and logs will start flowing (batched, up to 250 per request)</li>
            </ol>
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Endpoint Details</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-3">
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

          <div className="card p-4 bg-honey-50 border-honey-200 dark:bg-honey-900/20 dark:border-honey-800">
            <p className="text-honey-800 dark:text-honey-300 text-sm">
              <strong>Log Types:</strong> Supabase sends logs from PostgreSQL, PostgREST, GoTrue (auth), Storage,
              Realtime, and Edge Functions - all automatically categorized by source.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Vercel Log Drains</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Stream logs from your Vercel deployments including serverless functions, edge functions, and builds.
        </p>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Setup Instructions</h3>
            <ol className="text-sm text-nog-600 dark:text-nog-400 space-y-2 list-decimal list-inside">
              <li>Go to Vercel Dashboard &rarr; Project Settings &rarr; Integrations</li>
              <li>Navigate to the Log Drains section</li>
              <li>Set the URL to: <code className="code">https://your-lognog-server/api/ingest/vercel</code></li>
              <li>Add header: <code className="code">X-API-Key: your-lognog-api-key</code></li>
              <li>Logs arrive as NDJSON in real-time (~1-2s latency)</li>
            </ol>
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Endpoint Details</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-3">
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
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">SmartThings Integration</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Collect IoT device events from Samsung SmartThings for home automation monitoring.
        </p>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Setup Instructions</h3>
            <ol className="text-sm text-nog-600 dark:text-nog-400 space-y-2 list-decimal list-inside">
              <li>Create a SmartApp in SmartThings Developer Workspace</li>
              <li>Register a Webhook SmartApp pointing to: <code className="code">https://your-lognog-server/api/ingest/smartthings</code></li>
              <li>Add header: <code className="code">X-API-Key: your-lognog-api-key</code></li>
              <li>Subscribe to device events, health events, and lifecycle events</li>
            </ol>
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Event Types Captured</h3>
            <ul className="text-sm text-nog-600 dark:text-nog-400 space-y-1 list-disc list-inside">
              <li><strong>Device events:</strong> capability.attribute = value (e.g., switch.on, temperature.72)</li>
              <li><strong>Device lifecycle:</strong> add, remove, update operations</li>
              <li><strong>Device health:</strong> online, offline, unhealthy status changes</li>
              <li><strong>Hub health:</strong> Hub connectivity and status events</li>
            </ul>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">LogNog In Agent</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          The LogNog In agent is a lightweight collector that runs on Windows, Linux, and macOS to collect
          log files, Windows Event Logs, and file integrity monitoring (FIM) events.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Features</h3>
            <ul className="text-sm text-nog-600 dark:text-nog-400 space-y-1 list-disc list-inside">
              <li>Watch directories for new log files</li>
              <li>Windows Event Log collection (Security, System, Application)</li>
              <li>File Integrity Monitoring (FIM)</li>
              <li>System tray GUI (Windows)</li>
              <li>Batched shipping (100 logs / 5 seconds)</li>
              <li>Retry with exponential backoff</li>
            </ul>
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Installation</h3>
            <CodeBlock code={`# Install from source
cd agent
pip install -e ".[dev]"

# Run the agent
python -m lognog_in

# Build Windows EXE
python build.py`} />
          </div>
        </div>

        <div className="card p-4 dark:bg-nog-800">
          <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Agent Configuration</h3>
          <p className="text-sm text-nog-600 dark:text-nog-400 mb-3">
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

        <div className="card p-4 dark:bg-nog-800">
          <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Agent API Endpoint</h3>
          <p className="text-sm text-nog-600 dark:text-nog-400 mb-3">
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
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Authentication</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          All HTTP ingestion endpoints (except syslog) require API key authentication.
        </p>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Creating an API Key</h3>
            <ol className="text-sm text-nog-600 dark:text-nog-400 space-y-2 list-decimal list-inside">
              <li>Navigate to <strong>Settings &rarr; API Keys</strong></li>
              <li>Click "Create API Key"</li>
              <li>Give it a descriptive name (e.g., "Vercel Log Drain", "Production Agent")</li>
              <li>Copy the key immediately - it won't be shown again</li>
            </ol>
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Using API Keys</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-3">
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
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Quick Reference: curl Examples</h2>
        <div className="space-y-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Send a Single Log</h3>
            <CodeBlock code={`curl -X POST http://localhost/api/ingest/http \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '[{"message": "Application started", "severity": 6, "app_name": "myapp"}]'`} />
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Send Error Log</h3>
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

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Send Batch of Logs</h3>
            <CodeBlock code={`curl -X POST http://localhost/api/ingest/http \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '[
    {"message": "Request received", "severity": 6},
    {"message": "Processing complete", "severity": 6},
    {"message": "Response sent", "severity": 6}
  ]'`} />
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Test Syslog via netcat</h3>
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
