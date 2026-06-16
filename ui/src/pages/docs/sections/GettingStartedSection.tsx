import CodeBlock from '../components/CodeBlock';

export default function GettingStartedSection() {
  return (
    <div className="space-y-6 sm:space-y-8">
      <section>
        <h2 className="text-xl sm:text-2xl font-bold text-nog-900 dark:text-nog-100 mb-3 sm:mb-4">Quick Start</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Get LogNog running in under 10 minutes with Docker Compose.
        </p>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">1. Clone and Start</h3>
            <CodeBlock code={`git clone https://github.com/machinekinglabs/lognog.git
cd lognog
docker-compose up -d`} />
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">2. Access the UI</h3>
            <p className="text-nog-600 dark:text-nog-400 mb-2">
              Open <code className="code">http://localhost</code> in your browser.
            </p>
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">3. Send Test Logs</h3>
            <CodeBlock code={`# Send a test syslog message
echo "<14>$(date) myhost myapp[1234]: Test log message" | nc -u localhost 514`} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Architecture</h2>
        <div className="card p-6 bg-nog-50 dark:bg-nog-800/50">
          <pre className="text-sm text-nog-600 dark:text-nog-300 overflow-x-auto">{`
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
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Ports Reference</h2>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-nog-800">
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
