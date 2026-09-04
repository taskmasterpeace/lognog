import { describe, it, expect } from 'vitest';
import { buildAIContext } from './ai-context.js';

/**
 * "Make it easy for an AI to read": a single machine-readable description of how
 * to query THIS LogNog instance — DSL commands, the canonical CIM field
 * taxonomy, available macros, and the ATT&CK detections — so an agent can
 * self-orient without scraping the UI.
 */
describe('buildAIContext', () => {
  const macros = [{ name: 'errors', definition: 'severity<=3', description: null }];

  it('lists the DSL commands an agent can use', () => {
    const ctx = buildAIContext(macros);
    expect(ctx.query_language.commands).toContain('stats');
    expect(ctx.query_language.commands).toContain('timechart');
    expect(ctx.query_language.examples.length).toBeGreaterThan(0);
  });

  it('exposes the canonical CIM fields with a flat index for quick lookup', () => {
    const ctx = buildAIContext(macros);
    const auth = ctx.cim.models.find((m) => m.name === 'Authentication');
    expect(auth).toBeDefined();
    expect(auth!.ocsf_class).toBe(3002);
    expect(auth!.fields.some((f) => f.name === 'source.ip')).toBe(true);
    // Flat index makes "is this field queryable?" a one-line check for an agent.
    expect(ctx.cim.field_index).toContain('source.ip');
    expect(ctx.cim.field_index).toContain('user.name');
  });

  it('includes the caller-supplied macros', () => {
    const ctx = buildAIContext(macros);
    expect(ctx.macros).toEqual([{ name: 'errors', definition: 'severity<=3' }]);
  });

  it('includes the ATT&CK detections and required attribution', () => {
    const ctx = buildAIContext(macros);
    expect(ctx.detections.length).toBeGreaterThanOrEqual(10);
    expect(ctx.detections[0]).toHaveProperty('attack_technique');
    expect(ctx.attack_attribution).toContain('MITRE');
  });
});
