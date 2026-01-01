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
];

export default ALERT_TEMPLATES;
