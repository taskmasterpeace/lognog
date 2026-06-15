/**
 * Add test account exclusions to HYH alerts
 *
 * Run with: npx tsx scripts/add-test-account-exclusions.ts
 *
 * This updates HYH alerts to exclude test accounts from triggering.
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'lognog.db');

const db = new Database(dbPath);

// Patterns to exclude from alerts (test accounts)
const EXCLUSION_PATTERNS = [
  'taskmasterpeace+%',
  'automation-test@%',
];

// Build the exclusion WHERE clause
const exclusionClause = EXCLUSION_PATTERNS
  .map(p => `NOT user_email LIKE "${p}"`)
  .join(' AND ');

console.log('Adding test account exclusions to HYH alerts...\n');
console.log('Exclusion clause:', exclusionClause);
console.log('');

// Get all alerts that target hey-youre-hired index
const alerts = db.prepare(`
  SELECT id, name, search_query, enabled
  FROM alerts
  WHERE search_query LIKE '%hey-youre-hired%'
     OR search_query LIKE '%heyyourehired%'
`).all() as { id: string; name: string; search_query: string; enabled: number }[];

if (alerts.length === 0) {
  console.log('No HYH alerts found.');
  process.exit(0);
}

console.log(`Found ${alerts.length} HYH alert(s):\n`);

for (const alert of alerts) {
  console.log(`- ${alert.name} (${alert.enabled ? 'enabled' : 'disabled'})`);
  console.log(`  Current query: ${alert.search_query.substring(0, 80)}...`);

  // Check if already has exclusion
  if (alert.search_query.includes('taskmasterpeace')) {
    console.log('  ✓ Already has exclusion, skipping\n');
    continue;
  }

  // Add exclusion - insert WHERE clause after the search portion
  let newQuery = alert.search_query;

  // If query already has a WHERE/filter, append with AND
  if (newQuery.includes('| where ') || newQuery.includes('| filter ')) {
    // Find the where clause and append to it
    newQuery = newQuery.replace(
      /(\| where\s+)([^|]+)/i,
      `$1$2 AND (${exclusionClause})`
    );
  } else {
    // Add a new where clause after the search
    // Find a good insertion point (after search, before stats/sort/etc)
    const pipeIndex = newQuery.indexOf('|');
    if (pipeIndex > 0) {
      newQuery = newQuery.slice(0, pipeIndex) + `| where ${exclusionClause} ` + newQuery.slice(pipeIndex);
    } else {
      newQuery = newQuery + ` | where ${exclusionClause}`;
    }
  }

  console.log(`  New query: ${newQuery.substring(0, 100)}...`);

  // Update the alert
  db.prepare('UPDATE alerts SET search_query = ?, updated_at = datetime("now") WHERE id = ?')
    .run(newQuery, alert.id);

  console.log('  ✓ Updated\n');
}

console.log('Done!');
db.close();
