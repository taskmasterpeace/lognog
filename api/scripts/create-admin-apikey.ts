/**
 * Create an admin API key for automated scripts
 * Run with: npx tsx scripts/create-admin-apikey.ts
 */

import { createApiKey, getUserByUsername, initializeAuthSchema } from '../src/auth/auth.js';

async function main() {
  // Initialize auth schema
  initializeAuthSchema();

  // Get admin user
  const admin = getUserByUsername('admin');
  if (!admin) {
    console.error('Admin user not found. Create one first via the LogNog setup.');
    process.exit(1);
  }

  console.log(`Found admin user: ${admin.username} (${admin.id})`);

  // Create API key with full permissions
  const { apiKey, keyData } = await createApiKey(
    admin.id,
    'Admin Script Key',
    ['*'],  // Full permissions
    null    // No expiration
  );

  console.log('\n✅ API Key Created!\n');
  console.log('Key prefix:', keyData.key_prefix);
  console.log('Full API key (save this - shown only once):');
  console.log('');
  console.log(`  LOGNOG_API_KEY=${apiKey}`);
  console.log('');
  console.log('Add this to your .env file or use it directly with scripts.');
}

main().catch(console.error);
