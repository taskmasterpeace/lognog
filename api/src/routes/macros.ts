import { Router, Request, Response } from 'express';
import { authenticate, denyReadonly } from '../auth/middleware.js';
import {
  getMacros,
  getMacro,
  getMacroByName,
  createMacro,
  updateMacro,
  deleteMacro,
} from '../db/sqlite-macros.js';

/**
 * Search macros CRUD. Reusable named DSL fragments, referenced in a query as
 * `name` and expanded before compilation (see services/macros.ts). Reads for any
 * authenticated user; writes blocked for read-only roles.
 */
const router = Router();
router.use(authenticate);

const NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_.-]*$/;

router.get('/', (_req: Request, res: Response) => {
  res.json(getMacros());
});

router.get('/:id', (req: Request, res: Response) => {
  const macro = getMacro(req.params.id);
  return macro ? res.json(macro) : res.status(404).json({ error: 'Macro not found' });
});

router.post('/', denyReadonly, (req: Request, res: Response) => {
  const { name, definition, description } = req.body || {};
  if (!name || !definition) {
    return res.status(400).json({ error: 'name and definition are required' });
  }
  if (!NAME_RE.test(name)) {
    return res.status(400).json({ error: 'Invalid macro name (letters, digits, _ . - ; must start with a letter or _)' });
  }
  if (getMacroByName(name)) {
    return res.status(409).json({ error: 'A macro with that name already exists' });
  }
  return res.status(201).json(createMacro({ name, definition, description }));
});

router.put('/:id', denyReadonly, (req: Request, res: Response) => {
  const { name, definition, description } = req.body || {};
  if (name !== undefined && !NAME_RE.test(name)) {
    return res.status(400).json({ error: 'Invalid macro name' });
  }
  const updated = updateMacro(req.params.id, { name, definition, description });
  return updated ? res.json(updated) : res.status(404).json({ error: 'Macro not found' });
});

router.delete('/:id', denyReadonly, (req: Request, res: Response) => {
  return deleteMacro(req.params.id)
    ? res.json({ success: true })
    : res.status(404).json({ error: 'Macro not found' });
});

export default router;
