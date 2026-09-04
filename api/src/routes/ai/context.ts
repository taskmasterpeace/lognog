import { Router, Request, Response } from 'express';
import { authenticate } from '../../auth/middleware.js';
import { buildAIContext } from '../../services/ai-context.js';
import { getMacros } from '../../db/sqlite-macros.js';

/**
 * GET /ai/context — a machine-readable description of how to query this LogNog
 * instance (DSL, canonical CIM fields, macros, ATT&CK detections). Lets an AI
 * agent self-orient. Authenticated: an agent that can query already has a token.
 */
const router = Router();

router.get('/context', authenticate, (_req: Request, res: Response) => {
  try {
    const macros = getMacros().map((m) => ({
      name: m.name,
      definition: m.definition,
      description: m.description,
    }));
    res.json(buildAIContext(macros));
  } catch (error) {
    console.error('Error building AI context:', error);
    res.status(500).json({ error: 'Failed to build AI context' });
  }
});

export default router;
