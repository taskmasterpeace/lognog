/**
 * GeoIP API Routes
 *
 * Geographic IP lookup endpoints using MaxMind GeoLite2.
 */

import { Router, Request, Response } from 'express';
import { getGeoIPService } from '../services/geoip.js';

const router = Router();

// Get GeoIP service status
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const service = await getGeoIPService();
    const status = service.getStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting GeoIP status:', error);
    res.status(500).json({ error: 'Failed to get GeoIP status' });
  }
});

// Lookup single IP address
router.get('/lookup/:ip', async (req: Request, res: Response) => {
  try {
    const { ip } = req.params;

    // Basic IP validation
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipPattern.test(ip)) {
      return res.status(400).json({ error: 'Invalid IP address format' });
    }

    const service = await getGeoIPService();

    if (!service.isAvailable()) {
      return res.status(503).json({
        error: 'GeoIP service not available',
        message: 'MaxMind databases not found. Please configure GeoIP databases.',
      });
    }

    const result = service.lookup(ip);

    if (!result) {
      return res.status(404).json({
        error: 'No data found for this IP address',
        ip,
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Error looking up IP:', error);
    res.status(500).json({ error: 'Failed to lookup IP address' });
  }
});

// Batch lookup multiple IPs
router.post('/lookup', async (req: Request, res: Response) => {
  try {
    const { ips } = req.body;

    if (!Array.isArray(ips)) {
      return res.status(400).json({ error: 'ips must be an array' });
    }

    if (ips.length === 0) {
      return res.json({ results: {} });
    }

    if (ips.length > 1000) {
      return res.status(400).json({ error: 'Maximum 1000 IPs per batch request' });
    }

    // Validate all IPs
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    const invalidIps = ips.filter(ip => !ipPattern.test(ip));
    if (invalidIps.length > 0) {
      return res.status(400).json({
        error: 'Invalid IP addresses',
        invalid_ips: invalidIps.slice(0, 10), // Return first 10 invalid IPs
      });
    }

    const service = await getGeoIPService();

    if (!service.isAvailable()) {
      return res.status(503).json({
        error: 'GeoIP service not available',
        message: 'MaxMind databases not found. Please configure GeoIP databases.',
      });
    }

    const results = service.batchLookup(ips);

    // Convert Map to object for JSON response
    const resultsObj: Record<string, any> = {};
    results.forEach((value, key) => {
      resultsObj[key] = value;
    });

    res.json({
      count: results.size,
      results: resultsObj,
    });
  } catch (error) {
    console.error('Error batch looking up IPs:', error);
    res.status(500).json({ error: 'Failed to batch lookup IP addresses' });
  }
});

// Get cache statistics
router.get('/cache/stats', async (_req: Request, res: Response) => {
  try {
    const service = await getGeoIPService();
    const stats = service.getCacheStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting cache stats:', error);
    res.status(500).json({ error: 'Failed to get cache statistics' });
  }
});

// Clear cache
router.post('/cache/clear', async (_req: Request, res: Response) => {
  try {
    const service = await getGeoIPService();
    service.clearCache();
    res.json({ message: 'Cache cleared successfully' });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

export default router;
