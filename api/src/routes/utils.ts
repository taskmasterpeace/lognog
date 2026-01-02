import { Router } from 'express';
import { z } from 'zod';
import {
  classifyIP,
  classifyIPs,
  isValidIPv4,
  type IPClassification,
} from '../services/ip-classifier.js';
import { rateLimit } from '../auth/middleware.js';

const router = Router();

// Validation schema for single IP
const classifyIPSchema = z.object({
  ip: z.string().min(1),
});

// Validation schema for batch IPs
const classifyIPsSchema = z.object({
  ips: z.array(z.string()).min(1).max(1000), // Limit to 1000 IPs per request
});

/**
 * GET /utils/classify-ip
 * Classify a single IP address
 *
 * Query params:
 *   - ip: IP address to classify
 *
 * Example: GET /utils/classify-ip?ip=192.168.1.1
 */
router.get('/classify-ip', (req, res) => {
  try {
    const { ip } = req.query;

    if (!ip || typeof ip !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid IP address',
        message: 'Please provide an IP address via the "ip" query parameter',
      });
    }

    // Validate IP format
    if (!isValidIPv4(ip)) {
      return res.status(400).json({
        error: 'Invalid IP address',
        message: 'The provided value is not a valid IPv4 address',
      });
    }

    const classification = classifyIP(ip);

    res.json({
      success: true,
      classification,
    });
  } catch (error) {
    console.error('Error classifying IP:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to classify IP address',
    });
  }
});

/**
 * POST /utils/classify-ip
 * Classify a single IP address (alternative POST method)
 *
 * Body:
 *   - ip: IP address to classify
 */
router.post('/classify-ip', (req, res) => {
  try {
    const parseResult = classifyIPSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid request',
        message: parseResult.error.errors,
      });
    }

    const { ip } = parseResult.data;

    if (!isValidIPv4(ip)) {
      return res.status(400).json({
        error: 'Invalid IP address',
        message: 'The provided value is not a valid IPv4 address',
      });
    }

    const classification = classifyIP(ip);

    res.json({
      success: true,
      classification,
    });
  } catch (error) {
    console.error('Error classifying IP:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to classify IP address',
    });
  }
});

/**
 * POST /utils/classify-ips
 * Classify multiple IP addresses in batch (rate limited: 30/min)
 *
 * Body:
 *   - ips: Array of IP addresses to classify
 *
 * Returns a map of IP -> classification
 */
router.post('/classify-ips', rateLimit(30, 60000), (req, res) => {
  try {
    const parseResult = classifyIPsSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid request',
        message: parseResult.error.errors,
      });
    }

    const { ips } = parseResult.data;

    // Classify all IPs (deduplication happens in classifyIPs)
    const results = classifyIPs(ips);

    // Convert Map to object for JSON serialization
    const classificationsObj: Record<string, IPClassification> = {};
    results.forEach((classification, ip) => {
      classificationsObj[ip] = classification;
    });

    res.json({
      success: true,
      count: results.size,
      classifications: classificationsObj,
    });
  } catch (error) {
    console.error('Error classifying IPs:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to classify IP addresses',
    });
  }
});

/**
 * GET /utils/ip-info
 * Get comprehensive information about an IP address
 * (Combines classification with any additional metadata)
 */
router.get('/ip-info', (req, res) => {
  try {
    const { ip } = req.query;

    if (!ip || typeof ip !== 'string') {
      return res.status(400).json({
        error: 'Missing or invalid IP address',
        message: 'Please provide an IP address via the "ip" query parameter',
      });
    }

    if (!isValidIPv4(ip)) {
      return res.status(400).json({
        error: 'Invalid IP address',
        message: 'The provided value is not a valid IPv4 address',
      });
    }

    const classification = classifyIP(ip);

    // Additional metadata could be added here in the future
    // (e.g., GeoIP, threat intelligence, WHOIS, etc.)
    const info = {
      ip,
      valid: true,
      classification,
      // Future enhancements:
      // geolocation: null,  // From Phase 5 (GeoIP)
      // threat_intel: null, // From threat feeds
      // whois: null,        // WHOIS data
    };

    res.json({
      success: true,
      info,
    });
  } catch (error) {
    console.error('Error getting IP info:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get IP info',
    });
  }
});

export default router;
