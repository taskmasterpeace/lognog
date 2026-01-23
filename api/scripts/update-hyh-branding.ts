/**
 * Update Hey You're Hired dashboards with branding
 *
 * Run with:
 *   LOGNOG_API_KEY=your-api-key npx tsx scripts/update-hyh-branding.ts
 *
 * Or set LOGNOG_API_KEY in your .env file
 */

const CLOUD_URL = process.env.LOGNOG_URL || 'https://logs.machinekinglabs.com';
const API_KEY = process.env.LOGNOG_API_KEY;

// HYH Brand colors
const HYH_BRANDING = {
  logo_url: 'https://www.heyyourehired.com/logo.png',
  accent_color: '#00bcd4',  // HYH cyan
  header_color: '#001f3f',  // HYH navy
};

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (API_KEY) {
    headers['Authorization'] = `ApiKey ${API_KEY}`;
  }

  return headers;
}

async function getAllDashboards() {
  const response = await fetch(`${CLOUD_URL}/api/dashboards`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch dashboards: ${response.status}`);
  }
  return response.json();
}

async function updateDashboardBranding(dashboardId: string, branding: typeof HYH_BRANDING) {
  const response = await fetch(`${CLOUD_URL}/api/dashboards/${dashboardId}/branding`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(branding),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update branding: ${response.status} - ${error}`);
  }
  return response.json();
}

async function main() {
  console.log('HYH Dashboard Branding Updater\n');
  console.log('='.repeat(50));

  if (!API_KEY) {
    console.log('WARNING: No LOGNOG_API_KEY set. API key required for authenticated requests.');
    console.log('Set it with: LOGNOG_API_KEY=your-key npx tsx scripts/update-hyh-branding.ts\n');
  } else {
    console.log(`Using API key: ${API_KEY.substring(0, 8)}...`);
  }

  console.log(`Target: ${CLOUD_URL}\n`);
  console.log('Fetching all dashboards...\n');

  const dashboards = await getAllDashboards();
  console.log(`Found ${dashboards.length} total dashboards\n`);

  // Filter HYH dashboards
  const hyhDashboards = dashboards.filter((d: any) =>
    d.name.startsWith('HYH:') ||
    d.name.toLowerCase().includes('hey you') ||
    d.name.toLowerCase().includes('yourehired')
  );

  console.log(`Found ${hyhDashboards.length} HYH dashboards to update:\n`);

  for (const dashboard of hyhDashboards) {
    console.log(`  - ${dashboard.name} (${dashboard.id})`);
  }
  console.log('');

  // Update each dashboard
  for (const dashboard of hyhDashboards) {
    console.log(`Updating: ${dashboard.name}...`);
    try {
      await updateDashboardBranding(dashboard.id, HYH_BRANDING);
      console.log(`  ✅ Updated branding`);
    } catch (error) {
      console.log(`  ❌ Error: ${error}`);
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
