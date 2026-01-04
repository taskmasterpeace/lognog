/**
 * Create Hey You're Hired alerts (disabled)
 * Run with: npx tsx scripts/create-hyh-alerts.ts
 */

import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';

const db = new Database('./lognog.db');

interface AlertConfig {
  name: string;
  description: string;
  search_query: string;
  trigger_condition: 'greater_than' | 'less_than' | 'equals';
  trigger_threshold: number;
  time_range: string;
  cron_expression: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

function createAlert(config: AlertConfig) {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO alerts (id, name, description, search_query, trigger_type, trigger_condition, trigger_threshold,
                        schedule_type, cron_expression, time_range, actions, severity, enabled, app_scope,
                        created_at, updated_at)
    VALUES (?, ?, ?, ?, 'number_of_results', ?, ?, 'cron', ?, ?, '[]', ?, 0, 'hey-youre-hired',
            datetime('now'), datetime('now'))
  `).run(
    id,
    config.name,
    config.description,
    config.search_query,
    config.trigger_condition,
    config.trigger_threshold,
    config.cron_expression,
    config.time_range,
    config.severity
  );
  return id;
}

console.log('Creating Hey You\'re Hired alerts (disabled)...\n');

// ==========================================
// Critical Alerts
// ==========================================
const alert1 = createAlert({
  name: 'HYH: High Error Rate',
  description: 'More than 10 errors in 5 minutes',
  search_query: 'search index=hey-youre-hired severity<=3',
  trigger_condition: 'greater_than',
  trigger_threshold: 10,
  time_range: '-5m',
  cron_expression: '*/5 * * * *',
  severity: 'critical'
});
console.log(`Created: High Error Rate (${alert1})`);

const alert2 = createAlert({
  name: 'HYH: Stripe Webhook Errors',
  description: 'Any Stripe webhook error (payment system down)',
  search_query: 'search index=hey-youre-hired message="Stripe webhook error"',
  trigger_condition: 'greater_than',
  trigger_threshold: 0,
  time_range: '-5m',
  cron_expression: '*/5 * * * *',
  severity: 'critical'
});
console.log(`Created: Stripe Webhook Errors (${alert2})`);

// ==========================================
// High Alerts
// ==========================================
const alert3 = createAlert({
  name: 'HYH: External API Down',
  description: 'Multiple external API failures in 10 minutes',
  search_query: 'search index=hey-youre-hired message~"External API:*error"',
  trigger_condition: 'greater_than',
  trigger_threshold: 5,
  time_range: '-10m',
  cron_expression: '*/10 * * * *',
  severity: 'high'
});
console.log(`Created: External API Down (${alert3})`);

const alert4 = createAlert({
  name: 'HYH: OAuth Login Failures',
  description: 'Multiple OAuth failures',
  search_query: 'search index=hey-youre-hired message="OAuth login failed"',
  trigger_condition: 'greater_than',
  trigger_threshold: 5,
  time_range: '-10m',
  cron_expression: '*/10 * * * *',
  severity: 'high'
});
console.log(`Created: OAuth Login Failures (${alert4})`);

// ==========================================
// Medium Alerts
// ==========================================
const alert5 = createAlert({
  name: 'HYH: Zero Job Results',
  description: 'Job searches returning no results',
  search_query: 'search index=hey-youre-hired message="Job orchestrator: Low results warning"',
  trigger_condition: 'greater_than',
  trigger_threshold: 3,
  time_range: '-1h',
  cron_expression: '0 * * * *',
  severity: 'medium'
});
console.log(`Created: Zero Job Results (${alert5})`);

const alert6 = createAlert({
  name: 'HYH: Fallback API Usage High',
  description: 'Primary job APIs failing, fallbacks being used frequently',
  search_query: 'search index=hey-youre-hired message~"Job orchestrator: Calling*fallback"',
  trigger_condition: 'greater_than',
  trigger_threshold: 10,
  time_range: '-1h',
  cron_expression: '0 * * * *',
  severity: 'medium'
});
console.log(`Created: Fallback API Usage High (${alert6})`);

console.log('\n✅ All alerts created (disabled)!');
console.log('\nAlert IDs:');
console.log(`  1. High Error Rate: ${alert1}`);
console.log(`  2. Stripe Webhook Errors: ${alert2}`);
console.log(`  3. External API Down: ${alert3}`);
console.log(`  4. OAuth Login Failures: ${alert4}`);
console.log(`  5. Zero Job Results: ${alert5}`);
console.log(`  6. Fallback API Usage High: ${alert6}`);

db.close();
