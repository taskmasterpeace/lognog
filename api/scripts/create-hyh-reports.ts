/**
 * Create Hey You're Hired scheduled reports (disabled)
 * Run with: npx tsx scripts/create-hyh-reports.ts
 */

import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';

const db = new Database('./lognog.db');

interface ReportConfig {
  name: string;
  query: string;
  schedule: string; // cron expression
  recipients: string[];
  format: 'html' | 'csv' | 'pdf';
}

function createReport(config: ReportConfig) {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO scheduled_reports (id, name, query, schedule, recipients, format, enabled, app_scope, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, 'hey-youre-hired', datetime('now'))
  `).run(
    id,
    config.name,
    config.query,
    config.schedule,
    JSON.stringify(config.recipients),
    config.format
  );
  return id;
}

console.log('Creating Hey You\'re Hired scheduled reports (disabled)...\n');

// ==========================================
// Daily Reports
// ==========================================
const report1 = createReport({
  name: 'HYH: Daily Signups Report',
  query: 'search index=hey-youre-hired message="User signup completed" earliest=-24h | stats count by utm_source | sort -count',
  schedule: '0 8 * * *', // Daily at 8am
  recipients: ['admin@example.com'],
  format: 'html'
});
console.log(`Created: Daily Signups Report (${report1})`);

const report2 = createReport({
  name: 'HYH: Daily Feature Usage Report',
  query: 'search index=hey-youre-hired (message="AI: Cover letter generated" OR message="AI: Career coach conversation" OR message="Job recommendations request") earliest=-24h | stats count by message',
  schedule: '0 8 * * *', // Daily at 8am
  recipients: ['admin@example.com'],
  format: 'html'
});
console.log(`Created: Daily Feature Usage Report (${report2})`);

const report3 = createReport({
  name: 'HYH: Daily Error Summary',
  query: 'search index=hey-youre-hired severity<=3 earliest=-24h | stats count by message | sort -count | head 20',
  schedule: '0 8 * * *', // Daily at 8am
  recipients: ['admin@example.com'],
  format: 'html'
});
console.log(`Created: Daily Error Summary (${report3})`);

// ==========================================
// Weekly Reports
// ==========================================
const report4 = createReport({
  name: 'HYH: Weekly Conversion Report',
  query: `search index=hey-youre-hired (message="User signup completed" OR message="Subscription synced") earliest=-7d | stats count by message`,
  schedule: '0 9 * * 1', // Mondays at 9am
  recipients: ['admin@example.com'],
  format: 'html'
});
console.log(`Created: Weekly Conversion Report (${report4})`);

const report5 = createReport({
  name: 'HYH: Weekly Job Search Trends',
  query: 'search index=hey-youre-hired message="Job recommendations request" earliest=-7d | stats count by job_title | sort -count | head 20',
  schedule: '0 9 * * 1', // Mondays at 9am
  recipients: ['admin@example.com'],
  format: 'html'
});
console.log(`Created: Weekly Job Search Trends (${report5})`);

const report6 = createReport({
  name: 'HYH: Weekly API Health Report',
  query: 'search index=hey-youre-hired message~"External API:*" earliest=-7d | stats count by message | sort -count',
  schedule: '0 9 * * 1', // Mondays at 9am
  recipients: ['admin@example.com'],
  format: 'html'
});
console.log(`Created: Weekly API Health Report (${report6})`);

console.log('\n✅ All reports created (disabled)!');
console.log('\nReport IDs:');
console.log(`  1. Daily Signups Report: ${report1}`);
console.log(`  2. Daily Feature Usage Report: ${report2}`);
console.log(`  3. Daily Error Summary: ${report3}`);
console.log(`  4. Weekly Conversion Report: ${report4}`);
console.log(`  5. Weekly Job Search Trends: ${report5}`);
console.log(`  6. Weekly API Health Report: ${report6}`);

db.close();
