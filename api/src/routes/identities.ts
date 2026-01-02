/**
 * Identities API Routes
 *
 * CRUD operations for identity management and discovery.
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/middleware.js';
import {
  Identity,
  IdentityInput,
  IdentityType,
  IdentityStatus,
  getIdentities,
  getIdentityById,
  createIdentity,
  updateIdentity,
  deleteIdentity,
  getIdentityStats,
  getIdentityAssets,
} from '../db/sqlite.js';
import { discoverIdentitiesFromLogs } from '../services/asset-discovery.js';

const router = Router();

/**
 * GET /api/identities
 * List all identities with optional filtering
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const {
      identity_type,
      status,
      is_privileged,
      search,
      limit,
      offset,
    } = req.query;

    const identities = getIdentities({
      identity_type: identity_type as IdentityType | undefined,
      status: status as IdentityStatus | undefined,
      is_privileged: is_privileged === 'true' ? true : is_privileged === 'false' ? false : undefined,
      search: search as string | undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });

    return res.json({
      identities,
      count: identities.length,
    });
  } catch (error) {
    console.error('Error getting identities:', error);
    return res.status(500).json({ error: 'Failed to get identities' });
  }
});

/**
 * GET /api/identities/stats
 * Get identity statistics
 */
router.get('/stats', authenticate, async (_req: Request, res: Response) => {
  try {
    const stats = getIdentityStats();
    return res.json(stats);
  } catch (error) {
    console.error('Error getting identity stats:', error);
    return res.status(500).json({ error: 'Failed to get identity stats' });
  }
});

/**
 * POST /api/identities/discover
 * Trigger identity discovery from logs
 */
router.post('/discover', authenticate, async (req: Request, res: Response) => {
  try {
    const { lookbackHours = 24 } = req.body;

    const result = await discoverIdentitiesFromLogs(lookbackHours);

    return res.json({
      message: 'Identity discovery completed',
      discovered: result.discovered,
      updated: result.updated,
      errors: result.errors,
    });
  } catch (error) {
    console.error('Error discovering identities:', error);
    return res.status(500).json({ error: 'Failed to discover identities' });
  }
});

/**
 * GET /api/identities/:id
 * Get a specific identity
 */
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const identity = getIdentityById(id);

    if (!identity) {
      return res.status(404).json({ error: 'Identity not found' });
    }

    // Include related assets
    const assets = getIdentityAssets(id);

    return res.json({
      identity,
      assets,
    });
  } catch (error) {
    console.error('Error getting identity:', error);
    return res.status(500).json({ error: 'Failed to get identity' });
  }
});

/**
 * POST /api/identities
 * Create a new identity
 */
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const input: IdentityInput = req.body;

    if (!input.identity_type || !input.identifier) {
      return res.status(400).json({ error: 'identity_type and identifier are required' });
    }

    const identity = createIdentity(input);
    return res.status(201).json(identity);
  } catch (error) {
    console.error('Error creating identity:', error);
    if ((error as Error).message?.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Identity with this type and identifier already exists' });
    }
    return res.status(500).json({ error: 'Failed to create identity' });
  }
});

/**
 * PUT /api/identities/:id
 * Update an existing identity
 */
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const input: Partial<IdentityInput> = req.body;

    const identity = updateIdentity(id, input);

    if (!identity) {
      return res.status(404).json({ error: 'Identity not found' });
    }

    return res.json(identity);
  } catch (error) {
    console.error('Error updating identity:', error);
    return res.status(500).json({ error: 'Failed to update identity' });
  }
});

/**
 * DELETE /api/identities/:id
 * Delete an identity
 */
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = deleteIdentity(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Identity not found' });
    }

    return res.json({ message: 'Identity deleted' });
  } catch (error) {
    console.error('Error deleting identity:', error);
    return res.status(500).json({ error: 'Failed to delete identity' });
  }
});

/**
 * POST /api/identities/import
 * Import identities from CSV (bulk create/update)
 */
router.post('/import', authenticate, async (req: Request, res: Response) => {
  try {
    const { identities } = req.body as { identities: IdentityInput[] };

    if (!Array.isArray(identities) || identities.length === 0) {
      return res.status(400).json({ error: 'identities array is required' });
    }

    const results = {
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const input of identities) {
      try {
        if (!input.identity_type || !input.identifier) {
          results.errors.push(`Missing identity_type or identifier for identity`);
          continue;
        }

        const existing = getIdentityById(input.identifier);
        if (existing) {
          updateIdentity(existing.id, input);
          results.updated++;
        } else {
          createIdentity(input);
          results.created++;
        }
      } catch (err) {
        results.errors.push(`Failed to import ${input.identifier}: ${(err as Error).message}`);
      }
    }

    return res.json(results);
  } catch (error) {
    console.error('Error importing identities:', error);
    return res.status(500).json({ error: 'Failed to import identities' });
  }
});

export default router;
