import {
  getDashboardTemplates,
  createDashboardTemplate,
  getSavedSearches,
  createSavedSearch,
  deleteSavedSearchByName,
  SavedSearchCreateOptions,
} from '../db/sqlite.js';
import { DASHBOARD_TEMPLATES } from './dashboard-templates.js';

// Pre-built saved searches that showcase common LogNog queries. They seed a
// new install with useful, product-neutral examples across the core commands.
export interface SavedSearchTemplate {
  name: string;
  query: string;
  description: string;
  time_range: string;
  tags: string[];
  is_shared: boolean;
}

export const SAVED_SEARCH_TEMPLATES: SavedSearchTemplate[] = [
  // Errors & health
  {
    name: 'Top Errors (24h)',
    query: 'search severity<=3 | stats count by message | sort desc count | head 50',
    description: 'The 50 most frequent error messages from the last day',
    time_range: '-24h',
    tags: ['getting-started', 'errors'],
    is_shared: true,
  },
  {
    name: 'Errors Over Time',
    query: 'search severity<=3 | timechart span=1h count',
    description: 'Hourly error volume — spot spikes at a glance',
    time_range: '-24h',
    tags: ['getting-started', 'errors', 'trends'],
    is_shared: true,
  },
  {
    name: 'Recent Warnings',
    query: 'search severity=4 | table timestamp, hostname, message | sort desc timestamp | head 100',
    description: 'Latest warning-level events with host and message',
    time_range: '-24h',
    tags: ['getting-started', 'errors'],
    is_shared: true,
  },

  // Volume & trends
  {
    name: 'Log Volume Trend',
    query: 'search * | timechart span=1h count',
    description: 'Total events per hour across all sources',
    time_range: '-24h',
    tags: ['getting-started', 'volume', 'trends'],
    is_shared: true,
  },
  {
    name: 'Top Hosts by Volume',
    query: 'search * | stats count by hostname | sort desc count | head 20',
    description: 'Which hosts are sending the most logs',
    time_range: '-24h',
    tags: ['getting-started', 'volume'],
    is_shared: true,
  },
  {
    name: 'Volume by Source',
    query: 'search * | stats count by source | sort desc count | head 20',
    description: 'Event counts grouped by log source',
    time_range: '-24h',
    tags: ['getting-started', 'volume'],
    is_shared: true,
  },
  {
    name: 'Events by Severity',
    query: 'search * | stats count by severity | sort severity',
    description: 'Distribution of events across severity levels',
    time_range: '-24h',
    tags: ['getting-started', 'volume'],
    is_shared: true,
  },

  // Performance
  {
    name: 'Slow Requests (>5s)',
    query: 'search duration_ms>5000 | table timestamp, hostname, duration_ms, message | sort desc duration_ms',
    description: 'Requests taking longer than 5 seconds, slowest first',
    time_range: '-24h',
    tags: ['getting-started', 'performance'],
    is_shared: true,
  },

  // Security
  {
    name: 'Authentication Failures',
    query: 'search message~"authentication failed" OR message~"login failed" | stats count by hostname | sort desc count',
    description: 'Failed sign-in attempts grouped by host',
    time_range: '-24h',
    tags: ['getting-started', 'security', 'auth'],
    is_shared: true,
  },
  {
    name: 'Top Sources by Error Rate',
    query: 'search severity<=3 | stats count by source | sort desc count | head 20',
    description: 'Which sources are producing the most errors',
    time_range: '-24h',
    tags: ['getting-started', 'security', 'errors'],
    is_shared: true,
  },
];

export function seedDashboardTemplates(): void {
  const existingTemplates = getDashboardTemplates();
  const existingNames = new Set(existingTemplates.map(t => t.name));

  let seeded = 0;

  for (const template of DASHBOARD_TEMPLATES) {
    if (!existingNames.has(template.name)) {
      createDashboardTemplate(
        template.name,
        JSON.stringify(template.template),
        {
          description: template.description,
          category: template.category,
          required_sources: template.required_sources,
        }
      );
      seeded++;
      console.log(`[Templates] Seeded: ${template.name}`);
    }
  }

  if (seeded > 0) {
    console.log(`[Templates] Seeded ${seeded} new dashboard templates`);
  } else {
    console.log('[Templates] All templates already exist');
  }
}

export function seedSavedSearches(): void {
  const existingSearches = getSavedSearches();
  const existingNames = new Set(existingSearches.map((s) => s.name));

  let seeded = 0;

  for (const template of SAVED_SEARCH_TEMPLATES) {
    if (!existingNames.has(template.name)) {
      const options: SavedSearchCreateOptions = {
        description: template.description,
        is_shared: template.is_shared,
        time_range: template.time_range,
        tags: template.tags,
      };
      createSavedSearch(template.name, template.query, options);
      seeded++;
      console.log(`[SavedSearches] Seeded: ${template.name}`);
    }
  }

  if (seeded > 0) {
    console.log(`[SavedSearches] Seeded ${seeded} new saved searches`);
  } else {
    console.log('[SavedSearches] All saved searches already exist');
  }
}

export function reseedSavedSearches(): { deleted: number; created: number } {
  let deleted = 0;
  let created = 0;

  // Delete all template-based saved searches by name
  for (const template of SAVED_SEARCH_TEMPLATES) {
    if (deleteSavedSearchByName(template.name)) {
      deleted++;
      console.log(`[SavedSearches] Deleted: ${template.name}`);
    }
  }

  // Recreate all saved searches from templates
  for (const template of SAVED_SEARCH_TEMPLATES) {
    const options: SavedSearchCreateOptions = {
      description: template.description,
      is_shared: template.is_shared,
      time_range: template.time_range,
      tags: template.tags,
    };
    createSavedSearch(template.name, template.query, options);
    created++;
    console.log(`[SavedSearches] Created: ${template.name}`);
  }

  console.log(`[SavedSearches] Reseed complete: deleted ${deleted}, created ${created}`);
  return { deleted, created };
}

export default seedDashboardTemplates;
