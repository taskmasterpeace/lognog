#!/usr/bin/env node
/**
 * Migration script to convert app_scope to projects
 *
 * This script:
 * 1. Gets all unique app_scope values from dashboards
 * 2. Creates a project for each app_scope
 * 3. Updates dashboards to reference their project_id
 * 4. Creates a "Hey You're Hired" project with HYH branding
 */

import { getSQLiteDB, getAppScopes, getDashboards, updateDashboard, createProject, getProjects } from '../src/db/sqlite.js';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function migrate() {
  console.log('Starting migration to projects system...\n');

  const db = getSQLiteDB();

  // Get all unique app scopes
  const appScopes = getAppScopes();
  console.log(`Found ${appScopes.length} unique app scopes:`, appScopes);

  // Check if projects already exist
  const existingProjects = getProjects();
  if (existingProjects.length > 0) {
    console.log(`\n⚠️  ${existingProjects.length} projects already exist. Skipping project creation.`);
    console.log('Existing projects:', existingProjects.map(p => p.name));
    return;
  }

  // Create projects for each app scope
  const projectMap = new Map<string, string>(); // app_scope -> project_id

  for (const appScope of appScopes) {
    if (!appScope || appScope === 'default') {
      // Skip default/empty scopes - these will be migrated to a "General" project
      continue;
    }

    const name = appScope
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    const slug = slugify(appScope);

    try {
      const project = createProject(name, slug, {
        description: `Project for ${name}`,
      });

      projectMap.set(appScope, project.id);
      console.log(`✓ Created project: ${name} (${slug})`);
    } catch (error) {
      console.error(`✗ Failed to create project for ${appScope}:`, error);
    }
  }

  // Create "Hey You're Hired" project with branding if it doesn't exist
  if (!projectMap.has('hey-youre-hired')) {
    try {
      const hyhProject = createProject('Hey You\'re Hired', 'hey-youre-hired', {
        description: 'AI-powered job application tracking system',
        logo_url: 'https://yourehired.ai/logo.png',
        accent_color: '#3b82f6',
      });
      projectMap.set('hey-youre-hired', hyhProject.id);
      console.log('✓ Created Hey You\'re Hired project with branding');
    } catch (error) {
      console.error('✗ Failed to create Hey You\'re Hired project:', error);
    }
  }

  // Create a "General" project for default/empty app scopes
  let generalProjectId: string | undefined;
  try {
    const generalProject = createProject('General', 'general', {
      description: 'General dashboards and monitoring',
    });
    generalProjectId = generalProject.id;
    console.log('✓ Created General project');
  } catch (error) {
    console.error('✗ Failed to create General project:', error);
  }

  // Update all dashboards to reference their project
  console.log('\nMigrating dashboards to projects...');
  const allDashboards = getDashboards();
  let migrated = 0;

  for (const dashboard of allDashboards) {
    const appScope = dashboard.app_scope || 'default';
    const projectId = projectMap.get(appScope) || generalProjectId;

    if (projectId) {
      try {
        updateDashboard(dashboard.id, { project_id: projectId });
        migrated++;
      } catch (error) {
        console.error(`✗ Failed to migrate dashboard ${dashboard.name}:`, error);
      }
    }
  }

  console.log(`\n✓ Migrated ${migrated}/${allDashboards.length} dashboards to projects`);
  console.log('\nMigration complete!');
  console.log('\nNext steps:');
  console.log('1. Update frontend to use projects instead of app_scope');
  console.log('2. Test project filtering and dashboard organization');
  console.log('3. Consider deprecating app_scope field in future versions');
}

// Run migration
migrate();
