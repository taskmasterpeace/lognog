/**
 * Create Director's Palette dashboards via API
 * Run with: npx tsx scripts/create-dp-dashboards-api.ts
 */

const API_KEY = process.env.LOGNOG_API_KEY || 'lnog_9cca1d3815a34aba8e5308c5b5725f66_07917f78f1b6499db732bd2dadd1b22b9ae1dc0d091e4287977fcb7f40c49cf8';
const API_URL = process.env.LOGNOG_URL || 'http://localhost:4000';

// Director's Palette branding
const DP_LOGO = 'https://directors-palette-v2.vercel.app/dp-icon.png';
const DP_ACCENT = '#c9a227';  // Gold
const DP_HEADER = '#1a1a2e';  // Dark purple

interface Dashboard {
  id: string;
  name: string;
}

interface Panel {
  title: string;
  query: string;
  visualization: string;
  position: { x: number; y: number; w: number; h: number };
}

async function createDashboard(name: string, description: string): Promise<string> {
  const response = await fetch(`${API_URL}/dashboards`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify({
      name,
      description,
      app_scope: 'directors-palette',
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create dashboard: ${response.statusText}`);
  }

  const data = await response.json() as Dashboard;

  // Update branding
  await fetch(`${API_URL}/dashboards/${data.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify({
      logo_url: DP_LOGO,
      accent_color: DP_ACCENT,
      header_color: DP_HEADER,
    }),
  });

  return data.id;
}

async function createPanel(dashboardId: string, panel: Panel): Promise<void> {
  const response = await fetch(`${API_URL}/dashboards/${dashboardId}/panels`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify({
      title: panel.title,
      query: panel.query,
      visualization: panel.visualization,
      options: {},
      position_x: panel.position.x,
      position_y: panel.position.y,
      width: panel.position.w,
      height: panel.position.h,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Failed to create panel "${panel.title}": ${text}`);
  }
}

async function main() {
  console.log('Creating Director\'s Palette dashboards via API...\n');

  // Check if dashboards already exist
  const existingResponse = await fetch(`${API_URL}/dashboards?app_scope=directors-palette`, {
    headers: { 'X-API-Key': API_KEY },
  });
  const existing = await existingResponse.json() as Dashboard[];

  if (existing.length > 0) {
    console.log(`Found ${existing.length} existing Director's Palette dashboards.`);
    console.log('Deleting existing dashboards...');

    for (const dash of existing) {
      await fetch(`${API_URL}/dashboards/${dash.id}`, {
        method: 'DELETE',
        headers: { 'X-API-Key': API_KEY },
      });
      console.log(`  Deleted: ${dash.name}`);
    }
    console.log('');
  }

  // Dashboard 1: Daily Overview
  console.log('Creating Dashboard 1: Daily Overview');
  const dash1 = await createDashboard('DP: Daily Overview', 'Key metrics at a glance for Director\'s Palette');

  const dash1Panels: Panel[] = [
    { title: 'API Requests Over Time', query: 'search app_name=directors-palette | timechart span=1h count', visualization: 'line', position: { x: 0, y: 0, w: 12, h: 3 } },
    { title: 'Generations Over Time', query: 'search app_name=directors-palette message="generation_completed" | timechart span=1h count', visualization: 'line', position: { x: 0, y: 3, w: 6, h: 3 } },
    { title: 'Errors Over Time', query: 'search app_name=directors-palette level=error OR level=warn | timechart span=1h count', visualization: 'line', position: { x: 6, y: 3, w: 6, h: 3 } },
    { title: 'Total Requests', query: 'search app_name=directors-palette | stats count', visualization: 'gauge', position: { x: 0, y: 6, w: 3, h: 2 } },
    { title: 'Generations', query: 'search app_name=directors-palette message="generation_completed" | stats count', visualization: 'gauge', position: { x: 3, y: 6, w: 3, h: 2 } },
    { title: 'Errors', query: 'search app_name=directors-palette level=error | stats count', visualization: 'gauge', position: { x: 6, y: 6, w: 3, h: 2 } },
    { title: 'Payments', query: 'search app_name=directors-palette message="payment_completed" | stats count', visualization: 'gauge', position: { x: 9, y: 6, w: 3, h: 2 } },
  ];

  for (const panel of dash1Panels) {
    await createPanel(dash1, panel);
  }
  console.log(`  Created ${dash1Panels.length} panels\n`);

  // Dashboard 2: Feature Usage
  console.log('Creating Dashboard 2: Feature Usage');
  const dash2 = await createDashboard('DP: Feature Usage', 'Track which features are used the most in Director\'s Palette');

  const dash2Panels: Panel[] = [
    { title: 'Image Generations by Model', query: 'search app_name=directors-palette message="generation_completed" | stats count by model | sort -count | head 10', visualization: 'bar', position: { x: 0, y: 0, w: 6, h: 4 } },
    { title: 'Recipe Executions', query: 'search app_name=directors-palette message="recipe_executed" | timechart span=1d count', visualization: 'line', position: { x: 6, y: 0, w: 6, h: 4 } },
    { title: 'Storybook Projects', query: 'search app_name=directors-palette message="storybook_project_created" OR message="storybook_project_updated" | timechart span=1d count by message', visualization: 'line', position: { x: 0, y: 4, w: 6, h: 4 } },
    { title: 'Story Generation', query: 'search app_name=directors-palette message="story_generated" | timechart span=1d count', visualization: 'line', position: { x: 6, y: 4, w: 6, h: 4 } },
    { title: 'Animation Prompts', query: 'search app_name=directors-palette message="animation_prompt_generated" | timechart span=1d count', visualization: 'line', position: { x: 0, y: 8, w: 6, h: 4 } },
    { title: 'Prompt Expansions', query: 'search app_name=directors-palette message="prompt_expanded" | timechart span=1d count', visualization: 'line', position: { x: 6, y: 8, w: 6, h: 4 } },
  ];

  for (const panel of dash2Panels) {
    await createPanel(dash2, panel);
  }
  console.log(`  Created ${dash2Panels.length} panels\n`);

  // Dashboard 3: Revenue & Credits
  console.log('Creating Dashboard 3: Revenue & Credits');
  const dash3 = await createDashboard('DP: Revenue & Credits', 'Track payments, credit usage, and coupon redemptions');

  const dash3Panels: Panel[] = [
    { title: 'Payments Over Time', query: 'search app_name=directors-palette message="payment_completed" | timechart span=1d count', visualization: 'line', position: { x: 0, y: 0, w: 6, h: 4 } },
    { title: 'Credit Deductions Over Time', query: 'search app_name=directors-palette message="credit_deduction" | timechart span=1d count', visualization: 'line', position: { x: 6, y: 0, w: 6, h: 4 } },
    { title: 'Checkout Sessions', query: 'search app_name=directors-palette message="checkout_session_created" | timechart span=1d count', visualization: 'line', position: { x: 0, y: 4, w: 6, h: 4 } },
    { title: 'Credit Deductions by Feature', query: 'search app_name=directors-palette message="credit_deduction" | stats sum(points) by feature | sort -sum(points)', visualization: 'bar', position: { x: 6, y: 4, w: 6, h: 4 } },
    { title: 'Failed Credit Deductions', query: 'search app_name=directors-palette message="credit_deduction_failed" | stats count by reason | sort -count', visualization: 'bar', position: { x: 0, y: 8, w: 6, h: 4 } },
    { title: 'Webhook Processing', query: 'search app_name=directors-palette message="webhook_processed" | timechart span=1d count', visualization: 'line', position: { x: 6, y: 8, w: 6, h: 4 } },
  ];

  for (const panel of dash3Panels) {
    await createPanel(dash3, panel);
  }
  console.log(`  Created ${dash3Panels.length} panels\n`);

  // Dashboard 4: API Health
  console.log('Creating Dashboard 4: API Health');
  const dash4 = await createDashboard('DP: API Health', 'Monitor API performance and errors');

  const dash4Panels: Panel[] = [
    { title: 'Response Codes', query: 'search app_name=directors-palette message="POST*" OR message="GET*" | rex field=message "(?<method>POST|GET).*/api/.*(?<status>\\d{3})" | stats count by status | sort status', visualization: 'bar', position: { x: 0, y: 0, w: 6, h: 4 } },
    { title: 'Slowest Endpoints', query: 'search app_name=directors-palette message="POST*200*" | rex field=message "(?<endpoint>/api/[^ ]+).*\\((?<latency>\\d+)ms\\)" | stats avg(latency) as avg_latency by endpoint | sort -avg_latency | head 10', visualization: 'bar', position: { x: 6, y: 0, w: 6, h: 4 } },
    { title: 'OpenRouter Calls', query: 'search app_name=directors-palette message="openrouter OK*" OR message="openrouter FAIL*" | timechart span=1h count by message', visualization: 'line', position: { x: 0, y: 4, w: 6, h: 4 } },
    { title: 'Replicate Calls', query: 'search app_name=directors-palette message="replicate OK*" OR message="replicate FAIL*" | timechart span=1h count by message', visualization: 'line', position: { x: 6, y: 4, w: 6, h: 4 } },
    { title: 'ElevenLabs Calls', query: 'search app_name=directors-palette message="elevenlabs OK*" OR message="elevenlabs FAIL*" | timechart span=1h count by message', visualization: 'line', position: { x: 0, y: 8, w: 6, h: 4 } },
    { title: 'Recent Errors', query: 'search app_name=directors-palette level=error | sort -_time | head 20 | table _time message', visualization: 'table', position: { x: 6, y: 8, w: 6, h: 4 } },
  ];

  for (const panel of dash4Panels) {
    await createPanel(dash4, panel);
  }
  console.log(`  Created ${dash4Panels.length} panels\n`);

  // Dashboard 5: External Services
  console.log('Creating Dashboard 5: External Services');
  const dash5 = await createDashboard('DP: External Services', 'Monitor Replicate, OpenRouter, ElevenLabs, and Stripe');

  const dash5Panels: Panel[] = [
    { title: 'Replicate Latency (ms)', query: 'search app_name=directors-palette message="replicate OK*" | rex field=message "replicate OK (?<latency>\\d+)ms" | timechart span=1h avg(latency)', visualization: 'line', position: { x: 0, y: 0, w: 6, h: 4 } },
    { title: 'OpenRouter Latency (ms)', query: 'search app_name=directors-palette message="openrouter OK*" | rex field=message "openrouter OK (?<latency>\\d+)ms" | timechart span=1h avg(latency)', visualization: 'line', position: { x: 6, y: 0, w: 6, h: 4 } },
    { title: 'Replicate Models Used', query: 'search app_name=directors-palette message="replicate OK*" | rex field=message "replicate OK \\d+ms (?<model>[^ ]+)" | stats count by model | sort -count | head 10', visualization: 'pie', position: { x: 0, y: 4, w: 6, h: 4 } },
    { title: 'OpenRouter Models Used', query: 'search app_name=directors-palette message="openrouter OK*" | rex field=message "openrouter OK \\d+ms (?<model>[^ ]+)" | stats count by model | sort -count | head 10', visualization: 'pie', position: { x: 6, y: 4, w: 6, h: 4 } },
    { title: 'ElevenLabs Latency (ms)', query: 'search app_name=directors-palette message="elevenlabs OK*" | rex field=message "elevenlabs OK (?<latency>\\d+)ms" | timechart span=1h avg(latency)', visualization: 'line', position: { x: 0, y: 8, w: 6, h: 4 } },
    { title: 'Stripe Webhooks', query: 'search app_name=directors-palette message="POST /api/webhooks/stripe*" | timechart span=1d count', visualization: 'line', position: { x: 6, y: 8, w: 6, h: 4 } },
  ];

  for (const panel of dash5Panels) {
    await createPanel(dash5, panel);
  }
  console.log(`  Created ${dash5Panels.length} panels\n`);

  console.log('✅ Director\'s Palette dashboards created successfully!');
  console.log('\nDashboards:');
  console.log(`  1. DP: Daily Overview (${dash1})`);
  console.log(`  2. DP: Feature Usage (${dash2})`);
  console.log(`  3. DP: Revenue & Credits (${dash3})`);
  console.log(`  4. DP: API Health (${dash4})`);
  console.log(`  5. DP: External Services (${dash5})`);
}

main().catch(console.error);
