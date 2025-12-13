/**
 * Template Service
 *
 * Business logic for managing source templates.
 */

import {
  SourceTemplate,
  FieldExtractionPattern,
  getSourceTemplates,
  getSourceTemplate,
  SourceCategory,
} from '../db/sqlite.js';

/**
 * Template validation result
 */
export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  extracted_fields: Record<string, unknown>;
}

/**
 * Extract a field from a log line using a pattern
 */
function extractField(logLine: string, extraction: FieldExtractionPattern): unknown {
  try {
    switch (extraction.pattern_type) {
      case 'regex':
        const match = logLine.match(new RegExp(extraction.pattern));
        return match && match[1] ? match[1] : null;

      case 'grok':
        // Grok pattern support could be added here
        // For now, treat it as regex
        const grokMatch = logLine.match(new RegExp(extraction.pattern));
        return grokMatch && grokMatch[1] ? grokMatch[1] : null;

      case 'json_path':
        // Simple JSON path implementation: $.field.subfield
        try {
          const obj = JSON.parse(logLine);
          const path = extraction.pattern.replace(/^\$\.?/, '');
          const parts = path.split('.');
          let current: unknown = obj;

          for (const part of parts) {
            if (current === null || current === undefined) return null;
            if (typeof current === 'object' && !Array.isArray(current)) {
              current = (current as Record<string, unknown>)[part];
            } else {
              return null;
            }
          }

          return current;
        } catch {
          return null;
        }

      default:
        return null;
    }
  } catch (error) {
    console.error(`Error extracting field ${extraction.field_name}:`, error);
    return null;
  }
}

/**
 * Test if a log line matches a template's field extraction patterns
 */
export function validateTemplate(
  template: SourceTemplate,
  logLine: string
): TemplateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const extracted: Record<string, unknown> = {};

  // Parse field extractions
  let fieldExtractions: FieldExtractionPattern[] = [];
  if (template.field_extractions) {
    try {
      fieldExtractions = JSON.parse(template.field_extractions);
    } catch (err) {
      errors.push('Invalid field_extractions JSON in template');
      return {
        valid: false,
        errors,
        warnings,
        extracted_fields: {},
      };
    }
  }

  // Extract fields
  for (const extraction of fieldExtractions) {
    const value = extractField(logLine, extraction);

    if (value !== null && value !== undefined) {
      extracted[extraction.field_name] = value;
    } else if (extraction.required) {
      errors.push(`Required field '${extraction.field_name}' not found or could not be extracted`);
    } else {
      warnings.push(`Optional field '${extraction.field_name}' not found`);
    }
  }

  // Check if any fields were extracted
  if (Object.keys(extracted).length === 0 && fieldExtractions.length > 0) {
    errors.push('No fields could be extracted - log format may not match this template');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    extracted_fields: extracted,
  };
}

/**
 * Get templates grouped by category
 */
export function getTemplatesByCategory(): Record<SourceCategory, SourceTemplate[]> {
  const allTemplates = getSourceTemplates();

  const grouped: Record<SourceCategory, SourceTemplate[]> = {
    database: [],
    security: [],
    web: [],
    system: [],
    application: [],
  };

  for (const template of allTemplates) {
    if (grouped[template.category]) {
      grouped[template.category].push(template);
    }
  }

  return grouped;
}

/**
 * Get template statistics
 */
export function getTemplateStats(): {
  total: number;
  by_category: Record<SourceCategory, number>;
  built_in: number;
  custom: number;
} {
  const allTemplates = getSourceTemplates();

  const stats = {
    total: allTemplates.length,
    by_category: {
      database: 0,
      security: 0,
      web: 0,
      system: 0,
      application: 0,
    } as Record<SourceCategory, number>,
    built_in: 0,
    custom: 0,
  };

  for (const template of allTemplates) {
    if (stats.by_category[template.category] !== undefined) {
      stats.by_category[template.category]++;
    }
    if (template.built_in) {
      stats.built_in++;
    } else {
      stats.custom++;
    }
  }

  return stats;
}

/**
 * Format a template for API response (parse JSON fields)
 */
export function formatTemplateForResponse(template: SourceTemplate): Record<string, unknown> {
  return {
    ...template,
    field_extractions: template.field_extractions ? JSON.parse(template.field_extractions) : [],
    dashboard_widgets: template.dashboard_widgets ? JSON.parse(template.dashboard_widgets) : [],
    alert_templates: template.alert_templates ? JSON.parse(template.alert_templates) : [],
  };
}
