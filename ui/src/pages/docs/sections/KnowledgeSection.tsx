import CodeBlock from '../components/CodeBlock';

export default function KnowledgeSection() {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">What are Knowledge Objects?</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Knowledge Objects are reusable components that enrich your log data and enhance your search workflows.
          They allow you to define patterns, lookups, classifications, and actions that can be applied across
          all your searches and dashboards.
        </p>

        <div className="card p-4 bg-honey-50 border-honey-200 dark:from-honey-900/20 dark:to-honey-900/20 dark:border-honey-800 mb-6">
          <p className="text-honey-800 dark:text-honey-300">
            <strong>Power Tip:</strong> Knowledge Objects are the key to transforming raw log data into
            actionable intelligence. Master them to unlock the full potential of LogNog.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Lookups</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400">
              Enrich events with external data (IP to location, user to department, etc.)
            </p>
          </div>
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Field Extractions</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400">
              Extract structured fields from unstructured log messages using patterns
            </p>
          </div>
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Event Types</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400">
              Categorize events based on search criteria for easier classification
            </p>
          </div>
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Tags</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400">
              Label field values for quick categorization and filtering
            </p>
          </div>
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Saved Searches</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400">
              Store frequently used queries for quick access and reuse
            </p>
          </div>
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Workflow Actions</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400">
              Define custom actions triggered from search results (links, scripts)
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Lookups</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Lookups are enrichment tables that add context to your log events. For example,
          you can map IP addresses to locations, usernames to departments, or error codes to descriptions.
        </p>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Lookup Types</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium text-nog-800 dark:text-nog-200 mb-1">Manual Lookups</h4>
                <p className="text-sm text-nog-600 dark:text-nog-400">
                  Store data directly in the database. Best for small, frequently updated datasets.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-nog-800 dark:text-nog-200 mb-1">CSV Lookups</h4>
                <p className="text-sm text-nog-600 dark:text-nog-400">
                  Reference external CSV files. Best for large, static datasets.
                </p>
              </div>
            </div>
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Creating a Lookup</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-3">
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

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Searching a Lookup</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-3">
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

          <div className="card p-4 bg-honey-50 border-honey-200 dark:bg-honey-900/20 dark:border-honey-800">
            <p className="text-honey-800 dark:text-honey-300 text-sm">
              <strong>Use Cases:</strong> IP geolocation, user-to-department mapping,
              asset inventory enrichment, error code descriptions, severity mappings.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Field Extractions</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Field extractions parse structured data from unstructured log messages. Define patterns
          using Grok or regular expressions to automatically extract fields like usernames, IPs,
          error codes, and more.
        </p>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Pattern Types</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium text-nog-800 dark:text-nog-200 mb-1">Grok Patterns</h4>
                <p className="text-sm text-nog-600 dark:text-nog-400 mb-2">
                  Use predefined patterns for common log formats. Easier to read and maintain.
                </p>
                <code className="code text-xs">%{'{'}COMBINEDAPACHELOG{'}'}</code>
              </div>
              <div>
                <h4 className="font-medium text-nog-800 dark:text-nog-200 mb-1">Regex Patterns</h4>
                <p className="text-sm text-nog-600 dark:text-nog-400 mb-2">
                  Use JavaScript regular expressions with named capture groups.
                </p>
                <code className="code text-xs">{'(?<username>\\w+)'}</code>
              </div>
            </div>
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Creating a Field Extraction</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-3">
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

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Testing Extractions</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-3">
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

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Common Grok Patterns</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-nog-200 dark:border-nog-700">
                    <th className="text-left py-2 pr-4 font-medium text-nog-700 dark:text-nog-300">Pattern</th>
                    <th className="text-left py-2 font-medium text-nog-700 dark:text-nog-300">Matches</th>
                  </tr>
                </thead>
                <tbody className="text-nog-600 dark:text-nog-400">
                  <tr className="border-b border-nog-100 dark:border-nog-800">
                    <td className="py-2 pr-4"><code className="code text-xs">%{'{'}IP{'}'}</code></td>
                    <td className="py-2">IPv4 or IPv6 address</td>
                  </tr>
                  <tr className="border-b border-nog-100 dark:border-nog-800">
                    <td className="py-2 pr-4"><code className="code text-xs">%{'{'}WORD{'}'}</code></td>
                    <td className="py-2">Single word (no spaces)</td>
                  </tr>
                  <tr className="border-b border-nog-100 dark:border-nog-800">
                    <td className="py-2 pr-4"><code className="code text-xs">%{'{'}NUMBER{'}'}</code></td>
                    <td className="py-2">Integer or decimal number</td>
                  </tr>
                  <tr className="border-b border-nog-100 dark:border-nog-800">
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
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Event Types</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Event types automatically categorize and classify events based on search criteria.
          When an event matches the search string, it gets tagged with the event type.
        </p>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Creating an Event Type</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-3">
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

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Priority System</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-2">
              Event types are evaluated in priority order (lower number = higher priority).
              This allows more specific event types to match before general ones.
            </p>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="text-center p-2 bg-red-50 dark:bg-red-900/20 rounded">
                <span className="font-mono font-bold text-red-600 dark:text-red-400">1-50</span>
                <p className="text-xs text-nog-600 dark:text-nog-400 mt-1">Critical events</p>
              </div>
              <div className="text-center p-2 bg-honey-50 dark:bg-honey-900/20 rounded">
                <span className="font-mono font-bold text-honey-600 dark:text-honey-400">51-100</span>
                <p className="text-xs text-nog-600 dark:text-nog-400 mt-1">Standard events</p>
              </div>
              <div className="text-center p-2 bg-green-50 dark:bg-green-900/20 rounded">
                <span className="font-mono font-bold text-green-600 dark:text-green-400">101+</span>
                <p className="text-xs text-nog-600 dark:text-nog-400 mt-1">Catch-all events</p>
              </div>
            </div>
          </div>

          <div className="card p-4 bg-honey-50 border-honey-200 dark:bg-honey-900/20 dark:border-honey-800">
            <p className="text-honey-800 dark:text-honey-300 text-sm">
              <strong>Examples:</strong> Authentication failures, successful logins, service restarts,
              configuration changes, error conditions, security events.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Tags</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Tags let you label specific field values for quick categorization. Unlike event types,
          tags are applied to specific field-value pairs rather than search criteria.
        </p>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Creating Tags</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-3">
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

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Querying Tags</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-3">
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
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Saved Searches</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Save frequently used queries for quick access. Saved searches can be shared
          across dashboards and used as the basis for alerts.
        </p>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Creating a Saved Search</h3>
            <CodeBlock code={`POST /api/search/saved
{
  "name": "Failed Logins Last Hour",
  "query": "search app_name=sshd message~\\"Failed\\" | stats count by source_ip | sort desc count",
  "description": "Shows failed SSH login attempts grouped by source IP"
}`} />
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Managing Saved Searches</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-nog-200 dark:border-nog-700">
                    <th className="text-left py-2 pr-4 font-medium text-nog-700 dark:text-nog-300">Endpoint</th>
                    <th className="text-left py-2 font-medium text-nog-700 dark:text-nog-300">Description</th>
                  </tr>
                </thead>
                <tbody className="text-nog-600 dark:text-nog-400">
                  <tr className="border-b border-nog-100 dark:border-nog-800">
                    <td className="py-2 pr-4"><code className="code text-xs">GET /api/search/saved</code></td>
                    <td className="py-2">List all saved searches</td>
                  </tr>
                  <tr className="border-b border-nog-100 dark:border-nog-800">
                    <td className="py-2 pr-4"><code className="code text-xs">GET /api/search/saved/:id</code></td>
                    <td className="py-2">Get a specific saved search</td>
                  </tr>
                  <tr className="border-b border-nog-100 dark:border-nog-800">
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
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Workflow Actions</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Workflow actions define custom actions that can be triggered from search results.
          When you click on a field value in search results, these actions become available.
        </p>

        <div className="space-y-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Action Types</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <h4 className="font-medium text-nog-800 dark:text-nog-200 mb-1">Link Actions</h4>
                <p className="text-sm text-nog-600 dark:text-nog-400">
                  Open external URLs with field values substituted into the URL.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-nog-800 dark:text-nog-200 mb-1">Search Actions</h4>
                <p className="text-sm text-nog-600 dark:text-nog-400">
                  Run a new search query with field values as parameters.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-nog-800 dark:text-nog-200 mb-1">Script Actions</h4>
                <p className="text-sm text-nog-600 dark:text-nog-400">
                  Execute custom Python scripts with field context.
                </p>
              </div>
            </div>
          </div>

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Creating a Link Action</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-3">
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

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Creating a Search Action</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-3">
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

          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Variable Substitution</h3>
            <p className="text-sm text-nog-600 dark:text-nog-400 mb-3">
              Use <code className="code">$field_name$</code> syntax to insert field values:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-nog-200 dark:border-nog-700">
                    <th className="text-left py-2 pr-4 font-medium text-nog-700 dark:text-nog-300">Variable</th>
                    <th className="text-left py-2 font-medium text-nog-700 dark:text-nog-300">Description</th>
                  </tr>
                </thead>
                <tbody className="text-nog-600 dark:text-nog-400">
                  <tr className="border-b border-nog-100 dark:border-nog-800">
                    <td className="py-2 pr-4"><code className="code text-xs">$value$</code></td>
                    <td className="py-2">The value of the field the action is attached to</td>
                  </tr>
                  <tr className="border-b border-nog-100 dark:border-nog-800">
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
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">API Reference</h2>
        <p className="text-nog-600 dark:text-nog-400 mb-4">
          Complete API endpoints for managing knowledge objects:
        </p>

        <div className="overflow-x-auto">
          <table className="table card dark:bg-nog-800">
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
        <h2 className="text-2xl font-bold text-nog-900 dark:text-nog-100 mb-4">Best Practices</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Naming Conventions</h3>
            <ul className="text-sm text-nog-600 dark:text-nog-400 space-y-1">
              <li>- Use descriptive, action-oriented names</li>
              <li>- Include the source or category in the name</li>
              <li>- Use consistent prefixes for related objects</li>
            </ul>
          </div>
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Organization</h3>
            <ul className="text-sm text-nog-600 dark:text-nog-400 space-y-1">
              <li>- Group related knowledge objects together</li>
              <li>- Use priority to control matching order</li>
              <li>- Document the purpose of each object</li>
            </ul>
          </div>
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Testing</h3>
            <ul className="text-sm text-nog-600 dark:text-nog-400 space-y-1">
              <li>- Always test field extractions before enabling</li>
              <li>- Verify lookup data is correctly formatted</li>
              <li>- Test workflow actions with sample data</li>
            </ul>
          </div>
          <div className="card p-4 dark:bg-nog-800">
            <h3 className="font-semibold text-nog-900 dark:text-nog-100 mb-2">Performance</h3>
            <ul className="text-sm text-nog-600 dark:text-nog-400 space-y-1">
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
