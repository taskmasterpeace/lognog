import { Router, Request, Response } from 'express';
import { authenticate, denyReadonly } from '../auth/middleware.js';
import {
  getEventAnnotations,
  getEventAnnotation,
  getEventAnnotationsInRange,
  createEventAnnotation,
  updateEventAnnotation,
  deleteEventAnnotation,
} from '../db/sqlite-event-annotations.js';

/**
 * Event annotations — timeline markers (deployments, incidents, maintenance)
 * to overlay on timecharts. GET with ?earliest&latest returns only the
 * annotations overlapping that window (for a chart's current time range).
 * Reads for any authenticated user; writes blocked for read-only roles.
 */
const router = Router();
router.use(authenticate);

const normalizeTags = (tags: unknown): string | null | undefined => {
  if (tags === undefined) return undefined;
  if (tags === null) return null;
  return Array.isArray(tags) ? tags.join(',') : String(tags);
};

router.get('/', (req: Request, res: Response) => {
  const { earliest, latest } = req.query;
  if (typeof earliest === 'string' && typeof latest === 'string') {
    return res.json(getEventAnnotationsInRange(earliest, latest));
  }
  return res.json(getEventAnnotations());
});

router.get('/:id', (req: Request, res: Response) => {
  const annotation = getEventAnnotation(req.params.id);
  return annotation ? res.json(annotation) : res.status(404).json({ error: 'Annotation not found' });
});

router.post('/', denyReadonly, (req: Request, res: Response) => {
  const { title, start_ts, description, end_ts, color, tags } = req.body || {};
  if (!title || !start_ts) {
    return res.status(400).json({ error: 'title and start_ts are required' });
  }
  return res.status(201).json(
    createEventAnnotation({
      title,
      start_ts,
      description,
      end_ts,
      color,
      tags: normalizeTags(tags) ?? null,
      created_by: req.user?.username ?? null,
    }),
  );
});

router.put('/:id', denyReadonly, (req: Request, res: Response) => {
  const { title, start_ts, description, end_ts, color, tags } = req.body || {};
  const updated = updateEventAnnotation(req.params.id, {
    title,
    start_ts,
    description,
    end_ts,
    color,
    tags: normalizeTags(tags),
  });
  return updated ? res.json(updated) : res.status(404).json({ error: 'Annotation not found' });
});

router.delete('/:id', denyReadonly, (req: Request, res: Response) => {
  return deleteEventAnnotation(req.params.id)
    ? res.json({ success: true })
    : res.status(404).json({ error: 'Annotation not found' });
});

export default router;
