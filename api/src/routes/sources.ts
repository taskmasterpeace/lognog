/**
 * Sources / Heartbeat API (Phase 3)
 *
 * Exposes the cheap presence-tracking table for "tell me when an entity goes
 * silent" monitoring. These reads hit the tiny source_heartbeats table only —
 * they never scan log data.
 */
import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/middleware.js';
import { listSources, getStaleSources } from '../services/heartbeat.js';

const router = Router();

// GET /sources/heartbeats — all tracked sources, newest-last_seen first
router.get('/heartbeats', authenticate, (_req: Request, res: Response) => {
  try {
    const sources = listSources();
    return res.json(sources);
  } catch (error) {
    console.error('Error listing source heartbeats:', error);
    return res.status(500).json({ error: 'Failed to list source heartbeats' });
  }
});

// GET /sources/heartbeats/stale?minutes=15 — sources silent for >= minutes
router.get('/heartbeats/stale', authenticate, (req: Request, res: Response) => {
  try {
    const raw = req.query.minutes;
    const parsed = typeof raw === 'string' ? parseInt(raw, 10) : NaN;
    const minutes = Number.isFinite(parsed) && parsed > 0 ? parsed : 15;
    const stale = getStaleSources(minutes);
    return res.json(stale);
  } catch (error) {
    console.error('Error listing stale sources:', error);
    return res.status(500).json({ error: 'Failed to list stale sources' });
  }
});

export default router;
