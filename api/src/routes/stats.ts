import { Router, Request, Response } from 'express';
import { executeQuery } from '../db/clickhouse.js';

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

// Get index sizes
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

export default router;
