import CodeBlock from '../components/CodeBlock';

export default function APIReferenceSection() {
  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Overview */}
      <section>
        <h2 className="text-xl sm:text-2xl font-bold text-nog-900 dark:text-nog-100 mb-3 sm:mb-4">API Overview</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          LogNog provides a RESTful API for all operations. All endpoints are prefixed with <code className="code">/api</code>.
        </p>
        <div className="card p-4 bg-honey-50 border-honey-200 dark:bg-honey-900/20 dark:border-honey-800 mb-4">
          <p className="text-honey-800 dark:text-honey-300 text-sm">
            <strong>Base URL:</strong> <code className="bg-honey-100 dark:bg-honey-900 px-2 py-0.5 rounded">http://localhost/api</code> (or your LogNog server address)
          </p>
        </div>
      </section>

      {/* Authentication */}
      <section>
        <h2 className="text-xl font-bold text-nog-900 dark:text-nog-100 mb-4">Authentication</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          LogNog uses JWT tokens for user authentication and API keys for programmatic access.
        </p>
        <div className="space-y-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">JWT Token Authentication</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-2">For UI/interactive sessions</p>
            <CodeBlock code={`Authorization: Bearer <jwt_token>`} />
          </div>
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">API Key Authentication</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-2">For agents and integrations</p>
            <CodeBlock code={`X-API-Key: <your_api_key>
# OR
Authorization: Bearer <your_api_key>`} />
          </div>
        </div>
        <div className="overflow-x-auto mt-4">
          <table className="table card dark:bg-nog-800">
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
        <div className="card p-4 dark:bg-nog-800 mt-4">
          <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Login Example</h3>
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
        <h2 className="text-xl font-bold text-nog-900 dark:text-nog-100 mb-4">Search API</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">Execute DSL queries and manage saved searches.</p>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-nog-800">
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
        <div className="card p-4 dark:bg-nog-800 mt-4">
          <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Query Example</h3>
          <CodeBlock code={`curl -X POST http://localhost/api/search/query \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <token>" \\
  -d '{"query": "search severity<=3 | stats count by app_name", "earliest": "-24h"}'`} />
        </div>
      </section>

      {/* Ingestion API */}
      <section>
        <h2 className="text-xl font-bold text-nog-900 dark:text-nog-100 mb-4">Ingestion API</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">Send logs to LogNog via HTTP. Requires API key.</p>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-nog-800">
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
        <h2 className="text-xl font-bold text-nog-900 dark:text-nog-100 mb-4">Dashboards API</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">Manage dashboards, panels, variables, and annotations.</p>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-nog-800">
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
        <h2 className="text-xl font-bold text-nog-900 dark:text-nog-100 mb-4">Alerts API</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">Create and manage alert rules with various trigger conditions.</p>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-nog-800">
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
        <h2 className="text-xl font-bold text-nog-900 dark:text-nog-100 mb-4">Silences API</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">Temporarily silence alerts at global, host, or alert level.</p>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-nog-800">
            <thead><tr><th>Endpoint</th><th>Method</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code className="code">/silences</code></td><td>GET/POST</td><td>List/create silences</td></tr>
              <tr><td><code className="code">/silences/:id</code></td><td>GET/DELETE</td><td>Get/remove silence</td></tr>
              <tr><td><code className="code">/silences/check</code></td><td>GET</td><td>Check if alert is silenced</td></tr>
              <tr><td><code className="code">/silences/cleanup</code></td><td>POST</td><td>Remove expired silences</td></tr>
            </tbody>
          </table>
        </div>
        <div className="card p-4 dark:bg-nog-800 mt-4">
          <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Silence Levels</h3>
          <ul className="text-sm text-nog-600 dark:text-nog-400 space-y-1">
            <li><strong>global</strong> - Silence all alerts</li>
            <li><strong>host</strong> - Silence alerts for specific hostname</li>
            <li><strong>alert</strong> - Silence a specific alert</li>
          </ul>
          <p className="text-xs text-nog-500 mt-2">Duration formats: 1h, 4h, 8h, 12h, 24h, 2d, 3d, 1w, indefinite</p>
        </div>
      </section>

      {/* GeoIP & IP Utils */}
      <section>
        <h2 className="text-xl font-bold text-nog-900 dark:text-nog-100 mb-4">GeoIP & IP Utilities</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">IP geolocation and classification endpoints.</p>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-nog-800">
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
        <div className="card p-4 dark:bg-nog-800 mt-4">
          <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">IP Classification Types</h3>
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
        <h2 className="text-xl font-bold text-nog-900 dark:text-nog-100 mb-4">Statistics API</h2>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-nog-800">
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
        <h2 className="text-xl font-bold text-nog-900 dark:text-nog-100 mb-4">Settings API</h2>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-nog-800">
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
        <h2 className="text-xl font-bold text-nog-900 dark:text-nog-100 mb-4">AI API</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">AI-powered features via Ollama or OpenRouter.</p>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-nog-800">
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
        <h2 className="text-xl font-bold text-nog-900 dark:text-nog-100 mb-4">Error Codes</h2>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-nog-800">
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
        <div className="card p-4 dark:bg-nog-800 mt-4">
          <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Error Response Format</h3>
          <CodeBlock code={`{
  "error": "Short error description",
  "message": "Detailed error message"
}`} />
        </div>
      </section>

      {/* Rate Limiting */}
      <section>
        <h2 className="text-xl font-bold text-nog-900 dark:text-nog-100 mb-4">Rate Limiting</h2>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-nog-800">
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
        <div className="card p-4 bg-honey-50 border-honey-200 dark:bg-honey-900/20 dark:border-honey-800 mt-4">
          <p className="text-honey-800 dark:text-honey-300 text-sm">
            <strong>Note:</strong> When rate limited, you will receive a 429 status code. Wait before retrying.
          </p>
        </div>
      </section>
    </div>
  );
}
