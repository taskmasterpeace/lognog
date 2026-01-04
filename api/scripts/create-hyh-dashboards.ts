/**
 * Create Hey You're Hired dashboards
 * Run with: npx tsx scripts/create-hyh-dashboards.ts
 */

import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';

const db = new Database('./lognog.db');

// Helper to create dashboard
function createDashboard(name: string, description: string, appScope: string) {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO dashboards (id, name, description, app_scope, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(id, name, description, appScope);
  return id;
}

// Helper to create panel
function createPanel(
  dashboardId: string,
  title: string,
  query: string,
  visualization: string,
  position: { x: number; y: number; w: number; h: number }
) {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO dashboard_panels (id, dashboard_id, title, query, visualization, options, position_x, position_y, width, height)
    VALUES (?, ?, ?, ?, ?, '{}', ?, ?, ?, ?)
  `).run(id, dashboardId, title, query, visualization, position.x, position.y, position.w, position.h);
  return id;
}

console.log('Creating Hey You\'re Hired dashboards...\n');

// ==========================================
// Dashboard 1: User Acquisition & Funnel
// ==========================================
const dash1 = createDashboard(
  'HYH: User Acquisition & Funnel',
  'Track signups, conversions, and user sources for Hey You\'re Hired',
  'hey-youre-hired'
);
console.log(`Created dashboard: User Acquisition & Funnel (${dash1})`);

createPanel(dash1, 'Signups Over Time',
  'search index=hey-youre-hired message="User signup completed" | timechart span=1d count',
  'line', { x: 0, y: 0, w: 6, h: 4 });

createPanel(dash1, 'Signups by Source',
  'search index=hey-youre-hired message="User signup completed" | stats count by utm_source',
  'pie', { x: 6, y: 0, w: 6, h: 4 });

createPanel(dash1, 'Logins Over Time',
  'search index=hey-youre-hired message="User login" | timechart span=1d count',
  'line', { x: 0, y: 4, w: 6, h: 4 });

createPanel(dash1, 'New vs Returning Users',
  'search index=hey-youre-hired message="User login" | stats count by is_new_user',
  'pie', { x: 6, y: 4, w: 6, h: 4 });

createPanel(dash1, 'Profile Completions',
  'search index=hey-youre-hired message="Profile created" | timechart span=1d count',
  'line', { x: 0, y: 8, w: 6, h: 4 });

createPanel(dash1, 'Checkout Started',
  'search index=hey-youre-hired message="Checkout started" | timechart span=1d count',
  'line', { x: 6, y: 8, w: 6, h: 4 });

// ==========================================
// Dashboard 2: Feature Usage
// ==========================================
const dash2 = createDashboard(
  'HYH: Feature Usage',
  'Track which features are being used in Hey You\'re Hired',
  'hey-youre-hired'
);
console.log(`Created dashboard: Feature Usage (${dash2})`);

createPanel(dash2, 'Cover Letters Generated',
  'search index=hey-youre-hired message="AI: Cover letter generated" | timechart span=1d count',
  'line', { x: 0, y: 0, w: 6, h: 4 });

createPanel(dash2, 'Career Coach Sessions',
  'search index=hey-youre-hired message="AI: Career coach conversation" | timechart span=1d count',
  'line', { x: 6, y: 0, w: 6, h: 4 });

createPanel(dash2, 'Job Search Requests',
  'search index=hey-youre-hired message="Job recommendations request" | timechart span=1d count',
  'line', { x: 0, y: 4, w: 6, h: 4 });

createPanel(dash2, 'Job Searches by Title',
  'search index=hey-youre-hired message="Job recommendations request" | stats count by job_title | sort -count | head 10',
  'bar', { x: 6, y: 4, w: 6, h: 4 });

createPanel(dash2, 'Extension Autofill Usage',
  'search index=hey-youre-hired message="Extension: Autofill*" | timechart span=1d count',
  'line', { x: 0, y: 8, w: 6, h: 4 });

createPanel(dash2, 'Remote vs On-site Searches',
  'search index=hey-youre-hired message="Job recommendations request" | stats count by remote',
  'pie', { x: 6, y: 8, w: 6, h: 4 });

// ==========================================
// Dashboard 3: Revenue & Subscriptions
// ==========================================
const dash3 = createDashboard(
  'HYH: Revenue & Subscriptions',
  'Track subscriptions, revenue, and churn for Hey You\'re Hired',
  'hey-youre-hired'
);
console.log(`Created dashboard: Revenue & Subscriptions (${dash3})`);

createPanel(dash3, 'New Subscriptions',
  'search index=hey-youre-hired message="Subscription synced" status="active" | timechart span=1d count',
  'line', { x: 0, y: 0, w: 6, h: 4 });

createPanel(dash3, 'Subscriptions by Plan',
  'search index=hey-youre-hired message="Subscription synced" | stats count by plan_name',
  'pie', { x: 6, y: 0, w: 6, h: 4 });

createPanel(dash3, 'Stripe Webhook Events',
  'search index=hey-youre-hired message="Stripe webhook received" | stats count by event_type',
  'bar', { x: 0, y: 4, w: 6, h: 4 });

createPanel(dash3, 'Subscription Status',
  'search index=hey-youre-hired message="Subscription synced" | stats count by status',
  'pie', { x: 6, y: 4, w: 6, h: 4 });

createPanel(dash3, 'Recent Subscription Events',
  'search index=hey-youre-hired message="Subscription synced" | table timestamp user_id plan_name status | head 20',
  'table', { x: 0, y: 8, w: 12, h: 4 });

// ==========================================
// Dashboard 4: API & System Health
// ==========================================
const dash4 = createDashboard(
  'HYH: API & System Health',
  'Monitor API performance, errors, and external service health for Hey You\'re Hired',
  'hey-youre-hired'
);
console.log(`Created dashboard: API & System Health (${dash4})`);

createPanel(dash4, 'Error Events',
  'search index=hey-youre-hired severity<=3 | timechart span=1h count',
  'line', { x: 0, y: 0, w: 6, h: 4 });

createPanel(dash4, 'Errors by Type',
  'search index=hey-youre-hired severity<=3 | stats count by message | sort -count | head 10',
  'bar', { x: 6, y: 0, w: 6, h: 4 });

createPanel(dash4, 'Stripe Webhook Errors',
  'search index=hey-youre-hired message="Stripe webhook error" | timechart span=1h count',
  'line', { x: 0, y: 4, w: 6, h: 4 });

createPanel(dash4, 'External API Errors',
  'search index=hey-youre-hired message~"External API:*error" | stats count by message',
  'bar', { x: 6, y: 4, w: 6, h: 4 });

createPanel(dash4, 'Recent Errors',
  'search index=hey-youre-hired severity<=3 | table timestamp message | head 20',
  'table', { x: 0, y: 8, w: 12, h: 4 });

// ==========================================
// Dashboard 5: Job Search Performance
// ==========================================
const dash5 = createDashboard(
  'HYH: Job Search Performance',
  'Monitor job API performance, fallbacks, and search quality for Hey You\'re Hired',
  'hey-youre-hired'
);
console.log(`Created dashboard: Job Search Performance (${dash5})`);

createPanel(dash5, 'Job API Requests',
  'search index=hey-youre-hired message~"External API:*request" | timechart span=1h count by message',
  'line', { x: 0, y: 0, w: 12, h: 4 });

createPanel(dash5, 'Adzuna API Activity',
  'search index=hey-youre-hired message~"External API: Adzuna*" | stats count by message',
  'bar', { x: 0, y: 4, w: 4, h: 4 });

createPanel(dash5, 'Remotive API Activity',
  'search index=hey-youre-hired message~"External API: Remotive*" | stats count by message',
  'bar', { x: 4, y: 4, w: 4, h: 4 });

createPanel(dash5, 'JobSpy API Activity',
  'search index=hey-youre-hired message~"External API: JobSpy*" | stats count by message',
  'bar', { x: 8, y: 4, w: 4, h: 4 });

createPanel(dash5, 'Fallback Usage',
  'search index=hey-youre-hired message~"Job orchestrator: Calling*fallback" | timechart span=1d count',
  'line', { x: 0, y: 8, w: 6, h: 4 });

createPanel(dash5, 'Low Results Warnings',
  'search index=hey-youre-hired message="Job orchestrator: Low results warning" | timechart span=1d count',
  'line', { x: 6, y: 8, w: 6, h: 4 });

createPanel(dash5, 'Deduplication Stats',
  'search index=hey-youre-hired message="Job orchestrator: Deduplication complete" | table timestamp message',
  'table', { x: 0, y: 12, w: 12, h: 4 });

console.log('\n✅ All dashboards created successfully!');
console.log('\nDashboard IDs:');
console.log(`  1. User Acquisition & Funnel: ${dash1}`);
console.log(`  2. Feature Usage: ${dash2}`);
console.log(`  3. Revenue & Subscriptions: ${dash3}`);
console.log(`  4. API & System Health: ${dash4}`);
console.log(`  5. Job Search Performance: ${dash5}`);

db.close();
