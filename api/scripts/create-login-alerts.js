const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const db = new Database('/data/lognog.db');

// Alert 1: Non-internal user logs into Directors Palette
const alert1Id = uuidv4();
const alert1Actions = JSON.stringify([{
  type: 'apprise',
  config: {
    channel: 'slack-alerts',
    title: 'NEW DP User Login',
    message: '{{result.user_email}} logged in to Directors Palette from {{result.ip_address}}'
  }
}]);

db.prepare(
  'INSERT INTO alerts (id, name, description, search_query, trigger_type, trigger_condition, trigger_threshold, schedule_type, cron_expression, time_range, actions, throttle_enabled, throttle_window_seconds, severity, enabled, app_scope) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
).run(
  alert1Id,
  'DP New User Login (Non-Internal)',
  'Fires when someone who is NOT on the internal/beta user_types lookup logs into Directors Palette.',
  'search index=directors-palette message="User login" | lookup user_types field=user_email | where user_type!="internal" AND user_type!="beta"',
  'number_of_results',
  'greater_than',
  0,
  'cron',
  '*/5 * * * *',
  '-5m',
  alert1Actions,
  0,
  0,
  'high',
  1,
  'directors-palette'
);
console.log('Alert 1 created:', alert1Id);

// Alert 2: Any HYH login with user_type classification
const alert2Id = uuidv4();
const alert2Actions = JSON.stringify([{
  type: 'apprise',
  config: {
    channel: 'slack-alerts',
    title: 'HYH Login',
    message: '{{result.user_email}} ({{result.user_type}}) logged in via {{result.auth_method}} from {{result.ip_address}}'
  }
}]);

db.prepare(
  'INSERT INTO alerts (id, name, description, search_query, trigger_type, trigger_condition, trigger_threshold, schedule_type, cron_expression, time_range, actions, throttle_enabled, throttle_window_seconds, severity, enabled, app_scope) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
).run(
  alert2Id,
  'HYH User Login (With User Type)',
  'Fires on every HYH login and shows the user_type from the lookup table (internal, beta, or real user).',
  'search index=hey-youre-hired message="User login" | lookup user_types field=user_email',
  'number_of_results',
  'greater_than',
  0,
  'cron',
  '*/5 * * * *',
  '-5m',
  alert2Actions,
  0,
  0,
  'info',
  1,
  'hey-youre-hired'
);
console.log('Alert 2 created:', alert2Id);

// Disable the old HYH User Login alert (replaced by new one with user_type)
db.prepare('UPDATE alerts SET enabled = 0 WHERE id = ?').run('5b8a6d74-0f6e-4f55-ab22-81c8c46e36ab');
console.log('Old HYH Login alert disabled');

// Verify
const alerts = db.prepare("SELECT id, name, enabled, search_query FROM alerts WHERE name LIKE '%Login%' OR name LIKE '%DP New%'").all();
alerts.forEach(a => {
  console.log('  [' + (a.enabled ? 'ON' : 'OFF') + '] ' + a.name);
});
