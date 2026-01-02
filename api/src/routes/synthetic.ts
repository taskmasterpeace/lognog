/**
 * Synthetic Monitoring API Routes
 *
 * CRUD operations for synthetic tests and results.
 */

import { Router, Request, Response } from 'express';
import {
  getSyntheticTests,
  getSyntheticTestById,
  createSyntheticTest,
  updateSyntheticTest,
  deleteSyntheticTest,
  getSyntheticResults,
  getSyntheticUptime,
  getSyntheticDashboard,
  type SyntheticTestType,
} from '../db/sqlite.js';
import {
  runTestNow,
  getSchedulerStatus,
  scheduleTest,
  unscheduleTest,
  refreshScheduler,
} from '../services/synthetic/index.js';

const router = Router();

// Get all tests
router.get('/tests', (req: Request, res: Response) => {
  try {
    const enabled =
      req.query.enabled !== undefined
        ? req.query.enabled === 'true'
        : undefined;
    const testType = req.query.type as SyntheticTestType | undefined;

    const tests = getSyntheticTests({ enabled, test_type: testType });

    // Parse JSON fields
    const testsWithParsed = tests.map((test) => ({
      ...test,
      config: JSON.parse(test.config || '{}'),
      tags: JSON.parse(test.tags || '[]'),
    }));

    res.json(testsWithParsed);
  } catch (error) {
    console.error('Error getting synthetic tests:', error);
    res.status(500).json({ error: 'Failed to get synthetic tests' });
  }
});

// Get single test
router.get('/tests/:id', (req: Request, res: Response) => {
  try {
    const test = getSyntheticTestById(req.params.id);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    res.json({
      ...test,
      config: JSON.parse(test.config || '{}'),
      tags: JSON.parse(test.tags || '[]'),
    });
  } catch (error) {
    console.error('Error getting synthetic test:', error);
    res.status(500).json({ error: 'Failed to get synthetic test' });
  }
});

// Create test
router.post('/tests', (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      test_type,
      config,
      schedule,
      timeout_ms,
      enabled,
      tags,
      alert_after_failures,
    } = req.body;

    if (!name || !test_type) {
      return res.status(400).json({ error: 'Name and test_type are required' });
    }

    const test = createSyntheticTest({
      name,
      description,
      test_type,
      config,
      schedule,
      timeout_ms,
      enabled,
      tags,
      alert_after_failures,
    });

    // Schedule if enabled
    if (test.enabled) {
      try {
        scheduleTest(test.id, test.schedule);
      } catch (schedError) {
        console.error('Failed to schedule test:', schedError);
      }
    }

    res.status(201).json({
      ...test,
      config: JSON.parse(test.config || '{}'),
      tags: JSON.parse(test.tags || '[]'),
    });
  } catch (error) {
    console.error('Error creating synthetic test:', error);
    res.status(500).json({ error: 'Failed to create synthetic test' });
  }
});

// Update test
router.put('/tests/:id', (req: Request, res: Response) => {
  try {
    const existing = getSyntheticTestById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Test not found' });
    }

    const {
      name,
      description,
      test_type,
      config,
      schedule,
      timeout_ms,
      enabled,
      tags,
      alert_after_failures,
    } = req.body;

    const test = updateSyntheticTest(req.params.id, {
      name,
      description,
      test_type,
      config,
      schedule,
      timeout_ms,
      enabled,
      tags,
      alert_after_failures,
    });

    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    // Update scheduler
    if (test.enabled) {
      try {
        scheduleTest(test.id, test.schedule);
      } catch (schedError) {
        console.error('Failed to schedule test:', schedError);
      }
    } else {
      unscheduleTest(test.id);
    }

    res.json({
      ...test,
      config: JSON.parse(test.config || '{}'),
      tags: JSON.parse(test.tags || '[]'),
    });
  } catch (error) {
    console.error('Error updating synthetic test:', error);
    res.status(500).json({ error: 'Failed to update synthetic test' });
  }
});

// Delete test
router.delete('/tests/:id', (req: Request, res: Response) => {
  try {
    // Unschedule first
    unscheduleTest(req.params.id);

    const deleted = deleteSyntheticTest(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Test not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting synthetic test:', error);
    res.status(500).json({ error: 'Failed to delete synthetic test' });
  }
});

// Toggle test enabled/disabled
router.post('/tests/:id/toggle', (req: Request, res: Response) => {
  try {
    const existing = getSyntheticTestById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Test not found' });
    }

    const test = updateSyntheticTest(req.params.id, {
      enabled: !existing.enabled,
    });

    // Update scheduler
    if (test?.enabled) {
      try {
        scheduleTest(test.id, test.schedule);
      } catch (schedError) {
        console.error('Failed to schedule test:', schedError);
      }
    } else if (test) {
      unscheduleTest(test.id);
    }

    res.json({
      ...test,
      config: JSON.parse(test?.config || '{}'),
      tags: JSON.parse(test?.tags || '[]'),
    });
  } catch (error) {
    console.error('Error toggling synthetic test:', error);
    res.status(500).json({ error: 'Failed to toggle synthetic test' });
  }
});

// Run test immediately (manual trigger)
router.post('/tests/:id/run', async (req: Request, res: Response) => {
  try {
    const existing = getSyntheticTestById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Test not found' });
    }

    const result = await runTestNow(req.params.id);
    res.json(result);
  } catch (error) {
    console.error('Error running synthetic test:', error);
    res.status(500).json({ error: 'Failed to run synthetic test' });
  }
});

// Get results for a test
router.get('/tests/:id/results', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 100;
    const results = getSyntheticResults({ test_id: req.params.id, limit });

    // Parse JSON fields
    const resultsWithParsed = results.map((r) => ({
      ...r,
      metadata: JSON.parse(r.metadata || '{}'),
    }));

    res.json(resultsWithParsed);
  } catch (error) {
    console.error('Error getting synthetic results:', error);
    res.status(500).json({ error: 'Failed to get synthetic results' });
  }
});

// Get uptime for a test
router.get('/tests/:id/uptime', (req: Request, res: Response) => {
  try {
    const hours = parseInt(req.query.hours as string, 10) || 24;
    const uptime = getSyntheticUptime(req.params.id, hours);
    res.json(uptime);
  } catch (error) {
    console.error('Error getting synthetic uptime:', error);
    res.status(500).json({ error: 'Failed to get synthetic uptime' });
  }
});

// Get all results (across all tests)
router.get('/results', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 100;
    const results = getSyntheticResults({ limit });

    // Parse JSON fields
    const resultsWithParsed = results.map((r) => ({
      ...r,
      metadata: JSON.parse(r.metadata || '{}'),
    }));

    res.json(resultsWithParsed);
  } catch (error) {
    console.error('Error getting synthetic results:', error);
    res.status(500).json({ error: 'Failed to get synthetic results' });
  }
});

// Get dashboard summary
router.get('/dashboard', (_req: Request, res: Response) => {
  try {
    const dashboard = getSyntheticDashboard();
    res.json(dashboard);
  } catch (error) {
    console.error('Error getting synthetic dashboard:', error);
    res.status(500).json({ error: 'Failed to get synthetic dashboard' });
  }
});

// Get scheduler status
router.get('/scheduler/status', (_req: Request, res: Response) => {
  try {
    const status = getSchedulerStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting scheduler status:', error);
    res.status(500).json({ error: 'Failed to get scheduler status' });
  }
});

// Refresh scheduler (reload tests from database)
router.post('/scheduler/refresh', (_req: Request, res: Response) => {
  try {
    refreshScheduler();
    const status = getSchedulerStatus();
    res.json({ success: true, ...status });
  } catch (error) {
    console.error('Error refreshing scheduler:', error);
    res.status(500).json({ error: 'Failed to refresh scheduler' });
  }
});

export default router;
