import express from 'express';
import cors from 'cors';
import expressWs from 'express-ws';
import { WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';

import searchRouter from './routes/search.js';
import dashboardsRouter from './routes/dashboards.js';
import statsRouter from './routes/stats.js';
import reportsRouter from './routes/reports.js';
import knowledgeRouter from './routes/knowledge.js';
import fieldExtractionsRouter from './routes/field-extractions.js';
import authRouter from './routes/auth.js';
import ingestRouter from './routes/ingest.js';
import alertsRouter from './routes/alerts.js';
import geoipRouter from './routes/geoip.js';
import silencesRouter from './routes/silences.js';
import utilsRouter from './routes/utils.js';
import templatesRouter from './routes/templates.js';
import aiRouter from './routes/ai.js';
import demoRouter from './routes/demo.js';
import mcpRouter from './routes/mcp.js';
import notificationsRouter from './routes/notifications.js';
import settingsRouter from './routes/settings.js';
import onboardingRouter from './routes/onboarding.js';
import anomalyRouter from './routes/anomaly.js';
import assetsRouter from './routes/assets.js';
import identitiesRouter from './routes/identities.js';
import cimRouter from './routes/cim.js';
import syntheticRouter from './routes/synthetic.js';
import { healthCheck as clickhouseHealth, executeQuery, closeConnection } from './db/clickhouse.js';
import { closeDatabase } from './db/sqlite.js';
import { startScheduler } from './services/scheduler.js';
import { startScheduler as startSyntheticScheduler } from './services/synthetic/index.js';
import { executeDSLQuery } from './db/backend.js';
import { seedBuiltinTemplates } from './data/builtin-templates.js';
import { seedDashboardTemplates } from './data/seed-templates.js';
import { seedBuiltinCIMModels } from './data/builtin-cim-models.js';

const PORT = process.env.PORT || 4000;

// Create Express app with WebSocket support
const { app } = expressWs(express());

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', async (_req, res) => {
  const clickhouseOk = await clickhouseHealth();

  res.json({
    status: clickhouseOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      api: 'ok',
      clickhouse: clickhouseOk ? 'ok' : 'error',
    },
  });
});

// API Routes
app.use('/auth', authRouter);
app.use('/ingest', ingestRouter);
app.use('/search', searchRouter);
app.use('/dashboards', dashboardsRouter);
app.use('/stats', statsRouter);
app.use('/reports', reportsRouter);
app.use('/knowledge', knowledgeRouter);
app.use('/field-extractions', fieldExtractionsRouter);
app.use('/alerts', alertsRouter);
app.use('/silences', silencesRouter);
app.use('/geoip', geoipRouter);
app.use('/utils', utilsRouter);
app.use('/templates', templatesRouter);
app.use('/ai', aiRouter);
app.use('/demo', demoRouter);
app.use('/mcp', mcpRouter);
app.use('/notifications', notificationsRouter);
app.use('/settings', settingsRouter);
app.use('/onboarding', onboardingRouter);
app.use('/anomaly', anomalyRouter);
app.use('/assets', assetsRouter);
app.use('/identities', identitiesRouter);
app.use('/cim', cimRouter);
app.use('/synthetic', syntheticRouter);

// WebSocket endpoint for live tail
const liveTailClients: Set<WebSocket> = new Set();

app.ws('/ws/tail', (ws: WebSocket) => {
  console.log('Client connected to live tail');
  liveTailClients.add(ws);

  ws.on('message', (msg: string) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'subscribe') {
        // Client wants to subscribe to live logs
        // In a real implementation, you'd filter based on query
        console.log('Client subscribed to:', data.query || '*');
      }
    } catch (e) {
      console.error('Invalid WebSocket message:', e);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected from live tail');
    liveTailClients.delete(ws);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    liveTailClients.delete(ws);
  });
});

// Poll for new logs and broadcast to connected clients
let lastTimestamp = new Date().toISOString();

async function pollNewLogs(): Promise<void> {
  if (liveTailClients.size === 0) return;

  try {
    const logs = await executeQuery<Record<string, unknown>>(
      `SELECT * FROM lognog.logs
       WHERE timestamp > parseDateTimeBestEffort('${lastTimestamp}')
       ORDER BY timestamp ASC
       LIMIT 100`
    );

    if (logs.length > 0) {
      lastTimestamp = String(logs[logs.length - 1].timestamp);

      const message = JSON.stringify({
        type: 'logs',
        data: logs,
      });

      for (const client of liveTailClients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      }
    }
  } catch (error) {
    console.error('Error polling for new logs:', error);
  }
}

// Poll every 2 seconds
setInterval(pollNewLogs, 2000);

// SSE endpoint for live tail (works with both backends)
interface SSEClient {
  res: express.Response;
  query?: string;
  lastTimestamp: string;
}

const sseClients: Set<SSEClient> = new Set();

app.get('/sse/tail', (req: express.Request, res: express.Response) => {
  const query = req.query.query as string || 'search *';

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const client: SSEClient = {
    res,
    query,
    lastTimestamp: new Date().toISOString(),
  };

  sseClients.add(client);
  console.log(`SSE client connected (${sseClients.size} total), query: ${query}`);

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Live tail connected' })}\n\n`);

  // Handle client disconnect
  req.on('close', () => {
    sseClients.delete(client);
    console.log(`SSE client disconnected (${sseClients.size} remaining)`);
  });
});

// Poll and send new logs to SSE clients
async function pollSSEClients(): Promise<void> {
  if (sseClients.size === 0) return;

  for (const client of sseClients) {
    try {
      // Use DSL query with time filter
      const earliest = client.lastTimestamp;
      const latest = new Date().toISOString();

      const { results } = await executeDSLQuery(client.query || 'search *', { earliest, latest });

      if (results.length > 0) {
        // Update last timestamp to the newest result
        const timestamps = results.map((r: Record<string, unknown>) => r.timestamp as string).filter(Boolean);
        if (timestamps.length > 0) {
          client.lastTimestamp = timestamps[timestamps.length - 1];
        }

        // Send logs to client
        const message = JSON.stringify({
          type: 'logs',
          count: results.length,
          data: results.slice(0, 100), // Limit to 100 per update
        });

        client.res.write(`data: ${message}\n\n`);
      }
    } catch (error) {
      console.error('Error polling for SSE client:', error);
      // Send error to client
      client.res.write(`data: ${JSON.stringify({ type: 'error', message: 'Query error' })}\n\n`);
    }
  }
}

// Poll SSE clients every 2 seconds
setInterval(pollSSEClients, 2000);

// Serve static UI files (for Lite/standalone mode)
// Look for ui/dist relative to working directory and common locations
const cwd = process.cwd();
const uiDistPaths = [
  path.join(cwd, 'ui', 'dist'),                    // Running from project root
  path.join(cwd, '..', 'ui', 'dist'),              // Running from api/ folder
  path.join(cwd, '..', '..', 'ui', 'dist'),        // Running from api/dist/ folder
];

const uiDistPath = uiDistPaths.find(p => fs.existsSync(p));

if (uiDistPath) {
  console.log(`Serving UI from: ${uiDistPath}`);
  app.use(express.static(uiDistPath));

  // SPA fallback - serve index.html for non-API routes
  app.get('*', (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/auth') ||
        req.path.startsWith('/ingest') ||
        req.path.startsWith('/search') ||
        req.path.startsWith('/dashboards') ||
        req.path.startsWith('/stats') ||
        req.path.startsWith('/reports') ||
        req.path.startsWith('/knowledge') ||
        req.path.startsWith('/field-extractions') ||
        req.path.startsWith('/alerts') ||
        req.path.startsWith('/silences') ||
        req.path.startsWith('/geoip') ||
        req.path.startsWith('/utils') ||
        req.path.startsWith('/templates') ||
        req.path.startsWith('/ai') ||
        req.path.startsWith('/demo') ||
        req.path.startsWith('/mcp') ||
        req.path.startsWith('/health') ||
        req.path.startsWith('/ws') ||
        req.path.startsWith('/sse') ||
        req.path.startsWith('/settings') ||
        req.path.startsWith('/anomaly') ||
        req.path.startsWith('/assets') ||
        req.path.startsWith('/identities') ||
        req.path.startsWith('/cim') ||
        req.path.startsWith('/synthetic') ||
        req.path.startsWith('/onboarding')) {
      return next();
    }

    const indexPath = path.join(uiDistPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      next();
    }
  });
}

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await closeConnection();
  closeDatabase();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`LogNog API server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);

  // Seed built-in templates
  try {
    seedBuiltinTemplates();
    seedDashboardTemplates();
    seedBuiltinCIMModels();
  } catch (error) {
    console.error('Failed to seed templates:', error);
  }

  // Start the report scheduler
  startScheduler();

  // Start the synthetic monitoring scheduler
  startSyntheticScheduler();
});

export default app;
