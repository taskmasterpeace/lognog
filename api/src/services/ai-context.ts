/**
 * AI query context: a single machine-readable description of how to query this
 * LogNog instance — the DSL, the canonical CIM field taxonomy, the available
 * macros, and the shipped ATT&CK detections. Served at GET /ai/context so an AI
 * agent (or the MCP server) can self-orient without scraping the UI.
 */

import { BUILTIN_CIM_MODELS, OCSF_CLASS_MAP } from '../data/builtin-cim-models.js';
import { DETECTION_TEMPLATES, ATTACK_ATTRIBUTION } from '../data/attack-content.js';

/** DSL commands an agent can use (pipeline stages). */
const DSL_COMMANDS = [
  'search', 'filter', 'where', 'stats', 'sort', 'limit', 'head', 'tail', 'table',
  'fields', 'dedup', 'rename', 'top', 'rare', 'bin', 'timechart', 'rex', 'eval',
  'lookup', 'transaction', 'chart', 'compare', 'timewrap',
];

const DSL_EXAMPLES = [
  { description: 'Top source IPs by failed logins in the last hour', query: 'search event.category=authentication event.outcome=failure | top source.ip' },
  { description: 'Error count over time', query: 'search severity<=3 | timechart span=5m count' },
  { description: 'Use a macro (reusable fragment) and aggregate', query: 'search `errors` | stats count by host.name' },
  { description: 'HTTP 5xx by URL path', query: 'search event.category=web http.response.status_code>=500 | stats count by url.path | sort desc count' },
];

export interface AIContextMacro {
  name: string;
  definition: string;
}

export interface AIContext {
  service: string;
  description: string;
  query_language: {
    name: string;
    reference: string;
    commands: string[];
    examples: Array<{ description: string; query: string }>;
  };
  cim: {
    note: string;
    models: Array<{
      name: string;
      ocsf_class: number | undefined;
      category: string;
      fields: Array<{ name: string; type: string; aliases: string[] }>;
    }>;
    field_index: string[];
  };
  macros: AIContextMacro[];
  detections: Array<{
    id: string;
    name: string;
    attack_technique: string;
    attack_tactic: string;
    query: string;
  }>;
  attack_attribution: string;
}

export function buildAIContext(
  macros: Array<{ name: string; definition: string; description?: string | null }>,
): AIContext {
  const models = BUILTIN_CIM_MODELS.map((m) => ({
    name: m.name,
    ocsf_class: OCSF_CLASS_MAP[m.name],
    category: m.category,
    fields: m.fields.map((f) => ({ name: f.name, type: f.type, aliases: f.aliases ?? [] })),
  }));

  const fieldIndex = Array.from(
    new Set(models.flatMap((m) => m.fields.map((f) => f.name))),
  ).sort();

  return {
    service: 'LogNog',
    description:
      'Self-hosted log management with a Splunk-like DSL. Query logs, build detections, and read normalized (CIM) fields.',
    query_language: {
      name: 'LogNog DSL',
      reference: '/api/ingest/guide',
      commands: DSL_COMMANDS,
      examples: DSL_EXAMPLES,
    },
    cim: {
      note:
        'Canonical field names follow Elastic Common Schema (ECS); each model is classified by its OCSF event class. Splunk-style names (src, dest, uri, ...) are recognized as input aliases that normalize to the canonical names.',
      models,
      field_index: fieldIndex,
    },
    macros: macros.map((m) => ({ name: m.name, definition: m.definition })),
    detections: DETECTION_TEMPLATES.map((d) => ({
      id: d.id,
      name: d.name,
      attack_technique: d.attack_technique,
      attack_tactic: d.attack_tactic,
      query: d.search_query,
    })),
    attack_attribution: ATTACK_ATTRIBUTION,
  };
}
