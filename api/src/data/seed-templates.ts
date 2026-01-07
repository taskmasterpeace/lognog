import {
  getDashboardTemplates,
  createDashboardTemplate,
  getSavedSearches,
  createSavedSearch,
  deleteSavedSearchByName,
  SavedSearchCreateOptions,
} from '../db/sqlite.js';
import { DASHBOARD_TEMPLATES } from './dashboard-templates.js';

// Pre-built saved searches for Hey You're Hired SaaS analytics
export interface SavedSearchTemplate {
  name: string;
  query: string;
  description: string;
  time_range: string;
  tags: string[];
  is_shared: boolean;
}

export const SAVED_SEARCH_TEMPLATES: SavedSearchTemplate[] = [
  // Funnel Tracking
  {
    name: 'New Signups Today',
    query: 'search message~"User signup completed" | stats count by user_email | sort desc count',
    description: 'All user signups from today with email addresses',
    time_range: '-24h',
    tags: ['hey-youre-hired', 'funnel', 'signups'],
    is_shared: true,
  },
  {
    name: 'Signups by UTM Source',
    query: 'search message~"User signup completed" | stats count by utm_source | sort desc count',
    description: 'Track which marketing channels drive signups',
    time_range: '-7d',
    tags: ['hey-youre-hired', 'funnel', 'marketing'],
    is_shared: true,
  },
  {
    name: 'Profile Completions',
    query: 'search message~"Profile completion" | stats count by user_email, completion_step | sort desc count',
    description: 'Track profile wizard completion rates',
    time_range: '-7d',
    tags: ['hey-youre-hired', 'funnel', 'onboarding'],
    is_shared: true,
  },
  {
    name: 'Checkout Attempts',
    query: 'search message~"Checkout" | stats count by user_email, plan_name | sort desc count',
    description: 'All checkout page visits and attempts',
    time_range: '-7d',
    tags: ['hey-youre-hired', 'funnel', 'payments'],
    is_shared: true,
  },
  {
    name: 'Successful Conversions',
    query: 'search message~"Subscription created" OR message~"Payment successful" | stats count by user_email, plan_name | sort desc count',
    description: 'Completed subscription purchases',
    time_range: '-7d',
    tags: ['hey-youre-hired', 'funnel', 'payments', 'conversions'],
    is_shared: true,
  },

  // Feature Usage
  {
    name: 'Job Recommendations Usage',
    query: 'search message~"Job recommendations" feature_name="job_recommendations" | stats count by user_email | sort desc count',
    description: 'Track job recommendation feature usage per user',
    time_range: '-7d',
    tags: ['hey-youre-hired', 'features', 'ai'],
    is_shared: true,
  },
  {
    name: 'Cover Letter Usage',
    query: 'search message~"Cover letter" feature_name="cover_letter" | stats count by user_email | sort desc count',
    description: 'Track AI cover letter generation usage',
    time_range: '-7d',
    tags: ['hey-youre-hired', 'features', 'ai'],
    is_shared: true,
  },
  {
    name: 'Slow Job Searches (>5s)',
    query: 'search message~"Job search completed" duration_ms>5000 | table timestamp, user_email, duration_ms, query | sort desc duration_ms',
    description: 'Identify slow-performing job searches for optimization',
    time_range: '-24h',
    tags: ['hey-youre-hired', 'performance'],
    is_shared: true,
  },

  // Error Tracking
  {
    name: 'All Errors Today',
    query: 'search severity<=3 | stats count by message | sort desc count | head 50',
    description: 'Top 50 error messages from today',
    time_range: '-24h',
    tags: ['hey-youre-hired', 'errors'],
    is_shared: true,
  },
  {
    name: 'OAuth Failures',
    query: 'search message~"OAuth login failed" | stats count by error_reason, provider | sort desc count',
    description: 'Track Google/OAuth authentication failures',
    time_range: '-24h',
    tags: ['hey-youre-hired', 'errors', 'auth'],
    is_shared: true,
  },
  {
    name: 'Payment Issues',
    query: 'search message~"Subscription sync failed" OR message~"Stripe webhook error" OR message~"Payment failed" | table timestamp, user_email, error, message',
    description: 'All payment and subscription related errors',
    time_range: '-7d',
    tags: ['hey-youre-hired', 'errors', 'payments'],
    is_shared: true,
  },
  {
    name: 'External API Errors',
    query: 'search message~"External API" (message~"failed" OR message~"error" OR message~"timeout") | stats count by api_name, error_type | sort desc count',
    description: 'JobSpy, Active Jobs DB, and other external API failures',
    time_range: '-24h',
    tags: ['hey-youre-hired', 'errors', 'integrations'],
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
