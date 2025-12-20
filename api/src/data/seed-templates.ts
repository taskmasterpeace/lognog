import { getDashboardTemplates, createDashboardTemplate } from '../db/sqlite.js';
import { DASHBOARD_TEMPLATES } from './dashboard-templates.js';

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

export default seedDashboardTemplates;
