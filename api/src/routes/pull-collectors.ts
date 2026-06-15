/**
 * Phase 4 (Reach): Pull Collector API routes.
 *
 * Pull collectors are admin-configured, server-side credentialed pollers that
 * fetch external HTTP endpoints and ingest the response as logs. All routes
 * require an authenticated admin.
 */

import { Router, Request, Response } from 'express';
import { authenticate, requireAdmin } from '../auth/middleware.js';
import {
  createPullCollector,
  getPullCollectors,
  getPullCollector,
  updatePullCollector,
  deletePullCollector,
  runPullCollector,
  type CreatePullCollectorInput,
} from '../services/pull-collector.js';

const router = Router();

const INDEX_NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;

function isValidUrl(url: unknown): url is string {
  return typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'));
}

function isValidIndexName(name: unknown): name is string {
  return typeof name === 'string' && INDEX_NAME_RE.test(name);
}

// List all collectors
router.get('/', authenticate, requireAdmin, (req: Request, res: Response) => {
  try {
    const enabledOnly = req.query.enabled === 'true';
    res.json(getPullCollectors(enabledOnly));
  } catch (error) {
    console.error('Error listing pull collectors:', error);
    res.status(500).json({ error: 'Failed to list pull collectors' });
  }
});

// Create a collector
router.post('/', authenticate, requireAdmin, (req: Request, res: Response) => {
  try {
    const body = req.body as CreatePullCollectorInput;

    if (!body.name || typeof body.name !== 'string') {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!isValidUrl(body.url)) {
      return res.status(400).json({ error: 'url must start with http:// or https://' });
    }
    if (!isValidIndexName(body.index_name)) {
      return res.status(400).json({ error: 'index_name must match /^[a-z0-9][a-z0-9_-]*$/' });
    }

    const created = createPullCollector(body);
    res.status(201).json(created);
  } catch (error) {
    console.error('Error creating pull collector:', error);
    res.status(500).json({ error: 'Failed to create pull collector' });
  }
});

// Get a single collector
router.get('/:id', authenticate, requireAdmin, (req: Request, res: Response) => {
  try {
    const collector = getPullCollector(req.params.id);
    if (!collector) {
      return res.status(404).json({ error: 'Pull collector not found' });
    }
    res.json(collector);
  } catch (error) {
    console.error('Error getting pull collector:', error);
    res.status(500).json({ error: 'Failed to get pull collector' });
  }
});

// Update a collector
router.put('/:id', authenticate, requireAdmin, (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<CreatePullCollectorInput>;

    if (body.url !== undefined && !isValidUrl(body.url)) {
      return res.status(400).json({ error: 'url must start with http:// or https://' });
    }
    if (body.index_name !== undefined && !isValidIndexName(body.index_name)) {
      return res.status(400).json({ error: 'index_name must match /^[a-z0-9][a-z0-9_-]*$/' });
    }

    const updated = updatePullCollector(req.params.id, body);
    if (!updated) {
      return res.status(404).json({ error: 'Pull collector not found' });
    }
    res.json(updated);
  } catch (error) {
    console.error('Error updating pull collector:', error);
    res.status(500).json({ error: 'Failed to update pull collector' });
  }
});

// Delete a collector
router.delete('/:id', authenticate, requireAdmin, (req: Request, res: Response) => {
  try {
    const deleted = deletePullCollector(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Pull collector not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting pull collector:', error);
    res.status(500).json({ error: 'Failed to delete pull collector' });
  }
});

// Run a collector now
router.post('/:id/run', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const collector = getPullCollector(req.params.id);
    if (!collector) {
      return res.status(404).json({ error: 'Pull collector not found' });
    }
    const result = await runPullCollector(req.params.id);
    res.json(result);
  } catch (error) {
    console.error('Error running pull collector:', error);
    res.status(500).json({ error: 'Failed to run pull collector' });
  }
});

export default router;
