const API_BASE = '/api';

export interface SearchResult {
  query: string;
  sql: string;
  results: Record<string, unknown>[];
  count: number;
}

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface Dashboard {
  id: string;
  name: string;
  description?: string;
  panels: DashboardPanel[];
  created_at: string;
  updated_at: string;
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
