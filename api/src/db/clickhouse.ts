import { createClient, ClickHouseClient } from '@clickhouse/client';

let client: ClickHouseClient | null = null;

export function getClickHouseClient(): ClickHouseClient {
  if (!client) {
    client = createClient({
      host: `http://${process.env.CLICKHOUSE_HOST || 'localhost'}:${process.env.CLICKHOUSE_PORT || '8123'}`,
      username: process.env.CLICKHOUSE_USER || 'default',
      password: process.env.CLICKHOUSE_PASSWORD || '',
      database: process.env.CLICKHOUSE_DATABASE || 'lognog',
    });
  }
  return client;
}

export async function executeQuery<T = Record<string, unknown>>(
  sql: string,
  params?: Record<string, unknown>
): Promise<T[]> {
  const ch = getClickHouseClient();
  const result = await ch.query({
    query: sql,
    query_params: params,
    format: 'JSONEachRow',
  });
  return result.json() as Promise<T[]>;
}

export async function insertLogs(logs: Record<string, unknown>[]): Promise<void> {
  const ch = getClickHouseClient();
  await ch.insert({
    table: 'logs',
    values: logs,
    format: 'JSONEachRow',
  });
}

export async function healthCheck(): Promise<boolean> {
  try {
    const ch = getClickHouseClient();
    await ch.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get a single log entry by ID (for lazy loading full message)
 */
export async function getLogById(
  id: string,
  fields: string[] = ['id', 'message', 'raw', 'message_truncated']
): Promise<Record<string, unknown> | null> {
  const fieldList = fields.join(', ');
  const sql = `SELECT ${fieldList} FROM lognog.logs WHERE id = {id:String} LIMIT 1`;

  const results = await executeQuery<Record<string, unknown>>(sql, { id });
  return results[0] || null;
}

export async function closeConnection(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}
