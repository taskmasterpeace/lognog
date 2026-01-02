/**
 * Assets API Routes
 *
 * CRUD operations for asset management and discovery.
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/middleware.js';
import {
  Asset,
  AssetInput,
  AssetType,
  AssetStatus,
  getAssets,
  getAssetById,
  createAsset,
  updateAsset,
  deleteAsset,
  getAssetStats,
  getAssetIdentities,
  upsertAssetFromDiscovery,
} from '../db/sqlite.js';
import { discoverAssetsFromLogs } from '../services/asset-discovery.js';

const router = Router();

/**
 * GET /api/assets
 * List all assets with optional filtering
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const {
      asset_type,
      status,
      search,
      limit,
      offset,
    } = req.query;

    const assets = getAssets({
      asset_type: asset_type as AssetType | undefined,
      status: status as AssetStatus | undefined,
      search: search as string | undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });

    return res.json({
      assets,
      count: assets.length,
    });
  } catch (error) {
    console.error('Error getting assets:', error);
    return res.status(500).json({ error: 'Failed to get assets' });
  }
});

/**
 * GET /api/assets/stats
 * Get asset statistics
 */
router.get('/stats', authenticate, async (_req: Request, res: Response) => {
  try {
    const stats = getAssetStats();
    return res.json(stats);
  } catch (error) {
    console.error('Error getting asset stats:', error);
    return res.status(500).json({ error: 'Failed to get asset stats' });
  }
});

/**
 * POST /api/assets/discover
 * Trigger asset discovery from logs
 */
router.post('/discover', authenticate, async (req: Request, res: Response) => {
  try {
    const { lookbackHours = 24 } = req.body;

    const result = await discoverAssetsFromLogs(lookbackHours);

    return res.json({
      message: 'Asset discovery completed',
      discovered: result.discovered,
      updated: result.updated,
      errors: result.errors,
    });
  } catch (error) {
    console.error('Error discovering assets:', error);
    return res.status(500).json({ error: 'Failed to discover assets' });
  }
});

/**
 * GET /api/assets/:id
 * Get a specific asset
 */
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const asset = getAssetById(id);

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    // Include related identities
    const identities = getAssetIdentities(id);

    return res.json({
      asset,
      identities,
    });
  } catch (error) {
    console.error('Error getting asset:', error);
    return res.status(500).json({ error: 'Failed to get asset' });
  }
});

/**
 * POST /api/assets
 * Create a new asset
 */
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const input: AssetInput = req.body;

    if (!input.asset_type || !input.identifier) {
      return res.status(400).json({ error: 'asset_type and identifier are required' });
    }

    const asset = createAsset(input);
    return res.status(201).json(asset);
  } catch (error) {
    console.error('Error creating asset:', error);
    if ((error as Error).message?.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Asset with this type and identifier already exists' });
    }
    return res.status(500).json({ error: 'Failed to create asset' });
  }
});

/**
 * PUT /api/assets/:id
 * Update an existing asset
 */
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const input: Partial<AssetInput> = req.body;

    const asset = updateAsset(id, input);

    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    return res.json(asset);
  } catch (error) {
    console.error('Error updating asset:', error);
    return res.status(500).json({ error: 'Failed to update asset' });
  }
});

/**
 * DELETE /api/assets/:id
 * Delete an asset
 */
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = deleteAsset(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    return res.json({ message: 'Asset deleted' });
  } catch (error) {
    console.error('Error deleting asset:', error);
    return res.status(500).json({ error: 'Failed to delete asset' });
  }
});

/**
 * POST /api/assets/import
 * Import assets from CSV (bulk create/update)
 */
router.post('/import', authenticate, async (req: Request, res: Response) => {
  try {
    const { assets } = req.body as { assets: AssetInput[] };

    if (!Array.isArray(assets) || assets.length === 0) {
      return res.status(400).json({ error: 'assets array is required' });
    }

    const results = {
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    for (const input of assets) {
      try {
        if (!input.asset_type || !input.identifier) {
          results.errors.push(`Missing asset_type or identifier for asset`);
          continue;
        }

        const existing = getAssetById(input.identifier);
        if (existing) {
          updateAsset(existing.id, input);
          results.updated++;
        } else {
          createAsset(input);
          results.created++;
        }
      } catch (err) {
        results.errors.push(`Failed to import ${input.identifier}: ${(err as Error).message}`);
      }
    }

    return res.json(results);
  } catch (error) {
    console.error('Error importing assets:', error);
    return res.status(500).json({ error: 'Failed to import assets' });
  }
});

export default router;
