process.env.SQLITE_PATH = ':memory:';

import { describe, it, expect, beforeEach } from 'vitest';
import { getSQLiteDB, createFieldMapping } from '../db/sqlite.js';
import { seedBuiltinCIMModels } from '../data/builtin-cim-models.js';
import { processLog, refreshSourceConfigCache } from './source-processor.js';

/**
 * Roadmap C1: CIM normalization must run at INGEST, persisting canonical ECS
 * field names into structured_data — so `search source.ip=...` works even when
 * the source only emitted `rhost`. Previously normalization only ran on-demand.
 */
describe('processLog CIM normalization', () => {
  beforeEach(() => {
    const db = getSQLiteDB();
    db.exec('DELETE FROM field_mappings; DELETE FROM data_models;');
    seedBuiltinCIMModels();
    createFieldMapping({ source_type: 'sshd', source_field: 'rhost', data_model: 'Authentication', cim_field: 'source.ip', priority: 50, enabled: true });
    createFieldMapping({ source_type: 'nginx', source_field: 'request_time', data_model: 'HTTP_Activity', cim_field: 'event.duration', transform: 'float() * 1000', priority: 50, enabled: true });
    refreshSourceConfigCache();
  });

  it('normalizes mapped source fields into canonical ECS fields in structured_data', () => {
    const out = processLog({
      app_name: 'sshd',
      message: 'Failed password',
      structured_data: JSON.stringify({ source_type: 'sshd', rhost: '1.2.3.4' }),
    });
    const data = JSON.parse(out.structured_data as string);
    expect(data['source.ip']).toBe('1.2.3.4');
    // Raw field is preserved.
    expect(data.rhost).toBe('1.2.3.4');
  });

  it('applies the configured transform during ingest normalization', () => {
    const out = processLog({
      app_name: 'nginx',
      message: 'GET / 200',
      structured_data: JSON.stringify({ source_type: 'nginx', request_time: '0.5' }),
    });
    const data = JSON.parse(out.structured_data as string);
    expect(data['event.duration']).toBe(500);
  });

  it('leaves logs with no matching mappings untouched', () => {
    const out = processLog({
      app_name: 'randomapp',
      message: 'hello',
      structured_data: JSON.stringify({ source_type: 'randomapp', foo: 'bar' }),
    });
    const data = JSON.parse(out.structured_data as string);
    expect(data).toEqual({ source_type: 'randomapp', foo: 'bar' });
  });
});
