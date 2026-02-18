// Pre-built alert templates for common homelab monitoring scenarios

import {
  AlertTriggerType,
  AlertTriggerCondition,
  AlertSeverity,
  AlertScheduleType,
} from '../db/sqlite.js';

export interface AlertTemplateData {
  id: string;
  name: string;
  description: string;
  category: 'security' | 'errors' | 'performance' | 'availability' | 'system';
  search_query: string;
  trigger_type: AlertTriggerType;
  trigger_condition: AlertTriggerCondition;
  trigger_threshold: number;
  schedule_type: AlertScheduleType;
  cron_expression: string;
  time_range: string;
  severity: AlertSeverity;
  throttle_enabled: boolean;
  throttle_window_seconds: number;
  enabled?: boolean;  // Optional - defaults to true, set false for templates that should be disabled by default
}

export const ALERT_TEMPLATES: AlertTemplateData[] = [
  // High Error Rate
  {
    id: 'high-error-rate',
    name: 'High Error Rate',
    description: 'Alert when error logs spike above threshold',
    category: 'errors',
    search_query: 'search severity<=3 | stats count',
    trigger_type: 'number_of_results',
    trigger_condition: 'greater_than',
    trigger_threshold: 50,
    schedule_type: 'cron',
    cron_expression: '*/5 * * * *',
    time_range: '-5m',
    severity: 'high',
    throttle_enabled: true,
    throttle_window_seconds: 900,
  },

  // Failed SSH Logins
  {
    id: 'failed-ssh-logins',
    name: 'Failed SSH Logins',
    description: 'Detect potential brute force SSH attacks',
    category: 'security',
    search_query: 'search app_name=sshd message~"Failed|Invalid|authentication failure" | stats count',
    trigger_type: 'number_of_results',
    trigger_condition: 'greater_than',
    trigger_threshold: 10,
    schedule_type: 'cron',
    cron_expression: '*/5 * * * *',
    time_range: '-15m',
    severity: 'critical',
    throttle_enabled: true,
    throttle_window_seconds: 1800,
  },

  // Windows Failed Logins
  {
    id: 'windows-failed-logins',
    name: 'Windows Failed Logins',
    description: 'Alert on multiple Windows authentication failures',
    category: 'security',
    search_query: 'search EventID=4625 | stats count',
    trigger_type: 'number_of_results',
    trigger_condition: 'greater_than',
    trigger_threshold: 5,
    schedule_type: 'cron',
    cron_expression: '*/5 * * * *',
    time_range: '-5m',
    severity: 'high',
    throttle_enabled: true,
    throttle_window_seconds: 900,
  },

  // Firewall Block Spike
  {
    id: 'firewall-block-spike',
    name: 'Firewall Block Spike',
    description: 'Alert when firewall blocks spike (potential attack)',
    category: 'security',
    search_query: 'search app_name=filterlog action=block | stats count',
    trigger_type: 'number_of_results',
    trigger_condition: 'greater_than',
    trigger_threshold: 100,
    schedule_type: 'cron',
    cron_expression: '*/15 * * * *',
    time_range: '-15m',
    severity: 'medium',
    throttle_enabled: true,
    throttle_window_seconds: 3600,
  },

  // Web Server 5xx Errors
  {
    id: 'web-server-errors',
    name: 'Web Server 5xx Errors',
    description: 'Alert on server-side errors in web traffic',
    category: 'errors',
    search_query: 'search source_type=nginx status>=500 | stats count',
    trigger_type: 'number_of_results',
    trigger_condition: 'greater_than',
    trigger_threshold: 10,
    schedule_type: 'cron',
    cron_expression: '*/5 * * * *',
    time_range: '-5m',
    severity: 'high',
    throttle_enabled: true,
    throttle_window_seconds: 600,
  },

  // Docker Container Restarts
  {
    id: 'docker-restarts',
    name: 'Docker Container Restarts',
    description: 'Alert when containers restart frequently',
    category: 'availability',
    search_query: 'search source_type=docker event=restart | stats count',
    trigger_type: 'number_of_results',
    trigger_condition: 'greater_than',
    trigger_threshold: 3,
    schedule_type: 'cron',
    cron_expression: '*/10 * * * *',
    time_range: '-30m',
    severity: 'medium',
    throttle_enabled: true,
    throttle_window_seconds: 1800,
  },

  // New Admin User Created
  {
    id: 'new-admin-user',
    name: 'New Admin User Created',
    description: 'Alert when new admin accounts are created (Windows)',
    category: 'security',
    search_query: 'search EventID=4720 OR EventID=4728 | stats count',
    trigger_type: 'number_of_results',
    trigger_condition: 'greater_than',
    trigger_threshold: 0,
    schedule_type: 'cron',
    cron_expression: '*/15 * * * *',
    time_range: '-15m',
    severity: 'critical',
    throttle_enabled: false,
    throttle_window_seconds: 0,
  },

  // Host Went Silent
  {
    id: 'host-silent',
    name: 'Host Went Silent',
    description: 'Alert when a host stops sending logs (may be down)',
    category: 'availability',
    search_query: 'search * | stats dc(hostname) as active_hosts',
    trigger_type: 'number_of_results',
    trigger_condition: 'less_than',
    trigger_threshold: 1,
    schedule_type: 'cron',
    cron_expression: '*/30 * * * *',
    time_range: '-30m',
    severity: 'high',
    throttle_enabled: true,
    throttle_window_seconds: 3600,
  },

  // ============================================
  // SaaS Analytics Alerts (Hey You're Hired)
  // ============================================

  // OAuth Login Failures
  {
    id: 'saas-oauth-failures',
    name: 'OAuth Login Failures',
    description: 'Alert when OAuth/Google authentication failures spike',
    category: 'security',
    search_query: 'search message~"OAuth login failed" | stats count',
    trigger_type: 'number_of_results',
    trigger_condition: 'greater_than',
    trigger_threshold: 5,
    schedule_type: 'cron',
    cron_expression: '*/5 * * * *',
    time_range: '-5m',
    severity: 'high',
    throttle_enabled: true,
    throttle_window_seconds: 900,
  },

  // Payment/Checkout Failures
  {
    id: 'saas-payment-failures',
    name: 'Payment/Checkout Failures',
    description: 'Alert when payment or checkout failures occur',
    category: 'errors',
    search_query: 'search message~"Subscription sync failed" OR (message~"Checkout" AND message~"fail|error") | stats count',
    trigger_type: 'number_of_results',
    trigger_condition: 'greater_than',
    trigger_threshold: 3,
    schedule_type: 'cron',
    cron_expression: '*/5 * * * *',
    time_range: '-15m',
    severity: 'critical',
    throttle_enabled: true,
    throttle_window_seconds: 1800,
  },

  // Stripe Webhook Errors
  {
    id: 'saas-stripe-webhook-errors',
    name: 'Stripe Webhook Errors',
    description: 'Alert when Stripe webhook processing fails',
    category: 'errors',
    search_query: 'search message~"Stripe webhook error" | stats count',
    trigger_type: 'number_of_results',
    trigger_condition: 'greater_than',
    trigger_threshold: 1,
    schedule_type: 'cron',
    cron_expression: '*/5 * * * *',
    time_range: '-5m',
    severity: 'critical',
    throttle_enabled: true,
    throttle_window_seconds: 900,
  },

  // External API Failures (JobSpy, Active Jobs DB)
  {
    id: 'saas-external-api-failures',
    name: 'External API Failures',
    description: 'Alert when external APIs (JobSpy, Active Jobs DB) fail',
    category: 'errors',
    search_query: 'search message~"External API" AND (message~"failed" OR message~"error") | stats count',
    trigger_type: 'number_of_results',
    trigger_condition: 'greater_than',
    trigger_threshold: 10,
    schedule_type: 'cron',
    cron_expression: '*/10 * * * *',
    time_range: '-10m',
    severity: 'high',
    throttle_enabled: true,
    throttle_window_seconds: 1800,
  },

  // Feature Error Spike
  {
    id: 'saas-feature-errors',
    name: 'Feature Error Spike',
    description: 'Alert when feature execution failures spike',
    category: 'errors',
    search_query: 'search message~"Feature failed" | stats count',
    trigger_type: 'number_of_results',
    trigger_condition: 'greater_than',
    trigger_threshold: 5,
    schedule_type: 'cron',
    cron_expression: '*/5 * * * *',
    time_range: '-5m',
    severity: 'medium',
    throttle_enabled: true,
    throttle_window_seconds: 900,
  },

  // Signup Drop (Availability Check)
  {
    id: 'saas-signup-drop',
    name: 'Signup Activity Drop',
    description: 'Alert when no signups occur for an extended period (potential outage)',
    category: 'availability',
    search_query: 'search message~"User signup completed" | stats count',
    trigger_type: 'number_of_results',
    trigger_condition: 'less_than',
    trigger_threshold: 1,
    schedule_type: 'cron',
    cron_expression: '0 * * * *',
    time_range: '-1h',
    severity: 'medium',
    throttle_enabled: true,
    throttle_window_seconds: 3600,
  },

  // Heartbeat Dead Man's Switch
  {
    id: 'saas-heartbeat-missing',
    name: 'Heartbeat Missing (Dead Man\'s Switch)',
    description: 'Alert when no heartbeat received from app - indicates app may be down or not sending logs',
    category: 'availability',
    search_query: 'search message="Heartbeat" | stats count',
    trigger_type: 'number_of_results',
    trigger_condition: 'less_than',
    trigger_threshold: 1,
    schedule_type: 'cron',
    cron_expression: '*/10 * * * *',
    time_range: '-10m',
    severity: 'critical',
    throttle_enabled: true,
    throttle_window_seconds: 1800,
  },

  // ============================================
  // LogNog Self-Monitoring Alerts (Disabled by Default)
  // ============================================

  // High API Error Rate
  {
    id: 'lognog-api-errors',
    name: 'LogNog: High API Error Rate',
    description: 'Alert when LogNog API error rate exceeds threshold',
    category: 'system',
    search_query: 'search app_scope="lognog" category="api" success=false | stats count',
    trigger_type: 'number_of_results',
    trigger_condition: 'greater_than',
    trigger_threshold: 50,
    schedule_type: 'cron',
    cron_expression: '*/5 * * * *',
    time_range: '-5m',
    severity: 'high',
    throttle_enabled: true,
    throttle_window_seconds: 900,
    enabled: false,  // Disabled by default
  },

  // Slow Queries
  {
    id: 'lognog-slow-queries',
    name: 'LogNog: Slow Query Alert',
    description: 'Alert when search queries take longer than 10 seconds',
    category: 'performance',
    search_query: 'search app_scope="lognog" action="search.slow" | stats count',
    trigger_type: 'number_of_results',
    trigger_condition: 'greater_than',
    trigger_threshold: 5,
    schedule_type: 'cron',
    cron_expression: '*/10 * * * *',
    time_range: '-10m',
    severity: 'medium',
    throttle_enabled: true,
    throttle_window_seconds: 1800,
    enabled: false,
  },

  // Ingest Failures
  {
    id: 'lognog-ingest-failures',
    name: 'LogNog: Ingest Failures',
    description: 'Alert when log ingestion fails',
    category: 'errors',
    search_query: 'search app_scope="lognog" action="ingest.error" | stats count',
    trigger_type: 'number_of_results',
    trigger_condition: 'greater_than',
    trigger_threshold: 1,
    schedule_type: 'cron',
    cron_expression: '*/5 * * * *',
    time_range: '-5m',
    severity: 'high',
    throttle_enabled: true,
    throttle_window_seconds: 900,
    enabled: false,
  },

  // Alert Execution Failures
  {
    id: 'lognog-alert-failures',
    name: 'LogNog: Alert Execution Failures',
    description: 'Alert when scheduled alerts fail to execute',
    category: 'errors',
    search_query: 'search app_scope="lognog" action="alert.error" | stats count',
    trigger_type: 'number_of_results',
    trigger_condition: 'greater_than',
    trigger_threshold: 1,
    schedule_type: 'cron',
    cron_expression: '*/10 * * * *',
    time_range: '-10m',
    severity: 'medium',
    throttle_enabled: true,
    throttle_window_seconds: 1800,
    enabled: false,
  },

  // Failed Login Attempts
  {
    id: 'lognog-failed-logins',
    name: 'LogNog: Failed Login Attempts',
    description: 'Alert when multiple failed login attempts occur',
    category: 'security',
    search_query: 'search app_scope="lognog" action="auth.login_failed" | stats count',
    trigger_type: 'number_of_results',
    trigger_condition: 'greater_than',
    trigger_threshold: 5,
    schedule_type: 'cron',
    cron_expression: '*/5 * * * *',
    time_range: '-5m',
    severity: 'high',
    throttle_enabled: true,
    throttle_window_seconds: 900,
    enabled: false,
  },

  // System Errors
  {
    id: 'lognog-system-errors',
    name: 'LogNog: System Errors',
    description: 'Alert when unhandled system errors occur',
    category: 'errors',
    search_query: 'search app_scope="lognog" action="system.error" | stats count',
    trigger_type: 'number_of_results',
    trigger_condition: 'greater_than',
    trigger_threshold: 1,
    schedule_type: 'cron',
    cron_expression: '*/5 * * * *',
    time_range: '-5m',
    severity: 'critical',
    throttle_enabled: true,
    throttle_window_seconds: 900,
    enabled: false,
  },
];

export default ALERT_TEMPLATES;
