import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getSQLiteDB } from '../db/sqlite.js';
import { executeQuery } from '../db/clickhouse.js';

const router = Router();

interface RetentionSetting {
  id: string;
  index_name: string;
  retention_days: number;
  created_at: string;
  updated_at: string;
}

// Get all retention settings
router.get('/', async (_req: Request, res: Response) => {
  try {
    const db = getSQLiteDB();
    const settings = db.prepare(`
      SELECT * FROM index_retention_settings ORDER BY index_name
    `).all() as RetentionSetting[];

    return res.json(settings);
  } catch (error) {
    console.error('Error fetching retention settings:', error);
    return res.status(500).json({ error: 'Failed to fetch retention settings' });
  }
});

// Get retention setting for a specific index
router.get('/:indexName', async (req: Request, res: Response) => {
  try {
    const { indexName } = req.params;
    const db = getSQLiteDB();

    const setting = db.prepare(`
      SELECT * FROM index_retention_settings WHERE index_name = ?
    `).get(indexName) as RetentionSetting | undefined;

    if (!setting) {
      // Return default if no custom setting exists
      return res.json({
        index_name: indexName,
        retention_days: 90, // Default retention
        is_default: true,
      });
    }

    return res.json(setting);
  } catch (error) {
    console.error('Error fetching retention setting:', error);
    return res.status(500).json({ error: 'Failed to fetch retention setting' });
  }
});

// Create or update retention setting for an index
router.put('/:indexName', async (req: Request, res: Response) => {
  try {
    const { indexName } = req.params;
    const { retention_days } = req.body;

    // Validate retention days (1-365)
    if (!retention_days || retention_days < 1 || retention_days > 365) {
      return res.status(400).json({ error: 'Retention days must be between 1 and 365' });
    }

    // Validate index name format
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(indexName)) {
      return res.status(400).json({ error: 'Invalid index name format' });
    }

    const db = getSQLiteDB();
    const now = new Date().toISOString();

    // Check if setting exists
    const existing = db.prepare(`
      SELECT id FROM index_retention_settings WHERE index_name = ?
    `).get(indexName) as { id: string } | undefined;

    let setting: RetentionSetting;

    if (existing) {
      // Update existing setting
      db.prepare(`
        UPDATE index_retention_settings
        SET retention_days = ?, updated_at = ?
        WHERE index_name = ?
      `).run(retention_days, now, indexName);

      setting = db.prepare(`
        SELECT * FROM index_retention_settings WHERE index_name = ?
      `).get(indexName) as RetentionSetting;
    } else {
      // Create new setting
      const id = uuidv4();
      db.prepare(`
        INSERT INTO index_retention_settings (id, index_name, retention_days, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, indexName, retention_days, now, now);

      setting = db.prepare(`
        SELECT * FROM index_retention_settings WHERE id = ?
      `).get(id) as RetentionSetting;
    }

    return res.json(setting);
  } catch (error) {
    console.error('Error updating retention setting:', error);
    return res.status(500).json({ error: 'Failed to update retention setting' });
  }
});

// Delete retention setting (revert to default)
router.delete('/:indexName', async (req: Request, res: Response) => {
  try {
    const { indexName } = req.params;
    const db = getSQLiteDB();

    db.prepare(`
      DELETE FROM index_retention_settings WHERE index_name = ?
    `).run(indexName);

    return res.json({ success: true, message: 'Retention setting deleted, using default (90 days)' });
  } catch (error) {
    console.error('Error deleting retention setting:', error);
    return res.status(500).json({ error: 'Failed to delete retention setting' });
  }
});

// Trigger manual cleanup for all indexes based on their retention settings
router.post('/cleanup', async (_req: Request, res: Response) => {
  try {
    const db = getSQLiteDB();
    const settings = db.prepare(`
      SELECT index_name, retention_days FROM index_retention_settings
    `).all() as Array<{ index_name: string; retention_days: number }>;

    let totalDeleted = 0;

    // Get all unique indexes from ClickHouse
    const indexes = await executeQuery<{ index_name: string }>(`
      SELECT DISTINCT index_name FROM lognog.logs
    `);

    for (const idx of indexes) {
      // Find retention for this index (custom or default 90 days)
      const customSetting = settings.find(s => s.index_name === idx.index_name);
      const retentionDays = customSetting?.retention_days || 90;

      // Delete old data for this index
      // Note: This is a soft delete that will be cleaned up by ClickHouse's TTL
      // In production, you might want to use ALTER TABLE ... DELETE
      try {
        await executeQuery(`
          ALTER TABLE lognog.logs DELETE
          WHERE index_name = '${idx.index_name}'
            AND timestamp < now() - INTERVAL ${retentionDays} DAY
        `);

        // ClickHouse doesn't return affected row count easily for mutations
        // We'll just count it as processed
        totalDeleted++;
      } catch (deleteError) {
        console.error(`Error cleaning up index ${idx.index_name}:`, deleteError);
      }
    }

    return res.json({
      success: true,
      message: `Cleanup triggered for ${indexes.length} indexes`,
      indexes_processed: indexes.length,
    });
  } catch (error) {
    console.error('Error during retention cleanup:', error);
    return res.status(500).json({ error: 'Failed to trigger cleanup' });
  }
});

export default router;
