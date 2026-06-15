const Database = require('better-sqlite3');
const db = new Database('./lognog.db');

const rows = db.prepare(`
  SELECT id, name
  FROM dashboards
  WHERE app_scope = 'hey-youre-hired'
  ORDER BY name
`).all();

console.log('Hey You\'re Hired Dashboards:');
rows.forEach((row, i) => {
  console.log(`  ${i + 1}. ${row.name}`);
  console.log(`     ID: ${row.id}`);
});

console.log(`\nTotal: ${rows.length} dashboards`);

// Count panels
const panelCount = db.prepare(`
  SELECT COUNT(*) as count
  FROM dashboard_panels p
  JOIN dashboards d ON p.dashboard_id = d.id
  WHERE d.app_scope = 'hey-youre-hired'
`).get();

console.log(`Total panels: ${panelCount.count}`);

db.close();
