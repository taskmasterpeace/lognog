import { Router, Request, Response } from 'express';
import { executeQuery } from '../db/clickhouse.js';
import { getActiveSources } from '../db/backend.js';
import { getSQLiteDB } from '../db/sqlite.js';

const router = Router();

// Get log statistics
router.get('/overview', async (_req: Request, res: Response) => {
  try {
    // Execute multiple queries in parallel
    const [totalLogs, recentLogs, bySeverity, byHost, byApp] = await Promise.all([
      // Total log count
      executeQuery<{ count: number }>(
        'SELECT count() as count FROM lognog.logs'
      ),

      // Logs in last 24 hours
      executeQuery<{ count: number }>(
        "SELECT count() as count FROM lognog.logs WHERE timestamp > now() - INTERVAL 24 HOUR"
      ),

      // Logs by severity
      executeQuery<{ severity: number; count: number }>(
        'SELECT severity, count() as count FROM lognog.logs GROUP BY severity ORDER BY severity'
      ),

      // Top hosts
      executeQuery<{ hostname: string; count: number }>(
        'SELECT hostname, count() as count FROM lognog.logs GROUP BY hostname ORDER BY count DESC LIMIT 10'
      ),

      // Top apps
      executeQuery<{ app_name: string; count: number }>(
        'SELECT app_name, count() as count FROM lognog.logs GROUP BY app_name ORDER BY count DESC LIMIT 10'
      ),
    ]);

    return res.json({
      totalLogs: totalLogs[0]?.count || 0,
      last24Hours: recentLogs[0]?.count || 0,
      bySeverity,
      topHosts: byHost,
      topApps: byApp,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get time series data for charts
router.get('/timeseries', async (req: Request, res: Response) => {
  try {
    const { interval = '1 HOUR', hours = '24' } = req.query;

    // Validate interval to prevent SQL injection
    const validIntervals = ['1 MINUTE', '5 MINUTE', '15 MINUTE', '1 HOUR', '1 DAY'];
    if (!validIntervals.includes(interval as string)) {
      return res.status(400).json({ error: 'Invalid interval' });
    }

    const data = await executeQuery<{ time: string; count: number; errors: number }>(
      `SELECT
        toStartOfInterval(timestamp, INTERVAL ${interval}) as time,
        count() as count,
        countIf(severity <= 3) as errors
      FROM lognog.logs
      WHERE timestamp > now() - INTERVAL ${parseInt(hours as string, 10)} HOUR
      GROUP BY time
      ORDER BY time`
    );

    return res.json(data);
  } catch (error) {
    console.error('Error fetching time series:', error);
    return res.status(500).json({ error: 'Failed to fetch time series data' });
  }
});

// Get severity distribution
router.get('/severity', async (_req: Request, res: Response) => {
  try {
    const data = await executeQuery<{ severity: number; name: string; count: number }>(
      `SELECT
        l.severity,
        s.name,
        count() as count
      FROM lognog.logs l
      LEFT JOIN lognog.severity_levels s ON l.severity = s.level
      WHERE timestamp > now() - INTERVAL 24 HOUR
      GROUP BY l.severity, s.name
      ORDER BY l.severity`
    );

    return res.json(data);
  } catch (error) {
    console.error('Error fetching severity stats:', error);
    return res.status(500).json({ error: 'Failed to fetch severity statistics' });
  }
});

// Get index sizes (basic)
router.get('/indexes', async (_req: Request, res: Response) => {
  try {
    const data = await executeQuery<{ index_name: string; count: number; size_bytes: number }>(
      `SELECT
        index_name,
        count() as count,
        sum(length(message)) as size_bytes
      FROM lognog.logs
      GROUP BY index_name`
    );

    return res.json(data);
  } catch (error) {
    console.error('Error fetching index stats:', error);
    return res.status(500).json({ error: 'Failed to fetch index statistics' });
  }
});

// Get detailed index info with sparklines (for Dashboard Builder Wizard)
router.get('/indexes/details', async (_req: Request, res: Response) => {
  try {
    // Get basic index stats
    const indexStats = await executeQuery<{
      index_name: string;
      count: number;
      size_bytes: number;
      first_seen: string;
      last_seen: string;
    }>(
      `SELECT
        index_name,
        count() as count,
        sum(length(message)) as size_bytes,
        min(timestamp) as first_seen,
        max(timestamp) as last_seen
      FROM lognog.logs
      GROUP BY index_name
      ORDER BY count DESC`
    );

    // Get 24-hour sparkline data for each index
    const sparklineData = await executeQuery<{
      index_name: string;
      hour: number;
      count: number;
    }>(
      `SELECT
        index_name,
        toHour(timestamp) as hour,
        count() as count
      FROM lognog.logs
      WHERE timestamp > now() - INTERVAL 24 HOUR
      GROUP BY index_name, hour
      ORDER BY index_name, hour`
    );

    // Build sparklines per index (24 values, one per hour)
    const sparklineMap: Record<string, number[]> = {};
    for (const row of sparklineData) {
      if (!sparklineMap[row.index_name]) {
        sparklineMap[row.index_name] = new Array(24).fill(0);
      }
      sparklineMap[row.index_name][row.hour] = row.count;
    }

    // Combine results
    const indexes = indexStats.map(idx => ({
      name: idx.index_name,
      count: idx.count,
      size_bytes: idx.size_bytes,
      first_seen: idx.first_seen,
      last_seen: idx.last_seen,
      sparkline: sparklineMap[idx.index_name] || new Array(24).fill(0),
    }));

    return res.json({ indexes });
  } catch (error) {
    console.error('Error fetching detailed index stats:', error);
    return res.status(500).json({ error: 'Failed to fetch index details' });
  }
});

// Get discovered fields for a specific index (for Dashboard Builder Wizard)
router.get('/indexes/:indexName/fields', async (req: Request, res: Response) => {
  try {
    const { indexName } = req.params;

    // Sanitize index name
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/.test(indexName)) {
      return res.status(400).json({ error: 'Invalid index name' });
    }

    // Get standard fields with their cardinality and sample values
    const standardFields = ['hostname', 'app_name', 'severity', 'facility', 'source_ip'];

    const fieldQueries = standardFields.map(field => {
      // For numeric fields (severity, facility) and IP fields, don't use string comparison
      const isNonString = field === 'severity' || field === 'facility' || field === 'source_ip';
      const whereClause = isNonString
        ? `index_name = '${indexName}'`
        : `index_name = '${indexName}' AND ${field} != ''`;

      return executeQuery<{ value: string; count: number }>(
        `SELECT ${field} as value, count() as count
         FROM lognog.logs
         WHERE ${whereClause}
         GROUP BY ${field}
         ORDER BY count DESC
         LIMIT 10`
      ).then(results => ({
        name: field,
        type: field === 'severity' || field === 'facility' ? 'number' : 'string',
        cardinality: results.length,
        sample_values: results.slice(0, 5).map(r => String(r.value)),
        top_count: results[0]?.count || 0,
        recommended_viz: getRecommendedViz(field),
      }));
    });

    // Also check for structured_data fields (JSON extracted)
    const structuredFieldsQuery = executeQuery<{ field_name: string; count: number }>(
      `SELECT
        arrayJoin(JSONExtractKeys(structured_data)) as field_name,
        count() as count
      FROM lognog.logs
      WHERE index_name = '${indexName}' AND structured_data != '{}'
      GROUP BY field_name
      ORDER BY count DESC
      LIMIT 20`
    ).catch(() => []); // Ignore if structured_data parsing fails

    const [fields, structuredFields] = await Promise.all([
      Promise.all(fieldQueries),
      structuredFieldsQuery,
    ]);

    // Add structured fields if any
    const customFields = (structuredFields as { field_name: string; count: number }[]).map(sf => ({
      name: `structured.${sf.field_name}`,
      type: 'string' as const,
      cardinality: 0, // Would need another query to determine
      sample_values: [],
      top_count: sf.count,
      recommended_viz: ['table', 'bar'],
    }));

    // Always include timestamp as a field
    const allFields = [
      {
        name: 'timestamp',
        type: 'timestamp' as const,
        cardinality: 0,
        sample_values: [],
        top_count: 0,
        recommended_viz: ['line'],
      },
      ...fields.filter(f => f.cardinality > 0), // Only include fields with data
      ...customFields,
    ];

    return res.json({ fields: allFields });
  } catch (error) {
    console.error('Error fetching index fields:', error);
    return res.status(500).json({ error: 'Failed to fetch index fields' });
  }
});

// Helper function to recommend visualizations based on field name/type
function getRecommendedViz(fieldName: string): string[] {
  switch (fieldName) {
    case 'severity':
      return ['pie', 'heatmap', 'bar'];
    case 'hostname':
    case 'app_name':
      return ['bar', 'pie', 'table'];
    case 'source_ip':
      return ['table', 'bar'];
    case 'facility':
      return ['pie', 'bar'];
    default:
      return ['bar', 'table'];
  }
}

// Get active sources for Data Sources dashboard
router.get('/sources', async (_req: Request, res: Response) => {
  try {
    const data = await getActiveSources();
    return res.json(data);
  } catch (error) {
    console.error('Error fetching active sources:', error);
    return res.status(500).json({ error: 'Failed to fetch active sources' });
  }
});

// Get detailed storage statistics
router.get('/storage', async (_req: Request, res: Response) => {
  try {
    // Get retention settings from SQLite
    const db = getSQLiteDB();
    const retentionSettings = db.prepare(`
      SELECT index_name, retention_days FROM index_retention_settings
    `).all() as Array<{ index_name: string; retention_days: number }>;

    const retentionMap: Record<string, number> = {};
    for (const setting of retentionSettings) {
      retentionMap[setting.index_name] = setting.retention_days;
    }
    const defaultRetention = 90; // Default TTL in days

    // Get actual disk usage from ClickHouse system.parts
    const diskUsage = await executeQuery<{
      index_name: string;
      row_count: number;
      size_bytes: number;
      oldest_timestamp: string;
      newest_timestamp: string;
    }>(`
      SELECT
        index_name,
        count() as row_count,
        sum(length(message) + length(COALESCE(structured_data, ''))) as size_bytes,
        min(timestamp) as oldest_timestamp,
        max(timestamp) as newest_timestamp
      FROM lognog.logs
      GROUP BY index_name
      ORDER BY size_bytes DESC
    `);

    // Get total stats from system.parts for actual disk size
    const systemPartsTotal = await executeQuery<{
      total_bytes: number;
      total_rows: number;
    }>(`
      SELECT
        sum(bytes_on_disk) as total_bytes,
        sum(rows) as total_rows
      FROM system.parts
      WHERE database = 'lognog' AND table = 'logs' AND active = 1
    `);

    // Get daily log counts for growth rate calculation (last 7 days)
    const dailyCounts = await executeQuery<{
      day: string;
      count: number;
      bytes: number;
    }>(`
      SELECT
        toDate(timestamp) as day,
        count() as count,
        sum(length(message)) as bytes
      FROM lognog.logs
      WHERE timestamp > now() - INTERVAL 7 DAY
      GROUP BY day
      ORDER BY day
    `);

    // Calculate growth rates
    let dailyGrowthRate = 0;
    let weeklyGrowthBytes = 0;
    if (dailyCounts.length >= 2) {
      const recentDays = dailyCounts.slice(-2);
      if (recentDays.length === 2 && recentDays[0].bytes > 0) {
        dailyGrowthRate = ((recentDays[1].bytes - recentDays[0].bytes) / recentDays[0].bytes) * 100;
      }
      weeklyGrowthBytes = dailyCounts.reduce((sum, d) => sum + d.bytes, 0);
    }

    // Get oldest data timestamp
    const oldestData = await executeQuery<{ oldest: string }>(`
      SELECT min(timestamp) as oldest FROM lognog.logs
    `);

    // Build index storage details
    const indexes = diskUsage.map((idx) => {
      const retentionDays = retentionMap[idx.index_name] || defaultRetention;
      const oldestDate = new Date(idx.oldest_timestamp);
      const expiryDate = new Date(oldestDate.getTime() + retentionDays * 24 * 60 * 60 * 1000);
      const now = new Date();
      const daysUntilExpiry = Math.max(0, Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));

      // Calculate daily growth rate for this index (simplified)
      const ageInDays = Math.max(1, (now.getTime() - oldestDate.getTime()) / (24 * 60 * 60 * 1000));
      const growthRateDaily = idx.size_bytes / ageInDays;

      return {
        index_name: idx.index_name,
        row_count: idx.row_count,
        size_bytes: idx.size_bytes,
        retention_days: retentionDays,
        days_until_expiry: daysUntilExpiry,
        growth_rate_daily: Math.round(growthRateDaily),
        oldest_timestamp: idx.oldest_timestamp,
        newest_timestamp: idx.newest_timestamp,
      };
    });

    // Calculate total stats
    const totalDiskBytes = systemPartsTotal[0]?.total_bytes || indexes.reduce((sum, idx) => sum + idx.size_bytes, 0);
    const totalRows = systemPartsTotal[0]?.total_rows || indexes.reduce((sum, idx) => sum + idx.row_count, 0);

    return res.json({
      total_disk_bytes: totalDiskBytes,
      total_rows: totalRows,
      indexes,
      growth_rate: {
        daily: dailyGrowthRate,
        weekly_bytes: weeklyGrowthBytes,
      },
      oldest_data: oldestData[0]?.oldest || null,
      daily_counts: dailyCounts,
    });
  } catch (error) {
    console.error('Error fetching storage stats:', error);
    return res.status(500).json({ error: 'Failed to fetch storage statistics' });
  }
});

export default router;
