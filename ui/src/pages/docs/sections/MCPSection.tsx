import CodeBlock from '../components/CodeBlock';

export default function MCPSection() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Claude Desktop Integration (MCP)</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Connect LogNog to Claude Desktop for AI-powered log management. Ask Claude to search your logs,
          create dashboards, set up alerts, and more using natural language.
        </p>

        <div className="card p-4 bg-honey-50 border-honey-200 dark:from-honey-900/20 dark:to-honey-900/20 dark:border-honey-800 mb-6">
          <p className="text-honey-800 dark:text-honey-300">
            <strong>Model Context Protocol (MCP)</strong> is an open standard that allows AI assistants like Claude
            to securely interact with external tools and data sources - all while keeping your data on your own infrastructure.
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Quick Start</h2>
        <div className="space-y-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">1. Generate an API Key</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-2">
              Go to <strong>Settings → API Keys</strong> and create a new key for Claude Desktop.
            </p>
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">2. Configure Claude Desktop</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-2">
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
            <p className="text-xs text-nog-500 dark:text-nog-400 mt-2">
              <strong>macOS:</strong> ~/Library/Application Support/Claude/claude_desktop_config.json<br />
              <strong>Windows:</strong> %APPDATA%\Claude\claude_desktop_config.json
            </p>
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">3. Restart Claude Desktop</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400">
              Close and reopen Claude Desktop. You should see LogNog in the MCP servers list.
            </p>
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">4. Start Chatting!</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-2">Try these example prompts:</p>
            <ul className="text-sm text-nog-600 dark:text-nog-400 space-y-1">
              <li>• "Show me error logs from the last hour"</li>
              <li>• "Create a dashboard for nginx traffic"</li>
              <li>• "Set up an alert for failed SSH logins"</li>
              <li>• "What are the top 10 hosts by log volume?"</li>
            </ul>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Available Tools</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Claude can use these tools to interact with LogNog:
        </p>

        <div className="overflow-x-auto">
          <table className="table card dark:bg-nog-800">
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
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Available Resources</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Claude can read these resources from LogNog:
        </p>

        <div className="overflow-x-auto">
          <table className="table card dark:bg-nog-800">
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
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Example Conversations</h2>
        <div className="space-y-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Investigating an Issue</h3>
            <div className="space-y-2 text-sm">
              <p className="text-nog-600 dark:text-nog-400">
                <strong>You:</strong> "I'm seeing slow response times. Can you check the logs for any errors in the last 30 minutes?"
              </p>
              <p className="text-nog-600 dark:text-nog-400">
                <strong>Claude:</strong> <em>Searches logs for severity ≤ 3 in the last 30 minutes, summarizes findings</em>
              </p>
              <p className="text-nog-600 dark:text-nog-400">
                <strong>You:</strong> "Create a dashboard so I can monitor this going forward"
              </p>
              <p className="text-nog-600 dark:text-nog-400">
                <strong>Claude:</strong> <em>Creates a dashboard with relevant panels for monitoring</em>
              </p>
            </div>
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Setting Up Alerting</h3>
            <div className="space-y-2 text-sm">
              <p className="text-nog-600 dark:text-nog-400">
                <strong>You:</strong> "Set up an alert for when there are more than 10 failed SSH logins from the same IP in 5 minutes"
              </p>
              <p className="text-nog-600 dark:text-nog-400">
                <strong>Claude:</strong> <em>Creates an alert with the appropriate DSL query and threshold</em>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">API Endpoints</h2>
        <div className="overflow-x-auto">
          <table className="table card dark:bg-nog-800">
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
        <div className="card p-4 bg-honey-50 border-honey-200 dark:bg-honey-900/20 dark:border-honey-800">
          <p className="text-honey-800 dark:text-honey-300 text-sm">
            <strong>Full Documentation:</strong> For more details, troubleshooting, and advanced configuration,
            see the <a href="https://github.com/machinekinglabs/lognog/blob/main/docs/MCP-INTEGRATION.md" className="underline hover:no-underline" target="_blank" rel="noopener noreferrer">MCP Integration Guide</a> on GitHub.
          </p>
        </div>
      </section>
    </div>
  );
}
