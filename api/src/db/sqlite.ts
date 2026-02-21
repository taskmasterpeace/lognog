import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

let db: Database.Database | null = null;

export function getSQLiteDB(): Database.Database {
  if (!db) {
    const dbPath = process.env.SQLITE_PATH || './lognog.db';
    db = new Database(dbPath);
    initializeSchema();
  }
  return db;
}

function initializeSchema(): void {
  const database = getSQLiteDB();

  database.exec(`
    -- Saved searches
    CREATE TABLE IF NOT EXISTS saved_searches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      query TEXT NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Dashboards
    CREATE TABLE IF NOT EXISTS dashboards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      layout TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Dashboard panels
    CREATE TABLE IF NOT EXISTS dashboard_panels (
      id TEXT PRIMARY KEY,
      dashboard_id TEXT NOT NULL,
      title TEXT NOT NULL,
      query TEXT NOT NULL,
      visualization TEXT DEFAULT 'table',
      options TEXT DEFAULT '{}',
      position_x INTEGER DEFAULT 0,
      position_y INTEGER DEFAULT 0,
      width INTEGER DEFAULT 6,
      height INTEGER DEFAULT 4,
      FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE
    );

    -- Scheduled reports
    CREATE TABLE IF NOT EXISTS scheduled_reports (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      query TEXT NOT NULL,
      schedule TEXT NOT NULL,
      recipients TEXT NOT NULL,
      format TEXT DEFAULT 'html',
      enabled INTEGER DEFAULT 1,
      last_run TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Users (basic auth)
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Field extractions (for custom field extraction patterns)
    CREATE TABLE IF NOT EXISTS field_extractions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_type TEXT NOT NULL,
      field_name TEXT NOT NULL,
      pattern TEXT NOT NULL,
      pattern_type TEXT NOT NULL,
      priority INTEGER DEFAULT 100,
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Event types (for categorizing events)
    CREATE TABLE IF NOT EXISTS event_types (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      search_string TEXT NOT NULL,
      description TEXT,
      priority INTEGER DEFAULT 100,
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Tags (for tagging field values)
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      tag_name TEXT NOT NULL,
      field TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Lookups (for enrichment tables)
    CREATE TABLE IF NOT EXISTS lookups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      key_field TEXT NOT NULL,
      output_fields TEXT NOT NULL,
      data TEXT,
      file_path TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Workflow actions (for right-click actions)
    CREATE TABLE IF NOT EXISTS workflow_actions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      label TEXT NOT NULL,
      field TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_value TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Alerts (Splunk-style alerting)
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      search_query TEXT NOT NULL,
      -- Trigger settings
      trigger_type TEXT NOT NULL DEFAULT 'number_of_results',  -- number_of_results, number_of_hosts, custom_condition
      trigger_condition TEXT NOT NULL DEFAULT 'greater_than',  -- greater_than, less_than, equal_to, not_equal_to, drops_by, rises_by
      trigger_threshold INTEGER NOT NULL DEFAULT 0,
      -- Scheduling
      schedule_type TEXT NOT NULL DEFAULT 'cron',  -- cron, realtime
      cron_expression TEXT DEFAULT '*/5 * * * *',  -- Every 5 minutes default
      time_range TEXT NOT NULL DEFAULT '-5m',  -- How far back to search
      -- Actions (JSON array)
      actions TEXT NOT NULL DEFAULT '[]',
      -- Throttling
      throttle_enabled INTEGER DEFAULT 0,
      throttle_window_seconds INTEGER DEFAULT 300,  -- 5 minutes default
      -- Severity
      severity TEXT NOT NULL DEFAULT 'medium',  -- info, low, medium, high, critical
      -- State
      enabled INTEGER DEFAULT 1,
      last_run TEXT,
      last_triggered TEXT,
      trigger_count INTEGER DEFAULT 0,
      -- Metadata
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Alert history (when alerts fired)
    CREATE TABLE IF NOT EXISTS alert_history (
      id TEXT PRIMARY KEY,
      alert_id TEXT NOT NULL,
      triggered_at TEXT NOT NULL DEFAULT (datetime('now')),
      result_count INTEGER NOT NULL,
      trigger_value TEXT,  -- The value that triggered the alert
      severity TEXT NOT NULL,
      actions_executed TEXT,  -- JSON of actions and their results
      sample_results TEXT,  -- Sample of results that triggered (JSON)
      acknowledged INTEGER DEFAULT 0,
      acknowledged_by TEXT,
      acknowledged_at TEXT,
      notes TEXT,
      FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE
    );

    -- Agent notifications (push alerts to agents)
    CREATE TABLE IF NOT EXISTS agent_notifications (
      id TEXT PRIMARY KEY,
      hostname TEXT,  -- Target hostname (NULL = all agents)
      alert_id TEXT,  -- Source alert that triggered this
      alert_name TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT,  -- Optional expiration
      delivered INTEGER DEFAULT 0,
      delivered_at TEXT,
      FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE SET NULL
    );

    -- Source Templates (for onboarding different log types)
    CREATE TABLE IF NOT EXISTS source_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_type TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      description TEXT,
      setup_instructions TEXT,
      agent_config_example TEXT,
      syslog_config_example TEXT,
      field_extractions TEXT,
      default_index TEXT DEFAULT 'main',
      default_severity INTEGER DEFAULT 6,
      sample_log TEXT,
      sample_query TEXT,
      icon TEXT,
      dashboard_widgets TEXT,
      alert_templates TEXT,
      enabled INTEGER DEFAULT 1,
      built_in INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Source Configurations (Splunk-style source routing and parsing)
    CREATE TABLE IF NOT EXISTS source_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      hostname_pattern TEXT,
      app_name_pattern TEXT,
      source_type TEXT,
      priority INTEGER DEFAULT 100,
      template_id TEXT,
      target_index TEXT,
      parsing_mode TEXT DEFAULT 'auto',
      time_format TEXT,
      time_field TEXT,
      enabled INTEGER DEFAULT 1,
      match_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Source Config Field Extractions
    CREATE TABLE IF NOT EXISTS source_config_extractions (
      id TEXT PRIMARY KEY,
      source_config_id TEXT NOT NULL,
      field_name TEXT NOT NULL,
      pattern TEXT NOT NULL,
      pattern_type TEXT DEFAULT 'regex',
      priority INTEGER DEFAULT 100,
      enabled INTEGER DEFAULT 1,
      FOREIGN KEY (source_config_id) REFERENCES source_configs(id) ON DELETE CASCADE
    );

    -- Source Config Field Transforms
    CREATE TABLE IF NOT EXISTS source_config_transforms (
      id TEXT PRIMARY KEY,
      source_config_id TEXT NOT NULL,
      transform_type TEXT NOT NULL,
      source_field TEXT,
      target_field TEXT NOT NULL,
      config TEXT,
      priority INTEGER DEFAULT 100,
      enabled INTEGER DEFAULT 1,
      FOREIGN KEY (source_config_id) REFERENCES source_configs(id) ON DELETE CASCADE
    );

    -- Source Routing Rules (index routing)
    CREATE TABLE IF NOT EXISTS source_routing_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      conditions TEXT NOT NULL,
      match_mode TEXT DEFAULT 'all',
      target_index TEXT NOT NULL,
      priority INTEGER DEFAULT 100,
      enabled INTEGER DEFAULT 1,
      match_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Alert silences (3-level silencing: global, host, alert)
    CREATE TABLE IF NOT EXISTS alert_silences (
      id TEXT PRIMARY KEY,
      level TEXT NOT NULL,           -- 'global', 'host', 'alert'
      target_id TEXT,                -- hostname or alert_id (null for global)
      reason TEXT,
      created_by TEXT,
      starts_at TEXT NOT NULL DEFAULT (datetime('now')),
      ends_at TEXT,                  -- null = indefinite
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Dashboard variables (for dashboard templating)
    CREATE TABLE IF NOT EXISTS dashboard_variables (
      id TEXT PRIMARY KEY,
      dashboard_id TEXT NOT NULL,
      name TEXT NOT NULL,
      label TEXT,
      type TEXT DEFAULT 'query',
      query TEXT,
      default_value TEXT,
      multi_select INTEGER DEFAULT 0,
      include_all INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE
    );

    -- Dashboard annotations (for marking events on dashboards)
    CREATE TABLE IF NOT EXISTS dashboard_annotations (
      id TEXT PRIMARY KEY,
      dashboard_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      color TEXT DEFAULT '#3B82F6',
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE
    );

    -- Dashboard templates (for sharing/importing dashboards)
    CREATE TABLE IF NOT EXISTS dashboard_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      thumbnail_url TEXT,
      template_json TEXT NOT NULL,
      required_sources TEXT,
      downloads INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Codebase interview sessions (for helping dev teams set up logging)
    CREATE TABLE IF NOT EXISTS interview_sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      app_name TEXT,
      team_name TEXT,
      status TEXT DEFAULT 'questionnaire_sent',
      current_step INTEGER DEFAULT 1,
      questionnaire TEXT,
      responses TEXT,
      follow_up_questions TEXT,
      implementation_guide TEXT,
      recommended_logs TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_panels_dashboard ON dashboard_panels(dashboard_id);
    CREATE INDEX IF NOT EXISTS idx_searches_name ON saved_searches(name);
    CREATE INDEX IF NOT EXISTS idx_field_extractions_source ON field_extractions(source_type);
    CREATE INDEX IF NOT EXISTS idx_field_extractions_enabled ON field_extractions(enabled);
    CREATE INDEX IF NOT EXISTS idx_event_types_enabled ON event_types(enabled);
    CREATE INDEX IF NOT EXISTS idx_tags_field ON tags(field);
    CREATE INDEX IF NOT EXISTS idx_tags_tag_name ON tags(tag_name);
    CREATE INDEX IF NOT EXISTS idx_lookups_name ON lookups(name);
    CREATE INDEX IF NOT EXISTS idx_workflow_actions_field ON workflow_actions(field);
    CREATE INDEX IF NOT EXISTS idx_alerts_enabled ON alerts(enabled);
    CREATE INDEX IF NOT EXISTS idx_alerts_schedule ON alerts(schedule_type);
    CREATE INDEX IF NOT EXISTS idx_alert_history_alert ON alert_history(alert_id);
    CREATE INDEX IF NOT EXISTS idx_alert_history_triggered ON alert_history(triggered_at);
    CREATE INDEX IF NOT EXISTS idx_agent_notifications_hostname ON agent_notifications(hostname);
    CREATE INDEX IF NOT EXISTS idx_agent_notifications_delivered ON agent_notifications(delivered);
    CREATE INDEX IF NOT EXISTS idx_source_templates_category ON source_templates(category);
    CREATE INDEX IF NOT EXISTS idx_source_templates_source_type ON source_templates(source_type);
    CREATE INDEX IF NOT EXISTS idx_alert_silences_level ON alert_silences(level);
    CREATE INDEX IF NOT EXISTS idx_alert_silences_target ON alert_silences(target_id);
    CREATE INDEX IF NOT EXISTS idx_alert_silences_ends_at ON alert_silences(ends_at);
    CREATE INDEX IF NOT EXISTS idx_dashboard_variables_dashboard ON dashboard_variables(dashboard_id);
    CREATE INDEX IF NOT EXISTS idx_dashboard_annotations_dashboard ON dashboard_annotations(dashboard_id);
    CREATE INDEX IF NOT EXISTS idx_dashboard_annotations_timestamp ON dashboard_annotations(timestamp);
    CREATE INDEX IF NOT EXISTS idx_dashboard_templates_category ON dashboard_templates(category);
    CREATE INDEX IF NOT EXISTS idx_interview_sessions_status ON interview_sessions(status);

    -- RAG Knowledge Base
    CREATE TABLE IF NOT EXISTS rag_documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      source_type TEXT DEFAULT 'manual',
      source_path TEXT,
      chunk_index INTEGER DEFAULT 0,
      embedding TEXT,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_rag_documents_source ON rag_documents(source_type);
    CREATE INDEX IF NOT EXISTS idx_rag_documents_title ON rag_documents(title);

    -- FTS5 Full-Text Search for RAG documents (hybrid search support)
    -- Note: Not using content='' so we can retrieve doc_id for joining
    CREATE VIRTUAL TABLE IF NOT EXISTS rag_documents_fts USING fts5(
      doc_id,
      title,
      content,
      source_type,
      tokenize='porter unicode61'
    );

    -- User Field Preferences (for pinning/ordering fields in sidebar)
    CREATE TABLE IF NOT EXISTS user_field_preferences (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      field_name TEXT NOT NULL,
      is_pinned INTEGER DEFAULT 0,
      display_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, field_name)
    );

    CREATE INDEX IF NOT EXISTS idx_user_field_prefs_user ON user_field_preferences(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_field_prefs_pinned ON user_field_preferences(user_id, is_pinned);

    -- Notification Channels (for Apprise integration)
    CREATE TABLE IF NOT EXISTS notification_channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      service TEXT NOT NULL,        -- 'slack', 'discord', 'pagerduty', 'telegram', etc.
      apprise_url TEXT NOT NULL,    -- Full Apprise URL (e.g., slack://TokenA/TokenB/TokenC)
      description TEXT,
      enabled INTEGER DEFAULT 1,
      last_test TEXT,               -- Last successful test timestamp
      last_test_success INTEGER,    -- 1 = success, 0 = failure
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_notification_channels_service ON notification_channels(service);
    CREATE INDEX IF NOT EXISTS idx_notification_channels_enabled ON notification_channels(enabled);

    -- User Preferences (theme, defaults, etc.)
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY,
      theme TEXT DEFAULT 'system',
      default_time_range TEXT DEFAULT '-24h',
      sidebar_open INTEGER DEFAULT 1,
      default_view_mode TEXT DEFAULT 'log',
      query_history_limit INTEGER DEFAULT 10,
      date_format TEXT DEFAULT '12-hour',
      timezone TEXT DEFAULT 'browser',
      muted_values TEXT DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- System Settings (admin-configurable)
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Assets (servers, devices, endpoints)
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      asset_type TEXT NOT NULL,          -- 'server', 'workstation', 'network_device', 'container', 'cloud_instance'
      identifier TEXT NOT NULL,          -- hostname, IP, or unique ID
      display_name TEXT,
      description TEXT,
      criticality INTEGER DEFAULT 50,    -- 0-100 criticality score
      owner TEXT,
      department TEXT,
      location TEXT,
      tags TEXT DEFAULT '[]',            -- JSON array of tags
      attributes TEXT DEFAULT '{}',      -- JSON object of custom attributes
      first_seen TEXT,
      last_seen TEXT,
      status TEXT DEFAULT 'active',      -- 'active', 'inactive', 'decommissioned'
      source TEXT DEFAULT 'auto',        -- 'auto' (discovered) or 'manual'
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(asset_type, identifier)
    );

    -- Identities (users, service accounts)
    CREATE TABLE IF NOT EXISTS identities (
      id TEXT PRIMARY KEY,
      identity_type TEXT NOT NULL,       -- 'user', 'service_account', 'system', 'external'
      identifier TEXT NOT NULL,          -- username, email, or unique ID
      display_name TEXT,
      email TEXT,
      department TEXT,
      title TEXT,
      manager TEXT,
      is_privileged INTEGER DEFAULT 0,   -- 1 if admin/privileged account
      risk_score INTEGER DEFAULT 0,      -- 0-100 risk score
      tags TEXT DEFAULT '[]',            -- JSON array of tags
      attributes TEXT DEFAULT '{}',      -- JSON object of custom attributes
      first_seen TEXT,
      last_seen TEXT,
      status TEXT DEFAULT 'active',      -- 'active', 'inactive', 'disabled'
      source TEXT DEFAULT 'auto',        -- 'auto' (discovered) or 'manual'
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(identity_type, identifier)
    );

    -- Asset-Identity relationships (who uses what)
    CREATE TABLE IF NOT EXISTS asset_identity_links (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      identity_id TEXT NOT NULL,
      relationship_type TEXT DEFAULT 'user',  -- 'user', 'owner', 'admin'
      first_seen TEXT,
      last_seen TEXT,
      event_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
      FOREIGN KEY (identity_id) REFERENCES identities(id) ON DELETE CASCADE,
      UNIQUE(asset_id, identity_id, relationship_type)
    );

    -- Create indexes for faster lookups
    CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(asset_type);
    CREATE INDEX IF NOT EXISTS idx_assets_identifier ON assets(identifier);
    CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
    CREATE INDEX IF NOT EXISTS idx_identities_type ON identities(identity_type);
    CREATE INDEX IF NOT EXISTS idx_identities_identifier ON identities(identifier);
    CREATE INDEX IF NOT EXISTS idx_identities_privileged ON identities(is_privileged);

    -- CIM Data Models (Common Information Model)
    CREATE TABLE IF NOT EXISTS data_models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      category TEXT DEFAULT 'custom',  -- 'authentication', 'network', 'endpoint', 'web', 'custom'
      fields TEXT NOT NULL DEFAULT '[]',  -- JSON array of field definitions
      constraints TEXT DEFAULT '[]',  -- JSON array of validation constraints
      is_builtin INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- CIM Field Mappings (map source fields to CIM fields)
    CREATE TABLE IF NOT EXISTS field_mappings (
      id TEXT PRIMARY KEY,
      source_type TEXT NOT NULL,  -- log source type (e.g., 'sshd', 'nginx', 'windows_security')
      source_field TEXT NOT NULL,  -- original field name
      data_model TEXT NOT NULL,  -- target CIM data model name
      cim_field TEXT NOT NULL,  -- normalized CIM field name
      transform TEXT,  -- optional transform expression (e.g., 'lower()', 'int()')
      priority INTEGER DEFAULT 100,
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (data_model) REFERENCES data_models(name) ON DELETE CASCADE,
      UNIQUE(source_type, source_field, data_model)
    );

    -- Create indexes for CIM tables
    CREATE INDEX IF NOT EXISTS idx_data_models_category ON data_models(category);
    CREATE INDEX IF NOT EXISTS idx_data_models_enabled ON data_models(enabled);
    CREATE INDEX IF NOT EXISTS idx_field_mappings_source ON field_mappings(source_type);
    CREATE INDEX IF NOT EXISTS idx_field_mappings_model ON field_mappings(data_model);

    -- AI Agent Conversations
    CREATE TABLE IF NOT EXISTS agent_conversations (
      id TEXT PRIMARY KEY,
      persona_id TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- AI Agent Messages
    CREATE TABLE IF NOT EXISTS agent_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,  -- 'user', 'assistant', 'system'
      content TEXT NOT NULL,
      tool_calls TEXT,  -- JSON array of tool calls with results
      thinking TEXT,  -- Optional thinking/reasoning content
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES agent_conversations(id) ON DELETE CASCADE
    );

    -- Create indexes for agent tables
    CREATE INDEX IF NOT EXISTS idx_agent_conversations_persona ON agent_conversations(persona_id);
    CREATE INDEX IF NOT EXISTS idx_agent_conversations_updated ON agent_conversations(updated_at);
    CREATE INDEX IF NOT EXISTS idx_agent_messages_conversation ON agent_messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_agent_messages_created ON agent_messages(created_at);

    -- Synthetic Monitoring Tests
    CREATE TABLE IF NOT EXISTS synthetic_tests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      test_type TEXT NOT NULL,  -- 'http', 'tcp', 'browser', 'api'
      config TEXT NOT NULL DEFAULT '{}',  -- JSON config (url, method, headers, body, assertions, etc.)
      schedule TEXT NOT NULL DEFAULT '*/5 * * * *',  -- Cron expression (default: every 5 min)
      timeout_ms INTEGER DEFAULT 30000,
      enabled INTEGER DEFAULT 1,
      tags TEXT DEFAULT '[]',  -- JSON array of tags
      last_run TEXT,
      last_status TEXT,  -- 'success', 'failure', 'timeout', 'error'
      last_response_time_ms INTEGER,
      consecutive_failures INTEGER DEFAULT 0,
      alert_after_failures INTEGER DEFAULT 3,  -- Alert after N consecutive failures
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Synthetic Monitoring Results (recent results stored in SQLite)
    CREATE TABLE IF NOT EXISTS synthetic_results (
      id TEXT PRIMARY KEY,
      test_id TEXT NOT NULL,
      timestamp TEXT DEFAULT (datetime('now')),
      status TEXT NOT NULL,  -- 'success', 'failure', 'timeout', 'error'
      response_time_ms INTEGER,
      status_code INTEGER,
      error_message TEXT,
      response_body TEXT,  -- Truncated response for debugging
      assertions_passed INTEGER DEFAULT 0,
      assertions_failed INTEGER DEFAULT 0,
      metadata TEXT DEFAULT '{}',  -- JSON metadata (headers, redirects, etc.)
      FOREIGN KEY (test_id) REFERENCES synthetic_tests(id) ON DELETE CASCADE
    );

    -- Create indexes for synthetic tables
    CREATE INDEX IF NOT EXISTS idx_synthetic_tests_type ON synthetic_tests(test_type);
    CREATE INDEX IF NOT EXISTS idx_synthetic_tests_enabled ON synthetic_tests(enabled);
    CREATE INDEX IF NOT EXISTS idx_synthetic_results_test ON synthetic_results(test_id);
    CREATE INDEX IF NOT EXISTS idx_synthetic_results_timestamp ON synthetic_results(timestamp);
    CREATE INDEX IF NOT EXISTS idx_synthetic_results_status ON synthetic_results(status);

    -- Login Notifications (show alerts to users on login)
    CREATE TABLE IF NOT EXISTS login_notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT,              -- NULL = show to all users
      alert_id TEXT,
      alert_name TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT,           -- Optional expiration
      dismissed INTEGER DEFAULT 0,
      dismissed_at TEXT,
      FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_login_notifications_user ON login_notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_login_notifications_dismissed ON login_notifications(dismissed);
    CREATE INDEX IF NOT EXISTS idx_login_notifications_expires ON login_notifications(expires_at);

    -- Source Annotations (for adding context/notes to field values)
    CREATE TABLE IF NOT EXISTS source_annotations (
      id TEXT PRIMARY KEY,
      field_name TEXT NOT NULL,        -- e.g., 'hostname', 'app_name', 'source'
      field_value TEXT NOT NULL,       -- e.g., 'router', 'nginx', '192.168.1.1'
      title TEXT,                      -- Short label for tooltip
      description TEXT,                -- Brief description (tooltip)
      details TEXT,                    -- Full details (card view, markdown supported)
      icon TEXT,                       -- Optional emoji/icon
      color TEXT,                      -- Optional highlight color
      lookup_id TEXT,                  -- Link to knowledge lookup table
      tags TEXT DEFAULT '[]',          -- JSON array of tags
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(field_name, field_value)
    );

    CREATE INDEX IF NOT EXISTS idx_source_annotations_field ON source_annotations(field_name, field_value);
    CREATE INDEX IF NOT EXISTS idx_source_annotations_lookup ON source_annotations(lookup_id);

    -- Index Retention Settings (per-index TTL configuration)
    CREATE TABLE IF NOT EXISTS index_retention_settings (
      id TEXT PRIMARY KEY,
      index_name TEXT NOT NULL UNIQUE,
      retention_days INTEGER NOT NULL DEFAULT 90,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_retention_settings_index ON index_retention_settings(index_name);
  `);

  // Add new columns to dashboards table if they don't exist
  const columns = database.pragma('table_info(dashboards)') as Array<{ name: string }>;
  const columnNames = columns.map((col) => col.name);

  if (!columnNames.includes('logo_url')) {
    database.exec('ALTER TABLE dashboards ADD COLUMN logo_url TEXT');
  }
  if (!columnNames.includes('accent_color')) {
    database.exec('ALTER TABLE dashboards ADD COLUMN accent_color TEXT');
  }
  if (!columnNames.includes('header_color')) {
    database.exec('ALTER TABLE dashboards ADD COLUMN header_color TEXT');
  }
  if (!columnNames.includes('is_public')) {
    database.exec('ALTER TABLE dashboards ADD COLUMN is_public INTEGER DEFAULT 0');
  }
  if (!columnNames.includes('public_token')) {
    database.exec('ALTER TABLE dashboards ADD COLUMN public_token TEXT');
  }
  if (!columnNames.includes('public_password')) {
    database.exec('ALTER TABLE dashboards ADD COLUMN public_password TEXT');
  }
  if (!columnNames.includes('public_expires_at')) {
    database.exec('ALTER TABLE dashboards ADD COLUMN public_expires_at TEXT');
  }
  if (!columnNames.includes('icon')) {
    database.exec('ALTER TABLE dashboards ADD COLUMN icon TEXT');
  }

  // Add dashboard_pages table for multi-page dashboards
  database.exec(`
    CREATE TABLE IF NOT EXISTS dashboard_pages (
      id TEXT PRIMARY KEY,
      dashboard_id TEXT NOT NULL,
      name TEXT NOT NULL,
      icon TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_dashboard_pages_dashboard ON dashboard_pages(dashboard_id);
  `);

  // Add new columns to dashboard_panels for descriptions and pages
  const panelColumns = database.pragma('table_info(dashboard_panels)') as Array<{ name: string }>;
  const panelColumnNames = panelColumns.map((col) => col.name);

  if (!panelColumnNames.includes('description')) {
    database.exec('ALTER TABLE dashboard_panels ADD COLUMN description TEXT');
  }
  if (!panelColumnNames.includes('page_id')) {
    database.exec('ALTER TABLE dashboard_panels ADD COLUMN page_id TEXT');
  }

  // Add onboarding columns to users table if they don't exist
  const userColumns = database.pragma('table_info(users)') as Array<{ name: string }>;
  const userColumnNames = userColumns.map((col) => col.name);

  if (!userColumnNames.includes('onboarding_completed')) {
    database.exec('ALTER TABLE users ADD COLUMN onboarding_completed INTEGER DEFAULT 0');
  }
  if (!userColumnNames.includes('onboarding_completed_at')) {
    database.exec('ALTER TABLE users ADD COLUMN onboarding_completed_at TEXT');
  }

  // Add new columns to saved_searches table for enhanced functionality
  const ssColumns = database.pragma('table_info(saved_searches)') as Array<{ name: string }>;
  const ssColumnNames = ssColumns.map((col) => col.name);

  if (!ssColumnNames.includes('owner_id')) {
    database.exec('ALTER TABLE saved_searches ADD COLUMN owner_id TEXT');
  }
  if (!ssColumnNames.includes('is_shared')) {
    database.exec('ALTER TABLE saved_searches ADD COLUMN is_shared INTEGER DEFAULT 0');
  }
  if (!ssColumnNames.includes('time_range')) {
    database.exec("ALTER TABLE saved_searches ADD COLUMN time_range TEXT DEFAULT '-24h'");
  }
  if (!ssColumnNames.includes('schedule')) {
    database.exec('ALTER TABLE saved_searches ADD COLUMN schedule TEXT');
  }
  if (!ssColumnNames.includes('schedule_enabled')) {
    database.exec('ALTER TABLE saved_searches ADD COLUMN schedule_enabled INTEGER DEFAULT 0');
  }
  if (!ssColumnNames.includes('cache_ttl_seconds')) {
    database.exec('ALTER TABLE saved_searches ADD COLUMN cache_ttl_seconds INTEGER DEFAULT 3600');
  }
  if (!ssColumnNames.includes('cached_results')) {
    database.exec('ALTER TABLE saved_searches ADD COLUMN cached_results TEXT');
  }
  if (!ssColumnNames.includes('cached_at')) {
    database.exec('ALTER TABLE saved_searches ADD COLUMN cached_at TEXT');
  }
  if (!ssColumnNames.includes('cached_count')) {
    database.exec('ALTER TABLE saved_searches ADD COLUMN cached_count INTEGER');
  }
  if (!ssColumnNames.includes('cached_sql')) {
    database.exec('ALTER TABLE saved_searches ADD COLUMN cached_sql TEXT');
  }
  if (!ssColumnNames.includes('last_run')) {
    database.exec('ALTER TABLE saved_searches ADD COLUMN last_run TEXT');
  }
  if (!ssColumnNames.includes('last_run_duration_ms')) {
    database.exec('ALTER TABLE saved_searches ADD COLUMN last_run_duration_ms INTEGER');
  }
  if (!ssColumnNames.includes('last_error')) {
    database.exec('ALTER TABLE saved_searches ADD COLUMN last_error TEXT');
  }
  if (!ssColumnNames.includes('run_count')) {
    database.exec('ALTER TABLE saved_searches ADD COLUMN run_count INTEGER DEFAULT 0');
  }
  if (!ssColumnNames.includes('tags')) {
    database.exec("ALTER TABLE saved_searches ADD COLUMN tags TEXT DEFAULT '[]'");
  }
  if (!ssColumnNames.includes('version')) {
    database.exec('ALTER TABLE saved_searches ADD COLUMN version INTEGER DEFAULT 1');
  }
  if (!ssColumnNames.includes('previous_versions')) {
    database.exec("ALTER TABLE saved_searches ADD COLUMN previous_versions TEXT DEFAULT '[]'");
  }

  // Create indexes for saved_searches
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_saved_searches_owner ON saved_searches(owner_id);
    CREATE INDEX IF NOT EXISTS idx_saved_searches_schedule ON saved_searches(schedule_enabled);
    CREATE INDEX IF NOT EXISTS idx_saved_searches_cached_at ON saved_searches(cached_at);
  `);

  // Add app_scope column to organize dashboards, alerts, reports by application
  // This allows filtering by app (e.g., "hey-youre-hired", "directors-palette")
  if (!columnNames.includes('app_scope')) {
    database.exec("ALTER TABLE dashboards ADD COLUMN app_scope TEXT DEFAULT 'default'");
  }

  // Add category column for dashboard grouping/tabs
  if (!columnNames.includes('category')) {
    database.exec("ALTER TABLE dashboards ADD COLUMN category TEXT DEFAULT 'general'");
  }

  const alertColumns = database.pragma('table_info(alerts)') as Array<{ name: string }>;
  const alertColumnNames = alertColumns.map((col) => col.name);
  if (!alertColumnNames.includes('app_scope')) {
    database.exec("ALTER TABLE alerts ADD COLUMN app_scope TEXT DEFAULT 'default'");
  }
  if (!alertColumnNames.includes('playbook')) {
    database.exec("ALTER TABLE alerts ADD COLUMN playbook TEXT");
  }

  const reportColumns = database.pragma('table_info(scheduled_reports)') as Array<{ name: string }>;
  const reportColumnNames = reportColumns.map((col) => col.name);
  if (!reportColumnNames.includes('app_scope')) {
    database.exec("ALTER TABLE scheduled_reports ADD COLUMN app_scope TEXT DEFAULT 'default'");
  }
  // Phase 1: Token system for reports
  if (!reportColumnNames.includes('description')) {
    database.exec("ALTER TABLE scheduled_reports ADD COLUMN description TEXT");
  }
  if (!reportColumnNames.includes('subject_template')) {
    database.exec("ALTER TABLE scheduled_reports ADD COLUMN subject_template TEXT DEFAULT '[LogNog Report] {{report_name}}'");
  }
  if (!reportColumnNames.includes('message_template')) {
    database.exec("ALTER TABLE scheduled_reports ADD COLUMN message_template TEXT");
  }
  // Phase 3: Multiple output formats
  if (!reportColumnNames.includes('attachment_format')) {
    database.exec("ALTER TABLE scheduled_reports ADD COLUMN attachment_format TEXT DEFAULT 'none'");
  }
  // Phase 4: Compare offset for auto-comparison
  if (!reportColumnNames.includes('compare_offset')) {
    database.exec("ALTER TABLE scheduled_reports ADD COLUMN compare_offset TEXT");
  }
  // Phase 5: Smart reports
  if (!reportColumnNames.includes('send_condition')) {
    database.exec("ALTER TABLE scheduled_reports ADD COLUMN send_condition TEXT DEFAULT 'always'");
  }
  if (!reportColumnNames.includes('condition_threshold')) {
    database.exec("ALTER TABLE scheduled_reports ADD COLUMN condition_threshold INTEGER");
  }
  if (!reportColumnNames.includes('last_result_count')) {
    database.exec("ALTER TABLE scheduled_reports ADD COLUMN last_result_count INTEGER");
  }
  if (!reportColumnNames.includes('updated_at')) {
    database.exec("ALTER TABLE scheduled_reports ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))");
  }

  if (!ssColumnNames.includes('app_scope')) {
    database.exec("ALTER TABLE saved_searches ADD COLUMN app_scope TEXT DEFAULT 'default'");
  }

  if (!ssColumnNames.includes('folder')) {
    database.exec("ALTER TABLE saved_searches ADD COLUMN folder TEXT DEFAULT 'Uncategorized'");
  }

  // Create indexes for app_scope filtering
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_dashboards_app_scope ON dashboards(app_scope);
    CREATE INDEX IF NOT EXISTS idx_alerts_app_scope ON alerts(app_scope);
    CREATE INDEX IF NOT EXISTS idx_reports_app_scope ON scheduled_reports(app_scope);
    CREATE INDEX IF NOT EXISTS idx_saved_searches_app_scope ON saved_searches(app_scope);
  `);

  // Projects system - organize dashboards, alerts, and reports by project
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      logo_url TEXT,
      accent_color TEXT,
      sort_order INTEGER DEFAULT 0,
      is_archived INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);
    CREATE INDEX IF NOT EXISTS idx_projects_archived ON projects(is_archived);
  `);

  // Dashboard logos - support multiple logos per dashboard
  database.exec(`
    CREATE TABLE IF NOT EXISTS dashboard_logos (
      id TEXT PRIMARY KEY,
      dashboard_id TEXT NOT NULL,
      logo_url TEXT NOT NULL,
      label TEXT,
      position INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_dashboard_logos_dashboard ON dashboard_logos(dashboard_id);
  `);

  // Add project_id to dashboards
  if (!columnNames.includes('project_id')) {
    database.exec('ALTER TABLE dashboards ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL');
    database.exec('CREATE INDEX IF NOT EXISTS idx_dashboards_project ON dashboards(project_id)');
  }

  // Add provenance tracking to dashboard_panels for copied panels
  const panelProvenanceColumns = database.pragma('table_info(dashboard_panels)') as Array<{ name: string }>;
  const panelProvenanceColumnNames = panelProvenanceColumns.map((col) => col.name);

  if (!panelProvenanceColumnNames.includes('source_panel_id')) {
    database.exec('ALTER TABLE dashboard_panels ADD COLUMN source_panel_id TEXT');
  }
  if (!panelProvenanceColumnNames.includes('source_dashboard_id')) {
    database.exec('ALTER TABLE dashboard_panels ADD COLUMN source_dashboard_id TEXT');
  }
  if (!panelProvenanceColumnNames.includes('source_project_id')) {
    database.exec('ALTER TABLE dashboard_panels ADD COLUMN source_project_id TEXT');
  }
  if (!panelProvenanceColumnNames.includes('copied_at')) {
    database.exec('ALTER TABLE dashboard_panels ADD COLUMN copied_at TEXT');
  }
  if (!panelProvenanceColumnNames.includes('copy_generation')) {
    database.exec('ALTER TABLE dashboard_panels ADD COLUMN copy_generation INTEGER DEFAULT 0');
  }
}

// Saved Searches
export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  description?: string;
  owner_id?: string;
  is_shared: number;
  time_range: string;
  schedule?: string;
  schedule_enabled: number;
  folder: string;
  cache_ttl_seconds: number;
  cached_results?: string;
  cached_at?: string;
  cached_count?: number;
  cached_sql?: string;
  last_run?: string;
  last_run_duration_ms?: number;
  last_error?: string;
  run_count: number;
  tags: string;
  version: number;
  previous_versions: string;
  created_at: string;
  updated_at: string;
}

export interface SavedSearchFilters {
  owner_id?: string;
  is_shared?: boolean;
  tags?: string[];
  schedule_enabled?: boolean;
  search?: string;
  folder?: string;
}

export interface SavedSearchCreateOptions {
  description?: string;
  owner_id?: string;
  is_shared?: boolean;
  time_range?: string;
  schedule?: string;
  schedule_enabled?: boolean;
  cache_ttl_seconds?: number;
  tags?: string[];
  folder?: string;
}

export interface SavedSearchUpdateOptions {
  name?: string;
  query?: string;
  description?: string;
  is_shared?: boolean;
  time_range?: string;
  schedule?: string;
  schedule_enabled?: boolean;
  cache_ttl_seconds?: number;
  tags?: string[];
  folder?: string | null;
}

export function getSavedSearches(filters?: SavedSearchFilters): SavedSearch[] {
  const database = getSQLiteDB();

  let sql = 'SELECT * FROM saved_searches WHERE 1=1';
  const params: unknown[] = [];

  if (filters) {
    if (filters.owner_id) {
      sql += ' AND owner_id = ?';
      params.push(filters.owner_id);
    }
    if (filters.is_shared !== undefined) {
      sql += ' AND is_shared = ?';
      params.push(filters.is_shared ? 1 : 0);
    }
    if (filters.schedule_enabled !== undefined) {
      sql += ' AND schedule_enabled = ?';
      params.push(filters.schedule_enabled ? 1 : 0);
    }
    if (filters.search) {
      sql += ' AND (name LIKE ? OR description LIKE ? OR query LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    if (filters.tags && filters.tags.length > 0) {
      // Match any of the provided tags
      const tagConditions = filters.tags.map(() => 'tags LIKE ?').join(' OR ');
      sql += ` AND (${tagConditions})`;
      filters.tags.forEach(tag => params.push(`%"${tag}"%`));
    }
    if (filters.folder) {
      sql += ' AND folder = ?';
      params.push(filters.folder);
    }
  }

  sql += ' ORDER BY folder ASC NULLS LAST, updated_at DESC';
  return database.prepare(sql).all(...params) as SavedSearch[];
}

export function getSavedSearch(id: string): SavedSearch | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM saved_searches WHERE id = ?').get(id) as SavedSearch | undefined;
}

export function getScheduledSavedSearches(): SavedSearch[] {
  const database = getSQLiteDB();
  return database.prepare(
    'SELECT * FROM saved_searches WHERE schedule_enabled = 1 AND schedule IS NOT NULL'
  ).all() as SavedSearch[];
}

export function createSavedSearch(
  name: string,
  query: string,
  options?: SavedSearchCreateOptions
): SavedSearch {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO saved_searches (
      id, name, query, description, owner_id, is_shared, time_range,
      schedule, schedule_enabled, cache_ttl_seconds, tags, folder
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name,
    query,
    options?.description || null,
    options?.owner_id || null,
    options?.is_shared ? 1 : 0,
    options?.time_range || '-24h',
    options?.schedule || null,
    options?.schedule_enabled ? 1 : 0,
    options?.cache_ttl_seconds || 3600,
    JSON.stringify(options?.tags || []),
    options?.folder || 'Uncategorized'
  );

  return getSavedSearch(id)!;
}

export function updateSavedSearch(
  id: string,
  updates: SavedSearchUpdateOptions
): SavedSearch | undefined {
  const database = getSQLiteDB();
  const existing = getSavedSearch(id);
  if (!existing) return undefined;

  // Track version history if query changed
  let newVersion = existing.version;
  let previousVersions = JSON.parse(existing.previous_versions || '[]');

  if (updates.query && updates.query !== existing.query) {
    previousVersions.push({
      version: existing.version,
      query: existing.query,
      time_range: existing.time_range,
      changed_at: new Date().toISOString(),
    });
    newVersion = existing.version + 1;
  }

  const fields: string[] = ["updated_at = datetime('now')"];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.query !== undefined) {
    fields.push('query = ?');
    values.push(updates.query);
    fields.push('version = ?');
    values.push(newVersion);
    fields.push('previous_versions = ?');
    values.push(JSON.stringify(previousVersions));
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.is_shared !== undefined) {
    fields.push('is_shared = ?');
    values.push(updates.is_shared ? 1 : 0);
  }
  if (updates.time_range !== undefined) {
    fields.push('time_range = ?');
    values.push(updates.time_range);
  }
  if (updates.schedule !== undefined) {
    fields.push('schedule = ?');
    values.push(updates.schedule);
  }
  if (updates.schedule_enabled !== undefined) {
    fields.push('schedule_enabled = ?');
    values.push(updates.schedule_enabled ? 1 : 0);
  }
  if (updates.cache_ttl_seconds !== undefined) {
    fields.push('cache_ttl_seconds = ?');
    values.push(updates.cache_ttl_seconds);
  }
  if (updates.tags !== undefined) {
    fields.push('tags = ?');
    values.push(JSON.stringify(updates.tags));
  }
  if (updates.folder !== undefined) {
    fields.push('folder = ?');
    values.push(updates.folder);
  }

  values.push(id);
  database.prepare(`UPDATE saved_searches SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return getSavedSearch(id);
}

export function deleteSavedSearch(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM saved_searches WHERE id = ?').run(id);
  return result.changes > 0;
}

export function deleteSavedSearchByName(name: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM saved_searches WHERE name = ?').run(name);
  return result.changes > 0;
}

export function updateSavedSearchCache(
  id: string,
  results: unknown[],
  sql: string,
  executionTimeMs: number
): SavedSearch | undefined {
  const database = getSQLiteDB();

  database.prepare(`
    UPDATE saved_searches SET
      cached_results = ?,
      cached_sql = ?,
      cached_at = datetime('now'),
      cached_count = ?,
      last_run = datetime('now'),
      last_run_duration_ms = ?,
      last_error = NULL,
      run_count = run_count + 1,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    JSON.stringify(results),
    sql,
    results.length,
    executionTimeMs,
    id
  );

  return getSavedSearch(id);
}

export function updateSavedSearchError(id: string, error: string): void {
  const database = getSQLiteDB();
  database.prepare(`
    UPDATE saved_searches SET
      last_run = datetime('now'),
      last_error = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(error, id);
}

export function clearSavedSearchCache(id: string): void {
  const database = getSQLiteDB();
  database.prepare(`
    UPDATE saved_searches SET
      cached_results = NULL,
      cached_sql = NULL,
      cached_at = NULL,
      cached_count = NULL
    WHERE id = ?
  `).run(id);
}

export function cleanupExpiredSearchCache(): number {
  const database = getSQLiteDB();

  // Find and clear expired caches
  const result = database.prepare(`
    UPDATE saved_searches SET
      cached_results = NULL,
      cached_sql = NULL,
      cached_at = NULL,
      cached_count = NULL
    WHERE cached_at IS NOT NULL
    AND (julianday('now') - julianday(cached_at)) * 86400 > cache_ttl_seconds
  `).run();

  return result.changes;
}

export function getSavedSearchTags(): string[] {
  const database = getSQLiteDB();
  const searches = database.prepare('SELECT tags FROM saved_searches').all() as { tags: string }[];

  const allTags = new Set<string>();
  searches.forEach(s => {
    const tags = JSON.parse(s.tags || '[]') as string[];
    tags.forEach(tag => allTags.add(tag));
  });

  return Array.from(allTags).sort();
}

export function getSavedSearchFolders(): string[] {
  const database = getSQLiteDB();
  const folders = database.prepare(
    `SELECT DISTINCT folder FROM saved_searches WHERE folder IS NOT NULL ORDER BY folder`
  ).all() as { folder: string }[];

  return folders.map(f => f.folder);
}

export function duplicateSavedSearch(id: string, newOwnerId?: string): SavedSearch | undefined {
  const existing = getSavedSearch(id);
  if (!existing) return undefined;

  return createSavedSearch(
    `${existing.name} (Copy)`,
    existing.query,
    {
      description: existing.description,
      owner_id: newOwnerId || existing.owner_id,
      is_shared: false,
      time_range: existing.time_range,
      schedule: existing.schedule,
      schedule_enabled: false, // Don't auto-enable schedule on copy
      cache_ttl_seconds: existing.cache_ttl_seconds,
      tags: JSON.parse(existing.tags || '[]'),
    }
  );
}

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

// Field Extractions
export interface FieldExtraction {
  id: string;
  name: string;
  source_type: string;
  field_name: string;
  pattern: string;
  pattern_type: 'grok' | 'regex';
  priority: number;
  enabled: number;
  created_at: string;
}

export function getFieldExtractions(sourceType?: string): FieldExtraction[] {
  const database = getSQLiteDB();
  if (sourceType) {
    return database.prepare('SELECT * FROM field_extractions WHERE source_type = ? ORDER BY priority, created_at').all(sourceType) as FieldExtraction[];
  }
  return database.prepare('SELECT * FROM field_extractions ORDER BY priority, created_at').all() as FieldExtraction[];
}

export function getFieldExtraction(id: string): FieldExtraction | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM field_extractions WHERE id = ?').get(id) as FieldExtraction | undefined;
}

export function createFieldExtraction(
  name: string,
  sourceType: string,
  fieldName: string,
  pattern: string,
  patternType: 'grok' | 'regex',
  priority: number = 100,
  enabled: boolean = true
): FieldExtraction {
  const database = getSQLiteDB();
  const id = uuidv4();
  database.prepare(
    'INSERT INTO field_extractions (id, name, source_type, field_name, pattern, pattern_type, priority, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name, sourceType, fieldName, pattern, patternType, priority, enabled ? 1 : 0);
  return getFieldExtraction(id)!;
}

export function updateFieldExtraction(
  id: string,
  updates: {
    name?: string;
    source_type?: string;
    field_name?: string;
    pattern?: string;
    pattern_type?: 'grok' | 'regex';
    priority?: number;
    enabled?: boolean;
  }
): FieldExtraction | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.source_type !== undefined) {
    fields.push('source_type = ?');
    values.push(updates.source_type);
  }
  if (updates.field_name !== undefined) {
    fields.push('field_name = ?');
    values.push(updates.field_name);
  }
  if (updates.pattern !== undefined) {
    fields.push('pattern = ?');
    values.push(updates.pattern);
  }
  if (updates.pattern_type !== undefined) {
    fields.push('pattern_type = ?');
    values.push(updates.pattern_type);
  }
  if (updates.priority !== undefined) {
    fields.push('priority = ?');
    values.push(updates.priority);
  }
  if (updates.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(updates.enabled ? 1 : 0);
  }

  if (fields.length === 0) {
    return getFieldExtraction(id);
  }

  values.push(id);
  database.prepare(`UPDATE field_extractions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getFieldExtraction(id);
}

export function deleteFieldExtraction(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM field_extractions WHERE id = ?').run(id);
  return result.changes > 0;
}

// Event Types
export interface EventType {
  id: string;
  name: string;
  search_string: string;
  description?: string;
  priority: number;
  enabled: number;
  created_at: string;
}

export function getEventTypes(): EventType[] {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM event_types ORDER BY priority, created_at').all() as EventType[];
}

export function getEventType(id: string): EventType | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM event_types WHERE id = ?').get(id) as EventType | undefined;
}

export function createEventType(
  name: string,
  searchString: string,
  description?: string,
  priority: number = 100,
  enabled: boolean = true
): EventType {
  const database = getSQLiteDB();
  const id = uuidv4();
  database.prepare(
    'INSERT INTO event_types (id, name, search_string, description, priority, enabled) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, name, searchString, description || null, priority, enabled ? 1 : 0);
  return getEventType(id)!;
}

export function updateEventType(
  id: string,
  updates: {
    name?: string;
    search_string?: string;
    description?: string;
    priority?: number;
    enabled?: boolean;
  }
): EventType | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.search_string !== undefined) {
    fields.push('search_string = ?');
    values.push(updates.search_string);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.priority !== undefined) {
    fields.push('priority = ?');
    values.push(updates.priority);
  }
  if (updates.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(updates.enabled ? 1 : 0);
  }

  if (fields.length === 0) {
    return getEventType(id);
  }

  values.push(id);
  database.prepare(`UPDATE event_types SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getEventType(id);
}

export function deleteEventType(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM event_types WHERE id = ?').run(id);
  return result.changes > 0;
}

// Tags
export interface Tag {
  id: string;
  tag_name: string;
  field: string;
  value: string;
  created_at: string;
}

export function getTags(field?: string): Tag[] {
  const database = getSQLiteDB();
  if (field) {
    return database.prepare('SELECT * FROM tags WHERE field = ? ORDER BY tag_name').all(field) as Tag[];
  }
  return database.prepare('SELECT * FROM tags ORDER BY tag_name, field').all() as Tag[];
}

export function getTag(id: string): Tag | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM tags WHERE id = ?').get(id) as Tag | undefined;
}

export function getTagsByValue(field: string, value: string): Tag[] {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM tags WHERE field = ? AND value = ?').all(field, value) as Tag[];
}

export function createTag(tagName: string, field: string, value: string): Tag {
  const database = getSQLiteDB();
  const id = uuidv4();
  database.prepare(
    'INSERT INTO tags (id, tag_name, field, value) VALUES (?, ?, ?, ?)'
  ).run(id, tagName, field, value);
  return getTag(id)!;
}

export function deleteTag(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM tags WHERE id = ?').run(id);
  return result.changes > 0;
}

// Lookups
export interface Lookup {
  id: string;
  name: string;
  type: 'csv' | 'manual';
  key_field: string;
  output_fields: string;
  data?: string;
  file_path?: string;
  created_at: string;
}

export function getLookups(): Lookup[] {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM lookups ORDER BY name').all() as Lookup[];
}

export function getLookup(id: string): Lookup | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM lookups WHERE id = ?').get(id) as Lookup | undefined;
}

export function getLookupByName(name: string): Lookup | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM lookups WHERE name = ?').get(name) as Lookup | undefined;
}

export function createLookup(
  name: string,
  type: 'csv' | 'manual',
  keyField: string,
  outputFields: string[],
  data?: Record<string, unknown>[],
  filePath?: string
): Lookup {
  const database = getSQLiteDB();
  const id = uuidv4();
  database.prepare(
    'INSERT INTO lookups (id, name, type, key_field, output_fields, data, file_path) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    name,
    type,
    keyField,
    JSON.stringify(outputFields),
    data ? JSON.stringify(data) : null,
    filePath || null
  );
  return getLookup(id)!;
}

export function updateLookup(
  id: string,
  updates: {
    name?: string;
    type?: 'csv' | 'manual';
    key_field?: string;
    output_fields?: string[];
    data?: Record<string, unknown>[];
    file_path?: string;
  }
): Lookup | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.type !== undefined) {
    fields.push('type = ?');
    values.push(updates.type);
  }
  if (updates.key_field !== undefined) {
    fields.push('key_field = ?');
    values.push(updates.key_field);
  }
  if (updates.output_fields !== undefined) {
    fields.push('output_fields = ?');
    values.push(JSON.stringify(updates.output_fields));
  }
  if (updates.data !== undefined) {
    fields.push('data = ?');
    values.push(JSON.stringify(updates.data));
  }
  if (updates.file_path !== undefined) {
    fields.push('file_path = ?');
    values.push(updates.file_path);
  }

  if (fields.length === 0) {
    return getLookup(id);
  }

  values.push(id);
  database.prepare(`UPDATE lookups SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getLookup(id);
}

export function deleteLookup(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM lookups WHERE id = ?').run(id);
  return result.changes > 0;
}

// Workflow Actions
export interface WorkflowAction {
  id: string;
  name: string;
  label: string;
  field: string;
  action_type: 'link' | 'search' | 'script';
  action_value: string;
  enabled: number;
  created_at: string;
}

export function getWorkflowActions(field?: string): WorkflowAction[] {
  const database = getSQLiteDB();
  if (field) {
    return database.prepare('SELECT * FROM workflow_actions WHERE field = ? AND enabled = 1 ORDER BY name').all(field) as WorkflowAction[];
  }
  return database.prepare('SELECT * FROM workflow_actions ORDER BY name').all() as WorkflowAction[];
}

export function getWorkflowAction(id: string): WorkflowAction | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM workflow_actions WHERE id = ?').get(id) as WorkflowAction | undefined;
}

export function createWorkflowAction(
  name: string,
  label: string,
  field: string,
  actionType: 'link' | 'search' | 'script',
  actionValue: string,
  enabled: boolean = true
): WorkflowAction {
  const database = getSQLiteDB();
  const id = uuidv4();
  database.prepare(
    'INSERT INTO workflow_actions (id, name, label, field, action_type, action_value, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name, label, field, actionType, actionValue, enabled ? 1 : 0);
  return getWorkflowAction(id)!;
}

export function updateWorkflowAction(
  id: string,
  updates: {
    name?: string;
    label?: string;
    field?: string;
    action_type?: 'link' | 'search' | 'script';
    action_value?: string;
    enabled?: boolean;
  }
): WorkflowAction | undefined {
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
  if (updates.field !== undefined) {
    fields.push('field = ?');
    values.push(updates.field);
  }
  if (updates.action_type !== undefined) {
    fields.push('action_type = ?');
    values.push(updates.action_type);
  }
  if (updates.action_value !== undefined) {
    fields.push('action_value = ?');
    values.push(updates.action_value);
  }
  if (updates.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(updates.enabled ? 1 : 0);
  }

  if (fields.length === 0) {
    return getWorkflowAction(id);
  }

  values.push(id);
  database.prepare(`UPDATE workflow_actions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getWorkflowAction(id);
}

export function deleteWorkflowAction(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM workflow_actions WHERE id = ?').run(id);
  return result.changes > 0;
}

// Alerts
export type AlertTriggerType = 'number_of_results' | 'number_of_hosts' | 'custom_condition';
export type AlertTriggerCondition = 'greater_than' | 'less_than' | 'equal_to' | 'not_equal_to' | 'drops_by' | 'rises_by';
export type AlertSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type AlertScheduleType = 'cron' | 'realtime';

export interface AlertAction {
  type: 'email' | 'webhook' | 'log' | 'script' | 'apprise' | 'show_on_login';
  config: {
    // Email
    to?: string;
    subject?: string;
    body?: string;
    // Webhook
    url?: string;
    method?: 'GET' | 'POST' | 'PUT';
    headers?: Record<string, string>;
    payload?: string;
    // Script
    command?: string;
    // Apprise
    channel?: string;        // Pre-configured channel name (from notification_channels)
    apprise_urls?: string;   // Direct Apprise URLs (fallback if no channel)
    title?: string;          // Notification title template
    message?: string;        // Notification body template
    format?: 'text' | 'markdown' | 'html';
    // Show on login
    user_id?: string;        // Specific user, or null for all users
    expires_in?: string;     // Auto-expire after duration (e.g., "24h", "7d")
  };
}

export interface Alert {
  id: string;
  name: string;
  description?: string;
  search_query: string;
  trigger_type: AlertTriggerType;
  trigger_condition: AlertTriggerCondition;
  trigger_threshold: number;
  schedule_type: AlertScheduleType;
  cron_expression?: string;
  time_range: string;
  actions: string;  // JSON stringified AlertAction[]
  throttle_enabled: number;
  throttle_window_seconds: number;
  severity: AlertSeverity;
  enabled: number;
  last_run?: string;
  last_triggered?: string;
  trigger_count: number;
  app_scope?: string;
  playbook?: string;  // Markdown runbook/instructions for when alert fires
  created_at: string;
  updated_at: string;
}

export interface AlertHistory {
  id: string;
  alert_id: string;
  triggered_at: string;
  result_count: number;
  trigger_value?: string;
  severity: AlertSeverity;
  actions_executed?: string;  // JSON
  sample_results?: string;  // JSON
  acknowledged: number;
  acknowledged_by?: string;
  acknowledged_at?: string;
  notes?: string;
}

export function getAlerts(enabledOnly: boolean = false, appScope?: string): Alert[] {
  const database = getSQLiteDB();
  if (enabledOnly && appScope && appScope !== 'all') {
    return database.prepare('SELECT * FROM alerts WHERE enabled = 1 AND app_scope = ? ORDER BY name').all(appScope) as Alert[];
  }
  if (enabledOnly) {
    return database.prepare('SELECT * FROM alerts WHERE enabled = 1 ORDER BY name').all() as Alert[];
  }
  if (appScope && appScope !== 'all') {
    return database.prepare('SELECT * FROM alerts WHERE app_scope = ? ORDER BY name').all(appScope) as Alert[];
  }
  return database.prepare('SELECT * FROM alerts ORDER BY name').all() as Alert[];
}

export function getAlert(id: string): Alert | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM alerts WHERE id = ?').get(id) as Alert | undefined;
}

export function createAlert(
  name: string,
  searchQuery: string,
  options: {
    description?: string;
    trigger_type?: AlertTriggerType;
    trigger_condition?: AlertTriggerCondition;
    trigger_threshold?: number;
    schedule_type?: AlertScheduleType;
    cron_expression?: string;
    time_range?: string;
    actions?: AlertAction[];
    throttle_enabled?: boolean;
    throttle_window_seconds?: number;
    severity?: AlertSeverity;
    enabled?: boolean;
    app_scope?: string;
    playbook?: string;
  } = {}
): Alert {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO alerts (
      id, name, description, search_query,
      trigger_type, trigger_condition, trigger_threshold,
      schedule_type, cron_expression, time_range,
      actions, throttle_enabled, throttle_window_seconds,
      severity, enabled, app_scope, playbook
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name,
    options.description || null,
    searchQuery,
    options.trigger_type || 'number_of_results',
    options.trigger_condition || 'greater_than',
    options.trigger_threshold ?? 0,
    options.schedule_type || 'cron',
    options.cron_expression || '*/5 * * * *',
    options.time_range || '-5m',
    JSON.stringify(options.actions || []),
    options.throttle_enabled ? 1 : 0,
    options.throttle_window_seconds || 300,
    options.severity || 'medium',
    options.enabled !== false ? 1 : 0,
    options.app_scope || 'default',
    options.playbook || null
  );

  return getAlert(id)!;
}

export function updateAlert(
  id: string,
  updates: {
    name?: string;
    description?: string;
    search_query?: string;
    trigger_type?: AlertTriggerType;
    trigger_condition?: AlertTriggerCondition;
    trigger_threshold?: number;
    schedule_type?: AlertScheduleType;
    cron_expression?: string;
    time_range?: string;
    actions?: AlertAction[];
    throttle_enabled?: boolean;
    throttle_window_seconds?: number;
    severity?: AlertSeverity;
    enabled?: boolean;
    last_run?: string;
    last_triggered?: string;
    trigger_count?: number;
    app_scope?: string;
    playbook?: string;
  }
): Alert | undefined {
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
  if (updates.search_query !== undefined) {
    fields.push('search_query = ?');
    values.push(updates.search_query);
  }
  if (updates.trigger_type !== undefined) {
    fields.push('trigger_type = ?');
    values.push(updates.trigger_type);
  }
  if (updates.trigger_condition !== undefined) {
    fields.push('trigger_condition = ?');
    values.push(updates.trigger_condition);
  }
  if (updates.trigger_threshold !== undefined) {
    fields.push('trigger_threshold = ?');
    values.push(updates.trigger_threshold);
  }
  if (updates.schedule_type !== undefined) {
    fields.push('schedule_type = ?');
    values.push(updates.schedule_type);
  }
  if (updates.cron_expression !== undefined) {
    fields.push('cron_expression = ?');
    values.push(updates.cron_expression);
  }
  if (updates.time_range !== undefined) {
    fields.push('time_range = ?');
    values.push(updates.time_range);
  }
  if (updates.actions !== undefined) {
    fields.push('actions = ?');
    values.push(JSON.stringify(updates.actions));
  }
  if (updates.throttle_enabled !== undefined) {
    fields.push('throttle_enabled = ?');
    values.push(updates.throttle_enabled ? 1 : 0);
  }
  if (updates.throttle_window_seconds !== undefined) {
    fields.push('throttle_window_seconds = ?');
    values.push(updates.throttle_window_seconds);
  }
  if (updates.severity !== undefined) {
    fields.push('severity = ?');
    values.push(updates.severity);
  }
  if (updates.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(updates.enabled ? 1 : 0);
  }
  if (updates.last_run !== undefined) {
    fields.push('last_run = ?');
    values.push(updates.last_run);
  }
  if (updates.last_triggered !== undefined) {
    fields.push('last_triggered = ?');
    values.push(updates.last_triggered);
  }
  if (updates.trigger_count !== undefined) {
    fields.push('trigger_count = ?');
    values.push(updates.trigger_count);
  }
  if (updates.app_scope !== undefined) {
    fields.push('app_scope = ?');
    values.push(updates.app_scope);
  }
  if (updates.playbook !== undefined) {
    fields.push('playbook = ?');
    values.push(updates.playbook);
  }

  if (fields.length === 0) {
    return getAlert(id);
  }

  fields.push("updated_at = datetime('now')");
  values.push(id);
  database.prepare(`UPDATE alerts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getAlert(id);
}

export function deleteAlert(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM alerts WHERE id = ?').run(id);
  return result.changes > 0;
}

// Alert History
export function getAlertHistory(alertId?: string, limit: number = 100): AlertHistory[] {
  const database = getSQLiteDB();
  if (alertId) {
    return database.prepare(
      'SELECT * FROM alert_history WHERE alert_id = ? ORDER BY triggered_at DESC LIMIT ?'
    ).all(alertId, limit) as AlertHistory[];
  }
  return database.prepare(
    'SELECT * FROM alert_history ORDER BY triggered_at DESC LIMIT ?'
  ).all(limit) as AlertHistory[];
}

export function getAlertHistoryEntry(id: string): AlertHistory | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM alert_history WHERE id = ?').get(id) as AlertHistory | undefined;
}

export function createAlertHistoryEntry(
  alertId: string,
  resultCount: number,
  severity: AlertSeverity,
  options: {
    trigger_value?: string;
    actions_executed?: Record<string, unknown>[];
    sample_results?: Record<string, unknown>[];
  } = {}
): AlertHistory {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO alert_history (
      id, alert_id, result_count, trigger_value, severity,
      actions_executed, sample_results
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    alertId,
    resultCount,
    options.trigger_value || null,
    severity,
    options.actions_executed ? JSON.stringify(options.actions_executed) : null,
    options.sample_results ? JSON.stringify(options.sample_results) : null
  );

  return getAlertHistoryEntry(id)!;
}

export function acknowledgeAlertHistory(
  id: string,
  acknowledgedBy: string,
  notes?: string
): AlertHistory | undefined {
  const database = getSQLiteDB();
  database.prepare(`
    UPDATE alert_history
    SET acknowledged = 1, acknowledged_by = ?, acknowledged_at = datetime('now'), notes = ?
    WHERE id = ?
  `).run(acknowledgedBy, notes || null, id);
  return getAlertHistoryEntry(id);
}

export function getRecentAlertTrigger(alertId: string, windowSeconds: number): AlertHistory | undefined {
  const database = getSQLiteDB();
  return database.prepare(`
    SELECT * FROM alert_history
    WHERE alert_id = ?
    AND triggered_at > datetime('now', '-' || ? || ' seconds')
    ORDER BY triggered_at DESC
    LIMIT 1
  `).get(alertId, windowSeconds) as AlertHistory | undefined;
}

// Agent Notifications
export interface AgentNotification {
  id: string;
  hostname?: string;
  alert_id?: string;
  alert_name: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  created_at: string;
  expires_at?: string;
  delivered: number;
  delivered_at?: string;
}

export function createAgentNotification(
  alertName: string,
  title: string,
  message: string,
  options: {
    hostname?: string;
    alert_id?: string;
    severity?: AlertSeverity;
    expires_at?: string;
  } = {}
): AgentNotification {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO agent_notifications (
      id, hostname, alert_id, alert_name, severity, title, message, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    options.hostname || null,
    options.alert_id || null,
    alertName,
    options.severity || 'medium',
    title,
    message,
    options.expires_at || null
  );

  return getAgentNotification(id)!;
}

export function getAgentNotification(id: string): AgentNotification | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM agent_notifications WHERE id = ?').get(id) as AgentNotification | undefined;
}

export function getPendingNotifications(hostname?: string): AgentNotification[] {
  const database = getSQLiteDB();

  // Get undelivered, non-expired notifications
  // Matches specific hostname OR notifications with no hostname (broadcast)
  if (hostname) {
    return database.prepare(`
      SELECT * FROM agent_notifications
      WHERE delivered = 0
      AND (hostname IS NULL OR hostname = ?)
      AND (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY created_at ASC
    `).all(hostname) as AgentNotification[];
  }

  return database.prepare(`
    SELECT * FROM agent_notifications
    WHERE delivered = 0
    AND (expires_at IS NULL OR expires_at > datetime('now'))
    ORDER BY created_at ASC
  `).all() as AgentNotification[];
}

export function markNotificationDelivered(id: string, hostname?: string): boolean {
  const database = getSQLiteDB();

  // For broadcast notifications (hostname IS NULL), we create a delivery record
  // For targeted notifications, just mark as delivered
  const notification = getAgentNotification(id);
  if (!notification) return false;

  if (notification.hostname === null && hostname) {
    // Broadcast notification - we could track per-host delivery
    // For simplicity, mark as delivered for now
  }

  const result = database.prepare(`
    UPDATE agent_notifications
    SET delivered = 1, delivered_at = datetime('now')
    WHERE id = ?
  `).run(id);

  return result.changes > 0;
}

export function deleteExpiredNotifications(): number {
  const database = getSQLiteDB();
  const result = database.prepare(`
    DELETE FROM agent_notifications
    WHERE expires_at IS NOT NULL AND expires_at < datetime('now')
  `).run();
  return result.changes;
}

// Login Notifications (show alerts to users on login)
export interface LoginNotification {
  id: string;
  user_id?: string;
  alert_id?: string;
  alert_name: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  created_at: string;
  expires_at?: string;
  dismissed: number;
  dismissed_at?: string;
}

export function createLoginNotification(
  alertName: string,
  title: string,
  message: string,
  options: {
    user_id?: string | null;
    alert_id?: string;
    severity?: AlertSeverity;
    expires_at?: string | null;
  } = {}
): LoginNotification {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO login_notifications (
      id, user_id, alert_id, alert_name, severity, title, message, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    options.user_id || null,
    options.alert_id || null,
    alertName,
    options.severity || 'medium',
    title,
    message,
    options.expires_at || null
  );

  return getLoginNotification(id)!;
}

export function getLoginNotification(id: string): LoginNotification | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM login_notifications WHERE id = ?').get(id) as LoginNotification | undefined;
}

export function getLoginNotifications(userId: string): LoginNotification[] {
  const database = getSQLiteDB();

  // Get undismissed, non-expired notifications
  // Matches specific user OR notifications with no user_id (all users)
  return database.prepare(`
    SELECT * FROM login_notifications
    WHERE dismissed = 0
    AND (user_id IS NULL OR user_id = ?)
    AND (expires_at IS NULL OR expires_at > datetime('now'))
    ORDER BY created_at DESC
  `).all(userId) as LoginNotification[];
}

export function dismissLoginNotification(id: string, userId: string): boolean {
  const database = getSQLiteDB();

  // Only allow dismissing if the notification is for this user or all users
  const result = database.prepare(`
    UPDATE login_notifications
    SET dismissed = 1, dismissed_at = datetime('now')
    WHERE id = ?
    AND (user_id IS NULL OR user_id = ?)
  `).run(id, userId);

  return result.changes > 0;
}

export function dismissAllLoginNotifications(userId: string): number {
  const database = getSQLiteDB();

  const result = database.prepare(`
    UPDATE login_notifications
    SET dismissed = 1, dismissed_at = datetime('now')
    WHERE dismissed = 0
    AND (user_id IS NULL OR user_id = ?)
    AND (expires_at IS NULL OR expires_at > datetime('now'))
  `).run(userId);

  return result.changes;
}

export function deleteExpiredLoginNotifications(): number {
  const database = getSQLiteDB();
  const result = database.prepare(`
    DELETE FROM login_notifications
    WHERE expires_at IS NOT NULL AND expires_at < datetime('now')
  `).run();
  return result.changes;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// Source Templates
export type SourceCategory = 'database' | 'security' | 'web' | 'system' | 'application';

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
  category: SourceCategory;
  description?: string;
  setup_instructions?: string;
  agent_config_example?: string;
  syslog_config_example?: string;
  field_extractions?: string;  // JSON stringified FieldExtractionPattern[]
  default_index: string;
  default_severity: number;
  sample_log?: string;
  sample_query?: string;
  icon?: string;
  dashboard_widgets?: string;  // JSON
  alert_templates?: string;  // JSON
  enabled: number;
  built_in: number;
  created_at: string;
  updated_at: string;
}

export function getSourceTemplates(category?: SourceCategory): SourceTemplate[] {
  const database = getSQLiteDB();
  if (category) {
    return database.prepare('SELECT * FROM source_templates WHERE category = ? AND enabled = 1 ORDER BY name').all(category) as SourceTemplate[];
  }
  return database.prepare('SELECT * FROM source_templates WHERE enabled = 1 ORDER BY category, name').all() as SourceTemplate[];
}

export function getSourceTemplate(id: string): SourceTemplate | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM source_templates WHERE id = ?').get(id) as SourceTemplate | undefined;
}

export function getSourceTemplateByType(sourceType: string): SourceTemplate | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM source_templates WHERE source_type = ?').get(sourceType) as SourceTemplate | undefined;
}

export function createSourceTemplate(
  name: string,
  sourceType: string,
  category: SourceCategory,
  options: {
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
    enabled?: boolean;
    built_in?: boolean;
  } = {}
): SourceTemplate {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO source_templates (
      id, name, source_type, category, description,
      setup_instructions, agent_config_example, syslog_config_example,
      field_extractions, default_index, default_severity,
      sample_log, sample_query, icon,
      dashboard_widgets, alert_templates, enabled, built_in
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name,
    sourceType,
    category,
    options.description || null,
    options.setup_instructions || null,
    options.agent_config_example || null,
    options.syslog_config_example || null,
    options.field_extractions ? JSON.stringify(options.field_extractions) : null,
    options.default_index || 'main',
    options.default_severity ?? 6,
    options.sample_log || null,
    options.sample_query || null,
    options.icon || null,
    options.dashboard_widgets ? JSON.stringify(options.dashboard_widgets) : null,
    options.alert_templates ? JSON.stringify(options.alert_templates) : null,
    options.enabled !== false ? 1 : 0,
    options.built_in !== false ? 1 : 0
  );

  return getSourceTemplate(id)!;
}

export function updateSourceTemplate(
  id: string,
  updates: {
    name?: string;
    source_type?: string;
    category?: SourceCategory;
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
    enabled?: boolean;
  }
): SourceTemplate | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.source_type !== undefined) {
    fields.push('source_type = ?');
    values.push(updates.source_type);
  }
  if (updates.category !== undefined) {
    fields.push('category = ?');
    values.push(updates.category);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.setup_instructions !== undefined) {
    fields.push('setup_instructions = ?');
    values.push(updates.setup_instructions);
  }
  if (updates.agent_config_example !== undefined) {
    fields.push('agent_config_example = ?');
    values.push(updates.agent_config_example);
  }
  if (updates.syslog_config_example !== undefined) {
    fields.push('syslog_config_example = ?');
    values.push(updates.syslog_config_example);
  }
  if (updates.field_extractions !== undefined) {
    fields.push('field_extractions = ?');
    values.push(JSON.stringify(updates.field_extractions));
  }
  if (updates.default_index !== undefined) {
    fields.push('default_index = ?');
    values.push(updates.default_index);
  }
  if (updates.default_severity !== undefined) {
    fields.push('default_severity = ?');
    values.push(updates.default_severity);
  }
  if (updates.sample_log !== undefined) {
    fields.push('sample_log = ?');
    values.push(updates.sample_log);
  }
  if (updates.sample_query !== undefined) {
    fields.push('sample_query = ?');
    values.push(updates.sample_query);
  }
  if (updates.icon !== undefined) {
    fields.push('icon = ?');
    values.push(updates.icon);
  }
  if (updates.dashboard_widgets !== undefined) {
    fields.push('dashboard_widgets = ?');
    values.push(JSON.stringify(updates.dashboard_widgets));
  }
  if (updates.alert_templates !== undefined) {
    fields.push('alert_templates = ?');
    values.push(JSON.stringify(updates.alert_templates));
  }
  if (updates.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(updates.enabled ? 1 : 0);
  }

  if (fields.length === 0) {
    return getSourceTemplate(id);
  }

  fields.push("updated_at = datetime('now')");
  values.push(id);
  database.prepare(`UPDATE source_templates SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getSourceTemplate(id);
}

export function deleteSourceTemplate(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM source_templates WHERE id = ? AND built_in = 0').run(id);
  return result.changes > 0;
}

// Alert Silences
export type SilenceLevel = 'global' | 'host' | 'alert';

export interface AlertSilence {
  id: string;
  level: SilenceLevel;
  target_id?: string;
  reason?: string;
  created_by?: string;
  starts_at: string;
  ends_at?: string;
  created_at: string;
}

export function getAlertSilences(): AlertSilence[] {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM alert_silences ORDER BY created_at DESC').all() as AlertSilence[];
}

export function getActiveSilences(): AlertSilence[] {
  const database = getSQLiteDB();
  return database.prepare(`
    SELECT * FROM alert_silences
    WHERE (ends_at IS NULL OR ends_at > datetime('now'))
    ORDER BY created_at DESC
  `).all() as AlertSilence[];
}

export function getAlertSilence(id: string): AlertSilence | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM alert_silences WHERE id = ?').get(id) as AlertSilence | undefined;
}

export function createAlertSilence(
  level: SilenceLevel,
  options: {
    target_id?: string;
    reason?: string;
    created_by?: string;
    starts_at?: string;
    ends_at?: string;
  } = {}
): AlertSilence {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO alert_silences (
      id, level, target_id, reason, created_by, starts_at, ends_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    level,
    options.target_id || null,
    options.reason || null,
    options.created_by || null,
    options.starts_at || new Date().toISOString(),
    options.ends_at || null
  );

  return getAlertSilence(id)!;
}

export function deleteAlertSilence(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM alert_silences WHERE id = ?').run(id);
  return result.changes > 0;
}

export function deleteExpiredSilences(): number {
  const database = getSQLiteDB();
  const result = database.prepare(`
    DELETE FROM alert_silences
    WHERE ends_at IS NOT NULL AND ends_at < datetime('now')
  `).run();
  return result.changes;
}

export function isAlertSilenced(alertId: string, hostname?: string): boolean {
  const database = getSQLiteDB();

  // Check for active silences (global, host-specific, or alert-specific)
  const silence = database.prepare(`
    SELECT * FROM alert_silences
    WHERE (ends_at IS NULL OR ends_at > datetime('now'))
    AND (
      level = 'global'
      OR (level = 'host' AND target_id = ?)
      OR (level = 'alert' AND target_id = ?)
    )
    LIMIT 1
  `).get(hostname || null, alertId) as AlertSilence | undefined;

  return !!silence;
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

// Interview Sessions (for Codebase Interview Wizard)
export interface InterviewSession {
  id: string;
  name: string;
  app_name?: string;
  team_name?: string;
  status: 'questionnaire_sent' | 'awaiting_response' | 'processing' | 'follow_up_sent' | 'implementation_ready' | 'completed';
  current_step: number;
  questionnaire?: string;
  responses?: string;
  follow_up_questions?: string;
  implementation_guide?: string;
  recommended_logs?: string;
  created_at: string;
  updated_at: string;
}

export function getInterviewSessions(): InterviewSession[] {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM interview_sessions ORDER BY updated_at DESC').all() as InterviewSession[];
}

export function getInterviewSession(id: string): InterviewSession | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM interview_sessions WHERE id = ?').get(id) as InterviewSession | undefined;
}

export function createInterviewSession(
  name: string,
  options: {
    app_name?: string;
    team_name?: string;
    questionnaire?: string;
  } = {}
): InterviewSession {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO interview_sessions (
      id, name, app_name, team_name, status, current_step, questionnaire
    ) VALUES (?, ?, ?, ?, 'questionnaire_sent', 1, ?)
  `).run(
    id,
    name,
    options.app_name || null,
    options.team_name || null,
    options.questionnaire || null
  );

  return getInterviewSession(id)!;
}

export function updateInterviewSession(
  id: string,
  updates: {
    name?: string;
    app_name?: string;
    team_name?: string;
    status?: InterviewSession['status'];
    current_step?: number;
    questionnaire?: string;
    responses?: string;
    follow_up_questions?: string;
    implementation_guide?: string;
    recommended_logs?: string;
  }
): InterviewSession | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.app_name !== undefined) {
    fields.push('app_name = ?');
    values.push(updates.app_name);
  }
  if (updates.team_name !== undefined) {
    fields.push('team_name = ?');
    values.push(updates.team_name);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.current_step !== undefined) {
    fields.push('current_step = ?');
    values.push(updates.current_step);
  }
  if (updates.questionnaire !== undefined) {
    fields.push('questionnaire = ?');
    values.push(updates.questionnaire);
  }
  if (updates.responses !== undefined) {
    fields.push('responses = ?');
    values.push(updates.responses);
  }
  if (updates.follow_up_questions !== undefined) {
    fields.push('follow_up_questions = ?');
    values.push(updates.follow_up_questions);
  }
  if (updates.implementation_guide !== undefined) {
    fields.push('implementation_guide = ?');
    values.push(updates.implementation_guide);
  }
  if (updates.recommended_logs !== undefined) {
    fields.push('recommended_logs = ?');
    values.push(updates.recommended_logs);
  }

  if (fields.length === 0) {
    return getInterviewSession(id);
  }

  fields.push("updated_at = datetime('now')");
  values.push(id);
  database.prepare(`UPDATE interview_sessions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getInterviewSession(id);
}

export function deleteInterviewSession(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM interview_sessions WHERE id = ?').run(id);
  return result.changes > 0;
}

// RAG Documents
export interface RAGDocument {
  id: string;
  title: string;
  content: string;
  source_type: string;
  source_path?: string;
  chunk_index: number;
  embedding?: string;
  metadata: string;
  created_at: string;
  updated_at: string;
}

export function getRAGDocuments(sourceType?: string): RAGDocument[] {
  const database = getSQLiteDB();
  if (sourceType) {
    return database.prepare('SELECT * FROM rag_documents WHERE source_type = ? ORDER BY title, chunk_index').all(sourceType) as RAGDocument[];
  }
  return database.prepare('SELECT * FROM rag_documents ORDER BY title, chunk_index').all() as RAGDocument[];
}

export function getRAGDocument(id: string): RAGDocument | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM rag_documents WHERE id = ?').get(id) as RAGDocument | undefined;
}

export function searchRAGDocuments(query: string): RAGDocument[] {
  const database = getSQLiteDB();
  const searchTerm = `%${query}%`;
  return database.prepare('SELECT * FROM rag_documents WHERE title LIKE ? OR content LIKE ? ORDER BY title LIMIT 50').all(searchTerm, searchTerm) as RAGDocument[];
}

export function createRAGDocument(doc: {
  title: string;
  content: string;
  source_type?: string;
  source_path?: string;
  chunk_index?: number;
  embedding?: string;
  metadata?: string;
}): RAGDocument {
  const database = getSQLiteDB();
  const id = uuidv4();
  const sourceType = doc.source_type || 'manual';

  database.prepare(`
    INSERT INTO rag_documents (id, title, content, source_type, source_path, chunk_index, embedding, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    doc.title,
    doc.content,
    sourceType,
    doc.source_path || null,
    doc.chunk_index || 0,
    doc.embedding || null,
    doc.metadata || '{}'
  );

  // Also index into FTS5 for full-text search
  try {
    database.prepare(`
      INSERT INTO rag_documents_fts (doc_id, title, content, source_type)
      VALUES (?, ?, ?, ?)
    `).run(id, doc.title, doc.content, sourceType);
  } catch {
    // FTS indexing failure shouldn't fail document creation
  }

  return getRAGDocument(id)!;
}

export function updateRAGDocumentEmbedding(id: string, embedding: string): void {
  const database = getSQLiteDB();
  database.prepare("UPDATE rag_documents SET embedding = ?, updated_at = datetime('now') WHERE id = ?").run(embedding, id);
}

export function deleteRAGDocument(id: string): boolean {
  const database = getSQLiteDB();

  // Also remove from FTS5 index
  try {
    database.prepare('DELETE FROM rag_documents_fts WHERE doc_id = ?').run(id);
  } catch {
    // FTS deletion failure shouldn't fail document deletion
  }

  const result = database.prepare('DELETE FROM rag_documents WHERE id = ?').run(id);
  return result.changes > 0;
}

export function deleteRAGDocumentsBySource(sourceType: string, sourcePath?: string): number {
  const database = getSQLiteDB();

  // Get IDs to delete from FTS5 first
  const docsToDelete = sourcePath
    ? database.prepare('SELECT id FROM rag_documents WHERE source_type = ? AND source_path = ?').all(sourceType, sourcePath) as Array<{ id: string }>
    : database.prepare('SELECT id FROM rag_documents WHERE source_type = ?').all(sourceType) as Array<{ id: string }>;

  // Remove from FTS5
  try {
    const deleteStmt = database.prepare('DELETE FROM rag_documents_fts WHERE doc_id = ?');
    for (const doc of docsToDelete) {
      deleteStmt.run(doc.id);
    }
  } catch {
    // FTS deletion failure shouldn't fail document deletion
  }

  // Delete from main table
  if (sourcePath) {
    const result = database.prepare('DELETE FROM rag_documents WHERE source_type = ? AND source_path = ?').run(sourceType, sourcePath);
    return result.changes;
  }
  const result = database.prepare('DELETE FROM rag_documents WHERE source_type = ?').run(sourceType);
  return result.changes;
}

export function getRAGDocumentsWithEmbeddings(): RAGDocument[] {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM rag_documents WHERE embedding IS NOT NULL').all() as RAGDocument[];
}

// FTS5 Full-Text Search for RAG documents
export interface FTSSearchResult {
  doc_id: string;
  title: string;
  content: string;
  source_type: string;
  rank: number;
  snippet: string;
}

export function searchRAGDocumentsFTS(query: string, limit: number = 20): FTSSearchResult[] {
  const database = getSQLiteDB();
  try {
    // Use FTS5 MATCH query with BM25 ranking
    // Join with rag_documents table to get actual content (FTS table is contentless)
    const results = database.prepare(`
      SELECT
        fts.doc_id,
        docs.title,
        docs.content,
        docs.source_type,
        bm25(rag_documents_fts) as rank,
        snippet(rag_documents_fts, 2, '<mark>', '</mark>', '...', 50) as snippet
      FROM rag_documents_fts fts
      JOIN rag_documents docs ON fts.doc_id = docs.id
      WHERE rag_documents_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit) as FTSSearchResult[];
    return results;
  } catch (error) {
    // Fallback to empty results if FTS fails (e.g., invalid query syntax)
    console.error('FTS search error:', error);
    return [];
  }
}

export function indexRAGDocumentFTS(docId: string, title: string, content: string, sourceType: string): void {
  const database = getSQLiteDB();
  try {
    database.prepare(`
      INSERT INTO rag_documents_fts (doc_id, title, content, source_type)
      VALUES (?, ?, ?, ?)
    `).run(docId, title, content, sourceType);
  } catch (error) {
    console.error('FTS index error:', error);
  }
}

export function removeRAGDocumentFTS(docId: string): void {
  const database = getSQLiteDB();
  try {
    database.prepare(`
      DELETE FROM rag_documents_fts WHERE doc_id = ?
    `).run(docId);
  } catch (error) {
    console.error('FTS remove error:', error);
  }
}

export function rebuildFTSIndex(): number {
  const database = getSQLiteDB();
  // Clear existing FTS index
  database.prepare('DELETE FROM rag_documents_fts').run();

  // Re-index all documents
  const docs = database.prepare('SELECT id, title, content, source_type FROM rag_documents').all() as Array<{
    id: string;
    title: string;
    content: string;
    source_type: string;
  }>;

  const insertStmt = database.prepare(`
    INSERT INTO rag_documents_fts (doc_id, title, content, source_type)
    VALUES (?, ?, ?, ?)
  `);

  for (const doc of docs) {
    insertStmt.run(doc.id, doc.title, doc.content, doc.source_type);
  }

  return docs.length;
}

// User Field Preferences (for sidebar field pinning/ordering)
export interface UserFieldPreference {
  id: string;
  user_id: string;
  field_name: string;
  is_pinned: number;
  display_order: number;
  created_at: string;
}

export function getUserPinnedFields(userId: string): string[] {
  const database = getSQLiteDB();
  const prefs = database.prepare(
    'SELECT field_name FROM user_field_preferences WHERE user_id = ? AND is_pinned = 1 ORDER BY display_order'
  ).all(userId) as Array<{ field_name: string }>;
  return prefs.map(p => p.field_name);
}

export function getUserFieldPreferences(userId: string): UserFieldPreference[] {
  const database = getSQLiteDB();
  return database.prepare(
    'SELECT * FROM user_field_preferences WHERE user_id = ? ORDER BY display_order'
  ).all(userId) as UserFieldPreference[];
}

export function setFieldPinned(userId: string, fieldName: string, pinned: boolean): UserFieldPreference {
  const database = getSQLiteDB();

  // Get current max order if pinning
  let displayOrder = 0;
  if (pinned) {
    const maxOrder = database.prepare(
      'SELECT MAX(display_order) as max_order FROM user_field_preferences WHERE user_id = ? AND is_pinned = 1'
    ).get(userId) as { max_order: number | null };
    displayOrder = (maxOrder?.max_order ?? -1) + 1;
  }

  // Upsert the preference
  const existing = database.prepare(
    'SELECT id FROM user_field_preferences WHERE user_id = ? AND field_name = ?'
  ).get(userId, fieldName) as { id: string } | undefined;

  if (existing) {
    database.prepare(
      'UPDATE user_field_preferences SET is_pinned = ?, display_order = ? WHERE id = ?'
    ).run(pinned ? 1 : 0, displayOrder, existing.id);
    return database.prepare('SELECT * FROM user_field_preferences WHERE id = ?').get(existing.id) as UserFieldPreference;
  } else {
    const id = uuidv4();
    database.prepare(
      'INSERT INTO user_field_preferences (id, user_id, field_name, is_pinned, display_order) VALUES (?, ?, ?, ?, ?)'
    ).run(id, userId, fieldName, pinned ? 1 : 0, displayOrder);
    return database.prepare('SELECT * FROM user_field_preferences WHERE id = ?').get(id) as UserFieldPreference;
  }
}

export function reorderPinnedFields(userId: string, fieldNames: string[]): void {
  const database = getSQLiteDB();

  const updateMany = database.transaction((fields: string[]) => {
    fields.forEach((fieldName, index) => {
      database.prepare(
        'UPDATE user_field_preferences SET display_order = ? WHERE user_id = ? AND field_name = ?'
      ).run(index, userId, fieldName);
    });
  });

  updateMany(fieldNames);
}

export function deleteFieldPreference(userId: string, fieldName: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare(
    'DELETE FROM user_field_preferences WHERE user_id = ? AND field_name = ?'
  ).run(userId, fieldName);
  return result.changes > 0;
}

// Notification Channels (for Apprise integration)
export type NotificationService =
  | 'slack' | 'discord' | 'telegram' | 'msteams' | 'pagerduty' | 'opsgenie'
  | 'pushover' | 'ntfy' | 'email' | 'webhook' | 'gotify' | 'matrix'
  | 'rocket_chat' | 'zulip' | 'twilio' | 'sns' | 'custom';

export interface NotificationChannel {
  id: string;
  name: string;
  service: NotificationService;
  apprise_url: string;
  description?: string;
  enabled: number;
  last_test?: string;
  last_test_success?: number;
  created_at: string;
  updated_at: string;
}

export function getNotificationChannels(enabledOnly: boolean = false): NotificationChannel[] {
  const database = getSQLiteDB();
  if (enabledOnly) {
    return database.prepare('SELECT * FROM notification_channels WHERE enabled = 1 ORDER BY name').all() as NotificationChannel[];
  }
  return database.prepare('SELECT * FROM notification_channels ORDER BY name').all() as NotificationChannel[];
}

export function getNotificationChannel(id: string): NotificationChannel | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM notification_channels WHERE id = ?').get(id) as NotificationChannel | undefined;
}

export function getNotificationChannelByName(name: string): NotificationChannel | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM notification_channels WHERE name = ?').get(name) as NotificationChannel | undefined;
}

export function createNotificationChannel(
  name: string,
  service: NotificationService,
  appriseUrl: string,
  options: {
    description?: string;
    enabled?: boolean;
  } = {}
): NotificationChannel {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO notification_channels (
      id, name, service, apprise_url, description, enabled
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    name,
    service,
    appriseUrl,
    options.description || null,
    options.enabled !== false ? 1 : 0
  );

  return getNotificationChannel(id)!;
}

export function updateNotificationChannel(
  id: string,
  updates: {
    name?: string;
    service?: NotificationService;
    apprise_url?: string;
    description?: string;
    enabled?: boolean;
    last_test?: string;
    last_test_success?: boolean;
  }
): NotificationChannel | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.service !== undefined) {
    fields.push('service = ?');
    values.push(updates.service);
  }
  if (updates.apprise_url !== undefined) {
    fields.push('apprise_url = ?');
    values.push(updates.apprise_url);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.enabled !== undefined) {
    fields.push('enabled = ?');
    values.push(updates.enabled ? 1 : 0);
  }
  if (updates.last_test !== undefined) {
    fields.push('last_test = ?');
    values.push(updates.last_test);
  }
  if (updates.last_test_success !== undefined) {
    fields.push('last_test_success = ?');
    values.push(updates.last_test_success ? 1 : 0);
  }

  if (fields.length === 0) {
    return getNotificationChannel(id);
  }

  fields.push("updated_at = datetime('now')");
  values.push(id);
  database.prepare(`UPDATE notification_channels SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getNotificationChannel(id);
}

export function deleteNotificationChannel(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM notification_channels WHERE id = ?').run(id);
  return result.changes > 0;
}

export function updateChannelTestResult(id: string, success: boolean): void {
  const database = getSQLiteDB();
  database.prepare(`
    UPDATE notification_channels
    SET last_test = datetime('now'), last_test_success = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(success ? 1 : 0, id);
}

// ============ User Preferences ============

export interface UserPreferences {
  user_id: string;
  theme: 'light' | 'dark' | 'system';
  default_time_range: string;
  sidebar_open: number;
  default_view_mode: 'log' | 'table' | 'json';
  query_history_limit: number;
  date_format: '12-hour' | '24-hour' | 'day-of-week' | 'iso' | 'short';
  timezone: string;
  muted_values: string;
  updated_at: string;
}

export interface MutedValues {
  app_name: string[];
  index_name: string[];
  hostname: string[];
}

export function getUserPreferences(userId: string): UserPreferences | null {
  const database = getSQLiteDB();
  const prefs = database.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId) as UserPreferences | undefined;
  return prefs || null;
}

export function upsertUserPreferences(userId: string, prefs: Partial<Omit<UserPreferences, 'user_id' | 'updated_at'>>): UserPreferences {
  const database = getSQLiteDB();
  const existing = getUserPreferences(userId);

  if (existing) {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (prefs.theme !== undefined) { fields.push('theme = ?'); values.push(prefs.theme); }
    if (prefs.default_time_range !== undefined) { fields.push('default_time_range = ?'); values.push(prefs.default_time_range); }
    if (prefs.sidebar_open !== undefined) { fields.push('sidebar_open = ?'); values.push(prefs.sidebar_open); }
    if (prefs.default_view_mode !== undefined) { fields.push('default_view_mode = ?'); values.push(prefs.default_view_mode); }
    if (prefs.query_history_limit !== undefined) { fields.push('query_history_limit = ?'); values.push(prefs.query_history_limit); }
    if (prefs.date_format !== undefined) { fields.push('date_format = ?'); values.push(prefs.date_format); }
    if (prefs.timezone !== undefined) { fields.push('timezone = ?'); values.push(prefs.timezone); }
    if (prefs.muted_values !== undefined) { fields.push('muted_values = ?'); values.push(prefs.muted_values); }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      values.push(userId);
      database.prepare(`UPDATE user_preferences SET ${fields.join(', ')} WHERE user_id = ?`).run(...values);
    }
  } else {
    database.prepare(`
      INSERT INTO user_preferences (user_id, theme, default_time_range, sidebar_open, default_view_mode, query_history_limit, date_format, timezone, muted_values)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      prefs.theme || 'system',
      prefs.default_time_range || '-24h',
      prefs.sidebar_open ?? 1,
      prefs.default_view_mode || 'log',
      prefs.query_history_limit ?? 10,
      prefs.date_format || '12-hour',
      prefs.timezone || 'browser',
      prefs.muted_values || '{}'
    );
  }

  return getUserPreferences(userId)!;
}

const DEFAULT_MUTED_VALUES: MutedValues = { app_name: [], index_name: [], hostname: [] };

export function getMutedValues(userId: string): MutedValues {
  const prefs = getUserPreferences(userId);
  if (!prefs?.muted_values) {
    return { ...DEFAULT_MUTED_VALUES };
  }
  try {
    const parsed = JSON.parse(prefs.muted_values);
    return {
      app_name: Array.isArray(parsed.app_name) ? parsed.app_name : [],
      index_name: Array.isArray(parsed.index_name) ? parsed.index_name : [],
      hostname: Array.isArray(parsed.hostname) ? parsed.hostname : [],
    };
  } catch {
    return { ...DEFAULT_MUTED_VALUES };
  }
}

export function setMutedValues(userId: string, mutedValues: MutedValues): MutedValues {
  const database = getSQLiteDB();
  const json = JSON.stringify(mutedValues);

  // Ensure user preferences exist
  const existing = getUserPreferences(userId);
  if (existing) {
    database.prepare(`
      UPDATE user_preferences
      SET muted_values = ?, updated_at = datetime('now')
      WHERE user_id = ?
    `).run(json, userId);
  } else {
    database.prepare(`
      INSERT INTO user_preferences (user_id, muted_values)
      VALUES (?, ?)
    `).run(userId, json);
  }

  return mutedValues;
}

// ============ System Settings ============

export function getSystemSetting(key: string): string | null {
  const database = getSQLiteDB();
  const row = database.prepare('SELECT value FROM system_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function getAllSystemSettings(): Record<string, string> {
  const database = getSQLiteDB();
  const rows = database.prepare('SELECT key, value FROM system_settings').all() as Array<{ key: string; value: string }>;
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export function setSystemSetting(key: string, value: string): void {
  const database = getSQLiteDB();
  database.prepare(`
    INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(key, value);
}

export function setSystemSettings(settings: Record<string, string>): void {
  const database = getSQLiteDB();
  const stmt = database.prepare(`
    INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `);

  const transaction = database.transaction((items: Array<[string, string]>) => {
    for (const [key, value] of items) {
      stmt.run(key, value);
    }
  });

  transaction(Object.entries(settings));
}

// ============ Onboarding ============

export interface OnboardingStatus {
  completed: boolean;
  completed_at: string | null;
}

export function getOnboardingStatus(userId: string): OnboardingStatus {
  const database = getSQLiteDB();
  const row = database.prepare(
    'SELECT onboarding_completed, onboarding_completed_at FROM users WHERE id = ?'
  ).get(userId) as { onboarding_completed: number | null; onboarding_completed_at: string | null } | undefined;

  return {
    completed: row?.onboarding_completed === 1,
    completed_at: row?.onboarding_completed_at || null,
  };
}

export function completeOnboarding(userId: string): OnboardingStatus {
  const database = getSQLiteDB();
  database.prepare(`
    UPDATE users SET onboarding_completed = 1, onboarding_completed_at = datetime('now') WHERE id = ?
  `).run(userId);

  return getOnboardingStatus(userId);
}

export function resetOnboarding(userId: string): OnboardingStatus {
  const database = getSQLiteDB();
  database.prepare(`
    UPDATE users SET onboarding_completed = 0, onboarding_completed_at = NULL WHERE id = ?
  `).run(userId);

  return getOnboardingStatus(userId);
}

// ============ Assets ============

export type AssetType = 'server' | 'workstation' | 'network_device' | 'container' | 'cloud_instance' | 'other';
export type AssetStatus = 'active' | 'inactive' | 'decommissioned';

export interface Asset {
  id: string;
  asset_type: AssetType;
  identifier: string;
  display_name: string | null;
  description: string | null;
  criticality: number;
  owner: string | null;
  department: string | null;
  location: string | null;
  tags: string[];
  attributes: Record<string, unknown>;
  first_seen: string | null;
  last_seen: string | null;
  status: AssetStatus;
  source: 'auto' | 'manual';
  created_at: string;
  updated_at: string;
}

export interface AssetInput {
  asset_type: AssetType;
  identifier: string;
  display_name?: string;
  description?: string;
  criticality?: number;
  owner?: string;
  department?: string;
  location?: string;
  tags?: string[];
  attributes?: Record<string, unknown>;
  status?: AssetStatus;
}

interface AssetRow {
  id: string;
  asset_type: string;
  identifier: string;
  display_name: string | null;
  description: string | null;
  criticality: number;
  owner: string | null;
  department: string | null;
  location: string | null;
  tags: string;
  attributes: string;
  first_seen: string | null;
  last_seen: string | null;
  status: string;
  source: string;
  created_at: string;
  updated_at: string;
}

function rowToAsset(row: AssetRow): Asset {
  return {
    ...row,
    asset_type: row.asset_type as AssetType,
    status: row.status as AssetStatus,
    source: row.source as 'auto' | 'manual',
    tags: JSON.parse(row.tags || '[]'),
    attributes: JSON.parse(row.attributes || '{}'),
  };
}

export function getAssets(options?: {
  asset_type?: AssetType;
  status?: AssetStatus;
  search?: string;
  limit?: number;
  offset?: number;
}): Asset[] {
  const database = getSQLiteDB();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options?.asset_type) {
    conditions.push('asset_type = ?');
    params.push(options.asset_type);
  }
  if (options?.status) {
    conditions.push('status = ?');
    params.push(options.status);
  }
  if (options?.search) {
    conditions.push('(identifier LIKE ? OR display_name LIKE ? OR description LIKE ?)');
    const searchTerm = `%${options.search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options?.limit || 100;
  const offset = options?.offset || 0;

  const rows = database.prepare(`
    SELECT * FROM assets ${whereClause}
    ORDER BY last_seen DESC NULLS LAST, identifier ASC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as AssetRow[];

  return rows.map(rowToAsset);
}

export function getAssetById(id: string): Asset | null {
  const database = getSQLiteDB();
  const row = database.prepare('SELECT * FROM assets WHERE id = ?').get(id) as AssetRow | undefined;
  return row ? rowToAsset(row) : null;
}

export function getAssetByIdentifier(asset_type: AssetType, identifier: string): Asset | null {
  const database = getSQLiteDB();
  const row = database.prepare(
    'SELECT * FROM assets WHERE asset_type = ? AND identifier = ?'
  ).get(asset_type, identifier) as AssetRow | undefined;
  return row ? rowToAsset(row) : null;
}

export function createAsset(input: AssetInput): Asset {
  const database = getSQLiteDB();
  const id = uuidv4();
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO assets (id, asset_type, identifier, display_name, description, criticality, owner, department, location, tags, attributes, first_seen, last_seen, status, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)
  `).run(
    id,
    input.asset_type,
    input.identifier,
    input.display_name || null,
    input.description || null,
    input.criticality ?? 50,
    input.owner || null,
    input.department || null,
    input.location || null,
    JSON.stringify(input.tags || []),
    JSON.stringify(input.attributes || {}),
    now,
    now,
    input.status || 'active',
    now,
    now
  );

  return getAssetById(id)!;
}

export function updateAsset(id: string, input: Partial<AssetInput>): Asset | null {
  const database = getSQLiteDB();
  const existing = getAssetById(id);
  if (!existing) return null;

  const updates: string[] = [];
  const params: unknown[] = [];

  if (input.asset_type !== undefined) { updates.push('asset_type = ?'); params.push(input.asset_type); }
  if (input.identifier !== undefined) { updates.push('identifier = ?'); params.push(input.identifier); }
  if (input.display_name !== undefined) { updates.push('display_name = ?'); params.push(input.display_name); }
  if (input.description !== undefined) { updates.push('description = ?'); params.push(input.description); }
  if (input.criticality !== undefined) { updates.push('criticality = ?'); params.push(input.criticality); }
  if (input.owner !== undefined) { updates.push('owner = ?'); params.push(input.owner); }
  if (input.department !== undefined) { updates.push('department = ?'); params.push(input.department); }
  if (input.location !== undefined) { updates.push('location = ?'); params.push(input.location); }
  if (input.tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(input.tags)); }
  if (input.attributes !== undefined) { updates.push('attributes = ?'); params.push(JSON.stringify(input.attributes)); }
  if (input.status !== undefined) { updates.push('status = ?'); params.push(input.status); }

  if (updates.length === 0) return existing;

  updates.push("updated_at = datetime('now')");
  params.push(id);

  database.prepare(`UPDATE assets SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return getAssetById(id);
}

export function deleteAsset(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM assets WHERE id = ?').run(id);
  return result.changes > 0;
}

export function upsertAssetFromDiscovery(
  asset_type: AssetType,
  identifier: string,
  timestamp: string
): Asset {
  const database = getSQLiteDB();
  const existing = getAssetByIdentifier(asset_type, identifier);

  if (existing) {
    // Update last_seen
    database.prepare(`
      UPDATE assets SET last_seen = ?, updated_at = datetime('now') WHERE id = ?
    `).run(timestamp, existing.id);
    return getAssetById(existing.id)!;
  }

  // Create new auto-discovered asset
  const id = uuidv4();
  database.prepare(`
    INSERT INTO assets (id, asset_type, identifier, criticality, tags, attributes, first_seen, last_seen, status, source, created_at, updated_at)
    VALUES (?, ?, ?, 50, '[]', '{}', ?, ?, 'active', 'auto', datetime('now'), datetime('now'))
  `).run(id, asset_type, identifier, timestamp, timestamp);

  return getAssetById(id)!;
}

export function getAssetStats(): { total: number; by_type: Record<string, number>; by_status: Record<string, number> } {
  const database = getSQLiteDB();

  const total = (database.prepare('SELECT COUNT(*) as count FROM assets').get() as { count: number }).count;

  const byType = database.prepare('SELECT asset_type, COUNT(*) as count FROM assets GROUP BY asset_type').all() as Array<{ asset_type: string; count: number }>;
  const by_type: Record<string, number> = {};
  for (const row of byType) {
    by_type[row.asset_type] = row.count;
  }

  const byStatus = database.prepare('SELECT status, COUNT(*) as count FROM assets GROUP BY status').all() as Array<{ status: string; count: number }>;
  const by_status: Record<string, number> = {};
  for (const row of byStatus) {
    by_status[row.status] = row.count;
  }

  return { total, by_type, by_status };
}

// ============ Identities ============

export type IdentityType = 'user' | 'service_account' | 'system' | 'external';
export type IdentityStatus = 'active' | 'inactive' | 'disabled';

export interface Identity {
  id: string;
  identity_type: IdentityType;
  identifier: string;
  display_name: string | null;
  email: string | null;
  department: string | null;
  title: string | null;
  manager: string | null;
  is_privileged: boolean;
  risk_score: number;
  tags: string[];
  attributes: Record<string, unknown>;
  first_seen: string | null;
  last_seen: string | null;
  status: IdentityStatus;
  source: 'auto' | 'manual';
  created_at: string;
  updated_at: string;
}

export interface IdentityInput {
  identity_type: IdentityType;
  identifier: string;
  display_name?: string;
  email?: string;
  department?: string;
  title?: string;
  manager?: string;
  is_privileged?: boolean;
  risk_score?: number;
  tags?: string[];
  attributes?: Record<string, unknown>;
  status?: IdentityStatus;
}

interface IdentityRow {
  id: string;
  identity_type: string;
  identifier: string;
  display_name: string | null;
  email: string | null;
  department: string | null;
  title: string | null;
  manager: string | null;
  is_privileged: number;
  risk_score: number;
  tags: string;
  attributes: string;
  first_seen: string | null;
  last_seen: string | null;
  status: string;
  source: string;
  created_at: string;
  updated_at: string;
}

function rowToIdentity(row: IdentityRow): Identity {
  return {
    ...row,
    identity_type: row.identity_type as IdentityType,
    status: row.status as IdentityStatus,
    source: row.source as 'auto' | 'manual',
    is_privileged: row.is_privileged === 1,
    tags: JSON.parse(row.tags || '[]'),
    attributes: JSON.parse(row.attributes || '{}'),
  };
}

export function getIdentities(options?: {
  identity_type?: IdentityType;
  status?: IdentityStatus;
  is_privileged?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}): Identity[] {
  const database = getSQLiteDB();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options?.identity_type) {
    conditions.push('identity_type = ?');
    params.push(options.identity_type);
  }
  if (options?.status) {
    conditions.push('status = ?');
    params.push(options.status);
  }
  if (options?.is_privileged !== undefined) {
    conditions.push('is_privileged = ?');
    params.push(options.is_privileged ? 1 : 0);
  }
  if (options?.search) {
    conditions.push('(identifier LIKE ? OR display_name LIKE ? OR email LIKE ?)');
    const searchTerm = `%${options.search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options?.limit || 100;
  const offset = options?.offset || 0;

  const rows = database.prepare(`
    SELECT * FROM identities ${whereClause}
    ORDER BY last_seen DESC NULLS LAST, identifier ASC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as IdentityRow[];

  return rows.map(rowToIdentity);
}

export function getIdentityById(id: string): Identity | null {
  const database = getSQLiteDB();
  const row = database.prepare('SELECT * FROM identities WHERE id = ?').get(id) as IdentityRow | undefined;
  return row ? rowToIdentity(row) : null;
}

export function getIdentityByIdentifier(identity_type: IdentityType, identifier: string): Identity | null {
  const database = getSQLiteDB();
  const row = database.prepare(
    'SELECT * FROM identities WHERE identity_type = ? AND identifier = ?'
  ).get(identity_type, identifier) as IdentityRow | undefined;
  return row ? rowToIdentity(row) : null;
}

export function createIdentity(input: IdentityInput): Identity {
  const database = getSQLiteDB();
  const id = uuidv4();
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO identities (id, identity_type, identifier, display_name, email, department, title, manager, is_privileged, risk_score, tags, attributes, first_seen, last_seen, status, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)
  `).run(
    id,
    input.identity_type,
    input.identifier,
    input.display_name || null,
    input.email || null,
    input.department || null,
    input.title || null,
    input.manager || null,
    input.is_privileged ? 1 : 0,
    input.risk_score ?? 0,
    JSON.stringify(input.tags || []),
    JSON.stringify(input.attributes || {}),
    now,
    now,
    input.status || 'active',
    now,
    now
  );

  return getIdentityById(id)!;
}

export function updateIdentity(id: string, input: Partial<IdentityInput>): Identity | null {
  const database = getSQLiteDB();
  const existing = getIdentityById(id);
  if (!existing) return null;

  const updates: string[] = [];
  const params: unknown[] = [];

  if (input.identity_type !== undefined) { updates.push('identity_type = ?'); params.push(input.identity_type); }
  if (input.identifier !== undefined) { updates.push('identifier = ?'); params.push(input.identifier); }
  if (input.display_name !== undefined) { updates.push('display_name = ?'); params.push(input.display_name); }
  if (input.email !== undefined) { updates.push('email = ?'); params.push(input.email); }
  if (input.department !== undefined) { updates.push('department = ?'); params.push(input.department); }
  if (input.title !== undefined) { updates.push('title = ?'); params.push(input.title); }
  if (input.manager !== undefined) { updates.push('manager = ?'); params.push(input.manager); }
  if (input.is_privileged !== undefined) { updates.push('is_privileged = ?'); params.push(input.is_privileged ? 1 : 0); }
  if (input.risk_score !== undefined) { updates.push('risk_score = ?'); params.push(input.risk_score); }
  if (input.tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(input.tags)); }
  if (input.attributes !== undefined) { updates.push('attributes = ?'); params.push(JSON.stringify(input.attributes)); }
  if (input.status !== undefined) { updates.push('status = ?'); params.push(input.status); }

  if (updates.length === 0) return existing;

  updates.push("updated_at = datetime('now')");
  params.push(id);

  database.prepare(`UPDATE identities SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return getIdentityById(id);
}

export function deleteIdentity(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM identities WHERE id = ?').run(id);
  return result.changes > 0;
}

export function upsertIdentityFromDiscovery(
  identity_type: IdentityType,
  identifier: string,
  timestamp: string,
  is_privileged?: boolean
): Identity {
  const database = getSQLiteDB();
  const existing = getIdentityByIdentifier(identity_type, identifier);

  if (existing) {
    // Update last_seen and potentially privileged status
    if (is_privileged !== undefined && is_privileged && !existing.is_privileged) {
      database.prepare(`
        UPDATE identities SET last_seen = ?, is_privileged = 1, updated_at = datetime('now') WHERE id = ?
      `).run(timestamp, existing.id);
    } else {
      database.prepare(`
        UPDATE identities SET last_seen = ?, updated_at = datetime('now') WHERE id = ?
      `).run(timestamp, existing.id);
    }
    return getIdentityById(existing.id)!;
  }

  // Create new auto-discovered identity
  const id = uuidv4();
  database.prepare(`
    INSERT INTO identities (id, identity_type, identifier, is_privileged, risk_score, tags, attributes, first_seen, last_seen, status, source, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, '[]', '{}', ?, ?, 'active', 'auto', datetime('now'), datetime('now'))
  `).run(id, identity_type, identifier, is_privileged ? 1 : 0, timestamp, timestamp);

  return getIdentityById(id)!;
}

export function getIdentityStats(): { total: number; by_type: Record<string, number>; privileged_count: number } {
  const database = getSQLiteDB();

  const total = (database.prepare('SELECT COUNT(*) as count FROM identities').get() as { count: number }).count;
  const privileged_count = (database.prepare('SELECT COUNT(*) as count FROM identities WHERE is_privileged = 1').get() as { count: number }).count;

  const byType = database.prepare('SELECT identity_type, COUNT(*) as count FROM identities GROUP BY identity_type').all() as Array<{ identity_type: string; count: number }>;
  const by_type: Record<string, number> = {};
  for (const row of byType) {
    by_type[row.identity_type] = row.count;
  }

  return { total, by_type, privileged_count };
}

// ============ Asset-Identity Links ============

export interface AssetIdentityLink {
  id: string;
  asset_id: string;
  identity_id: string;
  relationship_type: string;
  first_seen: string | null;
  last_seen: string | null;
  event_count: number;
  created_at: string;
}

export function linkAssetIdentity(
  asset_id: string,
  identity_id: string,
  relationship_type: string = 'user',
  timestamp?: string
): AssetIdentityLink | null {
  const database = getSQLiteDB();
  const now = timestamp || new Date().toISOString();

  // Try to update existing link
  const existing = database.prepare(`
    SELECT * FROM asset_identity_links
    WHERE asset_id = ? AND identity_id = ? AND relationship_type = ?
  `).get(asset_id, identity_id, relationship_type) as AssetIdentityLink | undefined;

  if (existing) {
    database.prepare(`
      UPDATE asset_identity_links
      SET last_seen = ?, event_count = event_count + 1
      WHERE id = ?
    `).run(now, existing.id);
    return database.prepare('SELECT * FROM asset_identity_links WHERE id = ?').get(existing.id) as AssetIdentityLink;
  }

  // Create new link
  const id = uuidv4();
  database.prepare(`
    INSERT INTO asset_identity_links (id, asset_id, identity_id, relationship_type, first_seen, last_seen, event_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
  `).run(id, asset_id, identity_id, relationship_type, now, now);

  return database.prepare('SELECT * FROM asset_identity_links WHERE id = ?').get(id) as AssetIdentityLink;
}

export function getAssetIdentities(asset_id: string): Array<Identity & { relationship_type: string; event_count: number }> {
  const database = getSQLiteDB();
  const rows = database.prepare(`
    SELECT i.*, ail.relationship_type, ail.event_count
    FROM identities i
    JOIN asset_identity_links ail ON i.id = ail.identity_id
    WHERE ail.asset_id = ?
    ORDER BY ail.event_count DESC
  `).all(asset_id) as Array<IdentityRow & { relationship_type: string; event_count: number }>;

  return rows.map(row => ({
    ...rowToIdentity(row),
    relationship_type: row.relationship_type,
    event_count: row.event_count,
  }));
}

export function getIdentityAssets(identity_id: string): Array<Asset & { relationship_type: string; event_count: number }> {
  const database = getSQLiteDB();
  const rows = database.prepare(`
    SELECT a.*, ail.relationship_type, ail.event_count
    FROM assets a
    JOIN asset_identity_links ail ON a.id = ail.asset_id
    WHERE ail.identity_id = ?
    ORDER BY ail.event_count DESC
  `).all(identity_id) as Array<AssetRow & { relationship_type: string; event_count: number }>;

  return rows.map(row => ({
    ...rowToAsset(row),
    relationship_type: row.relationship_type,
    event_count: row.event_count,
  }));
}

// ============================================================================
// CIM Data Models
// ============================================================================

export interface CIMField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'timestamp' | 'ip' | 'array';
  description?: string;
  required?: boolean;
  aliases?: string[];  // Alternative field names that map to this
}

export interface DataModel {
  id: string;
  name: string;
  description: string | null;
  category: 'authentication' | 'network' | 'endpoint' | 'web' | 'custom';
  fields: CIMField[];
  constraints: string[];
  is_builtin: boolean;
  enabled: boolean;
  created_at: string | null;
  updated_at: string | null;
}

interface DataModelRow {
  id: string;
  name: string;
  description: string | null;
  category: string;
  fields: string;
  constraints: string;
  is_builtin: number;
  enabled: number;
  created_at: string | null;
  updated_at: string | null;
}

function rowToDataModel(row: DataModelRow): DataModel {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category as DataModel['category'],
    fields: JSON.parse(row.fields || '[]'),
    constraints: JSON.parse(row.constraints || '[]'),
    is_builtin: row.is_builtin === 1,
    enabled: row.enabled === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function getDataModels(options?: {
  category?: string;
  enabled?: boolean;
}): DataModel[] {
  const database = getSQLiteDB();
  let query = 'SELECT * FROM data_models WHERE 1=1';
  const params: unknown[] = [];

  if (options?.category) {
    query += ' AND category = ?';
    params.push(options.category);
  }
  if (options?.enabled !== undefined) {
    query += ' AND enabled = ?';
    params.push(options.enabled ? 1 : 0);
  }

  query += ' ORDER BY is_builtin DESC, name ASC';

  const rows = database.prepare(query).all(...params) as DataModelRow[];
  return rows.map(rowToDataModel);
}

export function getDataModel(name: string): DataModel | null {
  const database = getSQLiteDB();
  const row = database.prepare('SELECT * FROM data_models WHERE name = ?').get(name) as DataModelRow | undefined;
  return row ? rowToDataModel(row) : null;
}

export function getDataModelById(id: string): DataModel | null {
  const database = getSQLiteDB();
  const row = database.prepare('SELECT * FROM data_models WHERE id = ?').get(id) as DataModelRow | undefined;
  return row ? rowToDataModel(row) : null;
}

export function createDataModel(model: Partial<DataModel>): DataModel {
  const database = getSQLiteDB();
  const id = uuidv4();
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO data_models (id, name, description, category, fields, constraints, is_builtin, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    model.name,
    model.description || null,
    model.category || 'custom',
    JSON.stringify(model.fields || []),
    JSON.stringify(model.constraints || []),
    model.is_builtin ? 1 : 0,
    model.enabled !== false ? 1 : 0,
    now,
    now
  );

  return getDataModelById(id)!;
}

export function updateDataModel(name: string, updates: Partial<DataModel>): DataModel | null {
  const database = getSQLiteDB();
  const existing = getDataModel(name);
  if (!existing) return null;

  // Prevent modifying built-in models (only allow enabling/disabling)
  if (existing.is_builtin && Object.keys(updates).some(k => k !== 'enabled')) {
    throw new Error('Cannot modify built-in data models');
  }

  const now = new Date().toISOString();
  const setClauses: string[] = ['updated_at = ?'];
  const params: unknown[] = [now];

  if (updates.description !== undefined) {
    setClauses.push('description = ?');
    params.push(updates.description);
  }
  if (updates.category !== undefined) {
    setClauses.push('category = ?');
    params.push(updates.category);
  }
  if (updates.fields !== undefined) {
    setClauses.push('fields = ?');
    params.push(JSON.stringify(updates.fields));
  }
  if (updates.constraints !== undefined) {
    setClauses.push('constraints = ?');
    params.push(JSON.stringify(updates.constraints));
  }
  if (updates.enabled !== undefined) {
    setClauses.push('enabled = ?');
    params.push(updates.enabled ? 1 : 0);
  }

  params.push(name);
  database.prepare(`UPDATE data_models SET ${setClauses.join(', ')} WHERE name = ?`).run(...params);

  return getDataModel(name);
}

export function deleteDataModel(name: string): boolean {
  const database = getSQLiteDB();
  const existing = getDataModel(name);
  if (!existing) return false;

  if (existing.is_builtin) {
    throw new Error('Cannot delete built-in data models');
  }

  const result = database.prepare('DELETE FROM data_models WHERE name = ?').run(name);
  return result.changes > 0;
}

// ============================================================================
// CIM Field Mappings
// ============================================================================

export interface FieldMapping {
  id: string;
  source_type: string;
  source_field: string;
  data_model: string;
  cim_field: string;
  transform: string | null;
  priority: number;
  enabled: boolean;
  created_at: string | null;
}

interface FieldMappingRow {
  id: string;
  source_type: string;
  source_field: string;
  data_model: string;
  cim_field: string;
  transform: string | null;
  priority: number;
  enabled: number;
  created_at: string | null;
}

function rowToFieldMapping(row: FieldMappingRow): FieldMapping {
  return {
    id: row.id,
    source_type: row.source_type,
    source_field: row.source_field,
    data_model: row.data_model,
    cim_field: row.cim_field,
    transform: row.transform,
    priority: row.priority,
    enabled: row.enabled === 1,
    created_at: row.created_at,
  };
}

export function getFieldMappings(options?: {
  source_type?: string;
  data_model?: string;
  enabled?: boolean;
}): FieldMapping[] {
  const database = getSQLiteDB();
  let query = 'SELECT * FROM field_mappings WHERE 1=1';
  const params: unknown[] = [];

  if (options?.source_type) {
    query += ' AND source_type = ?';
    params.push(options.source_type);
  }
  if (options?.data_model) {
    query += ' AND data_model = ?';
    params.push(options.data_model);
  }
  if (options?.enabled !== undefined) {
    query += ' AND enabled = ?';
    params.push(options.enabled ? 1 : 0);
  }

  query += ' ORDER BY priority ASC, source_type ASC';

  const rows = database.prepare(query).all(...params) as FieldMappingRow[];
  return rows.map(rowToFieldMapping);
}

export function getFieldMapping(id: string): FieldMapping | null {
  const database = getSQLiteDB();
  const row = database.prepare('SELECT * FROM field_mappings WHERE id = ?').get(id) as FieldMappingRow | undefined;
  return row ? rowToFieldMapping(row) : null;
}

export function createFieldMapping(mapping: Partial<FieldMapping>): FieldMapping {
  const database = getSQLiteDB();
  const id = uuidv4();
  const now = new Date().toISOString();

  database.prepare(`
    INSERT INTO field_mappings (id, source_type, source_field, data_model, cim_field, transform, priority, enabled, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    mapping.source_type,
    mapping.source_field,
    mapping.data_model,
    mapping.cim_field,
    mapping.transform || null,
    mapping.priority ?? 100,
    mapping.enabled !== false ? 1 : 0,
    now
  );

  return getFieldMapping(id)!;
}

export function updateFieldMapping(id: string, updates: Partial<FieldMapping>): FieldMapping | null {
  const database = getSQLiteDB();
  const existing = getFieldMapping(id);
  if (!existing) return null;

  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (updates.source_type !== undefined) {
    setClauses.push('source_type = ?');
    params.push(updates.source_type);
  }
  if (updates.source_field !== undefined) {
    setClauses.push('source_field = ?');
    params.push(updates.source_field);
  }
  if (updates.data_model !== undefined) {
    setClauses.push('data_model = ?');
    params.push(updates.data_model);
  }
  if (updates.cim_field !== undefined) {
    setClauses.push('cim_field = ?');
    params.push(updates.cim_field);
  }
  if (updates.transform !== undefined) {
    setClauses.push('transform = ?');
    params.push(updates.transform);
  }
  if (updates.priority !== undefined) {
    setClauses.push('priority = ?');
    params.push(updates.priority);
  }
  if (updates.enabled !== undefined) {
    setClauses.push('enabled = ?');
    params.push(updates.enabled ? 1 : 0);
  }

  if (setClauses.length === 0) return existing;

  params.push(id);
  database.prepare(`UPDATE field_mappings SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);

  return getFieldMapping(id);
}

export function deleteFieldMapping(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM field_mappings WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getMappingsForSource(source_type: string): Map<string, { cim_field: string; transform: string | null }> {
  const mappings = getFieldMappings({ source_type, enabled: true });
  const result = new Map<string, { cim_field: string; transform: string | null }>();

  for (const mapping of mappings) {
    result.set(mapping.source_field, {
      cim_field: mapping.cim_field,
      transform: mapping.transform,
    });
  }

  return result;
}

export function getDataModelStats(): {
  total_models: number;
  by_category: Record<string, number>;
  total_mappings: number;
  mappings_by_source: Record<string, number>;
} {
  const database = getSQLiteDB();

  const totalModels = (database.prepare('SELECT COUNT(*) as count FROM data_models WHERE enabled = 1').get() as { count: number }).count;

  const categoryRows = database.prepare(`
    SELECT category, COUNT(*) as count FROM data_models WHERE enabled = 1 GROUP BY category
  `).all() as Array<{ category: string; count: number }>;

  const by_category: Record<string, number> = {};
  for (const row of categoryRows) {
    by_category[row.category] = row.count;
  }

  const totalMappings = (database.prepare('SELECT COUNT(*) as count FROM field_mappings WHERE enabled = 1').get() as { count: number }).count;

  const sourceRows = database.prepare(`
    SELECT source_type, COUNT(*) as count FROM field_mappings WHERE enabled = 1 GROUP BY source_type
  `).all() as Array<{ source_type: string; count: number }>;

  const mappings_by_source: Record<string, number> = {};
  for (const row of sourceRows) {
    mappings_by_source[row.source_type] = row.count;
  }

  return {
    total_models: totalModels,
    by_category,
    total_mappings: totalMappings,
    mappings_by_source,
  };
}

// ============================================================================
// AI Agent Conversations
// ============================================================================

export interface AgentConversation {
  id: string;
  persona_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages?: AgentMessage[];
}

export interface AgentMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tool_calls?: string;
  thinking?: string;
  created_at: string;
}

export function getAgentConversations(filters?: {
  persona_id?: string;
  limit?: number;
}): AgentConversation[] {
  const database = getSQLiteDB();

  let sql = 'SELECT * FROM agent_conversations WHERE 1=1';
  const params: unknown[] = [];

  if (filters?.persona_id) {
    sql += ' AND persona_id = ?';
    params.push(filters.persona_id);
  }

  sql += ' ORDER BY updated_at DESC';

  if (filters?.limit) {
    sql += ' LIMIT ?';
    params.push(filters.limit);
  }

  return database.prepare(sql).all(...params) as AgentConversation[];
}

export function getAgentConversation(id: string): AgentConversation | null {
  const database = getSQLiteDB();

  const conversation = database.prepare(
    'SELECT * FROM agent_conversations WHERE id = ?'
  ).get(id) as AgentConversation | undefined;

  if (!conversation) {
    return null;
  }

  // Load messages
  const messages = database.prepare(
    'SELECT * FROM agent_messages WHERE conversation_id = ? ORDER BY created_at ASC'
  ).all(id) as AgentMessage[];

  return {
    ...conversation,
    messages,
  };
}

export function createAgentConversation(data: {
  persona_id: string;
  title: string;
}): AgentConversation {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO agent_conversations (id, persona_id, title)
    VALUES (?, ?, ?)
  `).run(id, data.persona_id, data.title);

  return getAgentConversation(id)!;
}

export function updateConversationTitle(id: string, title: string): AgentConversation | null {
  const database = getSQLiteDB();

  database.prepare(`
    UPDATE agent_conversations
    SET title = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(title, id);

  return getAgentConversation(id);
}

export function deleteAgentConversation(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM agent_conversations WHERE id = ?').run(id);
  return result.changes > 0;
}

export function addAgentMessage(data: {
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tool_calls?: string;
  thinking?: string;
}): AgentMessage {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO agent_messages (id, conversation_id, role, content, tool_calls, thinking)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, data.conversation_id, data.role, data.content, data.tool_calls || null, data.thinking || null);

  // Update conversation's updated_at
  database.prepare(`
    UPDATE agent_conversations SET updated_at = datetime('now') WHERE id = ?
  `).run(data.conversation_id);

  return database.prepare('SELECT * FROM agent_messages WHERE id = ?').get(id) as AgentMessage;
}

export function getConversationMessages(conversationId: string): AgentMessage[] {
  const database = getSQLiteDB();
  return database.prepare(
    'SELECT * FROM agent_messages WHERE conversation_id = ? ORDER BY created_at ASC'
  ).all(conversationId) as AgentMessage[];
}

// ============================================================================
// Synthetic Monitoring
// ============================================================================

export type SyntheticTestType = 'http' | 'tcp' | 'browser' | 'api';
export type SyntheticStatus = 'success' | 'failure' | 'timeout' | 'error';

export interface SyntheticTestConfig {
  // HTTP/API config
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'PATCH';
  headers?: Record<string, string>;
  body?: string;
  followRedirects?: boolean;
  // TCP config
  host?: string;
  port?: number;
  // Browser config
  script?: string;  // Playwright script
  // Assertions
  assertions?: Array<{
    type: 'status' | 'responseTime' | 'bodyContains' | 'headerContains' | 'jsonPath';
    operator: 'equals' | 'notEquals' | 'contains' | 'lessThan' | 'greaterThan';
    target: string;
    value: string | number;
  }>;
}

export interface SyntheticTest {
  id: string;
  name: string;
  description?: string;
  test_type: SyntheticTestType;
  config: string;  // JSON string of SyntheticTestConfig
  schedule: string;
  timeout_ms: number;
  enabled: number;
  tags: string;  // JSON array
  last_run?: string;
  last_status?: SyntheticStatus;
  last_response_time_ms?: number;
  consecutive_failures: number;
  alert_after_failures: number;
  created_at: string;
  updated_at: string;
}

export interface SyntheticResult {
  id: string;
  test_id: string;
  timestamp: string;
  status: SyntheticStatus;
  response_time_ms?: number;
  status_code?: number;
  error_message?: string;
  response_body?: string;
  assertions_passed: number;
  assertions_failed: number;
  metadata: string;  // JSON
}

// Get all synthetic tests
export function getSyntheticTests(filters?: {
  test_type?: SyntheticTestType;
  enabled?: boolean;
  tags?: string[];
}): SyntheticTest[] {
  const database = getSQLiteDB();

  let sql = 'SELECT * FROM synthetic_tests WHERE 1=1';
  const params: unknown[] = [];

  if (filters?.test_type) {
    sql += ' AND test_type = ?';
    params.push(filters.test_type);
  }

  if (filters?.enabled !== undefined) {
    sql += ' AND enabled = ?';
    params.push(filters.enabled ? 1 : 0);
  }

  sql += ' ORDER BY name ASC';

  const tests = database.prepare(sql).all(...params) as SyntheticTest[];

  // Filter by tags if specified
  if (filters?.tags && filters.tags.length > 0) {
    return tests.filter(test => {
      const testTags = JSON.parse(test.tags || '[]') as string[];
      return filters.tags!.some(tag => testTags.includes(tag));
    });
  }

  return tests;
}

// Get single synthetic test
export function getSyntheticTestById(id: string): SyntheticTest | null {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM synthetic_tests WHERE id = ?').get(id) as SyntheticTest | null;
}

// Create synthetic test
export function createSyntheticTest(data: {
  name: string;
  description?: string;
  test_type: SyntheticTestType;
  config: SyntheticTestConfig;
  schedule?: string;
  timeout_ms?: number;
  enabled?: boolean;
  tags?: string[];
  alert_after_failures?: number;
}): SyntheticTest {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO synthetic_tests (
      id, name, description, test_type, config, schedule, timeout_ms, enabled, tags, alert_after_failures
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.name,
    data.description || null,
    data.test_type,
    JSON.stringify(data.config),
    data.schedule || '*/5 * * * *',
    data.timeout_ms || 30000,
    data.enabled !== false ? 1 : 0,
    JSON.stringify(data.tags || []),
    data.alert_after_failures || 3
  );

  return getSyntheticTestById(id)!;
}

// Update synthetic test
export function updateSyntheticTest(id: string, data: Partial<{
  name: string;
  description: string;
  test_type: SyntheticTestType;
  config: SyntheticTestConfig;
  schedule: string;
  timeout_ms: number;
  enabled: boolean;
  tags: string[];
  alert_after_failures: number;
}>): SyntheticTest | null {
  const database = getSQLiteDB();
  const existing = getSyntheticTestById(id);
  if (!existing) return null;

  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.name !== undefined) {
    updates.push('name = ?');
    params.push(data.name);
  }
  if (data.description !== undefined) {
    updates.push('description = ?');
    params.push(data.description);
  }
  if (data.test_type !== undefined) {
    updates.push('test_type = ?');
    params.push(data.test_type);
  }
  if (data.config !== undefined) {
    updates.push('config = ?');
    params.push(JSON.stringify(data.config));
  }
  if (data.schedule !== undefined) {
    updates.push('schedule = ?');
    params.push(data.schedule);
  }
  if (data.timeout_ms !== undefined) {
    updates.push('timeout_ms = ?');
    params.push(data.timeout_ms);
  }
  if (data.enabled !== undefined) {
    updates.push('enabled = ?');
    params.push(data.enabled ? 1 : 0);
  }
  if (data.tags !== undefined) {
    updates.push('tags = ?');
    params.push(JSON.stringify(data.tags));
  }
  if (data.alert_after_failures !== undefined) {
    updates.push('alert_after_failures = ?');
    params.push(data.alert_after_failures);
  }

  if (updates.length === 0) return existing;

  updates.push("updated_at = datetime('now')");
  params.push(id);

  database.prepare(`
    UPDATE synthetic_tests SET ${updates.join(', ')} WHERE id = ?
  `).run(...params);

  return getSyntheticTestById(id);
}

// Update test run status
export function updateSyntheticTestStatus(id: string, status: SyntheticStatus, responseTimeMs?: number): void {
  const database = getSQLiteDB();
  const test = getSyntheticTestById(id);
  if (!test) return;

  const consecutiveFailures = status === 'success' ? 0 : test.consecutive_failures + 1;

  database.prepare(`
    UPDATE synthetic_tests
    SET last_run = datetime('now'),
        last_status = ?,
        last_response_time_ms = ?,
        consecutive_failures = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(status, responseTimeMs || null, consecutiveFailures, id);
}

// Delete synthetic test
export function deleteSyntheticTest(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM synthetic_tests WHERE id = ?').run(id);
  return result.changes > 0;
}

// Add synthetic result
export function addSyntheticResult(data: {
  test_id: string;
  status: SyntheticStatus;
  response_time_ms?: number;
  status_code?: number;
  error_message?: string;
  response_body?: string;
  assertions_passed?: number;
  assertions_failed?: number;
  metadata?: Record<string, unknown>;
}): SyntheticResult {
  const database = getSQLiteDB();
  const id = uuidv4();

  // Truncate response body to 10KB for storage
  const truncatedBody = data.response_body?.slice(0, 10240);

  database.prepare(`
    INSERT INTO synthetic_results (
      id, test_id, status, response_time_ms, status_code, error_message,
      response_body, assertions_passed, assertions_failed, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.test_id,
    data.status,
    data.response_time_ms || null,
    data.status_code || null,
    data.error_message || null,
    truncatedBody || null,
    data.assertions_passed || 0,
    data.assertions_failed || 0,
    JSON.stringify(data.metadata || {})
  );

  // Update test status
  updateSyntheticTestStatus(data.test_id, data.status, data.response_time_ms);

  // Cleanup old results (keep last 1000 per test)
  database.prepare(`
    DELETE FROM synthetic_results
    WHERE test_id = ? AND id NOT IN (
      SELECT id FROM synthetic_results WHERE test_id = ?
      ORDER BY timestamp DESC LIMIT 1000
    )
  `).run(data.test_id, data.test_id);

  return database.prepare('SELECT * FROM synthetic_results WHERE id = ?').get(id) as SyntheticResult;
}

// Get synthetic results
export function getSyntheticResults(filters: {
  test_id?: string;
  status?: SyntheticStatus;
  since?: string;  // ISO timestamp
  limit?: number;
}): SyntheticResult[] {
  const database = getSQLiteDB();

  let sql = 'SELECT * FROM synthetic_results WHERE 1=1';
  const params: unknown[] = [];

  if (filters.test_id) {
    sql += ' AND test_id = ?';
    params.push(filters.test_id);
  }
  if (filters.status) {
    sql += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters.since) {
    sql += ' AND timestamp >= ?';
    params.push(filters.since);
  }

  sql += ' ORDER BY timestamp DESC';

  if (filters.limit) {
    sql += ' LIMIT ?';
    params.push(filters.limit);
  }

  return database.prepare(sql).all(...params) as SyntheticResult[];
}

// Get uptime percentage for a test
export function getSyntheticUptime(testId: string, hoursBack: number = 24): {
  uptime_percent: number;
  total_checks: number;
  successful_checks: number;
  failed_checks: number;
  avg_response_time_ms: number;
} {
  const database = getSQLiteDB();
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  const stats = database.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
      SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) as failed,
      AVG(response_time_ms) as avg_response_time
    FROM synthetic_results
    WHERE test_id = ? AND timestamp >= ?
  `).get(testId, since) as {
    total: number;
    successful: number;
    failed: number;
    avg_response_time: number;
  };

  return {
    uptime_percent: stats.total > 0 ? (stats.successful / stats.total) * 100 : 100,
    total_checks: stats.total,
    successful_checks: stats.successful,
    failed_checks: stats.failed,
    avg_response_time_ms: Math.round(stats.avg_response_time || 0),
  };
}

// Get synthetic dashboard stats
export function getSyntheticDashboard(): {
  total_tests: number;
  enabled_tests: number;
  tests_by_type: Record<string, number>;
  tests_by_status: Record<string, number>;
  overall_uptime_24h: number;
  failing_tests: SyntheticTest[];
} {
  const database = getSQLiteDB();

  const totalTests = (database.prepare('SELECT COUNT(*) as count FROM synthetic_tests').get() as { count: number }).count;
  const enabledTests = (database.prepare('SELECT COUNT(*) as count FROM synthetic_tests WHERE enabled = 1').get() as { count: number }).count;

  const byType = database.prepare(`
    SELECT test_type, COUNT(*) as count FROM synthetic_tests GROUP BY test_type
  `).all() as Array<{ test_type: string; count: number }>;

  const tests_by_type: Record<string, number> = {};
  for (const row of byType) {
    tests_by_type[row.test_type] = row.count;
  }

  const byStatus = database.prepare(`
    SELECT last_status, COUNT(*) as count FROM synthetic_tests
    WHERE last_status IS NOT NULL GROUP BY last_status
  `).all() as Array<{ last_status: string; count: number }>;

  const tests_by_status: Record<string, number> = {};
  for (const row of byStatus) {
    tests_by_status[row.last_status] = row.count;
  }

  // Calculate overall uptime from last 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const overallStats = database.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful
    FROM synthetic_results
    WHERE timestamp >= ?
  `).get(since) as { total: number; successful: number };

  const overall_uptime_24h = overallStats.total > 0
    ? (overallStats.successful / overallStats.total) * 100
    : 100;

  // Get currently failing tests
  const failing_tests = database.prepare(`
    SELECT * FROM synthetic_tests
    WHERE enabled = 1 AND last_status != 'success' AND last_status IS NOT NULL
    ORDER BY consecutive_failures DESC
  `).all() as SyntheticTest[];

  return {
    total_tests: totalTests,
    enabled_tests: enabledTests,
    tests_by_type,
    tests_by_status,
    overall_uptime_24h: Math.round(overall_uptime_24h * 100) / 100,
    failing_tests,
  };
}

// Source Annotations
export interface SourceAnnotation {
  id: string;
  field_name: string;
  field_value: string;
  title?: string;
  description?: string;
  details?: string;
  icon?: string;
  color?: string;
  lookup_id?: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export function getSourceAnnotations(fieldName?: string): SourceAnnotation[] {
  const database = getSQLiteDB();
  let query = 'SELECT * FROM source_annotations';
  const params: string[] = [];

  if (fieldName) {
    query += ' WHERE field_name = ?';
    params.push(fieldName);
  }

  query += ' ORDER BY field_name, field_value';

  const rows = database.prepare(query).all(...params) as Array<SourceAnnotation & { tags: string }>;
  return rows.map(row => ({
    ...row,
    tags: JSON.parse(row.tags || '[]'),
  }));
}

export function getSourceAnnotation(fieldName: string, fieldValue: string): SourceAnnotation | undefined {
  const database = getSQLiteDB();
  const row = database.prepare(
    'SELECT * FROM source_annotations WHERE field_name = ? AND field_value = ?'
  ).get(fieldName, fieldValue) as (SourceAnnotation & { tags: string }) | undefined;

  if (!row) return undefined;

  return {
    ...row,
    tags: JSON.parse(row.tags || '[]'),
  };
}

export function getSourceAnnotationById(id: string): SourceAnnotation | undefined {
  const database = getSQLiteDB();
  const row = database.prepare(
    'SELECT * FROM source_annotations WHERE id = ?'
  ).get(id) as (SourceAnnotation & { tags: string }) | undefined;

  if (!row) return undefined;

  return {
    ...row,
    tags: JSON.parse(row.tags || '[]'),
  };
}

export function getSourceAnnotationsBatch(
  items: Array<{ field: string; value: string }>
): Map<string, SourceAnnotation> {
  const database = getSQLiteDB();
  const result = new Map<string, SourceAnnotation>();

  if (items.length === 0) return result;

  // Build a query with multiple OR conditions
  const conditions = items.map(() => '(field_name = ? AND field_value = ?)').join(' OR ');
  const params = items.flatMap(item => [item.field, item.value]);

  const rows = database.prepare(
    `SELECT * FROM source_annotations WHERE ${conditions}`
  ).all(...params) as Array<SourceAnnotation & { tags: string }>;

  for (const row of rows) {
    const key = `${row.field_name}:${row.field_value}`;
    result.set(key, {
      ...row,
      tags: JSON.parse(row.tags || '[]'),
    });
  }

  return result;
}

export function createSourceAnnotation(data: {
  field_name: string;
  field_value: string;
  title?: string;
  description?: string;
  details?: string;
  icon?: string;
  color?: string;
  lookup_id?: string;
  tags?: string[];
}): SourceAnnotation {
  const database = getSQLiteDB();
  const id = uuidv4();

  database.prepare(`
    INSERT INTO source_annotations
    (id, field_name, field_value, title, description, details, icon, color, lookup_id, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.field_name,
    data.field_value,
    data.title || null,
    data.description || null,
    data.details || null,
    data.icon || null,
    data.color || null,
    data.lookup_id || null,
    JSON.stringify(data.tags || [])
  );

  return getSourceAnnotationById(id)!;
}

export function updateSourceAnnotation(
  id: string,
  updates: {
    title?: string;
    description?: string;
    details?: string;
    icon?: string;
    color?: string;
    lookup_id?: string | null;
    tags?: string[];
  }
): SourceAnnotation | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title || null);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description || null);
  }
  if (updates.details !== undefined) {
    fields.push('details = ?');
    values.push(updates.details || null);
  }
  if (updates.icon !== undefined) {
    fields.push('icon = ?');
    values.push(updates.icon || null);
  }
  if (updates.color !== undefined) {
    fields.push('color = ?');
    values.push(updates.color || null);
  }
  if (updates.lookup_id !== undefined) {
    fields.push('lookup_id = ?');
    values.push(updates.lookup_id);
  }
  if (updates.tags !== undefined) {
    fields.push('tags = ?');
    values.push(JSON.stringify(updates.tags));
  }

  if (fields.length === 0) {
    return getSourceAnnotationById(id);
  }

  fields.push('updated_at = datetime(\'now\')');
  values.push(id);

  database.prepare(
    `UPDATE source_annotations SET ${fields.join(', ')} WHERE id = ?`
  ).run(...values);

  return getSourceAnnotationById(id);
}

export function deleteSourceAnnotation(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM source_annotations WHERE id = ?').run(id);
  return result.changes > 0;
}

// ============================================================================
// Source Configs CRUD
// ============================================================================

export interface SourceConfig {
  id: string;
  name: string;
  description?: string;
  hostname_pattern?: string;
  app_name_pattern?: string;
  source_type?: string;
  priority: number;
  template_id?: string;
  target_index?: string;
  parsing_mode: string;
  time_format?: string;
  time_field?: string;
  enabled: number;
  match_count: number;
  created_at: string;
  updated_at: string;
}

export interface SourceConfigExtraction {
  id: string;
  source_config_id: string;
  field_name: string;
  pattern: string;
  pattern_type: string;
  priority: number;
  enabled: number;
}

export interface SourceConfigTransform {
  id: string;
  source_config_id: string;
  transform_type: string;
  source_field?: string;
  target_field: string;
  config?: string;
  priority: number;
  enabled: number;
}

export interface SourceRoutingRule {
  id: string;
  name: string;
  conditions: string;
  match_mode: string;
  target_index: string;
  priority: number;
  enabled: number;
  match_count: number;
  created_at: string;
  updated_at: string;
}

// Get all source configs
export function getSourceConfigs(enabled?: boolean): SourceConfig[] {
  const database = getSQLiteDB();
  if (enabled !== undefined) {
    return database.prepare('SELECT * FROM source_configs WHERE enabled = ? ORDER BY priority ASC').all(enabled ? 1 : 0) as SourceConfig[];
  }
  return database.prepare('SELECT * FROM source_configs ORDER BY priority ASC').all() as SourceConfig[];
}

// Get single source config
export function getSourceConfig(id: string): SourceConfig | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM source_configs WHERE id = ?').get(id) as SourceConfig | undefined;
}

// Create source config
export function createSourceConfig(data: Omit<SourceConfig, 'id' | 'match_count' | 'created_at' | 'updated_at'>): SourceConfig {
  const database = getSQLiteDB();
  const id = crypto.randomUUID();

  database.prepare(`
    INSERT INTO source_configs (id, name, description, hostname_pattern, app_name_pattern, source_type, priority, template_id, target_index, parsing_mode, time_format, time_field, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.name,
    data.description || null,
    data.hostname_pattern || null,
    data.app_name_pattern || null,
    data.source_type || null,
    data.priority ?? 100,
    data.template_id || null,
    data.target_index || null,
    data.parsing_mode || 'auto',
    data.time_format || null,
    data.time_field || null,
    data.enabled ?? 1
  );

  return getSourceConfig(id)!;
}

// Update source config
export function updateSourceConfig(id: string, data: Partial<Omit<SourceConfig, 'id' | 'created_at' | 'updated_at'>>): SourceConfig | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  const allowedFields = ['name', 'description', 'hostname_pattern', 'app_name_pattern', 'source_type', 'priority', 'template_id', 'target_index', 'parsing_mode', 'time_format', 'time_field', 'enabled', 'match_count'];

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key) && value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value as string | number | null);
    }
  }

  if (fields.length === 0) {
    return getSourceConfig(id);
  }

  fields.push("updated_at = datetime('now')");
  values.push(id);

  database.prepare(`UPDATE source_configs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getSourceConfig(id);
}

// Delete source config (cascades to extractions and transforms)
export function deleteSourceConfig(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM source_configs WHERE id = ?').run(id);
  return result.changes > 0;
}

// Increment match count
export function incrementSourceConfigMatchCount(id: string): void {
  const database = getSQLiteDB();
  database.prepare('UPDATE source_configs SET match_count = match_count + 1 WHERE id = ?').run(id);
}

// ============================================================================
// Source Config Extractions CRUD
// ============================================================================

export function getSourceConfigExtractions(sourceConfigId: string): SourceConfigExtraction[] {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM source_config_extractions WHERE source_config_id = ? ORDER BY priority ASC').all(sourceConfigId) as SourceConfigExtraction[];
}

export function getSourceConfigExtraction(id: string): SourceConfigExtraction | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM source_config_extractions WHERE id = ?').get(id) as SourceConfigExtraction | undefined;
}

export function createSourceConfigExtraction(data: Omit<SourceConfigExtraction, 'id'>): SourceConfigExtraction {
  const database = getSQLiteDB();
  const id = crypto.randomUUID();

  database.prepare(`
    INSERT INTO source_config_extractions (id, source_config_id, field_name, pattern, pattern_type, priority, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.source_config_id, data.field_name, data.pattern, data.pattern_type || 'regex', data.priority ?? 100, data.enabled ?? 1);

  return getSourceConfigExtraction(id)!;
}

export function updateSourceConfigExtraction(id: string, data: Partial<Omit<SourceConfigExtraction, 'id' | 'source_config_id'>>): SourceConfigExtraction | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  const allowedFields = ['field_name', 'pattern', 'pattern_type', 'priority', 'enabled'];

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key) && value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value as string | number | null);
    }
  }

  if (fields.length === 0) {
    return getSourceConfigExtraction(id);
  }

  values.push(id);
  database.prepare(`UPDATE source_config_extractions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getSourceConfigExtraction(id);
}

export function deleteSourceConfigExtraction(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM source_config_extractions WHERE id = ?').run(id);
  return result.changes > 0;
}

// ============================================================================
// Source Config Transforms CRUD
// ============================================================================

export function getSourceConfigTransforms(sourceConfigId: string): SourceConfigTransform[] {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM source_config_transforms WHERE source_config_id = ? ORDER BY priority ASC').all(sourceConfigId) as SourceConfigTransform[];
}

export function getSourceConfigTransform(id: string): SourceConfigTransform | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM source_config_transforms WHERE id = ?').get(id) as SourceConfigTransform | undefined;
}

export function createSourceConfigTransform(data: Omit<SourceConfigTransform, 'id'>): SourceConfigTransform {
  const database = getSQLiteDB();
  const id = crypto.randomUUID();

  database.prepare(`
    INSERT INTO source_config_transforms (id, source_config_id, transform_type, source_field, target_field, config, priority, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.source_config_id, data.transform_type, data.source_field || null, data.target_field, data.config || null, data.priority ?? 100, data.enabled ?? 1);

  return getSourceConfigTransform(id)!;
}

export function updateSourceConfigTransform(id: string, data: Partial<Omit<SourceConfigTransform, 'id' | 'source_config_id'>>): SourceConfigTransform | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  const allowedFields = ['transform_type', 'source_field', 'target_field', 'config', 'priority', 'enabled'];

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key) && value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value as string | number | null);
    }
  }

  if (fields.length === 0) {
    return getSourceConfigTransform(id);
  }

  values.push(id);
  database.prepare(`UPDATE source_config_transforms SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getSourceConfigTransform(id);
}

export function deleteSourceConfigTransform(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM source_config_transforms WHERE id = ?').run(id);
  return result.changes > 0;
}

// ============================================================================
// Source Routing Rules CRUD
// ============================================================================

export function getSourceRoutingRules(enabled?: boolean): SourceRoutingRule[] {
  const database = getSQLiteDB();
  if (enabled !== undefined) {
    return database.prepare('SELECT * FROM source_routing_rules WHERE enabled = ? ORDER BY priority ASC').all(enabled ? 1 : 0) as SourceRoutingRule[];
  }
  return database.prepare('SELECT * FROM source_routing_rules ORDER BY priority ASC').all() as SourceRoutingRule[];
}

export function getSourceRoutingRule(id: string): SourceRoutingRule | undefined {
  const database = getSQLiteDB();
  return database.prepare('SELECT * FROM source_routing_rules WHERE id = ?').get(id) as SourceRoutingRule | undefined;
}

export function createSourceRoutingRule(data: Omit<SourceRoutingRule, 'id' | 'match_count' | 'created_at' | 'updated_at'>): SourceRoutingRule {
  const database = getSQLiteDB();
  const id = crypto.randomUUID();

  database.prepare(`
    INSERT INTO source_routing_rules (id, name, conditions, match_mode, target_index, priority, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.name, data.conditions, data.match_mode || 'all', data.target_index, data.priority ?? 100, data.enabled ?? 1);

  return getSourceRoutingRule(id)!;
}

export function updateSourceRoutingRule(id: string, data: Partial<Omit<SourceRoutingRule, 'id' | 'created_at' | 'updated_at'>>): SourceRoutingRule | undefined {
  const database = getSQLiteDB();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  const allowedFields = ['name', 'conditions', 'match_mode', 'target_index', 'priority', 'enabled', 'match_count'];

  for (const [key, value] of Object.entries(data)) {
    if (allowedFields.includes(key) && value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value as string | number | null);
    }
  }

  if (fields.length === 0) {
    return getSourceRoutingRule(id);
  }

  fields.push("updated_at = datetime('now')");
  values.push(id);

  database.prepare(`UPDATE source_routing_rules SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getSourceRoutingRule(id);
}

export function deleteSourceRoutingRule(id: string): boolean {
  const database = getSQLiteDB();
  const result = database.prepare('DELETE FROM source_routing_rules WHERE id = ?').run(id);
  return result.changes > 0;
}

export function incrementRoutingRuleMatchCount(id: string): void {
  const database = getSQLiteDB();
  database.prepare('UPDATE source_routing_rules SET match_count = match_count + 1 WHERE id = ?').run(id);
}
