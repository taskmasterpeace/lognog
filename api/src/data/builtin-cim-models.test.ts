import { describe, it, expect } from 'vitest';
import { BUILTIN_CIM_MODELS, DEFAULT_FIELD_MAPPINGS, OCSF_CLASS_MAP, LEGACY_MIGRATIONS } from './builtin-cim-models.js';

/**
 * Legal realignment (roadmap items L1/L2): the shipped CIM must be rebased on
 * Elastic Common Schema (ECS) canonical field names + OCSF event classes, with
 * Splunk-style names demoted to input aliases only. These tests pin that so the
 * Splunk-mirroring taxonomy can never silently return.
 */

// Splunk-CIM-specific flat field names that must NOT be canonical (aliases only).
const SPLUNK_FLAT_NAMES = new Set([
  'src', 'dest', 'src_ip', 'dest_ip', 'src_port', 'dest_port',
  'uri', 'uri_query', 'bytes_in', 'bytes_out', 'command_line',
  'file_hash', 'file_path', 'http_host', 'process_id', 'parent_process',
]);

// Splunk-CIM model names we must not ship verbatim.
const SPLUNK_MODEL_NAMES = new Set(['Network_Traffic', 'Endpoint', 'Web']);

describe('built-in CIM models rebased on ECS/OCSF', () => {
  it('ships none of the Splunk-CIM model names', () => {
    const names = BUILTIN_CIM_MODELS.map((m) => m.name);
    for (const splunk of SPLUNK_MODEL_NAMES) {
      expect(names).not.toContain(splunk);
    }
  });

  it('uses ECS dotted canonical field names, never Splunk flat names', () => {
    for (const model of BUILTIN_CIM_MODELS) {
      for (const field of model.fields) {
        expect(
          SPLUNK_FLAT_NAMES.has(field.name),
          `${model.name}.${field.name} is a Splunk flat name; it must be an alias, not canonical`,
        ).toBe(false);
      }
    }
  });

  it('keeps Splunk-style names as input aliases so normalization still resolves them', () => {
    const auth = BUILTIN_CIM_MODELS.find((m) => m.name === 'Authentication');
    expect(auth, 'Authentication model must exist').toBeDefined();

    const srcIp = auth!.fields.find((f) => f.name === 'source.ip');
    expect(srcIp, 'Authentication must expose canonical source.ip').toBeDefined();
    expect(srcIp!.aliases).toContain('src');
    expect(srcIp!.aliases).toContain('src_ip');

    const userName = auth!.fields.find((f) => f.name === 'user.name');
    expect(userName?.aliases).toContain('user');

    expect(auth!.fields.find((f) => f.name === 'event.outcome')).toBeDefined();
  });

  it('maps every built-in model to an OCSF class uid', () => {
    for (const model of BUILTIN_CIM_MODELS) {
      expect(OCSF_CLASS_MAP[model.name], `${model.name} needs an OCSF class uid`).toBeTypeOf('number');
    }
  });

  it('every legacy field-rename target is a real canonical field in its new model', () => {
    const byName = new Map(
      BUILTIN_CIM_MODELS.map((m) => [m.name, new Set(m.fields.map((f) => f.name))]),
    );
    for (const { newName, fieldRenames } of LEGACY_MIGRATIONS) {
      const model = byName.get(newName);
      expect(model, `migration targets unknown model ${newName}`).toBeDefined();
      for (const target of Object.values(fieldRenames)) {
        expect(model!.has(target), `rename target ${newName}.${target} is not a canonical field`).toBe(true);
      }
    }
  });

  it('DEFAULT_FIELD_MAPPINGS reference only existing models and their canonical fields', () => {
    const byName = new Map(
      BUILTIN_CIM_MODELS.map((m) => [m.name, new Set(m.fields.map((f) => f.name))]),
    );
    for (const mapping of DEFAULT_FIELD_MAPPINGS) {
      const model = byName.get(mapping.data_model);
      expect(model, `mapping references unknown model ${mapping.data_model}`).toBeDefined();
      expect(
        model!.has(mapping.cim_field),
        `mapping ${mapping.data_model}.${mapping.cim_field} is not a canonical field name`,
      ).toBe(true);
    }
  });
});
