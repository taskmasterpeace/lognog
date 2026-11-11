// Machine King Labs products and their logos, so LogNog can show which project a log
// source or dashboard belongs to. Logos live in ui/public/brands/ (copied from the studio
// brand guides at N:/enterprise/brand/<slug>/). Matching is by app_name / app_scope / project slug: a known full name, exactly or as
// the start of a longer name ("directors-palette-api"). No short nicknames like "tap" or
// "football", so an unrelated app with that name never gets a product logo.

export interface ProjectBrand {
  slug: string;
  name: string;
  logo: string;
  /** Brand accent, used for the ring around the logo. */
  accent: string;
  /** Logo art is drawn for a light ground; show it on a cream plate. */
  lightPlate?: boolean;
  aliases: string[];
}

export const PROJECT_BRANDS: ProjectBrand[] = [
  { slug: 'machine-king-labs', name: 'Machine King Labs', logo: '/brands/machine-king-labs.png', accent: '#E0A526', lightPlate: true, aliases: ['machinekinglabs'] },
  { slug: 'first-huddle-football', name: 'First Huddle Football', logo: '/brands/first-huddle-football.jpg', accent: '#EBB432', aliases: ['first-huddle', 'firsthuddle'] },
  { slug: 'consequences-of-failure', name: 'Consequences of Failure', logo: '/brands/consequences-of-failure.png', accent: '#FFD52A', aliases: ['war-world', 'warworld', 'living-superweapon'] },
  { slug: 'directors-palette', name: 'Directors Palette', logo: '/brands/directors-palette.svg', accent: '#F59E0B', aliases: ['directorspalette'] },
  { slug: 'hey-youre-hired', name: "Hey, You're Hired!", logo: '/brands/hey-youre-hired.svg', accent: '#3B82F6', lightPlate: true, aliases: ['heyyourehired', 'yourehired'] },
  { slug: 'talk-advantage-pro', name: 'Talk Advantage Pro', logo: '/brands/talk-advantage-pro.png', accent: '#B29960', aliases: ['talkadvantage', 'talk-advantage'] },
  { slug: 'homework-tree', name: 'Homework Tree', logo: '/brands/homework-tree.svg', accent: '#2E9E52', aliases: ['homeworktree', 'knowledge-league'] },
  { slug: 'lognog', name: 'LogNog', logo: '/brands/lognog.png', accent: '#C8862B', aliases: [] },
  { slug: 'myfieldtime', name: 'MyFieldTime', logo: '/brands/myfieldtime.png', accent: '#FFDD00', lightPlate: true, aliases: ['my-field-time', 'hey-its-my-contractor'] },
  { slug: 'aiobr', name: 'AIOBR', logo: '/brands/aiobr.png', accent: '#B1292B', lightPlate: true, aliases: ['algorithm-institute', 'listen-room'] },
  { slug: 'casethread', name: 'CaseThread', logo: '/brands/casethread.svg', accent: '#21B0B2', aliases: ['case-thread'] },
  { slug: 'knuckle-up', name: 'KNUCKLE UP', logo: '/brands/knuckle-up.svg', accent: '#F5B21A', aliases: ['knuckleup', 'mugen-platform'] },
  { slug: 'dramatis', name: 'DRAMATIS', logo: '/brands/dramatis.svg', accent: '#3EC5CF', aliases: ['audio-movie-studio', 'audiomoviestudio'] },
  { slug: 'verbadeck', name: 'VerbaDeck', logo: '/brands/verbadeck.png', accent: '#15A6D6', aliases: ['verba-deck'] },
  { slug: 'presidium', name: 'Presidium', logo: '/brands/presidium.png', accent: '#FFD629', aliases: [] },
];

const norm = (s: string) => s.toLowerCase().trim().replace(/[\s_.]+/g, '-').replace(/[^a-z0-9-]/g, '');

const KEYS: Array<[string, ProjectBrand]> = [];
for (const b of PROJECT_BRANDS) {
  for (const key of new Set([b.slug, norm(b.name), ...b.aliases.map(norm)])) KEYS.push([key, b]);
}
// Longest names first, so "talk-advantage-pro" wins over "talk-advantage".
KEYS.sort((a, z) => z[0].length - a[0].length);

/**
 * Find the product for an app_name, app_scope or project slug. Matches a known full name
 * exactly (dashes optional) or as the start of a longer dashed name, e.g. "lognog-api".
 */
export function findProjectBrand(value?: string | null): ProjectBrand | undefined {
  if (!value) return undefined;
  const n = norm(value);
  if (!n) return undefined;
  const flat = n.replace(/-/g, '');
  for (const [key, b] of KEYS) {
    if (n === key || flat === key.replace(/-/g, '') || n.startsWith(key + '-')) return b;
  }
  return undefined;
}

/**
 * Dashboard groups (app_scope) the studio named itself. They are short everyday words, so
 * they are matched only for dashboards, never for log sources: "game" as an app name could
 * be anything, but the "Game" dashboard group is always Consequences of Failure.
 */
export const DASHBOARD_SCOPE_BRANDS: Record<string, string> = {
  game: 'consequences-of-failure',
  studio: 'machine-king-labs',
  'main-suite': 'machine-king-labs',
};

/** Find the product for a dashboard's app_scope: a known product name first, then the studio's own group names. */
export function findDashboardBrand(scope?: string | null): ProjectBrand | undefined {
  const known = findProjectBrand(scope);
  if (known) return known;
  if (!scope) return undefined;
  const slug = DASHBOARD_SCOPE_BRANDS[norm(scope)];
  return slug ? PROJECT_BRANDS.find((b) => b.slug === slug) : undefined;
}

/** A dashboard group's name as people read it: "main-suite" -> "Main Suite". */
export function scopeLabel(scope: string): string {
  return scope
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
