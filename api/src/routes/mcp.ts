/**
 * MCP Server HTTP Routes
 *
 * Provides HTTP/SSE transport for the LogNog MCP server.
 * This allows Claude Desktop and other clients to connect via HTTP
 * instead of stdio.
 */

import { Router, Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createMCPServer } from '../mcp/server.js';
import { validateApiKey } from '../auth/auth.js';

const router = Router();

// Store active SSE connections
const activeConnections: Map<string, SSEServerTransport> = new Map();

/**
 * GET /mcp/sse
 * Server-Sent Events endpoint for MCP communication
 *
 * Connect to this endpoint to establish an MCP session.
 * Requires API key authentication via X-API-Key header or query param.
 */
router.get('/sse', async (req: Request, res: Response) => {
  // Verify API key
  const apiKey = req.headers['x-api-key'] as string || req.query.api_key as string;

  if (!apiKey) {
    res.status(401).json({ error: 'API key required. Provide via X-API-Key header or api_key query param.' });
    return;
  }

  try {
    const keyInfo = await validateApiKey(apiKey);
    if (!keyInfo) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    // Create connection ID
    const connectionId = `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create SSE transport
    const transport = new SSEServerTransport('/mcp/messages', res);
    activeConnections.set(connectionId, transport);

    console.log(`[MCP] SSE client connected: ${connectionId} (userId: ${keyInfo.userId})`);

    // Create and connect MCP server
    const server = createMCPServer();
    await server.connect(transport);

    // Handle client disconnect
    req.on('close', () => {
      activeConnections.delete(connectionId);
      console.log(`[MCP] SSE client disconnected: ${connectionId}`);
    });

  } catch (error) {
    console.error('[MCP] SSE connection error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to establish MCP connection' });
    }
  }
});

/**
 * POST /mcp/messages
 * Handle messages from SSE clients
 */
router.post('/messages', async (req: Request, res: Response) => {
  const connectionId = req.query.connectionId as string;

  if (!connectionId) {
    res.status(400).json({ error: 'Connection ID required' });
    return;
  }

  const transport = activeConnections.get(connectionId);
  if (!transport) {
    res.status(404).json({ error: 'Connection not found' });
    return;
  }

  try {
    await transport.handlePostMessage(req, res);
  } catch (error) {
    console.error('[MCP] Message handling error:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

/**
 * GET /mcp/status
 * Check MCP server status and list active connections
 */
router.get('/status', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    transport: 'sse',
    active_connections: activeConnections.size,
    capabilities: {
      resources: [
        'lognog://logs/recent',
        'lognog://dashboards',
        'lognog://alerts',
        'lognog://silences',
        'lognog://stats',
        'lognog://templates',
        'lognog://saved-searches',
      ],
      tools: [
        'search_logs',
        'create_dashboard',
        'update_dashboard',
        'add_dashboard_panel',
        'create_alert',
        'silence_alert',
        'ingest_logs',
        'generate_report',
      ],
    },
    documentation: '/docs/mcp-integration',
  });
});

/**
 * GET /mcp/health
 * Simple health check for MCP endpoint
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

export default router;
