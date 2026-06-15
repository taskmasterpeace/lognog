/**
 * Sync Hey You're Hired dashboards to cloud LogNog
 * Run with: npx tsx scripts/sync-dashboards-to-cloud.ts
 */

import Database from 'better-sqlite3';

const db = new Database('./lognog.db');
const CLOUD_URL = 'https://logs.machinekinglabs.com';

// Get all HYH dashboards with their panels
function getHYHDashboards() {
  const dashboards = db.prepare(`
    SELECT * FROM dashboards
    WHERE app_scope = 'hey-youre-hired'
    AND name LIKE 'HYH:%'
    ORDER BY name
  `).all() as any[];

  return dashboards.map(dash => {
    const panels = db.prepare(`
      SELECT * FROM dashboard_panels
      WHERE dashboard_id = ?
      ORDER BY position_y, position_x
    `).all(dash.id) as any[];

    return {
      name: dash.name,
      description: dash.description,
      app_scope: dash.app_scope,
      logo_url: dash.logo_url,
      accent_color: dash.accent_color,
      header_color: dash.header_color,
      panels: panels.map(p => ({
        title: p.title,
        query: p.query,
        visualization: p.visualization,
        options: p.options ? JSON.parse(p.options) : {},
        position_x: p.position_x,
        position_y: p.position_y,
        width: p.width,
        height: p.height,
      })),
    };
  });
}

async function syncDashboards() {
  const dashboards = getHYHDashboards();
  console.log(`Found ${dashboards.length} HYH dashboards to sync\n`);

  for (const dashboard of dashboards) {
    console.log(`Syncing: ${dashboard.name}`);
    console.log(`  Panels: ${dashboard.panels.length}`);

    try {
      const response = await fetch(`${CLOUD_URL}/api/dashboards/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          template: dashboard,
          name: dashboard.name,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`  ✅ Created: ${result.id}`);
      } else {
        const error = await response.text();
        console.log(`  ❌ Failed: ${response.status} - ${error}`);
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error}`);
    }
    console.log('');
  }
}

// Also export as JSON file for backup/manual import
function exportAsJson() {
  const dashboards = getHYHDashboards();
  const exportPath = './exports/hyh-dashboards.json';

  // Ensure exports directory exists
  const fs = require('fs');
  if (!fs.existsSync('./exports')) {
    fs.mkdirSync('./exports');
  }

  fs.writeFileSync(exportPath, JSON.stringify(dashboards, null, 2));
  console.log(`Exported ${dashboards.length} dashboards to ${exportPath}`);
}

console.log('Hey You\'re Hired Dashboard Sync\n');
console.log('='.repeat(50));

// Export to JSON first
exportAsJson();

console.log('\n' + '='.repeat(50));
console.log('Syncing to cloud...\n');

syncDashboards().then(() => {
  console.log('Done!');
  db.close();
}).catch(err => {
  console.error('Sync failed:', err);
  db.close();
  process.exit(1);
});
