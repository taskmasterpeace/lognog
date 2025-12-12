/**
 * SQLite-based log storage for LogNog Lite.
 *
 * This module provides the same interface as clickhouse.ts but uses SQLite
 * for log storage. Suitable for small deployments (1-10 machines, <100K logs/day).
 */

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

let db: Database.Database | null = null;

export function getSQLiteLogsDB(): Database.Database {
  if (!db) {
    const dbPath = process.env.LOGS_DB_PATH || './lognog-logs.db';
    db = new Database(dbPath);

    // Enable WAL mode for better concurrent performance
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -64000'); // 64MB cache

    initializeLogsSchema();
  }
  return db;
}

function initializeLogsSchema(): void {
  const database = getSQLiteLogsDB();

  database.exec(`
    -- Main logs table (similar to ClickHouse schema)
    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      received_at TEXT NOT NULL,
      hostname TEXT DEFAULT '',
      app_name TEXT DEFAULT '',
      severity INTEGER DEFAULT 6,
      facility INTEGER DEFAULT 1,
      priority INTEGER DEFAULT 14,
      message TEXT DEFAULT '',
      raw TEXT DEFAULT '',
      structured_data TEXT DEFAULT '{}',
      index_name TEXT DEFAULT 'main',
      protocol TEXT DEFAULT 'agent',
      source_ip TEXT DEFAULT '',
      source_port INTEGER DEFAULT 0
    );

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_logs_hostname ON logs(hostname);
    CREATE INDEX IF NOT EXISTS idx_logs_app_name ON logs(app_name);
    CREATE INDEX IF NOT EXISTS idx_logs_severity ON logs(severity);
    CREATE INDEX IF NOT EXISTS idx_logs_index_name ON logs(index_name);
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp_hostname ON logs(timestamp DESC, hostname);
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp_app ON logs(timestamp DESC, app_name);

    -- Full-text search index for message content
    CREATE VIRTUAL TABLE IF NOT EXISTS logs_fts USING fts5(
      message,
      raw,
      content='logs',
      content_rowid='rowid'
    );

    -- Triggers to keep FTS index updated
    CREATE TRIGGER IF NOT EXISTS logs_ai AFTER INSERT ON logs BEGIN
      INSERT INTO logs_fts(rowid, message, raw) VALUES (NEW.rowid, NEW.message, NEW.raw);
    END;

    CREATE TRIGGER IF NOT EXISTS logs_ad AFTER DELETE ON logs BEGIN
      INSERT INTO logs_fts(logs_fts, rowid, message, raw) VALUES('delete', OLD.rowid, OLD.message, OLD.raw);
    END;

    CREATE TRIGGER IF NOT EXISTS logs_au AFTER UPDATE ON logs BEGIN
      INSERT INTO logs_fts(logs_fts, rowid, message, raw) VALUES('delete', OLD.rowid, OLD.message, OLD.raw);
      INSERT INTO logs_fts(rowid, message, raw) VALUES (NEW.rowid, NEW.message, NEW.raw);
    END;
  `);
}

export interface LogEntry {
  id?: string;
  timestamp: string;
  received_at?: string;
  hostname?: string;
  app_name?: string;
  severity?: number;
  facility?: number;
  priority?: number;
  message?: string;
  raw?: string;
  structured_data?: string;
  index_name?: string;
  protocol?: string;
  source_ip?: string;
  source_port?: number;
}

/**
 * Insert logs into SQLite (compatible with clickhouse.ts interface)
 */
export async function insertLogs(logs: Record<string, unknown>[]): Promise<void> {
  const database = getSQLiteLogsDB();

  const insert = database.prepare(`
    INSERT INTO logs (
      id, timestamp, received_at, hostname, app_name, severity, facility,
      priority, message, raw, structured_data, index_name, protocol,
      source_ip, source_port
    ) VALUES (
      @id, @timestamp, @received_at, @hostname, @app_name, @severity, @facility,
      @priority, @message, @raw, @structured_data, @index_name, @protocol,
      @source_ip, @source_port
    )
  `);

  const insertMany = database.transaction((entries: Record<string, unknown>[]) => {
    for (const log of entries) {
      insert.run({
        id: uuidv4(),
        timestamp: log.timestamp || new Date().toISOString(),
        received_at: log.received_at || new Date().toISOString(),
        hostname: log.hostname || '',
        app_name: log.app_name || '',
        severity: log.severity ?? 6,
        facility: log.facility ?? 1,
        priority: log.priority ?? 14,
        message: log.message || '',
        raw: log.raw || '',
        structured_data: typeof log.structured_data === 'string'
          ? log.structured_data
          : JSON.stringify(log.structured_data || {}),
        index_name: log.index_name || 'main',
        protocol: log.protocol || 'agent',
        source_ip: log.source_ip || '',
        source_port: log.source_port ?? 0,
      });
    }
  });

  insertMany(logs);
}

/**
 * Execute a SQL query against the logs database.
 * The SQL should be SQLite-compatible (use the SQLite compiler).
 */
export async function executeQuery<T = Record<string, unknown>>(
  sql: string,
  _params?: Record<string, unknown>
): Promise<T[]> {
  const database = getSQLiteLogsDB();

  try {
    // For SELECT queries, use .all()
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      return database.prepare(sql).all() as T[];
    }

    // For other queries (shouldn't happen in normal use)
    database.exec(sql);
    return [];
  } catch (error) {
    console.error('SQLite query error:', sql);
    throw error;
  }
}

/**
 * Full-text search in log messages
 */
export async function searchLogs(
  searchTerm: string,
  limit: number = 1000
): Promise<LogEntry[]> {
  const database = getSQLiteLogsDB();

  const results = database.prepare(`
    SELECT logs.* FROM logs
    JOIN logs_fts ON logs.rowid = logs_fts.rowid
    WHERE logs_fts MATCH ?
    ORDER BY logs.timestamp DESC
    LIMIT ?
  `).all(searchTerm, limit) as LogEntry[];

  return results;
}

/**
 * Health check for SQLite logs database
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const database = getSQLiteLogsDB();
    database.prepare('SELECT 1').get();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get log count (for stats)
 */
export function getLogCount(): number {
  const database = getSQLiteLogsDB();
  const result = database.prepare('SELECT COUNT(*) as count FROM logs').get() as { count: number };
  return result.count;
}

/**
 * Get database size in bytes
 */
export function getDatabaseSize(): number {
  const database = getSQLiteLogsDB();
  const result = database.prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()').get() as { size: number };
  return result.size;
}

/**
 * Clean up old logs based on retention period
 */
export function cleanupOldLogs(retentionDays: number = 30): number {
  const database = getSQLiteLogsDB();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const result = database.prepare(`
    DELETE FROM logs WHERE timestamp < ?
  `).run(cutoff.toISOString());

  // Optimize database after deletion
  database.exec('VACUUM');

  return result.changes;
}

/**
 * Close the database connection
 */
export async function closeConnection(): Promise<void> {
  if (db) {
    db.close();
    db = null;
  }
}
