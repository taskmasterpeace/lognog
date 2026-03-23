import { v4 as uuidv4 } from 'uuid';
import { getSQLiteDB } from './sqlite.js';

// Projects
export interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logo_url?: string;
  accent_color?: string;
  sort_order: number;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

export interface DashboardLogo {
  id: string;
  dashboard_id: string;
  logo_url: string;
  label?: string;
  position: number;
  created_at: string;
}

export function createProject(
  name: string,
  slug: string,
  options: {
    description?: string;
    logo_url?: string;
    accent_color?: string;
    sort_order?: number;
  } = {}
): Project {
  const database = getSQLiteDB();
  const id = uuidv4();
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO projects (id, name, slug, description, logo_url, accent_color, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name,
    slug,
    options.description || null,
    options.logo_url || null,
    options.accent_color || null,
    options.sort_order || 0,
    now,
    now
  );

  return database.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project;
}

export function getProjects(): Project[] {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM projects WHERE is_archived = 0 ORDER BY sort_order, name').all() as Project[];
}

export function getProject(id: string): Project | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
}

export function getProjectBySlug(slug: string): Project | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM projects WHERE slug = ?').get(slug) as Project | undefined;
}

export function updateProject(
  id: string,
  updates: {
    name?: string;
    slug?: string;
    description?: string;
    logo_url?: string;
    accent_color?: string;
    sort_order?: number;
    is_archived?: number;
  }
): Project | undefined {
  const database = getSQLiteDB();
  const now = new Date().toISOString();

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.slug !== undefined) {
    fields.push('slug = ?');
    values.push(updates.slug);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.logo_url !== undefined) {
    fields.push('logo_url = ?');
    values.push(updates.logo_url);
  }
  if (updates.accent_color !== undefined) {
    fields.push('accent_color = ?');
    values.push(updates.accent_color);
  }
  if (updates.sort_order !== undefined) {
    fields.push('sort_order = ?');
    values.push(updates.sort_order);
  }
  if (updates.is_archived !== undefined) {
    fields.push('is_archived = ?');
    values.push(updates.is_archived);
  }

  if (fields.length > 0) {
    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);

    database.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  return database.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
}

export function deleteProject(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM projects WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getDashboardsByProject(projectId: string): Dashboard[] {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM dashboards WHERE project_id = ? ORDER BY updated_at DESC').all(projectId) as Dashboard[];
}

// Dashboard Logos
export function addDashboardLogo(
  dashboardId: string,
  logoUrl: string,
  options: {
    label?: string;
    position?: number;
  } = {}
): DashboardLogo {
  const database = getSQLiteDB();
  const id = uuidv4();
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO dashboard_logos (id, dashboard_id, logo_url, label, position, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    dashboardId,
    logoUrl,
    options.label || null,
    options.position || 0,
    now
  );

  return database.prepare('SELECT * FROM dashboard_logos WHERE id = ?').get(id) as DashboardLogo;
}

export function getDashboardLogos(dashboardId: string): DashboardLogo[] {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM dashboard_logos WHERE dashboard_id = ? ORDER BY position').all(dashboardId) as DashboardLogo[];
}

export function removeDashboardLogo(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM dashboard_logos WHERE id = ?').run(id);
  return result.changes > 0;
}

export function reorderDashboardLogos(dashboardId: string, logoIds: string[]): void {
  const database = getSQLiteDB();
  const stmt = database.prepare('UPDATE dashboard_logos SET position = ? WHERE id = ? AND dashboard_id = ?');

  logoIds.forEach((logoId, index) => {
    stmt.run(index, logoId, dashboardId);
  });
}

// Dashboards
export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  layout: string;
  logo_url?: string;
  accent_color?: string;
  header_color?: string;
  is_public?: number;
  public_token?: string;
  public_password?: string;
  app_scope?: string;
  category?: string;
  project_id?: string;
  created_at: string;
  updated_at: string;
}

export interface DashboardPanel {
  id: string;
  dashboard_id: string;
  title: string;
  query: string;
  visualization: string;
  options: string;
  source_panel_id?: string;
  source_dashboard_id?: string;
  source_project_id?: string;
  copied_at?: string;
  copy_generation?: number;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  description?: string;
  page_id?: string;
}

export interface DashboardPage {
  id: string;
  dashboard_id: string;
  name: string;
  icon?: string;
  sort_order: number;
  created_at?: string;
}

export function getDashboards(appScope?: string): (Dashboard & { panel_count: number })[] {
  const database = getSQLiteDB();
  const baseQuery = `
    SELECT d.*, COUNT(p.id) as panel_count
    FROM dashboards d
    LEFT JOIN dashboard_panels p ON d.id = p.dashboard_id
  `;
  if (appScope && appScope !== 'all') {
    return database.prepare(baseQuery + ' WHERE d.app_scope = ? GROUP BY d.id ORDER BY d.updated_at DESC').all(appScope) as (Dashboard & { panel_count: number })[];
  }
  return database.prepare(baseQuery + ' GROUP BY d.id ORDER BY d.updated_at DESC').all() as (Dashboard & { panel_count: number })[];
}

export function getAppScopes(): string[] {
  const database = getSQLiteDB();
  const dashboardScopes = database.prepare("SELECT DISTINCT app_scope FROM dashboards WHERE app_scope IS NOT NULL AND app_scope != ''").all() as Array<{ app_scope: string }>;
  const alertScopes = database.prepare("SELECT DISTINCT app_scope FROM alerts WHERE app_scope IS NOT NULL AND app_scope != ''").all() as Array<{ app_scope: string }>;
  const reportScopes = database.prepare("SELECT DISTINCT app_scope FROM scheduled_reports WHERE app_scope IS NOT NULL AND app_scope != ''").all() as Array<{ app_scope: string }>;

  const allScopes = new Set([
    ...dashboardScopes.map(s => s.app_scope),
    ...alertScopes.map(s => s.app_scope),
    ...reportScopes.map(s => s.app_scope),
  ]);

  return Array.from(allScopes).sort();
}

export function getDashboard(id: string): Dashboard | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM dashboards WHERE id = ?').get(id) as Dashboard | undefined;
}

export function getDashboardPanels(dashboardId: string): DashboardPanel[] {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM dashboard_panels WHERE dashboard_id = ?').all(dashboardId) as DashboardPanel[];
}

export function createDashboard(
  name: string,
  description?: string,
  appScope?: string,
  category?: string,
  projectId?: string
): Dashboard {
  const database = getSQLiteDB();
  const id = uuidv4();
  database.prepare(
    'INSERT INTO dashboards (id, name, description, app_scope, category, project_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, name, description || null, appScope || 'default', category || 'general', projectId || null);
  return getDashboard(id)!;
}

export function createDashboardPanel(
  dashboardId: string,
  title: string,
  query: string,
  visualization: string = 'table',
  options: Record<string, unknown> = {},
  position: { x: number; y: number; width: number; height: number } = { x: 0, y: 0, width: 6, height: 4 }
): DashboardPanel {
  const database = getSQLiteDB();
  const id = uuidv4();
  database.prepare(
    'INSERT INTO dashboard_panels (id, dashboard_id, title, query, visualization, options, position_x, position_y, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, dashboardId, title, query, visualization, JSON.stringify(options), position.x, position.y, position.width, position.height);
  return database.prepare('SELECT * FROM dashboard_panels WHERE id = ?').get(id) as DashboardPanel;
}

export function updateDashboardPanel(
  id: string,
  updates: {
    title?: string;
    query?: string;
    visualization?: string;
    options?: Record<string, unknown>;
    position_x?: number;
    position_y?: number;
    width?: number;
    height?: number;
  }
): DashboardPanel | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.query !== undefined) {
    fields.push('query = ?');
    values.push(updates.query);
  }
  if (updates.visualization !== undefined) {
    fields.push('visualization = ?');
    values.push(updates.visualization);
  }
  if (updates.options !== undefined) {
    fields.push('options = ?');
    values.push(JSON.stringify(updates.options));
  }
  if (updates.position_x !== undefined) {
    fields.push('position_x = ?');
    values.push(updates.position_x);
  }
  if (updates.position_y !== undefined) {
    fields.push('position_y = ?');
    values.push(updates.position_y);
  }
  if (updates.width !== undefined) {
    fields.push('width = ?');
    values.push(updates.width);
  }
  if (updates.height !== undefined) {
    fields.push('height = ?');
    values.push(updates.height);
  }

  if (fields.length === 0) {
    return database.prepare('SELECT * FROM dashboard_panels WHERE id = ?').get(id) as DashboardPanel | undefined;
  }

  values.push(id);
  database.prepare(`UPDATE dashboard_panels SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return database.prepare('SELECT * FROM dashboard_panels WHERE id = ?').get(id) as DashboardPanel | undefined;
}

export function deleteDashboardPanel(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM dashboard_panels WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getDashboardPanel(id: string): DashboardPanel | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM dashboard_panels WHERE id = ?').get(id) as DashboardPanel | undefined;
}

export function copyDashboardPanel(
  sourcePanelId: string,
  targetDashboardId: string,
  options: {
    title?: string;
    position?: { x: number; y: number; width: number; height: number };
  } = {}
): DashboardPanel | undefined {
  const database = getSQLiteDB();

  // Get the source panel
  const sourcePanel = getDashboardPanel(sourcePanelId);
  if (!sourcePanel) {
    return undefined;
  }

  // Get the source dashboard to track provenance
  const sourceDashboard = getDashboard(sourcePanel.dashboard_id);
  const sourceProjectId = sourceDashboard?.project_id || null;

  // Calculate copy generation (if copying a copy, increment generation)
  const copyGeneration = (sourcePanel.copy_generation || 0) + 1;

  // Generate new panel ID
  const id = uuidv4();
  const now = new Date().toISOString();

  // Use provided title or generate "Copy of X"
  const title = options.title || `Copy of ${sourcePanel.title}`;

  // Use provided position or default
  const position = options.position || {
    x: sourcePanel.position_x || 0,
    y: sourcePanel.position_y || 0,
    width: sourcePanel.width || 6,
    height: sourcePanel.height || 4,
  };

  // Insert the new panel with provenance tracking
  database.prepare(`
    INSERT INTO dashboard_panels (
      id, dashboard_id, title, query, visualization, options,
      position_x, position_y, width, height,
      source_panel_id, source_dashboard_id, source_project_id,
      copied_at, copy_generation
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    targetDashboardId,
    title,
    sourcePanel.query,
    sourcePanel.visualization,
    sourcePanel.options,
    position.x,
    position.y,
    position.width,
    position.height,
    sourcePanelId,
    sourcePanel.dashboard_id,
    sourceProjectId,
    now,
    copyGeneration
  );

  return getDashboardPanel(id);
}

export function getPanelProvenance(panelId: string): {
  sourcePanel: { id: string; title: string } | null;
  sourceDashboard: { id: string; name: string } | null;
  sourceProject: { id: string; name: string } | null;
  copiedAt: string | null;
  generation: number;
} | null {
  const panel = getDashboardPanel(panelId);
  if (!panel) return null;

  let sourcePanel = null;
  let sourceDashboard = null;
  let sourceProject = null;

  if (panel.source_panel_id) {
    const sp = getDashboardPanel(panel.source_panel_id);
    if (sp) {
      sourcePanel = { id: sp.id, title: sp.title };
    }
  }

  if (panel.source_dashboard_id) {
    const sd = getDashboard(panel.source_dashboard_id);
    if (sd) {
      sourceDashboard = { id: sd.id, name: sd.name };
    }
  }

  if (panel.source_project_id) {
    const sproj = getProject(panel.source_project_id);
    if (sproj) {
      sourceProject = { id: sproj.id, name: sproj.name };
    }
  }

  return {
    sourcePanel,
    sourceDashboard,
    sourceProject,
    copiedAt: panel.copied_at || null,
    generation: panel.copy_generation || 0,
  };
}

export function deleteDashboard(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM dashboards WHERE id = ?').run(id);
  return result.changes > 0;
}

// Dashboard Variables
export interface DashboardVariable {
  id: string;
  dashboard_id: string;
  name: string;
  label?: string;
  type: 'query' | 'custom' | 'textbox' | 'interval';
  query?: string;
  default_value?: string;
  multi_select: number;
  include_all: number;
  sort_order: number;
}

export function getDashboardVariables(dashboardId: string): DashboardVariable[] {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM dashboard_variables WHERE dashboard_id = ? ORDER BY sort_order').all(dashboardId) as DashboardVariable[];
}

export function getDashboardVariable(id: string): DashboardVariable | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM dashboard_variables WHERE id = ?').get(id) as DashboardVariable | undefined;
}

export function createDashboardVariable(
  dashboardId: string,
  name: string,
  options: {
    label?: string;
    type?: 'query' | 'custom' | 'textbox' | 'interval';
    query?: string;
    default_value?: string;
    multi_select?: boolean;
    include_all?: boolean;
    sort_order?: number;
  } = {}
): DashboardVariable {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO dashboard_variables (
      id, dashboard_id, name, label, type, query, default_value, multi_select, include_all, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    dashboardId,
    name,
    options.label || null,
    options.type || 'query',
    options.query || null,
    options.default_value || null,
    options.multi_select ? 1 : 0,
    options.include_all ? 1 : 0,
    options.sort_order ?? 0
  );

  return getDashboardVariable(id)!;
}

export function updateDashboardVariable(
  id: string,
  updates: {
    name?: string;
    label?: string;
    type?: 'query' | 'custom' | 'textbox' | 'interval';
    query?: string;
    default_value?: string;
    multi_select?: boolean;
    include_all?: boolean;
    sort_order?: number;
  }
): DashboardVariable | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.label !== undefined) {
    fields.push('label = ?');
    values.push(updates.label);
  }
  if (updates.type !== undefined) {
    fields.push('type = ?');
    values.push(updates.type);
  }
  if (updates.query !== undefined) {
    fields.push('query = ?');
    values.push(updates.query);
  }
  if (updates.default_value !== undefined) {
    fields.push('default_value = ?');
    values.push(updates.default_value);
  }
  if (updates.multi_select !== undefined) {
    fields.push('multi_select = ?');
    values.push(updates.multi_select ? 1 : 0);
  }
  if (updates.include_all !== undefined) {
    fields.push('include_all = ?');
    values.push(updates.include_all ? 1 : 0);
  }
  if (updates.sort_order !== undefined) {
    fields.push('sort_order = ?');
    values.push(updates.sort_order);
  }

  if (fields.length === 0) {
    return getDashboardVariable(id);
  }

  values.push(id);
  database.prepare(`UPDATE dashboard_variables SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getDashboardVariable(id);
}

export function deleteDashboardVariable(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM dashboard_variables WHERE id = ?').run(id);
  return result.changes > 0;
}

// Dashboard Annotations
export interface DashboardAnnotation {
  id: string;
  dashboard_id: string;
  timestamp: string;
  title: string;
  description?: string;
  color: string;
  created_by?: string;
  created_at: string;
}

export function getDashboardAnnotations(dashboardId: string): DashboardAnnotation[] {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM dashboard_annotations WHERE dashboard_id = ? ORDER BY timestamp DESC').all(dashboardId) as DashboardAnnotation[];
}

export function getDashboardAnnotation(id: string): DashboardAnnotation | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM dashboard_annotations WHERE id = ?').get(id) as DashboardAnnotation | undefined;
}

export function createDashboardAnnotation(
  dashboardId: string,
  timestamp: string,
  title: string,
  options: {
    description?: string;
    color?: string;
    created_by?: string;
  } = {}
): DashboardAnnotation {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO dashboard_annotations (
      id, dashboard_id, timestamp, title, description, color, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    dashboardId,
    timestamp,
    title,
    options.description || null,
    options.color || '#3B82F6',
    options.created_by || null
  );

  return getDashboardAnnotation(id)!;
}

export function deleteDashboardAnnotation(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM dashboard_annotations WHERE id = ?').run(id);
  return result.changes > 0;
}

// Dashboard Pages
export function getDashboardPages(dashboardId: string): DashboardPage[] {
  const database = getSQLiteDB();
  return database.prepare(
    'SELECT * FROM dashboard_pages WHERE dashboard_id = ? ORDER BY sort_order ASC'
  ).all(dashboardId) as DashboardPage[];
}

export function getDashboardPage(id: string): DashboardPage | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM dashboard_pages WHERE id = ?').get(id) as DashboardPage | undefined;
}

export function createDashboardPage(
  dashboardId: string,
  name: string,
  options: { icon?: string; sort_order?: number } = {}
): DashboardPage {
  const database = getSQLiteDB();
  const id = uuidv4();

  // Get max sort_order if not specified
  const sortOrder = options.sort_order ?? (
    (database.prepare('SELECT MAX(sort_order) as max FROM dashboard_pages WHERE dashboard_id = ?').get(dashboardId) as { max: number | null })?.max ?? -1
  ) + 1;

  database.prepare(`
    INSERT INTO dashboard_pages (id, dashboard_id, name, icon, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, dashboardId, name, options.icon || null, sortOrder);

  return getDashboardPage(id)!;
}

export function updateDashboardPage(
  id: string,
  updates: { name?: string; icon?: string; sort_order?: number }
): DashboardPage | undefined {
  const database = getSQLiteDB();
  const sets: string[] = [];
  const values: (string | number)[] = [];

  if (updates.name !== undefined) {
    sets.push('name = ?');
    values.push(updates.name);
  }
  if (updates.icon !== undefined) {
    sets.push('icon = ?');
    values.push(updates.icon);
  }
  if (updates.sort_order !== undefined) {
    sets.push('sort_order = ?');
    values.push(updates.sort_order);
  }

  if (sets.length > 0) {
    values.push(id);
    database.prepare(`UPDATE dashboard_pages SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }

  return getDashboardPage(id);
}

export function deleteDashboardPage(id: string): boolean {
  const database = getSQLiteDB();
  // First, unlink any panels from this page
  database.prepare('UPDATE dashboard_panels SET page_id = NULL WHERE page_id = ?').run(id);
  const result = database.prepare('DELETE FROM dashboard_pages WHERE id = ?').run(id);
  return result.changes > 0;
}

export function reorderDashboardPages(dashboardId: string, pageIds: string[]): void {
  const database = getSQLiteDB();
  pageIds.forEach((id, index) => {
    database.prepare('UPDATE dashboard_pages SET sort_order = ? WHERE id = ? AND dashboard_id = ?')
      .run(index, id, dashboardId);
  });
}

// Dashboard Templates
export interface DashboardTemplate {
  id: string;
  name: string;
  description?: string;
  category?: string;
  thumbnail_url?: string;
  template_json: string;
  required_sources?: string;
  downloads: number;
  created_at: string;
}

export function getDashboardTemplates(category?: string): DashboardTemplate[] {
  const database = getSQLiteDB();
  if (category) {
    return database.prepare('SELECT * FROM dashboard_templates WHERE category = ? ORDER BY downloads DESC, name').all(category) as DashboardTemplate[];
  }
  return database.prepare('SELECT * FROM dashboard_templates ORDER BY downloads DESC, name').all() as DashboardTemplate[];
}

export function getDashboardTemplate(id: string): DashboardTemplate | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM dashboard_templates WHERE id = ?').get(id) as DashboardTemplate | undefined;
}

export function createDashboardTemplate(
  name: string,
  templateJson: string,
  options: {
    description?: string;
    category?: string;
    thumbnail_url?: string;
    required_sources?: string[];
  } = {}
): DashboardTemplate {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO dashboard_templates (
      id, name, description, category, thumbnail_url, template_json, required_sources
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name,
    options.description || null,
    options.category || null,
    options.thumbnail_url || null,
    templateJson,
    options.required_sources ? JSON.stringify(options.required_sources) : null
  );

  return getDashboardTemplate(id)!;
}

export function incrementTemplateDownloads(id: string): void {
  const database = getSQLiteDB();
  database.prepare('UPDATE dashboard_templates SET downloads = downloads + 1 WHERE id = ?').run(id);
}

// Update Dashboard (for branding and sharing)
export function updateDashboard(
  id: string,
  updates: {
    name?: string;
    description?: string;
    logo_url?: string;
    accent_color?: string;
    header_color?: string;
    is_public?: boolean;
    public_token?: string;
    public_password?: string;
    public_expires_at?: string;
    app_scope?: string;
    category?: string;
    project_id?: string;
  }
): Dashboard | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.logo_url !== undefined) {
    fields.push('logo_url = ?');
    values.push(updates.logo_url);
  }
  if (updates.accent_color !== undefined) {
    fields.push('accent_color = ?');
    values.push(updates.accent_color);
  }
  if (updates.header_color !== undefined) {
    fields.push('header_color = ?');
    values.push(updates.header_color);
  }
  if (updates.is_public !== undefined) {
    fields.push('is_public = ?');
    values.push(updates.is_public ? 1 : 0);
  }
  if (updates.public_token !== undefined) {
    fields.push('public_token = ?');
    values.push(updates.public_token);
  }
  if (updates.public_password !== undefined) {
    fields.push('public_password = ?');
    values.push(updates.public_password);
  }
  if (updates.public_expires_at !== undefined) {
    fields.push('public_expires_at = ?');
    values.push(updates.public_expires_at);
  }
  if (updates.app_scope !== undefined) {
    fields.push('app_scope = ?');
    values.push(updates.app_scope);
  }
  if (updates.category !== undefined) {
    fields.push('category = ?');
    values.push(updates.category);
  }
  if (updates.project_id !== undefined) {
    fields.push('project_id = ?');
    values.push(updates.project_id);
  }

  if (fields.length === 0) {
    return getDashboard(id);
  }

  fields.push("updated_at = datetime('now')");
  values.push(id);
  database.prepare(`UPDATE dashboards SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getDashboard(id);
}

// Get public dashboard by token
export function getDashboardByToken(token: string): Dashboard | undefined {
  const database = getSQLiteDB();
  return database.prepare(`
    SELECT * FROM dashboards
    WHERE public_token = ?
    AND is_public = 1
    AND (public_expires_at IS NULL OR public_expires_at > datetime('now'))
  `).get(token) as Dashboard | undefined;
}

// Batch update panel positions
export function updatePanelPositions(
  positions: Array<{ panelId: string; x: number; y: number; w: number; h: number }>
): void {
  const database = getSQLiteDB();
  const stmt = database.prepare(
    'UPDATE dashboard_panels SET position_x = ?, position_y = ?, width = ?, height = ? WHERE id = ?'
  );

  const updateMany = database.transaction((items: typeof positions) => {
    for (const item of items) {
      stmt.run(item.x, item.y, item.w, item.h, item.panelId);
    }
  });

  updateMany(positions);
}
