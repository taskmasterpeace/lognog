// Use an isolated in-memory DB for this file (set before any getSQLiteDB call).
process.env.SQLITE_PATH = ':memory:';

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getSQLiteDB,
  createDataModel,
  getDataModel,
  createFieldMapping,
  getFieldMappings,
} from '../db/sqlite.js';
import { migrateBuiltinCIMModelsToOCSF } from './builtin-cim-models.js';

/**
 * Roadmap item C2: migrating an already-seeded install (prod shipped the
 * Splunk-mirroring built-ins) must replace the stale models AND repoint every
 * existing field_mapping to the new ECS/OCSF names, dropping nothing.
 */
describe('migrateBuiltinCIMModelsToOCSF', () => {
  beforeEach(() => {
    const db = getSQLiteDB();
    db.exec('DELETE FROM field_mappings; DELETE FROM data_models;');

    // Simulate a legacy install: old Splunk-style built-ins.
    createDataModel({
      name: 'Authentication',
      description: 'legacy',
      category: 'authentication',
      fields: [
        { name: 'user', type: 'string', aliases: ['username'] },
        { name: 'src', type: 'ip', aliases: ['src_ip'] },
      ],
      constraints: [],
      is_builtin: true,
      enabled: true,
    });
    createDataModel({
      name: 'Web',
      description: 'legacy',
      category: 'web',
      fields: [{ name: 'uri', type: 'string', aliases: ['url'] }],
      constraints: [],
      is_builtin: true,
      enabled: true,
    });
    createDataModel({
      name: 'Network_Traffic',
      description: 'legacy',
      category: 'network',
      fields: [{ name: 'src_ip', type: 'ip', aliases: [] }],
      constraints: [],
      is_builtin: true,
      enabled: true,
    });

    // Existing user mappings pointing at the legacy taxonomy.
    createFieldMapping({ source_type: 'sshd', source_field: 'user', data_model: 'Authentication', cim_field: 'user', priority: 50, enabled: true });
    createFieldMapping({ source_type: 'nginx', source_field: 'request_uri', data_model: 'Web', cim_field: 'uri', priority: 50, enabled: true });
  });

  it('removes the legacy Splunk-named built-ins', () => {
    migrateBuiltinCIMModelsToOCSF();
    expect(getDataModel('Network_Traffic')).toBeNull();
    expect(getDataModel('Endpoint')).toBeNull();
    expect(getDataModel('Web')).toBeNull();
  });

  it('seeds the new OCSF-aligned built-ins', () => {
    migrateBuiltinCIMModelsToOCSF();
    expect(getDataModel('Network_Activity')?.is_builtin).toBe(true);
    expect(getDataModel('HTTP_Activity')?.is_builtin).toBe(true);
    expect(getDataModel('System_Activity')?.is_builtin).toBe(true);
  });

  it('replaces the legacy Authentication model with ECS field names', () => {
    migrateBuiltinCIMModelsToOCSF();
    const auth = getDataModel('Authentication');
    expect(auth?.is_builtin).toBe(true);
    const names = auth!.fields.map((f) => f.name);
    expect(names).toContain('user.name');
    expect(names).not.toContain('user');
  });

  it('repoints existing field_mappings to the new model + canonical field', () => {
    migrateBuiltinCIMModelsToOCSF();
    const mappings = getFieldMappings();

    const ssh = mappings.find((m) => m.source_type === 'sshd' && m.source_field === 'user');
    expect(ssh?.data_model).toBe('Authentication');
    expect(ssh?.cim_field).toBe('user.name');

    const web = mappings.find((m) => m.source_type === 'nginx' && m.source_field === 'request_uri');
    expect(web?.data_model).toBe('HTTP_Activity');
    expect(web?.cim_field).toBe('url.path');
  });
});
