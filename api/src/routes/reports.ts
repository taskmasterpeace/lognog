import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getSQLiteDB } from '../db/sqlite.js';
import { executeQuery } from '../db/clickhouse.js';
import { compileDSL, parseAndCompile } from '../dsl/index.js';
import { triggerReport } from '../services/scheduler.js';

const router = Router();

interface ScheduledReport {
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

// Get all scheduled reports
router.get('/', (_req: Request, res: Response) => {
  try {
    const db = getSQLiteDB();
    const reports = db.prepare('SELECT * FROM scheduled_reports ORDER BY created_at DESC').all() as ScheduledReport[];
    return res.json(reports);
  } catch (error) {
    console.error('Error fetching reports:', error);
    return res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// Create a scheduled report
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, query, schedule, recipients, format = 'html' } = req.body;

    if (!name || !query || !schedule || !recipients) {
      return res.status(400).json({ error: 'Name, query, schedule, and recipients are required' });
    }

    const db = getSQLiteDB();
    const id = uuidv4();
    db.prepare(
      'INSERT INTO scheduled_reports (id, name, query, schedule, recipients, format) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, name, query, schedule, recipients, format);

    const report = db.prepare('SELECT * FROM scheduled_reports WHERE id = ?').get(id);
    return res.status(201).json(report);
  } catch (error) {
    console.error('Error creating report:', error);
    return res.status(500).json({ error: 'Failed to create report' });
  }
});

// Update a scheduled report
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { name, query, schedule, recipients, format, enabled } = req.body;
    const db = getSQLiteDB();

    const fields: string[] = [];
    const values: unknown[] = [];

    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (query !== undefined) { fields.push('query = ?'); values.push(query); }
    if (schedule !== undefined) { fields.push('schedule = ?'); values.push(schedule); }
    if (recipients !== undefined) { fields.push('recipients = ?'); values.push(recipients); }
    if (format !== undefined) { fields.push('format = ?'); values.push(format); }
    if (enabled !== undefined) { fields.push('enabled = ?'); values.push(enabled ? 1 : 0); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.params.id);
    db.prepare(`UPDATE scheduled_reports SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    const report = db.prepare('SELECT * FROM scheduled_reports WHERE id = ?').get(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    return res.json(report);
  } catch (error) {
    console.error('Error updating report:', error);
    return res.status(500).json({ error: 'Failed to update report' });
  }
});

// Trigger a scheduled report manually
router.post('/:id/trigger', async (req: Request, res: Response) => {
  try {
    await triggerReport(req.params.id);
    return res.json({ message: 'Report triggered successfully' });
  } catch (error) {
    console.error('Error triggering report:', error);
    return res.status(500).json({ error: String(error) });
  }
});

// Delete a scheduled report
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getSQLiteDB();
    const result = db.prepare('DELETE FROM scheduled_reports WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }
    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting report:', error);
    return res.status(500).json({ error: 'Failed to delete report' });
  }
});

// Generate report (run query and return HTML/JSON)
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { query, format = 'html', title = 'LogNog Report', timeRange } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    // Compile and execute query
    const compiled = parseAndCompile(query);
    let sql = compiled.sql;

    if (timeRange) {
      // Parse relative time ranges like '-24h', '-7d', '-1w'
      let timeCondition: string;
      const match = timeRange.match(/^-(\d+)([hdwm])$/);
      if (match) {
        const value = parseInt(match[1], 10);
        const unit = match[2];
        const unitMap: Record<string, string> = {
          'h': 'HOUR',
          'd': 'DAY',
          'w': 'WEEK',
          'm': 'MONTH'
        };
        timeCondition = `timestamp >= now() - INTERVAL ${value} ${unitMap[unit]}`;
      } else {
        // Assume it's an absolute timestamp
        timeCondition = `timestamp >= parseDateTimeBestEffort('${timeRange}')`;
      }

      if (sql.includes('WHERE')) {
        sql = sql.replace('WHERE', `WHERE ${timeCondition} AND`);
      } else if (sql.includes('FROM lognog.logs')) {
        sql = sql.replace('FROM lognog.logs', `FROM lognog.logs WHERE ${timeCondition}`);
      }
    }

    const results = await executeQuery(sql);

    if (format === 'json') {
      return res.json({
        title,
        generatedAt: new Date().toISOString(),
        query,
        results,
        count: results.length,
      });
    }

    // Generate HTML report
    const html = generateHtmlReport(title, query, results);

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="${title.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.html"`);
    return res.send(html);
  } catch (error) {
    console.error('Error generating report:', error);
    return res.status(500).json({ error: String(error) });
  }
});

function generateHtmlReport(title: string, query: string, results: Record<string, unknown>[]): string {
  const columns = results.length > 0 ? Object.keys(results[0]) : [];
  const generatedAt = new Date().toLocaleString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - Spunk Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8fafc;
      color: #1e293b;
      line-height: 1.5;
      padding: 2rem;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    .header {
      background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
      color: white;
      padding: 2rem;
      border-radius: 12px;
      margin-bottom: 2rem;
    }
    .header h1 { font-size: 1.75rem; margin-bottom: 0.5rem; }
    .header p { opacity: 0.9; font-size: 0.875rem; }
    .meta {
      display: flex;
      gap: 2rem;
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid rgba(255,255,255,0.2);
    }
    .meta-item { font-size: 0.75rem; }
    .meta-label { opacity: 0.7; }
    .query-box {
      background: #1e293b;
      color: #e2e8f0;
      padding: 1rem;
      border-radius: 8px;
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 0.875rem;
      margin-bottom: 2rem;
      overflow-x: auto;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .stat-card {
      background: white;
      border-radius: 8px;
      padding: 1.25rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .stat-value { font-size: 1.5rem; font-weight: 700; color: #0ea5e9; }
    .stat-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; }
    .table-container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    table { width: 100%; border-collapse: collapse; }
    th {
      background: #f1f5f9;
      text-align: left;
      padding: 0.75rem 1rem;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      color: #475569;
      border-bottom: 2px solid #e2e8f0;
    }
    td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #f1f5f9;
      font-size: 0.875rem;
    }
    tr:hover td { background: #f8fafc; }
    .severity-0, .severity-1, .severity-2, .severity-3 {
      color: #dc2626;
      font-weight: 500;
    }
    .severity-4 { color: #ea580c; }
    .severity-5, .severity-6 { color: #16a34a; }
    .severity-7 { color: #64748b; }
    .footer {
      text-align: center;
      margin-top: 2rem;
      color: #94a3b8;
      font-size: 0.75rem;
    }
    @media print {
      body { background: white; padding: 0; }
      .header { page-break-after: avoid; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${escapeHtml(title)}</h1>
      <p>Generated by LogNog Log Analytics Platform</p>
      <div class="meta">
        <div class="meta-item">
          <span class="meta-label">Generated:</span> ${escapeHtml(generatedAt)}
        </div>
        <div class="meta-item">
          <span class="meta-label">Results:</span> ${results.length.toLocaleString()} rows
        </div>
      </div>
    </div>

    <div class="query-box">${escapeHtml(query)}</div>

    <div class="stats">
      <div class="stat-card">
        <div class="stat-value">${results.length.toLocaleString()}</div>
        <div class="stat-label">Total Results</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${columns.length}</div>
        <div class="stat-label">Columns</div>
      </div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            ${columns.map(col => `<th>${escapeHtml(col)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${results.slice(0, 1000).map(row => `
            <tr>
              ${columns.map(col => {
                const value = row[col];
                const className = col === 'severity' ? `severity-${value}` : '';
                return `<td class="${className}">${escapeHtml(String(value ?? ''))}</td>`;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    ${results.length > 1000 ? `<p style="text-align: center; margin-top: 1rem; color: #64748b;">Showing first 1,000 of ${results.length.toLocaleString()} results</p>` : ''}

    <div class="footer">
      LogNog - Open Source Log Analytics | ${escapeHtml(generatedAt)}
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default router;
