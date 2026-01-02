/**
 * AI Agent Tools
 *
 * Defines the tools available to AI agents for log analysis,
 * asset lookup, and security investigation.
 */

import { executeDSLQuery } from '../../db/backend.js';
import { getAssetById, getAssets, getIdentityById, getIdentities, type AssetType, type AssetStatus, type IdentityType } from '../../db/sqlite.js';
import { getAnomalies } from '../anomaly/detector.js';
import { type EntityType } from '../anomaly/baseline-calculator.js';
import { geolocate } from '../geoip.js';
import { classifyIP } from '../ip-classifier.js';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// Tool definitions for LLM function calling
export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: 'search_logs',
    description: 'Search logs using the LogNog DSL query language. Use this to find specific events, filter by fields, aggregate data, or analyze patterns.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'DSL query string (e.g., "search host=webserver severity>=warning | stats count by app")',
        },
        earliest: {
          type: 'string',
          description: 'Start time in ISO format (e.g., "2024-01-01T00:00:00Z") or relative (e.g., "-24h", "-7d")',
        },
        latest: {
          type: 'string',
          description: 'End time in ISO format or "now"',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 100)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_asset',
    description: 'Retrieve information about a specific asset (server, workstation, network device, etc.) by its ID or identifier.',
    parameters: {
      type: 'object',
      properties: {
        identifier: {
          type: 'string',
          description: 'Asset ID or identifier (hostname, IP address)',
        },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'search_assets',
    description: 'Search for assets by type, status, or other criteria.',
    parameters: {
      type: 'object',
      properties: {
        asset_type: {
          type: 'string',
          description: 'Type of asset to search for',
          enum: ['server', 'workstation', 'network_device', 'container', 'cloud_instance'],
        },
        search: {
          type: 'string',
          description: 'Search term to match against asset identifiers or names',
        },
        status: {
          type: 'string',
          description: 'Filter by asset status',
          enum: ['active', 'inactive', 'decommissioned'],
        },
      },
      required: [],
    },
  },
  {
    name: 'get_identity',
    description: 'Retrieve information about a specific identity (user, service account, etc.).',
    parameters: {
      type: 'object',
      properties: {
        identifier: {
          type: 'string',
          description: 'Identity ID or username',
        },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'search_identities',
    description: 'Search for identities by type, privilege level, or other criteria.',
    parameters: {
      type: 'object',
      properties: {
        identity_type: {
          type: 'string',
          description: 'Type of identity',
          enum: ['user', 'service_account', 'system', 'external'],
        },
        is_privileged: {
          type: 'boolean',
          description: 'Filter for privileged accounts only',
        },
        search: {
          type: 'string',
          description: 'Search term to match against usernames or display names',
        },
      },
      required: [],
    },
  },
  {
    name: 'enrich_ip',
    description: 'Get enrichment data for an IP address including geolocation, ASN, and classification (public/private/etc.).',
    parameters: {
      type: 'object',
      properties: {
        ip: {
          type: 'string',
          description: 'IP address to enrich',
        },
      },
      required: ['ip'],
    },
  },
  {
    name: 'get_anomalies',
    description: 'Retrieve recent anomaly detections for investigation.',
    parameters: {
      type: 'object',
      properties: {
        entity_type: {
          type: 'string',
          description: 'Filter by entity type',
          enum: ['user', 'host', 'ip', 'app'],
        },
        entity_id: {
          type: 'string',
          description: 'Filter by specific entity ID',
        },
        min_risk_score: {
          type: 'number',
          description: 'Minimum risk score (0-100)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of anomalies to return',
        },
      },
      required: [],
    },
  },
  {
    name: 'calculate_stats',
    description: 'Calculate statistics on log data (count, sum, avg, min, max, percentiles).',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Base search query to filter logs',
        },
        stats_expression: {
          type: 'string',
          description: 'Stats expression (e.g., "count, avg(response_time), p95(duration) by hostname")',
        },
        earliest: {
          type: 'string',
          description: 'Start time',
        },
        latest: {
          type: 'string',
          description: 'End time',
        },
      },
      required: ['query', 'stats_expression'],
    },
  },
  {
    name: 'timechart',
    description: 'Create a time-based chart/aggregation of log data.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Base search query',
        },
        span: {
          type: 'string',
          description: 'Time bucket size (e.g., "1h", "5m", "1d")',
        },
        aggregation: {
          type: 'string',
          description: 'Aggregation function (count, sum, avg)',
        },
        split_by: {
          type: 'string',
          description: 'Field to split the timechart by',
        },
        earliest: {
          type: 'string',
          description: 'Start time',
        },
        latest: {
          type: 'string',
          description: 'End time',
        },
      },
      required: ['query', 'span'],
    },
  },
];

// Parse relative time strings like "-24h", "-7d"
function parseRelativeTime(timeStr: string): string {
  if (!timeStr.startsWith('-')) {
    return timeStr;
  }

  const match = timeStr.match(/^-(\d+)([hdwm])$/);
  if (!match) {
    return timeStr;
  }

  const amount = parseInt(match[1], 10);
  const unit = match[2];
  const now = new Date();

  switch (unit) {
    case 'h':
      now.setHours(now.getHours() - amount);
      break;
    case 'd':
      now.setDate(now.getDate() - amount);
      break;
    case 'w':
      now.setDate(now.getDate() - amount * 7);
      break;
    case 'm':
      now.setMonth(now.getMonth() - amount);
      break;
  }

  return now.toISOString();
}

// Tool execution functions
export async function executeTool(
  toolName: string,
  parameters: Record<string, unknown>
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case 'search_logs': {
        const query = parameters.query as string;
        const earliest = parameters.earliest ? parseRelativeTime(parameters.earliest as string) : undefined;
        const latest = parameters.latest === 'now' ? new Date().toISOString() : parameters.latest as string | undefined;
        const limit = (parameters.limit as number) || 100;

        const fullQuery = limit ? `${query} | limit ${limit}` : query;
        const result = await executeDSLQuery(fullQuery, { earliest, latest });

        return {
          success: true,
          data: {
            count: result.results.length,
            results: result.results.slice(0, 50), // Limit results in response
            sql: result.sql,
          },
        };
      }

      case 'get_asset': {
        const identifier = parameters.identifier as string;

        // Try by ID first
        let asset = getAssetById(identifier);

        // If not found, search by identifier
        if (!asset) {
          const assets = getAssets({ search: identifier });
          if (assets.length > 0) {
            asset = assets[0];
          }
        }

        if (!asset) {
          return { success: false, error: `Asset not found: ${identifier}` };
        }

        return { success: true, data: asset };
      }

      case 'search_assets': {
        const assets = getAssets({
          asset_type: parameters.asset_type as AssetType | undefined,
          status: parameters.status as AssetStatus | undefined,
          search: parameters.search as string | undefined,
        });

        return {
          success: true,
          data: {
            count: assets.length,
            assets: assets.slice(0, 20),
          },
        };
      }

      case 'get_identity': {
        const identifier = parameters.identifier as string;

        let identity = getIdentityById(identifier);

        if (!identity) {
          const identities = getIdentities({ search: identifier });
          if (identities.length > 0) {
            identity = identities[0];
          }
        }

        if (!identity) {
          return { success: false, error: `Identity not found: ${identifier}` };
        }

        return { success: true, data: identity };
      }

      case 'search_identities': {
        const identities = getIdentities({
          identity_type: parameters.identity_type as IdentityType | undefined,
          is_privileged: parameters.is_privileged as boolean | undefined,
          search: parameters.search as string | undefined,
        });

        return {
          success: true,
          data: {
            count: identities.length,
            identities: identities.slice(0, 20),
          },
        };
      }

      case 'enrich_ip': {
        const ip = parameters.ip as string;

        // Get classification
        const classification = classifyIP(ip);

        // Get GeoIP data if available
        let geoData = null;
        try {
          geoData = await geolocate(ip);
        } catch {
          // GeoIP not available
        }

        return {
          success: true,
          data: {
            ip,
            classification,
            geo: geoData,
          },
        };
      }

      case 'get_anomalies': {
        const anomalies = await getAnomalies({
          entityType: parameters.entity_type as EntityType | undefined,
          entityId: parameters.entity_id as string | undefined,
          minRiskScore: parameters.min_risk_score as number | undefined,
          limit: (parameters.limit as number) || 20,
        });

        return {
          success: true,
          data: {
            count: anomalies.length,
            anomalies,
          },
        };
      }

      case 'calculate_stats': {
        const baseQuery = parameters.query as string;
        const statsExpr = parameters.stats_expression as string;
        const earliest = parameters.earliest ? parseRelativeTime(parameters.earliest as string) : undefined;
        const latest = parameters.latest === 'now' ? new Date().toISOString() : parameters.latest as string | undefined;

        const fullQuery = `${baseQuery} | stats ${statsExpr}`;
        const result = await executeDSLQuery(fullQuery, { earliest, latest });

        return {
          success: true,
          data: result.results,
        };
      }

      case 'timechart': {
        const baseQuery = parameters.query as string;
        const span = parameters.span as string;
        const aggregation = (parameters.aggregation as string) || 'count';
        const splitBy = parameters.split_by as string | undefined;
        const earliest = parameters.earliest ? parseRelativeTime(parameters.earliest as string) : undefined;
        const latest = parameters.latest === 'now' ? new Date().toISOString() : parameters.latest as string | undefined;

        let fullQuery = `${baseQuery} | timechart span=${span} ${aggregation}`;
        if (splitBy) {
          fullQuery += ` by ${splitBy}`;
        }

        const result = await executeDSLQuery(fullQuery, { earliest, latest });

        return {
          success: true,
          data: result.results,
        };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Tool execution failed',
    };
  }
}

// Get tool definitions in OpenAI function calling format
export function getToolsForLLM(): Array<{
  type: 'function';
  function: ToolDefinition;
}> {
  return AGENT_TOOLS.map(tool => ({
    type: 'function' as const,
    function: tool,
  }));
}
