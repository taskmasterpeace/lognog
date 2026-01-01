/**
 * Onboarding API Routes
 *
 * Endpoints for managing user onboarding wizard state.
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/middleware.js';
import {
  getOnboardingStatus,
  completeOnboarding,
  resetOnboarding,
} from '../db/sqlite.js';

const router = Router();

// GET /api/onboarding/status - Check if user has completed onboarding
router.get('/status', authenticate, (req: Request, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const status = getOnboardingStatus(userId);
    return res.json(status);
  } catch (error) {
    console.error('Error getting onboarding status:', error);
    return res.status(500).json({ error: 'Failed to get onboarding status' });
  }
});

// POST /api/onboarding/complete - Mark onboarding as complete
router.post('/complete', authenticate, (req: Request, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const status = completeOnboarding(userId);
    return res.json(status);
  } catch (error) {
    console.error('Error completing onboarding:', error);
    return res.status(500).json({ error: 'Failed to complete onboarding' });
  }
});

// POST /api/onboarding/reset - Reset onboarding (for testing/settings)
router.post('/reset', authenticate, (req: Request, res: Response) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const status = resetOnboarding(userId);
    return res.json(status);
  } catch (error) {
    console.error('Error resetting onboarding:', error);
    return res.status(500).json({ error: 'Failed to reset onboarding' });
  }
});

export default router;
