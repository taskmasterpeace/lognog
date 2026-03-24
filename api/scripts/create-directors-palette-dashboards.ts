/**
 * Create Director's Palette dashboards
 * Run with: npx tsx scripts/create-directors-palette-dashboards.ts
 */

import { v4 as uuidv4 } from 'uuid';
import Database from 'better-sqlite3';

const db = new Database('./lognog.db');

// Helper to create dashboard with branding
function createDashboard(name: string, description: string, appScope: string, logoUrl?: string, accentColor?: string, headerColor?: string) {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO dashboards (id, name, description, app_scope, logo_url, accent_color, header_color, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(id, name, description, appScope, logoUrl || null, accentColor || null, headerColor || null);
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

console.log('Creating Director\'s Palette dashboards...\n');

// Director's Palette branding
const DP_LOGO = 'https://directors-palette-v2.vercel.app/dp-icon.png';
const DP_ACCENT = '#c9a227';  // Gold
const DP_HEADER = '#1a1a2e';  // Dark purple

// ==========================================
// Dashboard 1: Daily Overview
// ==========================================
const dash1 = createDashboard(
  'DP: Daily Overview',
  'Key metrics at a glance for Director\'s Palette',
  'directors-palette',
  DP_LOGO,
  DP_ACCENT,
  DP_HEADER
);
console.log(`Created dashboard: Daily Overview (${dash1})`);

// Full width charts
createPanel(dash1, 'API Requests Over Time',
  'search app_name=directors-palette | timechart span=1h count',
  'line', { x: 0, y: 0, w: 12, h: 3 });

createPanel(dash1, 'Generations Over Time',
  'search app_name=directors-palette message="generation_completed" | timechart span=1h count',
  'line', { x: 0, y: 3, w: 6, h: 3 });

createPanel(dash1, 'Errors Over Time',
  'search app_name=directors-palette level=error OR level=warn | timechart span=1h count',
  'line', { x: 6, y: 3, w: 6, h: 3 });

// Gauges
createPanel(dash1, 'Total Requests',
  'search app_name=directors-palette | stats count',
  'gauge', { x: 0, y: 6, w: 3, h: 2 });

createPanel(dash1, 'Generations',
  'search app_name=directors-palette message="generation_completed" | stats count',
  'gauge', { x: 3, y: 6, w: 3, h: 2 });

createPanel(dash1, 'Errors',
  'search app_name=directors-palette level=error | stats count',
  'gauge', { x: 6, y: 6, w: 3, h: 2 });

createPanel(dash1, 'Payments',
  'search app_name=directors-palette message="payment_completed" | stats count',
  'gauge', { x: 9, y: 6, w: 3, h: 2 });

// ==========================================
// Dashboard 2: Feature Usage
// ==========================================
const dash2 = createDashboard(
  'DP: Feature Usage',
  'Track which features are used the most in Director\'s Palette',
  'directors-palette',
  DP_LOGO,
  DP_ACCENT,
  DP_HEADER
);
console.log(`Created dashboard: Feature Usage (${dash2})`);

createPanel(dash2, 'Image Generations by Model',
  'search app_name=directors-palette message="generation_completed" | stats count by model | sort -count | head 10',
  'bar', { x: 0, y: 0, w: 6, h: 4 });

createPanel(dash2, 'Recipe Executions',
  'search app_name=directors-palette message="recipe_executed" | timechart span=1d count',
  'line', { x: 6, y: 0, w: 6, h: 4 });

createPanel(dash2, 'Storybook Projects',
  'search app_name=directors-palette message="storybook_project_created" OR message="storybook_project_updated" | timechart span=1d count by message',
  'line', { x: 0, y: 4, w: 6, h: 4 });

createPanel(dash2, 'Story Generation',
  'search app_name=directors-palette message="story_generated" | timechart span=1d count',
  'line', { x: 6, y: 4, w: 6, h: 4 });

createPanel(dash2, 'Animation Prompts',
  'search app_name=directors-palette message="animation_prompt_generated" | timechart span=1d count',
  'line', { x: 0, y: 8, w: 6, h: 4 });

createPanel(dash2, 'Prompt Expansions',
  'search app_name=directors-palette message="prompt_expanded" | timechart span=1d count',
  'line', { x: 6, y: 8, w: 6, h: 4 });

// ==========================================
// Dashboard 3: Revenue & Credits
// ==========================================
const dash3 = createDashboard(
  'DP: Revenue & Credits',
  'Track payments, credit usage, and coupon redemptions',
  'directors-palette',
  DP_LOGO,
  DP_ACCENT,
  DP_HEADER
);
console.log(`Created dashboard: Revenue & Credits (${dash3})`);

createPanel(dash3, 'Payments Over Time',
  'search app_name=directors-palette message="payment_completed" | timechart span=1d count',
  'line', { x: 0, y: 0, w: 6, h: 4 });

createPanel(dash3, 'Credit Deductions Over Time',
  'search app_name=directors-palette message="credit_deduction" | timechart span=1d count',
  'line', { x: 6, y: 0, w: 6, h: 4 });

createPanel(dash3, 'Checkout Sessions',
  'search app_name=directors-palette message="checkout_session_created" | timechart span=1d count',
  'line', { x: 0, y: 4, w: 6, h: 4 });

createPanel(dash3, 'Credit Deductions by Feature',
  'search app_name=directors-palette message="credit_deduction" | stats sum(points) by feature | sort -sum(points)',
  'bar', { x: 6, y: 4, w: 6, h: 4 });

createPanel(dash3, 'Failed Credit Deductions',
  'search app_name=directors-palette message="credit_deduction_failed" | stats count by reason | sort -count',
  'bar', { x: 0, y: 8, w: 6, h: 4 });

createPanel(dash3, 'Webhook Processing',
  'search app_name=directors-palette message="webhook_processed" | timechart span=1d count',
  'line', { x: 6, y: 8, w: 6, h: 4 });

// ==========================================
// Dashboard 4: API Health
// ==========================================
const dash4 = createDashboard(
  'DP: API Health',
  'Monitor API performance and errors',
  'directors-palette',
  DP_LOGO,
  DP_ACCENT,
  DP_HEADER
);
console.log(`Created dashboard: API Health (${dash4})`);

createPanel(dash4, 'Response Codes',
  'search app_name=directors-palette message="POST*" OR message="GET*" | rex field=message "(?<method>POST|GET).*/api/.*(?<status>\\d{3})" | stats count by status | sort status',
  'bar', { x: 0, y: 0, w: 6, h: 4 });

createPanel(dash4, 'Slowest Endpoints',
  'search app_name=directors-palette message="POST*200*" | rex field=message "(?<endpoint>/api/[^ ]+).*\\((?<latency>\\d+)ms\\)" | stats avg(latency) as avg_latency by endpoint | sort -avg_latency | head 10',
  'bar', { x: 6, y: 0, w: 6, h: 4 });

createPanel(dash4, 'OpenRouter Calls',
  'search app_name=directors-palette message="openrouter OK*" OR message="openrouter FAIL*" | timechart span=1h count by message',
  'line', { x: 0, y: 4, w: 6, h: 4 });

createPanel(dash4, 'Replicate Calls',
  'search app_name=directors-palette message="replicate OK*" OR message="replicate FAIL*" | timechart span=1h count by message',
  'line', { x: 6, y: 4, w: 6, h: 4 });

createPanel(dash4, 'ElevenLabs Calls',
  'search app_name=directors-palette message="elevenlabs OK*" OR message="elevenlabs FAIL*" | timechart span=1h count by message',
  'line', { x: 0, y: 8, w: 6, h: 4 });

createPanel(dash4, 'Recent Errors',
  'search app_name=directors-palette level=error | sort -_time | head 20 | table _time message',
  'table', { x: 6, y: 8, w: 6, h: 4 });

// ==========================================
// Dashboard 5: External Service Health
// ==========================================
const dash5 = createDashboard(
  'DP: External Services',
  'Monitor Replicate, OpenRouter, ElevenLabs, and Stripe',
  'directors-palette',
  DP_LOGO,
  DP_ACCENT,
  DP_HEADER
);
console.log(`Created dashboard: External Services (${dash5})`);

createPanel(dash5, 'Replicate Latency (ms)',
  'search app_name=directors-palette message="replicate OK*" | rex field=message "replicate OK (?<latency>\\d+)ms" | timechart span=1h avg(latency)',
  'line', { x: 0, y: 0, w: 6, h: 4 });

createPanel(dash5, 'OpenRouter Latency (ms)',
  'search app_name=directors-palette message="openrouter OK*" | rex field=message "openrouter OK (?<latency>\\d+)ms" | timechart span=1h avg(latency)',
  'line', { x: 6, y: 0, w: 6, h: 4 });

createPanel(dash5, 'Replicate Models Used',
  'search app_name=directors-palette message="replicate OK*" | rex field=message "replicate OK \\d+ms (?<model>[^ ]+)" | stats count by model | sort -count | head 10',
  'pie', { x: 0, y: 4, w: 6, h: 4 });

createPanel(dash5, 'OpenRouter Models Used',
  'search app_name=directors-palette message="openrouter OK*" | rex field=message "openrouter OK \\d+ms (?<model>[^ ]+)" | stats count by model | sort -count | head 10',
  'pie', { x: 6, y: 4, w: 6, h: 4 });

createPanel(dash5, 'ElevenLabs Latency (ms)',
  'search app_name=directors-palette message="elevenlabs OK*" | rex field=message "elevenlabs OK (?<latency>\\d+)ms" | timechart span=1h avg(latency)',
  'line', { x: 0, y: 8, w: 6, h: 4 });

createPanel(dash5, 'Stripe Webhooks',
  'search app_name=directors-palette message="POST /api/webhooks/stripe*" | timechart span=1d count',
  'line', { x: 6, y: 8, w: 6, h: 4 });

console.log('\n✅ Director\'s Palette dashboards created successfully!');
console.log('\nDashboards:');
console.log(`  1. DP: Daily Overview (${dash1})`);
console.log(`  2. DP: Feature Usage (${dash2})`);
console.log(`  3. DP: Revenue & Credits (${dash3})`);
console.log(`  4. DP: API Health (${dash4})`);
console.log(`  5. DP: External Services (${dash5})`);
