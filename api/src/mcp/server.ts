/**
 * LogNog MCP Server
 *
 * Model Context Protocol server that exposes LogNog's log management
 * capabilities to Claude and other MCP-compatible clients.
 *
 * Features:
 * - Query logs using DSL
 * - Create/update dashboards
 * - Manage alerts and silences
 * - Generate reports
 * - Ingest logs
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { executeDSLQuery, insertLogs } from '../db/backend.js';
import { getSQLiteDB } from '../db/sqlite.js';

// Server instance
let server: Server;

/**
 * Initialize the MCP server with all resources and tools
 */
export function createMCPServer(): Server {
  server = new Server(
    {
      name: 'lognog-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  // Register resource handlers
  registerResourceHandlers();

  // Register tool handlers
  registerToolHandlers();

  // Error handling
  server.onerror = (error) => {
    console.error('[MCP Error]', error);
  };

  return server;
}

/**
 * Register resource handlers for read access to LogNog data
 */
function registerResourceHandlers(): void {
  // List available resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: 'lognog://logs/recent',
          mimeType: 'application/json',
          name: 'Recent Logs',
          description: 'Most recent 100 log entries',
        },
        {
          uri: 'lognog://dashboards',
          mimeType: 'application/json',
          name: 'Dashboards',
          description: 'All dashboard configurations',
        },
        {
          uri: 'lognog://alerts',
          mimeType: 'application/json',
          name: 'Alerts',
          description: 'All alert rules',
        },
        {
          uri: 'lognog://silences',
          mimeType: 'application/json',
          name: 'Silences',
          description: 'Active alert silences',
        },
        {
          uri: 'lognog://stats',
          mimeType: 'application/json',
          name: 'Statistics',
          description: 'System statistics and metrics',
        },
        {
          uri: 'lognog://templates',
          mimeType: 'application/json',
          name: 'Templates',
          description: 'Log source templates',
        },
        {
          uri: 'lognog://saved-searches',
          mimeType: 'application/json',
          name: 'Saved Searches',
          description: 'Saved search queries',
        },
      ],
    };
  });

  // Read specific resources
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const db = getSQLiteDB();

    try {
      if (uri === 'lognog://logs/recent') {
        const { results } = await executeDSLQuery('search * | limit 100', {
          earliest: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          latest: new Date().toISOString(),
        });
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      if (uri === 'lognog://dashboards') {
        const dashboards = db.prepare('SELECT * FROM dashboards').all();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(dashboards, null, 2),
            },
          ],
        };
      }

      if (uri === 'lognog://alerts') {
        const alerts = db.prepare('SELECT * FROM alerts').all();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(alerts, null, 2),
            },
          ],
        };
      }

      if (uri === 'lognog://silences') {
        const silences = db.prepare('SELECT * FROM silences WHERE expires_at > datetime(\'now\')').all();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(silences, null, 2),
            },
          ],
        };
      }

      if (uri === 'lognog://stats') {
        const { results } = await executeDSLQuery('search * | stats count', {
          earliest: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          latest: new Date().toISOString(),
        });
        const dashboardCount = db.prepare('SELECT COUNT(*) as count FROM dashboards').get() as { count: number };
        const alertCount = db.prepare('SELECT COUNT(*) as count FROM alerts').get() as { count: number };

        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                logs_24h: results[0]?.count || 0,
                dashboards: dashboardCount.count,
                alerts: alertCount.count,
              }, null, 2),
            },
          ],
        };
      }

      if (uri === 'lognog://templates') {
        const templates = db.prepare('SELECT * FROM templates').all();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(templates, null, 2),
            },
          ],
        };
      }

      if (uri === 'lognog://saved-searches') {
        const searches = db.prepare('SELECT * FROM saved_searches').all();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(searches, null, 2),
            },
          ],
        };
      }

      // Handle dynamic resource URIs (e.g., lognog://dashboards/123)
      const dashboardMatch = uri.match(/^lognog:\/\/dashboards\/(.+)$/);
      if (dashboardMatch) {
        const dashboard = db.prepare('SELECT * FROM dashboards WHERE id = ?').get(dashboardMatch[1]);
        if (!dashboard) {
          throw new McpError(ErrorCode.InvalidRequest, `Dashboard not found: ${dashboardMatch[1]}`);
        }
        const panels = db.prepare('SELECT * FROM dashboard_panels WHERE dashboard_id = ?').all(dashboardMatch[1]);
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({ ...dashboard, panels }, null, 2),
            },
          ],
        };
      }

      throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`);
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, String(error));
    }
  });
}

/**
 * Register tool handlers for write operations
 */
function registerToolHandlers(): void {
  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'search_logs',
          description: 'Execute a DSL query to search logs. Returns matching log entries.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'DSL query string (e.g., "search severity<=3 | stats count by hostname")',
              },
              earliest: {
                type: 'string',
                description: 'Start time in ISO format (default: 24 hours ago)',
              },
              latest: {
                type: 'string',
                description: 'End time in ISO format (default: now)',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'create_dashboard',
          description: 'Create a new dashboard with optional panels',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Dashboard name',
              },
              description: {
                type: 'string',
                description: 'Dashboard description',
              },
              panels: {
                type: 'array',
                description: 'Optional array of panel configurations',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    query: { type: 'string' },
                    visualization: { type: 'string', enum: ['table', 'bar', 'pie', 'line', 'area', 'single', 'heatmap', 'gauge'] },
                  },
                  required: ['title', 'query', 'visualization'],
                },
              },
            },
            required: ['name'],
          },
        },
        {
          name: 'update_dashboard',
          description: 'Update an existing dashboard',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Dashboard ID',
              },
              name: {
                type: 'string',
                description: 'New dashboard name',
              },
              description: {
                type: 'string',
                description: 'New dashboard description',
              },
            },
            required: ['id'],
          },
        },
        {
          name: 'add_dashboard_panel',
          description: 'Add a panel to an existing dashboard',
          inputSchema: {
            type: 'object',
            properties: {
              dashboard_id: {
                type: 'string',
                description: 'Dashboard ID',
              },
              title: {
                type: 'string',
                description: 'Panel title',
              },
              query: {
                type: 'string',
                description: 'DSL query for the panel',
              },
              visualization: {
                type: 'string',
                enum: ['table', 'bar', 'pie', 'line', 'area', 'single', 'heatmap', 'gauge'],
                description: 'Visualization type',
              },
            },
            required: ['dashboard_id', 'title', 'query', 'visualization'],
          },
        },
        {
          name: 'create_alert',
          description: 'Create a new alert rule',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Alert name',
              },
              query: {
                type: 'string',
                description: 'DSL query that triggers the alert',
              },
              condition: {
                type: 'string',
                enum: ['greater_than', 'less_than', 'equals', 'not_equals'],
                description: 'Condition type',
              },
              threshold: {
                type: 'number',
                description: 'Threshold value',
              },
              schedule: {
                type: 'string',
                description: 'Cron expression (e.g., "*/5 * * * *" for every 5 minutes)',
              },
              actions: {
                type: 'array',
                description: 'Actions to take when alert fires',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['email', 'webhook', 'log'] },
                    config: { type: 'object' },
                  },
                },
              },
            },
            required: ['name', 'query', 'condition', 'threshold'],
          },
        },
        {
          name: 'silence_alert',
          description: 'Create a silence to suppress alerts',
          inputSchema: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['global', 'host', 'alert'],
                description: 'Silence type',
              },
              target: {
                type: 'string',
                description: 'Target hostname or alert ID (required for host/alert types)',
              },
              duration_minutes: {
                type: 'number',
                description: 'Duration in minutes',
              },
              reason: {
                type: 'string',
                description: 'Reason for the silence',
              },
            },
            required: ['type', 'duration_minutes'],
          },
        },
        {
          name: 'ingest_logs',
          description: 'Ingest log entries into LogNog',
          inputSchema: {
            type: 'object',
            properties: {
              logs: {
                type: 'array',
                description: 'Array of log entries',
                items: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    hostname: { type: 'string' },
                    app_name: { type: 'string' },
                    severity: { type: 'number' },
                  },
                  required: ['message'],
                },
              },
            },
            required: ['logs'],
          },
        },
        {
          name: 'generate_report',
          description: 'Generate a report from a dashboard or query',
          inputSchema: {
            type: 'object',
            properties: {
              dashboard_id: {
                type: 'string',
                description: 'Dashboard ID to report on',
              },
              query: {
                type: 'string',
                description: 'Or a custom DSL query',
              },
              format: {
                type: 'string',
                enum: ['html', 'json'],
                description: 'Output format',
              },
            },
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const db = getSQLiteDB();

    try {
      switch (name) {
        case 'search_logs': {
          const query = args?.query as string;
          if (!query) {
            throw new McpError(ErrorCode.InvalidParams, 'Query is required');
          }
          const earliest = (args?.earliest as string) || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const latest = (args?.latest as string) || new Date().toISOString();

          const { results, sql } = await executeDSLQuery(query, { earliest, latest });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  count: results.length,
                  results: results.slice(0, 100), // Limit to 100 results
                  metadata: { sql },
                }, null, 2),
              },
            ],
          };
        }

        case 'create_dashboard': {
          const id = `dash_${Date.now()}`;
          const name = args?.name as string;
          const description = (args?.description as string) || '';

          db.prepare(`
            INSERT INTO dashboards (id, name, description, created_at, updated_at)
            VALUES (?, ?, ?, datetime('now'), datetime('now'))
          `).run(id, name, description);

          // Add panels if provided
          const panels = args?.panels as Array<{ title: string; query: string; visualization: string }>;
          if (panels && panels.length > 0) {
            const insertPanel = db.prepare(`
              INSERT INTO dashboard_panels (id, dashboard_id, title, query, visualization, position_x, position_y, width, height)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            panels.forEach((panel, index) => {
              insertPanel.run(
                `panel_${Date.now()}_${index}`,
                id,
                panel.title,
                panel.query,
                panel.visualization,
                (index % 2) * 6, // 2 columns
                Math.floor(index / 2) * 4,
                6,
                4
              );
            });
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ success: true, dashboard_id: id, message: `Dashboard "${name}" created` }),
              },
            ],
          };
        }

        case 'update_dashboard': {
          const id = args?.id as string;
          const updates: string[] = [];
          const values: unknown[] = [];

          if (args?.name) {
            updates.push('name = ?');
            values.push(args.name);
          }
          if (args?.description) {
            updates.push('description = ?');
            values.push(args.description);
          }

          if (updates.length === 0) {
            throw new McpError(ErrorCode.InvalidParams, 'No updates provided');
          }

          updates.push("updated_at = datetime('now')");
          values.push(id);

          db.prepare(`UPDATE dashboards SET ${updates.join(', ')} WHERE id = ?`).run(...values);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ success: true, message: `Dashboard ${id} updated` }),
              },
            ],
          };
        }

        case 'add_dashboard_panel': {
          const dashboardId = args?.dashboard_id as string;
          const panelId = `panel_${Date.now()}`;

          // Get current panel count for positioning
          const panelCount = (db.prepare('SELECT COUNT(*) as count FROM dashboard_panels WHERE dashboard_id = ?').get(dashboardId) as { count: number }).count;

          db.prepare(`
            INSERT INTO dashboard_panels (id, dashboard_id, title, query, visualization, position_x, position_y, width, height)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            panelId,
            dashboardId,
            args?.title,
            args?.query,
            args?.visualization,
            (panelCount % 2) * 6,
            Math.floor(panelCount / 2) * 4,
            6,
            4
          );

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ success: true, panel_id: panelId, message: 'Panel added' }),
              },
            ],
          };
        }

        case 'create_alert': {
          const id = `alert_${Date.now()}`;

          db.prepare(`
            INSERT INTO alerts (id, name, query, condition_type, threshold, schedule, enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
          `).run(
            id,
            args?.name,
            args?.query,
            args?.condition,
            args?.threshold,
            args?.schedule || '*/5 * * * *'
          );

          // Add actions if provided
          const actions = args?.actions as Array<{ type: string; config: object }>;
          if (actions && actions.length > 0) {
            const insertAction = db.prepare(`
              INSERT INTO alert_actions (id, alert_id, type, config)
              VALUES (?, ?, ?, ?)
            `);
            actions.forEach((action, index) => {
              insertAction.run(
                `action_${Date.now()}_${index}`,
                id,
                action.type,
                JSON.stringify(action.config || {})
              );
            });
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ success: true, alert_id: id, message: `Alert "${args?.name}" created` }),
              },
            ],
          };
        }

        case 'silence_alert': {
          const id = `silence_${Date.now()}`;
          const type = args?.type as string;
          const durationMinutes = args?.duration_minutes as number;
          const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

          db.prepare(`
            INSERT INTO silences (id, type, target, reason, expires_at, created_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
          `).run(
            id,
            type,
            args?.target || null,
            args?.reason || '',
            expiresAt
          );

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ success: true, silence_id: id, expires_at: expiresAt }),
              },
            ],
          };
        }

        case 'ingest_logs': {
          const logs = args?.logs as Array<{ message: string; hostname?: string; app_name?: string; severity?: number }>;
          if (!logs || logs.length === 0) {
            throw new McpError(ErrorCode.InvalidParams, 'Logs array is required');
          }

          const formattedLogs = logs.map(log => ({
            timestamp: new Date().toISOString(),
            hostname: log.hostname || 'mcp-client',
            app_name: log.app_name || 'mcp',
            severity: log.severity ?? 6, // INFO by default
            facility: 1,
            message: log.message,
            raw: log.message,
            structured_data: {},
            source_ip: '127.0.0.1',
          }));

          await insertLogs(formattedLogs);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ success: true, count: logs.length, message: `${logs.length} logs ingested` }),
              },
            ],
          };
        }

        case 'generate_report': {
          const dashboardId = args?.dashboard_id as string;
          const query = args?.query as string;
          const format = (args?.format as string) || 'json';

          let reportData: unknown;

          if (dashboardId) {
            const dashboard = db.prepare('SELECT * FROM dashboards WHERE id = ?').get(dashboardId);
            const panels = db.prepare('SELECT * FROM dashboard_panels WHERE dashboard_id = ?').all(dashboardId);

            // Execute each panel's query
            const panelResults = await Promise.all(
              (panels as Array<{ id: string; title: string; query: string }>).map(async (panel) => {
                const { results } = await executeDSLQuery(panel.query, {
                  earliest: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                  latest: new Date().toISOString(),
                });
                return { panel_id: panel.id, title: panel.title, results };
              })
            );

            reportData = { dashboard, panels: panelResults, generated_at: new Date().toISOString() };
          } else if (query) {
            const { results } = await executeDSLQuery(query, {
              earliest: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
              latest: new Date().toISOString(),
            });
            reportData = { query, results, generated_at: new Date().toISOString() };
          } else {
            throw new McpError(ErrorCode.InvalidParams, 'Either dashboard_id or query is required');
          }

          return {
            content: [
              {
                type: 'text',
                text: format === 'json' ? JSON.stringify(reportData, null, 2) : generateHTMLReport(reportData),
              },
            ],
          };
        }

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, String(error));
    }
  });
}

/**
 * Generate a simple HTML report
 */
function generateHTMLReport(data: unknown): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>LogNog Report</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 20px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f4f4f4; }
  </style>
</head>
<body>
  <h1>LogNog Report</h1>
  <p>Generated: ${new Date().toISOString()}</p>
  <pre>${JSON.stringify(data, null, 2)}</pre>
</body>
</html>`;
}

/**
 * Start the MCP server in stdio mode
 */
export async function startMCPServer(): Promise<void> {
  const mcpServer = createMCPServer();
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error('LogNog MCP server started in stdio mode');
}

export { server };
