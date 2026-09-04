process.env.SQLITE_PATH = ':memory:';

import { describe, it, expect, beforeEach } from 'vitest';
import { getSQLiteDB } from './sqlite.js';
import { createEventAnnotation, getEventAnnotationsInRange } from './sqlite-event-annotations.js';

describe('getEventAnnotationsInRange', () => {
  beforeEach(() => {
    getSQLiteDB().exec('DELETE FROM event_annotations;');
  });

  it('returns point and span annotations that overlap the window, in order', () => {
    // Inside the window.
    createEventAnnotation({ title: 'deploy', start_ts: '2026-09-03T06:00:00Z' });
    // Before the window — excluded.
    createEventAnnotation({ title: 'old', start_ts: '2026-09-02T06:00:00Z' });
    // A span that starts before the window but ends inside it — overlaps.
    createEventAnnotation({ title: 'maintenance', start_ts: '2026-09-02T23:00:00Z', end_ts: '2026-09-03T01:00:00Z' });
    // After the window — excluded.
    createEventAnnotation({ title: 'future', start_ts: '2026-09-04T00:00:00Z' });

    const results = getEventAnnotationsInRange('2026-09-03T00:00:00Z', '2026-09-03T12:00:00Z');
    expect(results.map((a) => a.title)).toEqual(['maintenance', 'deploy']);
  });
});
