/**
 * Pre-built Report Templates
 *
 * These templates provide common report configurations that users can
 * quickly deploy for their use cases.
 */

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  query: string;
  schedule: string;
  format: string;
  attachment_format: string;
  subject_template?: string;
  message_template?: string;
  send_condition: string;
  condition_threshold?: number;
  compare_offset?: string;
  app_scope?: string;
}

export const REPORT_TEMPLATES: ReportTemplate[] = [
  // ==================== Daily Operations ====================
  {
    id: 'daily-error-summary',
    name: 'Daily Error Summary',
    description: 'Top errors from the last 24 hours, grouped by message',
    category: 'Daily Operations',
    query: 'search severity<=3 | stats count by message | sort desc count | limit 25',
    schedule: '0 8 * * *', // Daily at 8 AM
    format: 'html',
    attachment_format: 'csv',
    subject_template: '{{report_name}} - {{result_count}} errors in the last 24h',
    send_condition: 'if_results',
  },
  {
    id: 'daily-host-health',
    name: 'Daily Host Health Report',
    description: 'Error counts per host for quick health overview',
    category: 'Daily Operations',
    query: 'search severity<=4 | stats count by hostname | sort desc count',
    schedule: '0 7 * * *', // Daily at 7 AM
    format: 'html',
    attachment_format: 'none',
    subject_template: 'Host Health: {{result_count}} hosts with issues',
    send_condition: 'always',
  },
  {
    id: 'daily-app-errors',
    name: 'Daily Application Errors',
    description: 'Errors grouped by application name',
    category: 'Daily Operations',
    query: 'search severity<=3 | stats count by app_name | sort desc count',
    schedule: '0 9 * * *', // Daily at 9 AM
    format: 'html',
    attachment_format: 'none',
    send_condition: 'if_results',
  },

  // ==================== Weekly Analytics ====================
  {
    id: 'weekly-traffic-report',
    name: 'Weekly Traffic Report',
    description: 'Event volume trends compared to last week',
    category: 'Weekly Analytics',
    query: 'search * | timechart span=1d count',
    schedule: '0 9 * * 1', // Monday at 9 AM
    format: 'html',
    attachment_format: 'csv',
    subject_template: 'Weekly Traffic: {{total.count:comma}} events',
    compare_offset: '1w',
    send_condition: 'always',
  },
  {
    id: 'weekly-severity-breakdown',
    name: 'Weekly Severity Breakdown',
    description: 'Distribution of log severity levels over the past week',
    category: 'Weekly Analytics',
    query: 'search * | stats count by severity | sort asc severity',
    schedule: '0 10 * * 1', // Monday at 10 AM
    format: 'html',
    attachment_format: 'none',
    send_condition: 'always',
  },
  {
    id: 'weekly-top-hosts',
    name: 'Weekly Top Hosts by Volume',
    description: 'Hosts generating the most log volume',
    category: 'Weekly Analytics',
    query: 'search * | stats count by hostname | sort desc count | limit 20',
    schedule: '0 8 * * 1', // Monday at 8 AM
    format: 'html',
    attachment_format: 'csv',
    send_condition: 'always',
  },

  // ==================== Security & Compliance ====================
  {
    id: 'security-critical-events',
    name: 'Critical Security Events',
    description: 'Emergency and alert level events requiring immediate attention',
    category: 'Security & Compliance',
    query: 'search severity<=1 | table timestamp, hostname, app_name, message',
    schedule: '0 */4 * * *', // Every 4 hours
    format: 'html',
    attachment_format: 'none',
    subject_template: 'CRITICAL: {{result_count}} security events detected',
    send_condition: 'if_results',
  },
  {
    id: 'failed-auth-report',
    name: 'Failed Authentication Report',
    description: 'Tracks authentication failures across systems',
    category: 'Security & Compliance',
    query: 'search message~"auth* fail*" OR message~"login fail*" OR message~"invalid password" | stats count by hostname, app_name | sort desc count',
    schedule: '0 6 * * *', // Daily at 6 AM
    format: 'html',
    attachment_format: 'csv',
    subject_template: 'Auth Failures: {{result_count}} sources detected',
    send_condition: 'if_results',
  },
  {
    id: 'audit-log-summary',
    name: 'Daily Audit Log Summary',
    description: 'Summary of audit-related events for compliance',
    category: 'Security & Compliance',
    query: 'search index_name="audit" OR message~"audit" | stats count by hostname, app_name',
    schedule: '0 7 * * *', // Daily at 7 AM
    format: 'html',
    attachment_format: 'json',
    send_condition: 'always',
  },

  // ==================== Performance & Capacity ====================
  {
    id: 'log-volume-spike',
    name: 'Log Volume Spike Alert',
    description: 'Alerts when hourly log volume exceeds threshold',
    category: 'Performance & Capacity',
    query: 'search * | timechart span=1h count',
    schedule: '0 * * * *', // Every hour
    format: 'html',
    attachment_format: 'none',
    send_condition: 'threshold',
    condition_threshold: 10000,
  },
  {
    id: 'hourly-volume-trend',
    name: 'Hourly Volume Trend',
    description: 'Compare current hour volume to yesterday',
    category: 'Performance & Capacity',
    query: 'search * | timechart span=1h count',
    schedule: '0 * * * *', // Every hour
    format: 'html',
    attachment_format: 'none',
    compare_offset: '1d',
    send_condition: 'always',
  },

  // ==================== Application-Specific ====================
  {
    id: 'app-startup-failures',
    name: 'Application Startup Failures',
    description: 'Track application startup and initialization failures',
    category: 'Application Monitoring',
    query: 'search message~"start* fail*" OR message~"init* error" OR message~"boot* fail*" | stats count by app_name, hostname',
    schedule: '*/30 * * * *', // Every 30 minutes
    format: 'html',
    attachment_format: 'none',
    send_condition: 'if_results',
  },
  {
    id: 'database-errors',
    name: 'Database Error Report',
    description: 'Database connection and query errors',
    category: 'Application Monitoring',
    query: 'search message~"database" OR message~"sql" OR message~"postgres" OR message~"mysql" severity<=4 | stats count by hostname, app_name, message | sort desc count | limit 20',
    schedule: '0 */2 * * *', // Every 2 hours
    format: 'html',
    attachment_format: 'none',
    send_condition: 'if_results',
  },

  // ==================== Executive Reports ====================
  {
    id: 'monthly-executive-summary',
    name: 'Monthly Executive Summary',
    description: 'High-level overview for leadership',
    category: 'Executive',
    query: 'search * | stats count by severity | sort asc severity',
    schedule: '0 9 1 * *', // 1st of month at 9 AM
    format: 'html',
    attachment_format: 'csv',
    subject_template: 'Monthly Log Summary - {{run_time:date}}',
    send_condition: 'always',
  },
  {
    id: 'weekly-executive-briefing',
    name: 'Weekly Executive Briefing',
    description: 'Weekly summary of critical events and trends',
    category: 'Executive',
    query: 'search severity<=3 | stats count by app_name | sort desc count | limit 10',
    schedule: '0 8 * * 1', // Monday at 8 AM
    format: 'html',
    attachment_format: 'none',
    subject_template: 'Weekly Briefing: {{result_count}} apps with critical events',
    send_condition: 'always',
  },
];

/**
 * Get all available report templates
 */
export function getReportTemplates(): ReportTemplate[] {
  return REPORT_TEMPLATES;
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(): Record<string, ReportTemplate[]> {
  const byCategory: Record<string, ReportTemplate[]> = {};

  for (const template of REPORT_TEMPLATES) {
    if (!byCategory[template.category]) {
      byCategory[template.category] = [];
    }
    byCategory[template.category].push(template);
  }

  return byCategory;
}

/**
 * Get a specific template by ID
 */
export function getTemplateById(id: string): ReportTemplate | undefined {
  return REPORT_TEMPLATES.find(t => t.id === id);
}

/**
 * Get template categories
 */
export function getTemplateCategories(): string[] {
  const categories = new Set(REPORT_TEMPLATES.map(t => t.category));
  return Array.from(categories);
}
