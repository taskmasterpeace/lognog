import Database from 'better-sqlite3';

let db: Database.Database | null = null;

export function getSQLiteDB(): Database.Database {
  if (!db) {
    const dbPath = process.env.SQLITE_PATH || './lognog.db';
    db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
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
    database.exec("ALTER TABLE scheduled_reports ADD COLUMN updated_at TEXT");
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

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// Re-export all domain modules for backward compatibility
export * from './sqlite-saved-searches.js';
export * from './sqlite-dashboards.js';
export * from './sqlite-alerts.js';
export * from './sqlite-notifications.js';
export * from './sqlite-enrichment.js';
export * from './sqlite-source-config.js';
export * from './sqlite-settings.js';
export * from './sqlite-assets.js';
export * from './sqlite-cim.js';
export * from './sqlite-agents.js';
export * from './sqlite-synthetic.js';
export * from './sqlite-rag.js';
export * from './sqlite-interview.js';
