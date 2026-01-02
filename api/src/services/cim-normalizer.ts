/**
 * CIM Normalizer Service
 *
 * Normalizes log fields from various sources to the Common Information Model (CIM).
 * This enables consistent queries across different log formats.
 */

import {
  getDataModel,
  getDataModels,
  getFieldMappings,
  getMappingsForSource,
  createFieldMapping,
  type DataModel,
  type CIMField,
  type FieldMapping,
} from '../db/sqlite.js';

export interface NormalizedEvent {
  _raw: Record<string, unknown>;
  _cim_model: string | null;
  _normalized: boolean;
  [key: string]: unknown;
}

export interface ValidationResult {
  valid: boolean;
  model: string;
  matched_fields: string[];
  missing_required: string[];
  extra_fields: string[];
  warnings: string[];
}

/**
 * Apply a transform expression to a value
 */
function applyTransform(value: unknown, transform: string | null): unknown {
  if (!transform || value === null || value === undefined) {
    return value;
  }

  const strValue = String(value);

  // Simple transform expressions
  if (transform === 'lower()') {
    return strValue.toLowerCase();
  }
  if (transform === 'upper()') {
    return strValue.toUpperCase();
  }
  if (transform === 'trim()') {
    return strValue.trim();
  }
  if (transform === 'int()') {
    const num = parseInt(strValue, 10);
    return isNaN(num) ? value : num;
  }
  if (transform === 'float()') {
    const num = parseFloat(strValue);
    return isNaN(num) ? value : num;
  }

  // Multiplication transforms like "float() * 1000"
  const multiplyMatch = transform.match(/^(float|int)\(\)\s*\*\s*(\d+(?:\.\d+)?)$/);
  if (multiplyMatch) {
    const num = multiplyMatch[1] === 'float' ? parseFloat(strValue) : parseInt(strValue, 10);
    const multiplier = parseFloat(multiplyMatch[2]);
    return isNaN(num) ? value : num * multiplier;
  }

  // Division transforms like "int() / 1024"
  const divideMatch = transform.match(/^(float|int)\(\)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (divideMatch) {
    const num = divideMatch[1] === 'float' ? parseFloat(strValue) : parseInt(strValue, 10);
    const divisor = parseFloat(divideMatch[2]);
    return isNaN(num) || divisor === 0 ? value : num / divisor;
  }

  // Substring transforms like "substr(0, 10)"
  const substrMatch = transform.match(/^substr\((\d+),\s*(\d+)\)$/);
  if (substrMatch) {
    const start = parseInt(substrMatch[1], 10);
    const len = parseInt(substrMatch[2], 10);
    return strValue.substring(start, start + len);
  }

  // Replace transforms like "replace('old', 'new')"
  const replaceMatch = transform.match(/^replace\(['"](.*)['"],\s*['"](.*)['"]\)$/);
  if (replaceMatch) {
    return strValue.replace(new RegExp(replaceMatch[1], 'g'), replaceMatch[2]);
  }

  // Unknown transform, return original value
  return value;
}

/**
 * Normalize a single log event using configured field mappings
 */
export function normalizeEvent(
  event: Record<string, unknown>,
  sourceType: string
): NormalizedEvent {
  const mappings = getMappingsForSource(sourceType);
  const result: NormalizedEvent = {
    _raw: { ...event },
    _cim_model: null,
    _normalized: false,
  };

  // Copy original fields
  for (const [key, value] of Object.entries(event)) {
    result[key] = value;
  }

  // Apply mappings
  let hasMapping = false;
  const modelNames = new Set<string>();

  for (const [sourceField, mapping] of mappings) {
    if (event[sourceField] !== undefined) {
      const normalizedValue = applyTransform(event[sourceField], mapping.transform);
      result[mapping.cim_field] = normalizedValue;
      hasMapping = true;

      // Track which models are being used
      const fieldMappings = getFieldMappings({ source_type: sourceType, enabled: true });
      for (const fm of fieldMappings) {
        if (fm.source_field === sourceField) {
          modelNames.add(fm.data_model);
        }
      }
    }
  }

  if (hasMapping) {
    result._normalized = true;
    result._cim_model = Array.from(modelNames).join(', ');
  }

  return result;
}

/**
 * Normalize multiple events in batch
 */
export function normalizeEvents(
  events: Array<Record<string, unknown>>,
  sourceType: string
): NormalizedEvent[] {
  return events.map(event => normalizeEvent(event, sourceType));
}

/**
 * Auto-detect field mappings by analyzing field names and values
 */
export function autoDetectMappings(
  sampleEvents: Array<Record<string, unknown>>,
  sourceType: string
): Array<Partial<FieldMapping>> {
  const suggestions: Array<Partial<FieldMapping>> = [];
  const seenFields = new Map<string, Set<unknown>>();

  // Collect all fields and sample values
  for (const event of sampleEvents) {
    for (const [field, value] of Object.entries(event)) {
      if (!seenFields.has(field)) {
        seenFields.set(field, new Set());
      }
      if (value !== null && value !== undefined) {
        seenFields.get(field)!.add(value);
      }
    }
  }

  // Load all data models
  const models = getDataModels({ enabled: true });

  for (const [sourceField, values] of seenFields) {
    const fieldLower = sourceField.toLowerCase();
    const sampleValue = Array.from(values)[0];

    for (const model of models) {
      for (const cimField of model.fields) {
        // Check for exact match
        if (cimField.name.toLowerCase() === fieldLower) {
          suggestions.push({
            source_type: sourceType,
            source_field: sourceField,
            data_model: model.name,
            cim_field: cimField.name,
            priority: 50, // High priority for exact match
          });
          break;
        }

        // Check aliases
        if (cimField.aliases?.some(alias => alias.toLowerCase() === fieldLower)) {
          suggestions.push({
            source_type: sourceType,
            source_field: sourceField,
            data_model: model.name,
            cim_field: cimField.name,
            priority: 75, // Medium priority for alias match
          });
          break;
        }

        // Check for partial matches based on common patterns
        if (isLikelyMatch(sourceField, sampleValue, cimField)) {
          suggestions.push({
            source_type: sourceType,
            source_field: sourceField,
            data_model: model.name,
            cim_field: cimField.name,
            priority: 100, // Lower priority for heuristic match
          });
        }
      }
    }
  }

  // Remove duplicates, keeping highest priority (lowest number)
  const uniqueSuggestions = new Map<string, Partial<FieldMapping>>();
  for (const suggestion of suggestions) {
    const key = `${suggestion.source_field}:${suggestion.data_model}`;
    const existing = uniqueSuggestions.get(key);
    if (!existing || (suggestion.priority ?? 100) < (existing.priority ?? 100)) {
      uniqueSuggestions.set(key, suggestion);
    }
  }

  return Array.from(uniqueSuggestions.values());
}

/**
 * Heuristic matching for field detection
 */
function isLikelyMatch(sourceField: string, sampleValue: unknown, cimField: CIMField): boolean {
  const fieldLower = sourceField.toLowerCase();
  const cimLower = cimField.name.toLowerCase();

  // IP address detection
  if (cimField.type === 'ip') {
    const valueStr = String(sampleValue);
    const ipPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
    if (ipPattern.test(valueStr)) {
      // Check if field name suggests IP
      if (fieldLower.includes('ip') || fieldLower.includes('addr') ||
          fieldLower.includes('src') || fieldLower.includes('dst') ||
          fieldLower.includes('host') || fieldLower.includes('client') ||
          fieldLower.includes('server') || fieldLower.includes('remote')) {
        return true;
      }
    }
  }

  // Port detection
  if (cimLower.includes('port') && typeof sampleValue === 'number') {
    if (sampleValue >= 0 && sampleValue <= 65535) {
      if (fieldLower.includes('port') || fieldLower === 'spt' || fieldLower === 'dpt') {
        return true;
      }
    }
  }

  // User detection
  if (cimLower === 'user' || cimLower === 'username') {
    if (fieldLower.includes('user') || fieldLower.includes('account') ||
        fieldLower.includes('actor') || fieldLower === 'uid') {
      return true;
    }
  }

  // Status code detection
  if (cimLower === 'status' && typeof sampleValue === 'number') {
    if (sampleValue >= 100 && sampleValue < 600) {
      if (fieldLower.includes('status') || fieldLower.includes('code') ||
          fieldLower === 'response') {
        return true;
      }
    }
  }

  return false;
}

/**
 * Validate an event against a data model
 */
export function validateEventAgainstModel(
  event: Record<string, unknown>,
  modelName: string
): ValidationResult {
  const model = getDataModel(modelName);
  if (!model) {
    return {
      valid: false,
      model: modelName,
      matched_fields: [],
      missing_required: [],
      extra_fields: Object.keys(event),
      warnings: [`Data model '${modelName}' not found`],
    };
  }

  const result: ValidationResult = {
    valid: true,
    model: modelName,
    matched_fields: [],
    missing_required: [],
    extra_fields: [],
    warnings: [],
  };

  const modelFieldNames = new Set(model.fields.map(f => f.name));
  const eventFieldNames = new Set(Object.keys(event).filter(k => !k.startsWith('_')));

  // Check required fields
  for (const field of model.fields) {
    if (field.required) {
      if (event[field.name] === undefined && event[field.name] === null) {
        result.missing_required.push(field.name);
        result.valid = false;
      }
    }

    if (event[field.name] !== undefined) {
      result.matched_fields.push(field.name);
    }
  }

  // Check for extra fields not in model
  for (const fieldName of eventFieldNames) {
    if (!modelFieldNames.has(fieldName)) {
      result.extra_fields.push(fieldName);
    }
  }

  // Add warnings for type mismatches
  for (const field of model.fields) {
    const value = event[field.name];
    if (value !== undefined && value !== null) {
      const actualType = typeof value;
      if (field.type === 'number' && actualType !== 'number') {
        result.warnings.push(`Field '${field.name}' expected number, got ${actualType}`);
      }
      if (field.type === 'boolean' && actualType !== 'boolean') {
        result.warnings.push(`Field '${field.name}' expected boolean, got ${actualType}`);
      }
    }
  }

  return result;
}

/**
 * Get compliance summary for a source type against all models
 */
export function getSourceCompliance(
  sampleEvents: Array<Record<string, unknown>>,
  sourceType: string
): {
  source_type: string;
  models: Array<{
    name: string;
    coverage: number;
    matched_fields: string[];
    missing_fields: string[];
  }>;
} {
  const models = getDataModels({ enabled: true });
  const result: {
    source_type: string;
    models: Array<{
      name: string;
      coverage: number;
      matched_fields: string[];
      missing_fields: string[];
    }>;
  } = {
    source_type: sourceType,
    models: [],
  };

  // Normalize sample events first
  const normalizedEvents = normalizeEvents(sampleEvents, sourceType);

  for (const model of models) {
    const matchedFields = new Set<string>();
    const allModelFields = model.fields.map(f => f.name);

    for (const event of normalizedEvents) {
      for (const field of allModelFields) {
        if (event[field] !== undefined) {
          matchedFields.add(field);
        }
      }
    }

    const coverage = allModelFields.length > 0
      ? (matchedFields.size / allModelFields.length) * 100
      : 0;

    const missingFields = allModelFields.filter(f => !matchedFields.has(f));

    result.models.push({
      name: model.name,
      coverage: Math.round(coverage * 10) / 10,
      matched_fields: Array.from(matchedFields),
      missing_fields: missingFields,
    });
  }

  // Sort by coverage descending
  result.models.sort((a, b) => b.coverage - a.coverage);

  return result;
}

/**
 * Apply auto-detected mappings to the database
 */
export function applyAutoMappings(
  suggestions: Array<Partial<FieldMapping>>
): { applied: number; skipped: number } {
  let applied = 0;
  let skipped = 0;

  for (const suggestion of suggestions) {
    try {
      // Check if mapping already exists
      const existing = getFieldMappings({
        source_type: suggestion.source_type,
        data_model: suggestion.data_model,
      }).find(m => m.source_field === suggestion.source_field);

      if (existing) {
        skipped++;
        continue;
      }

      createFieldMapping({
        source_type: suggestion.source_type!,
        source_field: suggestion.source_field!,
        data_model: suggestion.data_model!,
        cim_field: suggestion.cim_field!,
        priority: suggestion.priority ?? 100,
        enabled: true,
      });
      applied++;
    } catch (error) {
      skipped++;
    }
  }

  return { applied, skipped };
}
