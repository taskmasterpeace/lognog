import { Router, Request, Response } from 'express';
import { authenticate } from '../auth/middleware.js';
import {
  ATTACK_TACTICS,
  ATTACK_TECHNIQUES,
  DETECTION_TEMPLATES,
  ATTACK_ATTRIBUTION,
  computeAttackCoverage,
} from '../data/attack-content.js';

/**
 * MITRE ATT&CK detection content (reference data). Reads only; available to any
 * authenticated user. See docs/NOTICE and ATTACK_ATTRIBUTION for terms.
 */
const router = Router();
router.use(authenticate);

router.get('/attribution', (_req: Request, res: Response) => {
  res.json({ attribution: ATTACK_ATTRIBUTION });
});

router.get('/tactics', (_req: Request, res: Response) => {
  res.json(ATTACK_TACTICS);
});

router.get('/techniques', (_req: Request, res: Response) => {
  res.json(
    ATTACK_TECHNIQUES.map((t) => ({
      ...t,
      detections: DETECTION_TEMPLATES.filter((d) => d.attack_technique === t.id).map((d) => d.id),
    })),
  );
});

router.get('/detections', (_req: Request, res: Response) => {
  res.json(DETECTION_TEMPLATES);
});

router.get('/coverage', (_req: Request, res: Response) => {
  res.json(computeAttackCoverage());
});

export default router;
