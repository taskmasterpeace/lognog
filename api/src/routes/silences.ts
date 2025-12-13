/**
 * Silences API Routes
 *
 * Manage alert silencing (global, host-specific, alert-specific).
 */

import { Router, Request, Response } from 'express';
import {
  createSilence,
  listSilences,
  getSilence,
  removeSilence,
  checkSilenced,
  cleanupExpiredSilences,
  CreateSilenceOptions,
} from '../services/silence-service.js';
import { SilenceLevel } from '../db/sqlite.js';

const router = Router();

// Get all silences
router.get('/', (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.active === 'true';
    const silences = listSilences(activeOnly);
    res.json(silences);
  } catch (error) {
    console.error('Error getting silences:', error);
    res.status(500).json({ error: 'Failed to get silences' });
  }
});

// Get single silence
router.get('/:id', (req: Request, res: Response) => {
  try {
    const silence = getSilence(req.params.id);
    if (!silence) {
      return res.status(404).json({ error: 'Silence not found' });
    }
    res.json(silence);
  } catch (error) {
    console.error('Error getting silence:', error);
    res.status(500).json({ error: 'Failed to get silence' });
  }
});

// Create silence
router.post('/', (req: Request, res: Response) => {
  try {
    const { level, target_id, duration, reason, created_by } = req.body;

    if (!level) {
      return res.status(400).json({ error: 'level is required' });
    }

    if (!['global', 'host', 'alert'].includes(level)) {
      return res.status(400).json({ error: 'level must be global, host, or alert' });
    }

    if (!duration) {
      return res.status(400).json({ error: 'duration is required' });
    }

    const options: CreateSilenceOptions = {
      level: level as SilenceLevel,
      target_id,
      duration,
      reason,
      created_by,
    };

    const result = createSilence(options);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json(result.silence);
  } catch (error) {
    console.error('Error creating silence:', error);
    res.status(500).json({ error: 'Failed to create silence' });
  }
});

// Delete silence
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const result = removeSilence(req.params.id);

    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting silence:', error);
    res.status(500).json({ error: 'Failed to delete silence' });
  }
});

// Check if alert is silenced
router.get('/check', (req: Request, res: Response) => {
  try {
    const alertId = req.query.alert_id as string;
    const hostname = req.query.hostname as string;

    if (!alertId) {
      return res.status(400).json({ error: 'alert_id is required' });
    }

    const result = checkSilenced(alertId, hostname);
    res.json(result);
  } catch (error) {
    console.error('Error checking silence:', error);
    res.status(500).json({ error: 'Failed to check silence' });
  }
});

// Cleanup expired silences
router.post('/cleanup', (_req: Request, res: Response) => {
  try {
    const count = cleanupExpiredSilences();
    res.json({ success: true, removed: count });
  } catch (error) {
    console.error('Error cleaning up silences:', error);
    res.status(500).json({ error: 'Failed to cleanup silences' });
  }
});

export default router;
