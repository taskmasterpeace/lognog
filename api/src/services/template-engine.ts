/**
 * Enhanced Template Engine for Alert Actions
 *
 * Supports:
 * - Basic variables: {{alert_name}}, {{result.hostname}}
 * - Filters: {{alert_name:upper}}, {{result_count:comma}}
 * - Math expressions: {{result.bytes / 1024}}
 * - Aggregates: {{results:sum:bytes}}, {{results:pluck:hostname}}
 * - AI summary: {{ai_summary}}
 * - Conditionals: {{#if severity == "critical"}}...{{/if}}
 * - Loops: {{#each results limit=5}}...{{/each}}
 */

import { getSystemSetting } from '../db/sqlite.js';

// Dynamic configuration getters for AI providers
function getOllamaUrl(): string | undefined {
  return getSystemSetting('ai_ollama_url') || process.env.OLLAMA_URL || undefined;
}
function getOllamaModel(): string {
  return getSystemSetting('ai_ollama_model') || process.env.OLLAMA_MODEL || 'llama3.2';
}
function getOpenRouterApiKey(): string | undefined {
  return getSystemSetting('ai_openrouter_api_key') || process.env.OPENROUTER_API_KEY || undefined;
}
function getOpenRouterModel(): string {
  return getSystemSetting('ai_openrouter_model') || process.env.OPENROUTER_MODEL || 'anthropic/claude-3-haiku-20240307';
}

// Type for context passed to template engine (alerts)
export interface TemplateContext {
  // Alert metadata
  alert_name: string;
  alert_severity: string;
  result_count: number;
  timestamp: string;
  search_query?: string;

  // Results
  results: Record<string, unknown>[];
  result?: Record<string, unknown>;

  // Playbook/runbook instructions
  playbook?: string;
  alert_url?: string;

  // AI-generated content (optional, populated on demand)
  ai_summary?: string;
}

// Type for context passed to template engine (reports)
export interface ReportContext {
  // Report metadata
  report_name: string;
  report_id: string;
  report_description?: string;
  report_schedule?: string;

  // Execution info
  run_time: string;             // ISO timestamp
  execution_time_ms: number;    // Query duration
  time_range: string;           // Human readable (e.g., "Last 24 hours")
  earliest: string;             // Start timestamp
  latest: string;               // End timestamp

  // Results
  results: Record<string, unknown>[];
  result?: Record<string, unknown>;
  result_count: number;
  column_count: number;
  columns: string[];

  // Links
  results_link?: string;
  dashboard_link?: string;

  // Branding
  app_name?: string;
  app_scope?: string;
  logo_url?: string;
  accent_color?: string;

  // Query info
  search_query?: string;
}

// Filter functions
const FILTERS: Record<string, (value: unknown, ...args: string[]) => string> = {
  // String transformations
  upper: (v) => String(v).toUpperCase(),
  lower: (v) => String(v).toLowerCase(),
  trim: (v) => String(v).trim(),
  capitalize: (v) => {
    const s = String(v);
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  },

  // Number formatting
  comma: (v) => {
    const num = Number(v);
    if (isNaN(num)) return String(v);
    return num.toLocaleString();
  },
  round: (v, decimals = '0') => {
    const num = Number(v);
    const d = parseInt(decimals, 10);
    if (isNaN(num)) return String(v);
    return num.toFixed(d);
  },
  percent: (v, decimals = '1') => {
    const num = Number(v);
    const d = parseInt(decimals, 10);
    if (isNaN(num)) return String(v);
    return (num * 100).toFixed(d) + '%';
  },
  bytes: (v) => {
    const num = Number(v);
    if (isNaN(num)) return String(v);
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let size = num;
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024;
      i++;
    }
    return size.toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
  },

  // String operations
  truncate: (v, length = '100', ellipsis = '...') => {
    const s = String(v);
    const maxLen = parseInt(length, 10);
    if (s.length <= maxLen) return s;
    return s.substring(0, maxLen - ellipsis.length) + ellipsis;
  },
  substr: (v, start = '0', length = '') => {
    const s = String(v);
    const startIdx = parseInt(start, 10);
    if (length) {
      return s.substring(startIdx, startIdx + parseInt(length, 10));
    }
    return s.substring(startIdx);
  },
  replace: (v, search = '', replace = '') => String(v).split(search).join(replace),

  // Date/time formatting
  relative: (v) => {
    const date = new Date(String(v));
    if (isNaN(date.getTime())) return String(v);
    const now = Date.now();
    const diff = now - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
  },
  date: (v, format = 'medium') => {
    const date = new Date(String(v));
    if (isNaN(date.getTime())) return String(v);
    const options: Intl.DateTimeFormatOptions = format === 'long'
      ? { dateStyle: 'long', timeStyle: 'short' }
      : format === 'short'
        ? { dateStyle: 'short' }
        : { dateStyle: 'medium', timeStyle: 'short' };
    return date.toLocaleString(undefined, options);
  },
  time: (v) => {
    const date = new Date(String(v));
    if (isNaN(date.getTime())) return String(v);
    return date.toLocaleTimeString();
  },
  iso: (v) => {
    const date = new Date(String(v));
    if (isNaN(date.getTime())) return String(v);
    return date.toISOString();
  },

  // JSON/data formatting
  json: (v) => JSON.stringify(v, null, 2),
  json_compact: (v) => JSON.stringify(v),

  // Severity badge with emoji
  badge: (v) => {
    const severity = String(v).toLowerCase();
    const badges: Record<string, string> = {
      critical: '🔴 CRITICAL',
      high: '🟠 HIGH',
      medium: '🟡 MEDIUM',
      low: '🟢 LOW',
      info: '🔵 INFO',
      emergency: '🔴 EMERGENCY',
      alert: '🟠 ALERT',
      error: '🔴 ERROR',
      warning: '🟡 WARNING',
      notice: '🔵 NOTICE',
      debug: '⚪ DEBUG',
    };
    return badges[severity] || String(v).toUpperCase();
  },

  // Default/fallback value
  default: (v, defaultValue = '') => (v === null || v === undefined || v === '') ? defaultValue : String(v),

  // Escaping
  escape_html: (v) => String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;'),
  escape_url: (v) => encodeURIComponent(String(v)),
};

// Aggregate functions for arrays
const AGGREGATES: Record<string, (arr: Record<string, unknown>[], field?: string) => unknown> = {
  count: (arr) => arr.length,
  sum: (arr, field) => {
    if (!field) return 0;
    return arr.reduce((sum, item) => sum + (Number(item[field]) || 0), 0);
  },
  avg: (arr, field) => {
    if (!field || arr.length === 0) return 0;
    const sum = arr.reduce((sum, item) => sum + (Number(item[field]) || 0), 0);
    return sum / arr.length;
  },
  min: (arr, field) => {
    if (!field || arr.length === 0) return 0;
    return Math.min(...arr.map(item => Number(item[field]) || Infinity));
  },
  max: (arr, field) => {
    if (!field || arr.length === 0) return 0;
    return Math.max(...arr.map(item => Number(item[field]) || -Infinity));
  },
  first: (arr, field) => {
    if (!field || arr.length === 0) return '';
    return arr[0][field] || '';
  },
  last: (arr, field) => {
    if (!field || arr.length === 0) return '';
    return arr[arr.length - 1][field] || '';
  },
  pluck: (arr, field) => {
    if (!field) return [];
    return arr.map(item => item[field]).filter(v => v !== undefined);
  },
  unique: (arr, field) => {
    if (!field) return [];
    const values = arr.map(item => item[field]).filter(v => v !== undefined);
    return [...new Set(values)];
  },
  join: (arr, separator = ', ') => {
    // This is used after pluck: {{results:pluck:hostname:join:", "}}
    if (Array.isArray(arr)) {
      return arr.join(separator);
    }
    return String(arr);
  },
};

// Get nested value from object using dot notation
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: any = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }

  return current;
}

// Parse a simple math expression
function evaluateMath(expr: string, context: TemplateContext | ReportContext): number | null {
  // Replace variable references with values
  const resolvedExpr = expr.replace(/([a-zA-Z_][\w.]*)/g, (match) => {
    const value = resolveVariable(match, context);
    const num = Number(value);
    if (isNaN(num)) return '0';
    return String(num);
  });

  // Only allow safe math operations
  if (!/^[\d\s+\-*/.()]+$/.test(resolvedExpr)) {
    return null;
  }

  try {
    // Using Function constructor for safe math evaluation
    const result = new Function(`return (${resolvedExpr})`)();
    return typeof result === 'number' && !isNaN(result) ? result : null;
  } catch {
    return null;
  }
}

// Resolve a variable path to its value
function resolveVariable(path: string, context: TemplateContext | ReportContext): unknown {
  // Handle alert-specific variables
  if ('alert_name' in context) {
    if (path === 'alert_name') return context.alert_name;
    if (path === 'alert_severity') return context.alert_severity;
    if (path === 'ai_summary') return context.ai_summary || '[AI summary not available]';
    if (path === 'playbook') return context.playbook || '';
    if (path === 'alert_url') return context.alert_url || '';
  }

  // Handle report-specific variables
  if ('report_name' in context) {
    if (path === 'report_name') return context.report_name;
    if (path === 'report_id') return context.report_id;
    if (path === 'report_description') return context.report_description || '';
    if (path === 'report_schedule') return context.report_schedule || '';
    if (path === 'run_time') return context.run_time;
    if (path === 'execution_time_ms') return context.execution_time_ms;
    if (path === 'time_range') return context.time_range;
    if (path === 'earliest') return context.earliest;
    if (path === 'latest') return context.latest;
    if (path === 'column_count') return context.column_count;
    if (path === 'columns') return context.columns;
    if (path === 'results_link') return context.results_link || '';
    if (path === 'dashboard_link') return context.dashboard_link || '';
    if (path === 'app_name') return context.app_name || 'LogNog';
    if (path === 'app_scope') return context.app_scope || 'default';
    if (path === 'logo_url') return context.logo_url || '';
    if (path === 'accent_color') return context.accent_color || '#0ea5e9';
  }

  // Handle common variables
  if (path === 'result_count') return context.result_count;
  if (path === 'timestamp') return 'run_time' in context ? context.run_time : (context as TemplateContext).timestamp;
  if (path === 'search_query') return context.search_query || '';
  if (path === 'results') return context.results;

  // Handle result.field
  if (path.startsWith('result.')) {
    const field = path.substring(7);
    return context.result ? getNestedValue(context.result, field) : undefined;
  }

  // Handle result[N].field
  if (path.startsWith('result[')) {
    const match = path.match(/^result\[(\d+)\]\.(.+)$/);
    if (match) {
      const index = parseInt(match[1], 10);
      const field = match[2];
      if (index < context.results.length) {
        return getNestedValue(context.results[index], field);
      }
    }
    return undefined;
  }

  // Handle aggregate tokens: total.fieldname, avg.fieldname, etc.
  const aggregateMatch = path.match(/^(total|avg|min|max|first|last)\.(.+)$/);
  if (aggregateMatch) {
    const [, aggType, fieldName] = aggregateMatch;
    if (aggType === 'total') {
      return context.results.reduce((sum, item) => sum + (Number(item[fieldName]) || 0), 0);
    }
    if (aggType === 'avg' && context.results.length > 0) {
      const sum = context.results.reduce((s, item) => s + (Number(item[fieldName]) || 0), 0);
      return sum / context.results.length;
    }
    if (aggType === 'min') {
      return Math.min(...context.results.map(item => Number(item[fieldName]) || Infinity));
    }
    if (aggType === 'max') {
      return Math.max(...context.results.map(item => Number(item[fieldName]) || -Infinity));
    }
    if (aggType === 'first' && context.results.length > 0) {
      return context.results[0][fieldName];
    }
    if (aggType === 'last' && context.results.length > 0) {
      return context.results[context.results.length - 1][fieldName];
    }
    return undefined;
  }

  // Handle results:aggregate:field
  if (path.startsWith('results:')) {
    return handleAggregate(path, context);
  }

  // Check if it's a direct field in the first result
  if (context.result) {
    const value = getNestedValue(context.result, path);
    if (value !== undefined) return value;
  }

  return undefined;
}

// Handle aggregate expressions like results:sum:bytes
function handleAggregate(expr: string, context: TemplateContext | ReportContext): unknown {
  const parts = expr.split(':');
  if (parts.length < 2) return undefined;

  // Remove 'results' prefix
  parts.shift();

  let current: unknown = context.results;

  for (let i = 0; i < parts.length; i++) {
    const op = parts[i];
    const arg = parts[i + 1];

    if (AGGREGATES[op]) {
      current = AGGREGATES[op](
        current as Record<string, unknown>[],
        arg
      );
      // Skip the argument if used
      if (arg && ['sum', 'avg', 'min', 'max', 'first', 'last', 'pluck', 'unique'].includes(op)) {
        i++;
      }
    } else if (op === 'join' && Array.isArray(current)) {
      // Handle join with custom separator
      current = (current as unknown[]).join(arg || ', ');
      i++;
    }
  }

  return current;
}

// Apply filter chain to a value
function applyFilters(value: unknown, filterChain: string): string {
  const filters = filterChain.split(':');
  let result = value;

  for (let i = 0; i < filters.length; i++) {
    const filterName = filters[i].trim();
    const filterFn = FILTERS[filterName];

    if (filterFn) {
      // Collect arguments (values after the filter name until next filter)
      const args: string[] = [];
      while (i + 1 < filters.length && !FILTERS[filters[i + 1]]) {
        args.push(filters[i + 1]);
        i++;
      }
      result = filterFn(result, ...args);
    }
  }

  return String(result);
}

// Process conditional blocks: {{#if condition}}...{{/if}}
function processConditionals(template: string, context: TemplateContext | ReportContext): string {
  // Handle {{#if}}...{{#else}}...{{/if}}
  const ifPattern = /\{\{#if\s+(.+?)\}\}([\s\S]*?)\{\{\/if\}\}/g;

  return template.replace(ifPattern, (_, condition, content) => {
    // Check for {{#else}}
    const elseParts = content.split(/\{\{#else\s*(?:if\s+(.+?))?\}\}/);
    const ifContent = elseParts[0];

    // Evaluate condition
    if (evaluateCondition(condition, context)) {
      return ifContent;
    }

    // Check else-if and else blocks
    for (let i = 1; i < elseParts.length; i += 2) {
      const elseIfCondition = elseParts[i]; // may be undefined for plain else
      const elseContent = elseParts[i + 1] || elseParts[i];

      if (!elseIfCondition) {
        // Plain else
        return elseContent;
      }

      if (evaluateCondition(elseIfCondition, context)) {
        return elseContent;
      }
    }

    return '';
  });
}

// Evaluate a condition expression
function evaluateCondition(condition: string, context: TemplateContext | ReportContext): boolean {
  // Parse conditions like: severity == "critical", result_count > 100
  const operators = ['==', '!=', '>=', '<=', '>', '<'];
  let op = '';
  let parts: string[] = [];

  for (const operator of operators) {
    if (condition.includes(operator)) {
      op = operator;
      parts = condition.split(operator).map(s => s.trim());
      break;
    }
  }

  if (parts.length !== 2) {
    // No operator, just check if truthy
    const value = resolveVariable(condition.trim(), context);
    return Boolean(value);
  }

  const leftRaw = parts[0];
  const rightRaw = parts[1];

  // Resolve left side
  let left: unknown = resolveVariable(leftRaw, context);
  if (left === undefined && /^\d+$/.test(leftRaw)) {
    left = Number(leftRaw);
  }

  // Resolve right side (may be quoted string or variable)
  let right: unknown;
  const quotedMatch = rightRaw.match(/^["'](.*)["']$/);
  if (quotedMatch) {
    right = quotedMatch[1];
  } else if (/^\d+$/.test(rightRaw)) {
    right = Number(rightRaw);
  } else {
    right = resolveVariable(rightRaw, context);
  }

  // Compare
  switch (op) {
    case '==': return left == right;
    case '!=': return left != right;
    case '>': return Number(left) > Number(right);
    case '<': return Number(left) < Number(right);
    case '>=': return Number(left) >= Number(right);
    case '<=': return Number(left) <= Number(right);
    default: return false;
  }
}

// Process loop blocks: {{#each results limit=5}}...{{/each}}
function processLoops(template: string, context: TemplateContext | ReportContext): string {
  const eachPattern = /\{\{#each\s+(\w+)(?:\s+limit=(\d+))?\}\}([\s\S]*?)\{\{\/each\}\}/g;

  return template.replace(eachPattern, (_, arrayName, limitStr, itemTemplate) => {
    const rawItems = arrayName === 'results' ? context.results : resolveVariable(arrayName, context);

    if (!Array.isArray(rawItems)) {
      return '';
    }

    let items: Record<string, unknown>[] = rawItems as Record<string, unknown>[];

    // Apply limit
    if (limitStr) {
      const limit = parseInt(limitStr, 10);
      items = items.slice(0, limit);
    }

    // Process each item
    return items.map((item: Record<string, unknown>, index: number) => {
      // Create item context
      const itemContext: TemplateContext | ReportContext = {
        ...context,
        result: item,
      };

      // Replace item-specific variables
      let result = itemTemplate;

      // Replace {{@index}}
      result = result.replace(/\{\{@index\}\}/g, String(index));
      result = result.replace(/\{\{@number\}\}/g, String(index + 1));

      // Process the item template with the item as context
      return processExpression(result, itemContext);
    }).join('');
  });
}

// Process a single expression: {{variable:filter:args}}
function processExpression(template: string, context: TemplateContext | ReportContext): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, expr) => {
    const trimmedExpr = expr.trim();

    // Check for aggregate expressions first
    if (trimmedExpr.startsWith('results:')) {
      const colonIdx = trimmedExpr.indexOf(':');
      const filterStart = trimmedExpr.indexOf(':', colonIdx + 1);

      // Check if this has filters after the aggregate
      let aggregateExpr: string;
      let filterChain = '';

      // Find where aggregate ends and filters begin
      const parts = trimmedExpr.split(':');
      let aggEnd = 1; // After 'results'

      // Determine how much is aggregate vs filter
      while (aggEnd < parts.length && AGGREGATES[parts[aggEnd]]) {
        aggEnd++;
        // Skip field argument
        if (['sum', 'avg', 'min', 'max', 'first', 'last', 'pluck', 'unique'].includes(parts[aggEnd - 1]) && aggEnd < parts.length) {
          aggEnd++;
        }
      }

      // Special handling for join after pluck
      if (aggEnd < parts.length && parts[aggEnd] === 'join') {
        aggEnd += 2; // include join and its separator
      }

      aggregateExpr = parts.slice(0, aggEnd).join(':');
      if (aggEnd < parts.length) {
        filterChain = parts.slice(aggEnd).join(':');
      }

      let value = handleAggregate(aggregateExpr, context);
      if (filterChain) {
        value = applyFilters(value, filterChain);
      }

      return String(value ?? '');
    }

    // Check for filter chain: variable:filter:arg:filter2
    const colonIdx = trimmedExpr.indexOf(':');
    if (colonIdx > -1) {
      const varPath = trimmedExpr.substring(0, colonIdx);
      const filterChain = trimmedExpr.substring(colonIdx + 1);

      // Check if this is a math expression
      if (/[+\-*/]/.test(varPath)) {
        const mathResult = evaluateMath(varPath, context);
        if (mathResult !== null) {
          return applyFilters(mathResult, filterChain);
        }
      }

      const value = resolveVariable(varPath, context);
      return applyFilters(value, filterChain);
    }

    // Check for math expression without filters
    if (/[+\-*/]/.test(trimmedExpr)) {
      const mathResult = evaluateMath(trimmedExpr, context);
      if (mathResult !== null) {
        return String(mathResult);
      }
    }

    // Simple variable
    const value = resolveVariable(trimmedExpr, context);
    return value !== undefined ? String(value) : match;
  });
}

/**
 * Main template processing function
 */
export function processTemplate(template: string, context: TemplateContext | ReportContext): string {
  if (!template) return template;

  let result = template;

  // 1. Process conditionals first
  result = processConditionals(result, context);

  // 2. Process loops
  result = processLoops(result, context);

  // 3. Process remaining expressions
  result = processExpression(result, context);

  return result;
}

/**
 * Generate AI summary for alert context
 * Supports both Ollama and OpenRouter
 */
export async function generateAISummary(context: TemplateContext): Promise<string> {
  const ollamaUrl = getOllamaUrl();
  const openRouterKey = getOpenRouterApiKey();

  if (!ollamaUrl && !openRouterKey) {
    return '[AI summary unavailable - no AI provider configured]';
  }

  const prompt = `Summarize this alert concisely in 1-2 sentences for an IT operator:

Alert: ${context.alert_name}
Severity: ${context.alert_severity}
Time: ${context.timestamp}
Matched ${context.result_count} results.
Query: ${context.search_query || 'N/A'}
Sample Results: ${JSON.stringify(context.results.slice(0, 3), null, 2)}

Provide a brief, actionable summary.`;

  try {
    if (openRouterKey) {
      // Try OpenRouter first if configured
      const model = getOpenRouterModel();
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://lognog.local',
          'X-Title': 'LogNog Alert System',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200,
        }),
      });

      if (response.ok) {
        const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        return data.choices?.[0]?.message?.content?.trim() || '[AI summary failed]';
      }
    }

    if (ollamaUrl) {
      // Fall back to Ollama
      const model = getOllamaModel();
      const response = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
        }),
      });

      if (response.ok) {
        const data = await response.json() as { response?: string };
        return data.response?.trim() || '[AI summary failed]';
      }
    }

    return '[AI summary failed - API error]';
  } catch (error) {
    console.error('AI summary generation failed:', error);
    return '[AI summary failed]';
  }
}

// Export filter list for UI (variable insert helper)
export function getAvailableFilters(): Array<{ name: string; description: string; example: string }> {
  return [
    // String
    { name: 'upper', description: 'Convert to uppercase', example: '{{name:upper}} → JOHN' },
    { name: 'lower', description: 'Convert to lowercase', example: '{{name:lower}} → john' },
    { name: 'capitalize', description: 'Capitalize first letter', example: '{{name:capitalize}} → John' },
    { name: 'trim', description: 'Remove whitespace', example: '{{value:trim}}' },
    { name: 'truncate', description: 'Limit length', example: '{{message:truncate:50}} → First 50 chars...' },
    { name: 'replace', description: 'Replace text', example: '{{text:replace:old:new}}' },

    // Numbers
    { name: 'comma', description: 'Add thousand separators', example: '{{count:comma}} → 1,234' },
    { name: 'round', description: 'Round to decimals', example: '{{value:round:2}} → 123.46' },
    { name: 'percent', description: 'Format as percentage', example: '{{ratio:percent}} → 94.5%' },
    { name: 'bytes', description: 'Human-readable bytes', example: '{{size:bytes}} → 1.5 GB' },

    // Date/Time
    { name: 'relative', description: 'Relative time', example: '{{timestamp:relative}} → 5 minutes ago' },
    { name: 'date', description: 'Format date', example: '{{timestamp:date}} → Dec 31, 2025' },
    { name: 'time', description: 'Format time', example: '{{timestamp:time}} → 3:45:00 PM' },
    { name: 'iso', description: 'ISO format', example: '{{timestamp:iso}} → 2025-12-31T15:45:00Z' },

    // JSON
    { name: 'json', description: 'Pretty JSON', example: '{{data:json}}' },
    { name: 'json_compact', description: 'Compact JSON', example: '{{data:json_compact}}' },

    // Other
    { name: 'badge', description: 'Severity emoji', example: '{{severity:badge}} → 🔴 CRITICAL' },
    { name: 'default', description: 'Fallback value', example: '{{name:default:Unknown}}' },
    { name: 'escape_html', description: 'HTML escape', example: '{{text:escape_html}}' },
  ];
}

// Export aggregate list for UI
export function getAvailableAggregates(): Array<{ name: string; description: string; example: string }> {
  return [
    { name: 'count', description: 'Count results', example: '{{results:count}}' },
    { name: 'sum', description: 'Sum a field', example: '{{results:sum:bytes}}' },
    { name: 'avg', description: 'Average a field', example: '{{results:avg:latency}}' },
    { name: 'min', description: 'Minimum value', example: '{{results:min:size}}' },
    { name: 'max', description: 'Maximum value', example: '{{results:max:cpu}}' },
    { name: 'first', description: 'First value', example: '{{results:first:hostname}}' },
    { name: 'last', description: 'Last value', example: '{{results:last:message}}' },
    { name: 'pluck', description: 'Extract field values', example: '{{results:pluck:hostname}}' },
    { name: 'unique', description: 'Unique values', example: '{{results:unique:hostname}}' },
    { name: 'join', description: 'Join array', example: '{{results:pluck:hostname:join:", "}}' },
  ];
}

// Export report token list for UI
export function getAvailableReportTokens(): Array<{ name: string; description: string; example: string; category: string }> {
  return [
    // Report Metadata
    { name: 'report_name', description: 'Report name', example: '{{report_name}}', category: 'metadata' },
    { name: 'report_description', description: 'Report description', example: '{{report_description}}', category: 'metadata' },
    { name: 'report_schedule', description: 'Cron schedule (human readable)', example: '{{report_schedule}}', category: 'metadata' },
    { name: 'report_id', description: 'Report UUID', example: '{{report_id}}', category: 'metadata' },

    // Execution Info
    { name: 'run_time', description: 'When report ran (ISO)', example: '{{run_time}}', category: 'execution' },
    { name: 'run_time:date', description: 'Formatted date', example: '{{run_time:date}}', category: 'execution' },
    { name: 'run_time:relative', description: 'Relative time', example: '{{run_time:relative}}', category: 'execution' },
    { name: 'execution_time_ms', description: 'Query duration in ms', example: '{{execution_time_ms}}', category: 'execution' },
    { name: 'time_range', description: 'Human readable range', example: '{{time_range}}', category: 'execution' },
    { name: 'earliest', description: 'Start timestamp', example: '{{earliest}}', category: 'execution' },
    { name: 'latest', description: 'End timestamp', example: '{{latest}}', category: 'execution' },

    // Results
    { name: 'result_count', description: 'Number of rows', example: '{{result_count}}', category: 'results' },
    { name: 'result_count:comma', description: 'Formatted count', example: '{{result_count:comma}} → 1,234', category: 'results' },
    { name: 'column_count', description: 'Number of columns', example: '{{column_count}}', category: 'results' },
    { name: 'columns', description: 'Column names list', example: '{{columns}}', category: 'results' },

    // Aggregates
    { name: 'total.fieldname', description: 'Sum of numeric field', example: '{{total.count}}', category: 'aggregates' },
    { name: 'avg.fieldname', description: 'Average of field', example: '{{avg.latency}}', category: 'aggregates' },
    { name: 'min.fieldname', description: 'Minimum value', example: '{{min.size}}', category: 'aggregates' },
    { name: 'max.fieldname', description: 'Maximum value', example: '{{max.cpu}}', category: 'aggregates' },
    { name: 'first.fieldname', description: 'First row value', example: '{{first.hostname}}', category: 'aggregates' },

    // Links
    { name: 'results_link', description: 'URL to view in LogNog UI', example: '{{results_link}}', category: 'links' },
    { name: 'dashboard_link', description: 'Related dashboard URL', example: '{{dashboard_link}}', category: 'links' },

    // Branding
    { name: 'app_name', description: 'App scope name', example: '{{app_name}}', category: 'branding' },
    { name: 'logo_url', description: 'Logo from branding config', example: '{{logo_url}}', category: 'branding' },
    { name: 'accent_color', description: 'Brand accent color', example: '{{accent_color}}', category: 'branding' },
  ];
}
