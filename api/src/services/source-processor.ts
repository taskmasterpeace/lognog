/**
 * Source Processor Service
 *
 * Matches incoming logs against source configs and applies:
 * - Field extractions (regex, grok, json_path)
 * - Field transforms (rename, value_map, static, eval)
 * - Index routing
 */

import {
  getSourceConfigs,
  getSourceConfigExtractions,
  getSourceConfigTransforms,
  getSourceRoutingRules,
  SourceConfig,
  SourceConfigExtraction,
  SourceConfigTransform,
  SourceRoutingRule,
} from '../db/sqlite.js';

interface LogRecord {
  timestamp?: string;
  hostname?: string;
  app_name?: string;
  message?: string;
  severity?: number;
  index_name?: string;
  structured_data?: string | Record<string, unknown>;
  [key: string]: unknown;
}

interface ProcessedLog extends LogRecord {
  _extracted_fields?: Record<string, string | number>;
  _matched_config?: string;
  _matched_rule?: string;
}

// Cache for source configs (refreshed periodically)
let sourceConfigsCache: SourceConfig[] | null = null;
let extractionsCache: Map<string, SourceConfigExtraction[]> = new Map();
let transformsCache: Map<string, SourceConfigTransform[]> = new Map();
let routingRulesCache: SourceRoutingRule[] | null = null;
let lastCacheRefresh = 0;
const CACHE_TTL_MS = 60000; // Refresh cache every 60 seconds

function refreshCache(): void {
  const now = Date.now();
  if (sourceConfigsCache && now - lastCacheRefresh < CACHE_TTL_MS) {
    return;
  }

  try {
    // Load source configs
    sourceConfigsCache = getSourceConfigs(true); // Only enabled configs

    // Load extractions for each config
    extractionsCache = new Map();
    for (const config of sourceConfigsCache) {
      const extractions = getSourceConfigExtractions(config.id).filter(e => e.enabled);
      if (extractions.length > 0) {
        extractionsCache.set(config.id, extractions);
      }
    }

    // Load transforms for each config
    transformsCache = new Map();
    for (const config of sourceConfigsCache) {
      const transforms = getSourceConfigTransforms(config.id).filter(t => t.enabled);
      if (transforms.length > 0) {
        transformsCache.set(config.id, transforms);
      }
    }

    // Load routing rules
    routingRulesCache = getSourceRoutingRules(true);

    lastCacheRefresh = now;
  } catch (error) {
    console.error('[SourceProcessor] Failed to refresh cache:', error);
    // Keep using stale cache on error
  }
}

/**
 * Find the matching source config for a log record
 */
function findMatchingConfig(log: LogRecord): SourceConfig | null {
  refreshCache();
  if (!sourceConfigsCache) return null;

  // Sort by priority (lower = higher priority)
  const sortedConfigs = [...sourceConfigsCache].sort((a, b) => a.priority - b.priority);

  for (const config of sortedConfigs) {
    let matches = true;

    // Check hostname pattern
    if (config.hostname_pattern && log.hostname) {
      try {
        const regex = new RegExp(config.hostname_pattern, 'i');
        if (!regex.test(log.hostname)) {
          matches = false;
        }
      } catch {
        matches = false;
      }
    }

    // Check app_name pattern
    if (matches && config.app_name_pattern && log.app_name) {
      try {
        const regex = new RegExp(config.app_name_pattern, 'i');
        if (!regex.test(log.app_name)) {
          matches = false;
        }
      } catch {
        matches = false;
      }
    }

    // Check source_type
    if (matches && config.source_type) {
      const structuredData = typeof log.structured_data === 'string'
        ? JSON.parse(log.structured_data || '{}')
        : (log.structured_data || {});
      const sourceType = structuredData.source_type || log.app_name;
      if (sourceType !== config.source_type) {
        matches = false;
      }
    }

    if (matches) {
      return config;
    }
  }

  return null;
}

/**
 * Apply field extractions to a log record
 */
function applyExtractions(log: ProcessedLog, configId: string): void {
  const extractions = extractionsCache.get(configId);
  if (!extractions) return;

  const message = log.message || '';
  const extractedFields: Record<string, string | number> = {};

  // Sort by priority
  const sortedExtractions = [...extractions].sort((a, b) => a.priority - b.priority);

  for (const extraction of sortedExtractions) {
    try {
      switch (extraction.pattern_type) {
        case 'regex':
          // Extract named groups from regex
          const regex = new RegExp(extraction.pattern, 'i');
          const match = regex.exec(message);
          if (match?.groups) {
            Object.assign(extractedFields, match.groups);
          } else if (match) {
            // If no named groups, use the extraction field name
            extractedFields[extraction.field_name] = match[1] || match[0];
          }
          break;

        case 'json_path':
          // Simple JSON path extraction from structured_data
          const data = typeof log.structured_data === 'string'
            ? JSON.parse(log.structured_data || '{}')
            : (log.structured_data || {});
          const path = extraction.pattern.split('.');
          let value: unknown = data;
          for (const key of path) {
            value = (value as Record<string, unknown>)?.[key];
          }
          if (value !== undefined && value !== null) {
            extractedFields[extraction.field_name] = String(value);
          }
          break;

        case 'grok':
          // Basic grok pattern support (common patterns)
          const grokPatterns: Record<string, string> = {
            '%{IP}': '(?:\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})',
            '%{NUMBER}': '(?:\\d+(?:\\.\\d+)?)',
            '%{WORD}': '(?:\\w+)',
            '%{DATA}': '(?:.*?)',
            '%{GREEDYDATA}': '(?:.*)',
          };
          let grokRegex = extraction.pattern;
          // Handle named captures like %{IP:client_ip}
          grokRegex = grokRegex.replace(/%\{(\w+):(\w+)\}/g, (_match, pattern, name) => {
            const regexPattern = grokPatterns[`%{${pattern}}`] || '(?:.*?)';
            return `(?<${name}>${regexPattern.slice(3, -1)})`;
          });
          // Replace remaining unnamed patterns
          for (const [pattern, replacement] of Object.entries(grokPatterns)) {
            grokRegex = grokRegex.replace(new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement);
          }
          try {
            const grokMatch = new RegExp(grokRegex).exec(message);
            if (grokMatch?.groups) {
              Object.assign(extractedFields, grokMatch.groups);
            }
          } catch (e) {
            console.error('[SourceProcessor] Invalid grok pattern:', extraction.pattern, e);
          }
          break;
      }
    } catch (error) {
      console.error('[SourceProcessor] Extraction failed:', extraction.field_name, error);
    }
  }

  // Merge extracted fields into structured_data
  if (Object.keys(extractedFields).length > 0) {
    log._extracted_fields = extractedFields;
    const existingData = typeof log.structured_data === 'string'
      ? JSON.parse(log.structured_data || '{}')
      : (log.structured_data || {});
    log.structured_data = JSON.stringify({ ...existingData, ...extractedFields });
  }
}

/**
 * Apply field transforms to a log record
 */
function applyTransforms(log: ProcessedLog, configId: string): void {
  const transforms = transformsCache.get(configId);
  if (!transforms) return;

  const data = typeof log.structured_data === 'string'
    ? JSON.parse(log.structured_data || '{}')
    : (log.structured_data || {});

  // Sort by priority
  const sortedTransforms = [...transforms].sort((a, b) => a.priority - b.priority);

  for (const transform of sortedTransforms) {
    try {
      const config = transform.config ? JSON.parse(transform.config) : {};
      const sourceValue = transform.source_field ? data[transform.source_field] : undefined;

      switch (transform.transform_type) {
        case 'rename':
          // Rename field
          if (transform.source_field && sourceValue !== undefined) {
            data[transform.target_field] = sourceValue;
            delete data[transform.source_field];
          }
          break;

        case 'static':
          // Set static value
          data[transform.target_field] = config.value;
          break;

        case 'value_map':
          // Map values using lookup table
          if (sourceValue !== undefined && config.mappings) {
            const mapped = config.mappings[String(sourceValue)];
            data[transform.target_field] = mapped ?? (config.default || sourceValue);
          }
          break;

        case 'eval':
          // Simple eval expressions
          if (config.expression) {
            try {
              // Very basic expression evaluation - only supports simple math
              const expr = config.expression.replace(/\$(\w+)/g, (_: string, field: string) => {
                const val = data[field];
                return typeof val === 'number' ? String(val) : `"${val || ''}"`;
              });
              // Only allow safe operations
              if (/^[\d\s+\-*/().]+$/.test(expr)) {
                data[transform.target_field] = eval(expr);
              } else {
                data[transform.target_field] = expr;
              }
            } catch {
              // Skip on eval error
            }
          }
          break;
      }
    } catch (error) {
      console.error('[SourceProcessor] Transform failed:', transform.target_field, error);
    }
  }

  log.structured_data = JSON.stringify(data);
}

/**
 * Determine the target index for a log record using routing rules
 */
function determineIndex(log: LogRecord): string | null {
  refreshCache();
  if (!routingRulesCache) return null;

  // Sort by priority (lower = higher priority)
  const sortedRules = [...routingRulesCache].sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    try {
      const conditions = JSON.parse(rule.conditions);
      const matchMode = rule.match_mode || 'all';
      let matchedCount = 0;

      for (const condition of conditions) {
        const { field, operator, value } = condition;
        let testValue: string | undefined;

        // Get the field value from the log
        switch (field) {
          case 'hostname':
            testValue = log.hostname;
            break;
          case 'app_name':
            testValue = log.app_name;
            break;
          case 'source_type':
            const data = typeof log.structured_data === 'string'
              ? JSON.parse(log.structured_data || '{}')
              : (log.structured_data || {});
            testValue = data.source_type || log.app_name;
            break;
          case 'message':
            testValue = log.message;
            break;
          default:
            testValue = undefined;
        }

        if (testValue === undefined) continue;

        let matched = false;
        switch (operator) {
          case 'equals':
            matched = testValue === value;
            break;
          case 'contains':
            matched = testValue.includes(value);
            break;
          case 'regex':
            try {
              matched = new RegExp(value, 'i').test(testValue);
            } catch {
              matched = false;
            }
            break;
          case 'starts_with':
            matched = testValue.startsWith(value);
            break;
          case 'ends_with':
            matched = testValue.endsWith(value);
            break;
        }

        if (matched) {
          matchedCount++;
        }
      }

      // Check if rule matches based on match_mode
      const totalConditions = conditions.length;
      const ruleMatches = matchMode === 'all'
        ? matchedCount === totalConditions
        : matchedCount > 0;

      if (ruleMatches) {
        return rule.target_index;
      }
    } catch (error) {
      console.error('[SourceProcessor] Rule evaluation failed:', rule.name, error);
    }
  }

  return null;
}

/**
 * Process a single log record through the source configuration pipeline
 */
export function processLog(log: LogRecord): ProcessedLog {
  const processed: ProcessedLog = { ...log };

  // 1. Find matching source config
  const config = findMatchingConfig(log);
  if (config) {
    processed._matched_config = config.name;

    // 2. Apply field extractions
    applyExtractions(processed, config.id);

    // 3. Apply transforms
    applyTransforms(processed, config.id);

    // 4. Set target index from config if specified
    if (config.target_index && !processed.index_name) {
      processed.index_name = config.target_index;
    }
  }

  // 5. Apply routing rules (can override config index)
  const routedIndex = determineIndex(processed);
  if (routedIndex) {
    processed.index_name = routedIndex;
    processed._matched_rule = routedIndex;
  }

  return processed;
}

/**
 * Process a batch of log records
 */
export function processLogs(logs: LogRecord[]): ProcessedLog[] {
  return logs.map(processLog);
}

/**
 * Force cache refresh (useful when configs are updated)
 */
export function refreshSourceConfigCache(): void {
  lastCacheRefresh = 0;
  refreshCache();
}
