const API_BASE = '/api';

export interface SearchResult {
  query: string;
  sql: string;
  results: Record<string, unknown>[];
  count: number;
  executionTime?: number;
}

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface DashboardBranding {
  logo_url?: string;
  logo_position?: 'left' | 'center' | 'right';
  accent_color?: string;
  header_color?: string;
}

export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  panels: DashboardPanel[];
  created_at: string;
  updated_at: string;
  // Branding
  logo_url?: string;
  accent_color?: string;
  header_color?: string;
  // Sharing
  is_public?: number;
  public_token?: string;
}

export interface DashboardPanel {
  id: string;
  dashboard_id: string;
  title: string;
  query: string;
  visualization: string;
  options: Record<string, unknown>;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
}

export interface Stats {
  totalLogs: number;
  last24Hours: number;
  bySeverity: { severity: number; count: number }[];
  topHosts: { hostname: string; count: number }[];
  topApps: { app_name: string; count: number }[];
}

export interface TimeSeriesData {
  time: string;
  count: number;
  errors: number;
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.message || error.error || 'Request failed');
  }

  return response.json();
}

// Search API
export async function executeSearch(query: string, earliest?: string, latest?: string): Promise<SearchResult> {
  return request('/search/query', {
    method: 'POST',
    body: JSON.stringify({ query, earliest, latest }),
  });
}

export async function parseQuery(query: string): Promise<{ query: string; ast: unknown; sql: string }> {
  return request('/search/parse', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

export async function validateQuery(query: string): Promise<{ valid: boolean; error?: string }> {
  return request('/search/validate', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

export async function getFields(): Promise<{ name: string; type: string }[]> {
  return request('/search/fields');
}

export async function getFieldValues(field: string, limit?: number): Promise<{ value: string; count: number }[]> {
  const params = limit ? `?limit=${limit}` : '';
  return request(`/search/fields/${field}/values${params}`);
}

// Field Discovery API
export interface DiscoveredField {
  name: string;
  type: string;
  source: 'core' | 'discovered';
  occurrences?: number;
  sampleValues?: string[];
}

export interface FieldDiscoveryResult {
  core: DiscoveredField[];
  discovered: DiscoveredField[];
  backend: string;
}

export interface FieldPreferences {
  pinned: string[];
  authenticated: boolean;
  hasCustomPreferences?: boolean;
}

export async function discoverFields(options?: {
  earliest?: string;
  latest?: string;
  limit?: number;
  index?: string;
}): Promise<FieldDiscoveryResult> {
  const params = new URLSearchParams();
  if (options?.earliest) params.set('earliest', options.earliest);
  if (options?.latest) params.set('latest', options.latest);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.index) params.set('index', options.index);
  const query = params.toString();
  return request(`/search/fields/discover${query ? `?${query}` : ''}`);
}

export async function getFieldPreferences(): Promise<FieldPreferences> {
  return request('/search/fields/preferences');
}

export async function pinField(field: string, pinned: boolean): Promise<{ success: boolean }> {
  return request('/search/fields/pin', {
    method: 'POST',
    body: JSON.stringify({ field, pinned }),
  });
}

export async function reorderFields(fields: string[]): Promise<{ success: boolean; pinned: string[] }> {
  return request('/search/fields/reorder', {
    method: 'POST',
    body: JSON.stringify({ fields }),
  });
}

// Saved Searches API
export async function getSavedSearches(): Promise<SavedSearch[]> {
  return request('/search/saved');
}

export async function getSavedSearch(id: string): Promise<SavedSearch> {
  return request(`/search/saved/${id}`);
}

export async function createSavedSearch(name: string, query: string, description?: string): Promise<SavedSearch> {
  return request('/search/saved', {
    method: 'POST',
    body: JSON.stringify({ name, query, description }),
  });
}

export async function deleteSavedSearch(id: string): Promise<void> {
  await request(`/search/saved/${id}`, { method: 'DELETE' });
}

// Dashboards API
export async function getDashboards(): Promise<Dashboard[]> {
  return request('/dashboards');
}

export async function getDashboard(id: string): Promise<Dashboard> {
  return request(`/dashboards/${id}`);
}

export async function createDashboard(name: string, description?: string): Promise<Dashboard> {
  return request('/dashboards', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  });
}

export async function deleteDashboard(id: string): Promise<void> {
  await request(`/dashboards/${id}`, { method: 'DELETE' });
}

export async function duplicateDashboard(id: string): Promise<Dashboard> {
  return request(`/dashboards/${id}/duplicate`, { method: 'POST' });
}

export async function createDashboardPanel(
  dashboardId: string,
  panel: {
    title: string;
    query: string;
    visualization: string;
    options?: Record<string, unknown>;
    position?: { x: number; y: number; width: number; height: number };
  }
): Promise<DashboardPanel> {
  return request(`/dashboards/${dashboardId}/panels`, {
    method: 'POST',
    body: JSON.stringify(panel),
  });
}

export async function updateDashboardPanel(
  dashboardId: string,
  panelId: string,
  updates: Partial<DashboardPanel>
): Promise<DashboardPanel> {
  return request(`/dashboards/${dashboardId}/panels/${panelId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteDashboardPanel(dashboardId: string, panelId: string): Promise<void> {
  await request(`/dashboards/${dashboardId}/panels/${panelId}`, { method: 'DELETE' });
}

// Stats API
export async function getStats(): Promise<Stats> {
  return request('/stats/overview');
}

export async function getTimeSeries(interval?: string, hours?: number): Promise<TimeSeriesData[]> {
  const params = new URLSearchParams();
  if (interval) params.set('interval', interval);
  if (hours) params.set('hours', hours.toString());
  const query = params.toString();
  return request(`/stats/timeseries${query ? `?${query}` : ''}`);
}

// Active Sources (for Data Sources dashboard)
export interface ActiveSource {
  app_name: string;
  index_name: string;
  hostname: string;
  protocol: string;
  log_count: number;
  last_seen: string;
  error_count: number;
}

export interface IndexSummary {
  index_name: string;
  count: number;
  sources: number;
}

export interface ActiveSourcesResult {
  sources: ActiveSource[];
  by_index: IndexSummary[];
}

export async function getActiveSources(): Promise<ActiveSourcesResult> {
  return request('/stats/sources');
}

// Reports API
export interface ScheduledReport {
  id: string;
  name: string;
  query: string;
  schedule: string;
  recipients: string;
  format: string;
  enabled: number;
  last_run: string | null;
  created_at: string;
}

export async function getScheduledReports(): Promise<ScheduledReport[]> {
  return request('/reports');
}

export async function createScheduledReport(
  name: string,
  query: string,
  schedule: string,
  recipients: string,
  format?: string
): Promise<ScheduledReport> {
  return request('/reports', {
    method: 'POST',
    body: JSON.stringify({ name, query, schedule, recipients, format }),
  });
}

export async function updateScheduledReport(
  id: string,
  updates: Partial<ScheduledReport>
): Promise<ScheduledReport> {
  return request(`/reports/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteScheduledReport(id: string): Promise<void> {
  await request(`/reports/${id}`, { method: 'DELETE' });
}

export async function generateReport(
  query: string,
  format: 'html' | 'json',
  title?: string,
  timeRange?: string
): Promise<Blob | { title: string; results: Record<string, unknown>[]; count: number }> {
  const response = await fetch(`${API_BASE}/reports/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, format, title, timeRange }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.message || error.error || 'Request failed');
  }

  if (format === 'html') {
    return response.blob();
  }
  return response.json();
}

// AI Search API
export interface AISearchResult {
  question: string;
  query: string;
  confidence: number;
  explanation: string;
  results?: Record<string, unknown>[];
  sql?: string;
  error?: string;
}

export interface AISuggestion {
  text: string;
  description: string;
}

export async function aiSearch(question: string, execute = true): Promise<AISearchResult> {
  return request('/search/ai', {
    method: 'POST',
    body: JSON.stringify({ question, execute }),
  });
}

export async function getAISuggestions(): Promise<{ suggestions: AISuggestion[] }> {
  return request('/search/ai/suggestions');
}

// Health API
export async function getHealth(): Promise<{ status: string; services: Record<string, string> }> {
  return request('/health');
}

// Knowledge Management API

// Field Extractions
export interface FieldExtraction {
  id: string;
  name: string;
  source_type: string;
  field_name: string;
  pattern: string;
  pattern_type: 'regex' | 'grok';
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface TestExtractionResult {
  success: boolean;
  matches: { field: string; value: string }[];
  error?: string;
}

export async function getFieldExtractions(): Promise<FieldExtraction[]> {
  return request('/knowledge/extractions');
}

export async function createFieldExtraction(
  name: string,
  source_type: string,
  field_name: string,
  pattern: string,
  pattern_type: 'regex' | 'grok',
  enabled: boolean
): Promise<FieldExtraction> {
  return request('/knowledge/extractions', {
    method: 'POST',
    body: JSON.stringify({ name, source_type, field_name, pattern, pattern_type, enabled }),
  });
}

export async function updateFieldExtraction(
  id: string,
  updates: Partial<FieldExtraction>
): Promise<FieldExtraction> {
  return request(`/knowledge/extractions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteFieldExtraction(id: string): Promise<void> {
  await request(`/knowledge/extractions/${id}`, { method: 'DELETE' });
}

export async function testFieldExtraction(
  pattern: string,
  sample: string,
  pattern_type: 'regex' | 'grok'
): Promise<TestExtractionResult> {
  return request('/knowledge/extractions/test', {
    method: 'POST',
    body: JSON.stringify({ pattern, sample, pattern_type }),
  });
}

// Event Types
export interface EventType {
  id: string;
  name: string;
  search_string: string;
  description: string;
  priority: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export async function getEventTypes(): Promise<EventType[]> {
  return request('/knowledge/eventtypes');
}

export async function createEventType(
  name: string,
  search_string: string,
  description: string,
  priority: number,
  enabled: boolean
): Promise<EventType> {
  return request('/knowledge/eventtypes', {
    method: 'POST',
    body: JSON.stringify({ name, search_string, description, priority, enabled }),
  });
}

export async function updateEventType(
  id: string,
  updates: Partial<EventType>
): Promise<EventType> {
  return request(`/knowledge/eventtypes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteEventType(id: string): Promise<void> {
  await request(`/knowledge/eventtypes/${id}`, { method: 'DELETE' });
}

// Tags
export interface KnowledgeTag {
  id: string;
  tag_name: string;
  field_name: string;
  field_value: string;
  created_at: string;
}

export async function getTags(): Promise<KnowledgeTag[]> {
  return request('/knowledge/tags');
}

export async function createTag(
  tag_name: string,
  field_name: string,
  field_value: string
): Promise<KnowledgeTag> {
  return request('/knowledge/tags', {
    method: 'POST',
    body: JSON.stringify({ tag_name, field_name, field_value }),
  });
}

export async function deleteTag(id: string): Promise<void> {
  await request(`/knowledge/tags/${id}`, { method: 'DELETE' });
}

// Lookups
export interface Lookup {
  id: string;
  name: string;
  lookup_type: 'CSV' | 'Manual';
  key_field: string;
  output_fields: string;
  lookup_data: string;
  created_at: string;
  updated_at: string;
}

export async function getLookups(): Promise<Lookup[]> {
  return request('/knowledge/lookups');
}

export async function createLookup(
  name: string,
  lookup_type: 'CSV' | 'Manual',
  key_field: string,
  output_fields: string,
  lookup_data: string
): Promise<Lookup> {
  return request('/knowledge/lookups', {
    method: 'POST',
    body: JSON.stringify({ name, lookup_type, key_field, output_fields, lookup_data }),
  });
}

export async function updateLookup(
  id: string,
  updates: Partial<Lookup>
): Promise<Lookup> {
  return request(`/knowledge/lookups/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteLookup(id: string): Promise<void> {
  await request(`/knowledge/lookups/${id}`, { method: 'DELETE' });
}

// Workflow Actions
export interface WorkflowAction {
  id: string;
  name: string;
  label: string;
  field_name: string;
  action_type: 'url' | 'search';
  action_value: string;
  created_at: string;
  updated_at: string;
}

export async function getWorkflowActions(): Promise<WorkflowAction[]> {
  return request('/knowledge/workflows');
}

export async function createWorkflowAction(
  name: string,
  label: string,
  field_name: string,
  action_type: 'url' | 'search',
  action_value: string
): Promise<WorkflowAction> {
  return request('/knowledge/workflows', {
    method: 'POST',
    body: JSON.stringify({ name, label, field_name, action_type, action_value }),
  });
}

export async function updateWorkflowAction(
  id: string,
  updates: Partial<WorkflowAction>
): Promise<WorkflowAction> {
  return request(`/knowledge/workflows/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteWorkflowAction(id: string): Promise<void> {
  await request(`/knowledge/workflows/${id}`, { method: 'DELETE' });
}

// Alerts API
export interface AlertAction {
  type: 'email' | 'webhook' | 'log';
  config: {
    to?: string;
    subject?: string;
    body?: string;
    url?: string;
    method?: 'GET' | 'POST' | 'PUT';
    headers?: Record<string, string>;
    payload?: string;
  };
}

export interface Alert {
  id: string;
  name: string;
  description?: string;
  search_query: string;
  trigger_type: string;
  trigger_condition: string;
  trigger_threshold: number;
  schedule_type: string;
  cron_expression?: string;
  time_range: string;
  actions: AlertAction[];
  throttle_enabled: number;
  throttle_window_seconds: number;
  severity: string;
  enabled: number;
  last_run?: string;
  last_triggered?: string;
  trigger_count: number;
  created_at: string;
  updated_at: string;
}

export interface AlertHistory {
  id: string;
  alert_id: string;
  triggered_at: string;
  result_count: number;
  trigger_value?: string;
  severity: string;
  actions_executed?: { type: string; success: boolean; message: string }[];
  sample_results?: Record<string, unknown>[];
  acknowledged: number;
  acknowledged_by?: string;
  acknowledged_at?: string;
  notes?: string;
}

export async function getAlerts(): Promise<Alert[]> {
  return request('/alerts');
}

export async function getAlert(id: string): Promise<Alert> {
  return request(`/alerts/${id}`);
}

export async function getAlertHistory(alertId?: string, limit?: number): Promise<AlertHistory[]> {
  const params = limit ? `?limit=${limit}` : '';
  const url = alertId ? `/alerts/${alertId}/history${params}` : `/alerts/history${params}`;
  return request(url);
}

export async function createAlert(alert: {
  name: string;
  description?: string;
  search_query: string;
  trigger_type?: string;
  trigger_condition?: string;
  trigger_threshold?: number;
  schedule_type?: string;
  cron_expression?: string;
  time_range?: string;
  actions?: AlertAction[];
  throttle_enabled?: boolean;
  throttle_window_seconds?: number;
  severity?: string;
  enabled?: boolean;
}): Promise<Alert> {
  return request('/alerts', {
    method: 'POST',
    body: JSON.stringify(alert),
  });
}

export async function updateAlert(id: string, updates: Record<string, unknown>): Promise<Alert> {
  return request(`/alerts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteAlert(id: string): Promise<void> {
  await request(`/alerts/${id}`, { method: 'DELETE' });
}

export async function toggleAlert(id: string): Promise<Alert> {
  return request(`/alerts/${id}/toggle`, { method: 'POST' });
}

export async function evaluateAlert(id: string): Promise<{ triggered: boolean; resultCount: number; message: string }> {
  return request(`/alerts/${id}/evaluate`, { method: 'POST' });
}

export async function testAlert(config: {
  search_query: string;
  trigger_type: string;
  trigger_condition: string;
  trigger_threshold: number;
  time_range: string;
}): Promise<{ wouldTrigger: boolean; resultCount: number; message: string; sampleResults?: Record<string, unknown>[] }> {
  return request('/alerts/test', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export async function acknowledgeAlertHistory(id: string, acknowledgedBy: string, notes?: string): Promise<AlertHistory> {
  return request(`/alerts/history/${id}/acknowledge`, {
    method: 'POST',
    body: JSON.stringify({ acknowledged_by: acknowledgedBy, notes }),
  });
}

// Silences API
export interface AlertSilence {
  id: string;
  level: 'global' | 'host' | 'alert';
  target_id?: string;
  reason?: string;
  created_by?: string;
  starts_at: string;
  ends_at?: string;
  created_at: string;
}

export async function getSilences(activeOnly?: boolean): Promise<AlertSilence[]> {
  const params = activeOnly ? '?active=true' : '';
  return request(`/silences${params}`);
}

export async function getSilence(id: string): Promise<AlertSilence> {
  return request(`/silences/${id}`);
}

export async function createSilence(silence: {
  level: 'global' | 'host' | 'alert';
  target_id?: string;
  duration: string;
  reason?: string;
  created_by?: string;
}): Promise<AlertSilence> {
  return request('/silences', {
    method: 'POST',
    body: JSON.stringify(silence),
  });
}

export async function deleteSilence(id: string): Promise<void> {
  await request(`/silences/${id}`, { method: 'DELETE' });
}

export async function checkSilenced(alertId: string, hostname?: string): Promise<{ silenced: boolean; silence?: AlertSilence }> {
  const params = new URLSearchParams({ alert_id: alertId });
  if (hostname) params.append('hostname', hostname);
  return request(`/silences/check?${params}`);
}

// Source Templates API
export interface FieldExtractionPattern {
  field_name: string;
  pattern: string;
  pattern_type: 'regex' | 'grok' | 'json_path';
  description?: string;
  required?: boolean;
}

export interface SourceTemplate {
  id: string;
  name: string;
  source_type: string;
  category: 'database' | 'security' | 'web' | 'system' | 'application';
  description?: string;
  setup_instructions?: string;
  agent_config_example?: string;
  syslog_config_example?: string;
  field_extractions?: FieldExtractionPattern[];
  default_index: string;
  default_severity: number;
  sample_log?: string;
  sample_query?: string;
  icon?: string;
  dashboard_widgets?: Record<string, unknown>[];
  alert_templates?: Record<string, unknown>[];
  enabled: number;
  built_in: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  extracted_fields: Record<string, unknown>;
}

export async function getTemplates(category?: string): Promise<SourceTemplate[]> {
  const params = category ? `?category=${category}` : '';
  return request(`/templates${params}`);
}

export async function getTemplatesByCategory(): Promise<Record<string, SourceTemplate[]>> {
  return request('/templates/by-category');
}

export async function getTemplateStats(): Promise<{
  total: number;
  by_category: Record<string, number>;
  built_in: number;
  custom: number;
}> {
  return request('/templates/stats');
}

export async function getTemplate(id: string): Promise<SourceTemplate> {
  return request(`/templates/${id}`);
}

export async function testTemplate(id: string, logLine: string): Promise<TemplateValidationResult> {
  return request(`/templates/${id}/test`, {
    method: 'POST',
    body: JSON.stringify({ log_line: logLine }),
  });
}

export async function createTemplate(template: {
  name: string;
  source_type: string;
  category: 'database' | 'security' | 'web' | 'system' | 'application';
  description?: string;
  setup_instructions?: string;
  agent_config_example?: string;
  syslog_config_example?: string;
  field_extractions?: FieldExtractionPattern[];
  default_index?: string;
  default_severity?: number;
  sample_log?: string;
  sample_query?: string;
  icon?: string;
  dashboard_widgets?: Record<string, unknown>[];
  alert_templates?: Record<string, unknown>[];
}): Promise<SourceTemplate> {
  return request('/templates', {
    method: 'POST',
    body: JSON.stringify(template),
  });
}

export async function updateTemplate(id: string, updates: Partial<SourceTemplate>): Promise<SourceTemplate> {
  return request(`/templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteTemplate(id: string): Promise<void> {
  await request(`/templates/${id}`, { method: 'DELETE' });
}

// Dashboard Variables API
export interface DashboardVariable {
  id: string;
  dashboard_id: string;
  name: string;
  label?: string;
  type: 'query' | 'custom' | 'textbox' | 'interval';
  query?: string;
  default_value?: string;
  multi_select: boolean;
  include_all: boolean;
  sort_order: number;
}

export async function getDashboardVariables(dashboardId: string): Promise<DashboardVariable[]> {
  return request(`/dashboards/${dashboardId}/variables`);
}

export async function createDashboardVariable(
  dashboardId: string,
  variable: Omit<DashboardVariable, 'id' | 'dashboard_id'>
): Promise<DashboardVariable> {
  return request(`/dashboards/${dashboardId}/variables`, {
    method: 'POST',
    body: JSON.stringify(variable),
  });
}

export async function updateDashboardVariable(
  dashboardId: string,
  variableId: string,
  updates: Partial<DashboardVariable>
): Promise<DashboardVariable> {
  return request(`/dashboards/${dashboardId}/variables/${variableId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteDashboardVariable(dashboardId: string, variableId: string): Promise<void> {
  await request(`/dashboards/${dashboardId}/variables/${variableId}`, { method: 'DELETE' });
}

// Dashboard Branding API
export async function updateDashboardBranding(
  dashboardId: string,
  branding: DashboardBranding & { description?: string }
): Promise<Dashboard> {
  return request(`/dashboards/${dashboardId}/branding`, {
    method: 'PUT',
    body: JSON.stringify(branding),
  });
}

export async function updateDashboard(
  dashboardId: string,
  updates: Partial<Dashboard>
): Promise<Dashboard> {
  return request(`/dashboards/${dashboardId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

// Dashboard Layout API
export async function updateDashboardLayout(
  dashboardId: string,
  layout: Array<{ panelId: string; x: number; y: number; w: number; h: number }>
): Promise<void> {
  await request(`/dashboards/${dashboardId}/layout`, {
    method: 'PUT',
    body: JSON.stringify({ layout }),
  });
}

// Dashboard Sharing API
export interface DashboardShareSettings {
  is_public: boolean;
  public_token?: string;
  public_url?: string;
}

export async function enableDashboardSharing(
  dashboardId: string,
  options?: { password?: string; expires_at?: string }
): Promise<DashboardShareSettings> {
  return request(`/dashboards/${dashboardId}/share`, {
    method: 'POST',
    body: JSON.stringify(options || {}),
  });
}

export async function disableDashboardSharing(dashboardId: string): Promise<void> {
  await request(`/dashboards/${dashboardId}/share`, { method: 'DELETE' });
}

// Dashboard Annotations API
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

export async function getDashboardAnnotations(dashboardId: string): Promise<DashboardAnnotation[]> {
  return request(`/dashboards/${dashboardId}/annotations`);
}

export async function createDashboardAnnotation(
  dashboardId: string,
  annotation: { timestamp: string; title: string; description?: string; color?: string }
): Promise<DashboardAnnotation> {
  return request(`/dashboards/${dashboardId}/annotations`, {
    method: 'POST',
    body: JSON.stringify(annotation),
  });
}

export async function deleteDashboardAnnotation(dashboardId: string, annotationId: string): Promise<void> {
  await request(`/dashboards/${dashboardId}/annotations/${annotationId}`, { method: 'DELETE' });
}

// Dashboard Export/Import API
export interface DashboardExport {
  name: string;
  description?: string;
  logo_url?: string;
  accent_color?: string;
  header_color?: string;
  panels: Array<{
    title: string;
    query: string;
    visualization: string;
    options: Record<string, unknown>;
    position_x: number;
    position_y: number;
    width: number;
    height: number;
  }>;
  variables?: Array<{
    name: string;
    label?: string;
    type: string;
    query?: string;
    default_value?: string;
    multi_select: boolean;
    include_all: boolean;
  }>;
  exported_at: string;
  version: string;
}

export async function exportDashboard(dashboardId: string): Promise<DashboardExport> {
  return request(`/dashboards/${dashboardId}/export`, { method: 'POST' });
}

export async function importDashboard(template: DashboardExport, name?: string): Promise<Dashboard> {
  return request('/dashboards/import', {
    method: 'POST',
    body: JSON.stringify({ template, name }),
  });
}

// Dashboard Templates API
export interface DashboardTemplate {
  id: string;
  name: string;
  description?: string;
  category?: string;
  thumbnail_url?: string;
  required_sources: string[];
  downloads: number;
  created_at: string;
}

export async function getDashboardTemplates(category?: string): Promise<DashboardTemplate[]> {
  const params = category ? `?category=${category}` : '';
  return request(`/dashboards/templates${params}`);
}

export async function getDashboardTemplateById(templateId: string): Promise<DashboardTemplate & { template_json: DashboardExport }> {
  return request(`/dashboards/templates/${templateId}`);
}

export async function createDashboardFromTemplate(templateId: string, name?: string): Promise<Dashboard> {
  return request(`/dashboards/templates/${templateId}/create`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

// AI API
export interface AIInsight {
  type: 'anomaly' | 'trend' | 'suggestion';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  action?: { label: string; query?: string };
}

export async function getAIStatus(): Promise<{
  available: boolean;
  url?: string;
  model?: string;
  availableModels?: string[];
  message?: string;
}> {
  return request('/ai/status');
}

export async function generateAIQuery(prompt: string): Promise<{ query: string; prompt: string }> {
  return request('/ai/generate-query', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  });
}

export async function getAIInsights(dashboardId: string, timeRange: string): Promise<{ insights: AIInsight[] }> {
  return request('/ai/insights', {
    method: 'POST',
    body: JSON.stringify({ dashboardId, timeRange }),
  });
}

// Ingestion Validation API
export interface ValidatedField {
  value: unknown;
  detected_from: string | null;
}

export interface ValidationResult {
  success: boolean;
  event_count: number;
  extracted: {
    standard_fields: {
      timestamp: ValidatedField;
      hostname: ValidatedField;
      app_name: ValidatedField;
      severity: ValidatedField;
      message: ValidatedField;
    };
    custom_fields: Record<string, { value: unknown; type: string }>;
    custom_field_count: number;
  };
  warnings: string[];
  storage_preview: {
    message: string;
    structured_data: string;
  };
}

export async function validateIngestion(payload: unknown): Promise<ValidationResult> {
  return request('/ingest/validate', {
    method: 'POST',
    body: JSON.stringify({ payload }),
  });
}

export async function sendTestEvent(payload: unknown, apiKey: string): Promise<{ accepted: number }> {
  // This uses the generic HTTP ingest endpoint
  const response = await fetch(`${API_BASE}/ingest/http`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify(Array.isArray(payload) ? payload : [payload]),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to send test event');
  }

  return response.json();
}

// API Key Management
export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  permissions: string[];
  expires_at: string | null;
  revoked: boolean;
  created_at: string;
  last_used_at: string | null;
}

export interface CreateApiKeyResponse {
  apiKey: string;
  keyData: ApiKey;
}

export async function getApiKeys(): Promise<ApiKey[]> {
  return request('/auth/api-keys');
}

export async function createApiKey(name: string, permissions?: string[], expiresInDays?: number): Promise<CreateApiKeyResponse> {
  return request('/auth/api-keys', {
    method: 'POST',
    body: JSON.stringify({ name, permissions, expiresInDays }),
  });
}

export async function revokeApiKey(id: string): Promise<{ message: string }> {
  return request(`/auth/api-keys/${id}/revoke`, {
    method: 'POST',
  });
}

export async function deleteApiKey(id: string): Promise<{ message: string }> {
  return request(`/auth/api-keys/${id}`, {
    method: 'DELETE',
  });
}
