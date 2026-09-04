import { describe, it, expect } from 'vitest';
import {
  ATTACK_TACTICS,
  ATTACK_TECHNIQUES,
  DETECTION_TEMPLATES,
  ATTACK_ATTRIBUTION,
  computeAttackCoverage,
} from './attack-content.js';

/**
 * Roadmap items A1/A2/D1: MITRE ATT&CK catalog + detection content.
 * ATT&CK is free to use with attribution — these tests pin catalog integrity
 * and that every shipped detection maps to a real technique.
 */
describe('MITRE ATT&CK catalog', () => {
  it('uses valid, unique technique IDs', () => {
    const ids = ATTACK_TECHNIQUES.map((t) => t.id);
    for (const id of ids) {
      expect(id, `${id} is not a valid ATT&CK technique id`).toMatch(/^T\d{4}(\.\d{3})?$/);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('maps every technique to a known tactic', () => {
    const tacticNames = new Set(ATTACK_TACTICS.map((t) => t.name));
    for (const technique of ATTACK_TECHNIQUES) {
      expect(tacticNames.has(technique.tactic), `${technique.id} tactic "${technique.tactic}" is unknown`).toBe(true);
    }
  });

  it('carries the required MITRE attribution', () => {
    expect(ATTACK_ATTRIBUTION).toContain('MITRE');
    expect(ATTACK_ATTRIBUTION.toLowerCase()).toContain('permission');
  });
});

describe('detection templates', () => {
  it('ships a starter catalog of at least 10 detections', () => {
    expect(DETECTION_TEMPLATES.length).toBeGreaterThanOrEqual(10);
  });

  it('maps every detection to a real ATT&CK technique', () => {
    const known = new Set(ATTACK_TECHNIQUES.map((t) => t.id));
    for (const d of DETECTION_TEMPLATES) {
      expect(known.has(d.attack_technique), `detection "${d.id}" references unknown technique ${d.attack_technique}`).toBe(true);
    }
  });

  it('has runnable DSL and a numeric threshold on each detection', () => {
    for (const d of DETECTION_TEMPLATES) {
      expect(d.search_query.startsWith('search'), `${d.id} query must start with 'search'`).toBe(true);
      expect(typeof d.trigger_threshold).toBe('number');
      expect(d.category).toBe('security');
    }
  });

  it('uses unique detection IDs', () => {
    const ids = DETECTION_TEMPLATES.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('computeAttackCoverage', () => {
  it('groups techniques by tactic and marks the ones a detection covers', () => {
    const coverage = computeAttackCoverage();
    // Every tactic that owns a technique appears.
    const credAccess = coverage.tactics.find((t) => t.name === 'Credential Access');
    expect(credAccess).toBeDefined();
    const bruteForce = credAccess!.techniques.find((t) => t.id === 'T1110');
    expect(bruteForce?.covered).toBe(true);
    expect(bruteForce!.detection_count).toBeGreaterThanOrEqual(1);
  });

  it('summarizes covered vs total techniques and carries attribution', () => {
    const coverage = computeAttackCoverage();
    expect(coverage.summary.techniques_total).toBe(ATTACK_TECHNIQUES.length);
    expect(coverage.summary.techniques_covered).toBeGreaterThan(0);
    expect(coverage.summary.techniques_covered).toBeLessThanOrEqual(coverage.summary.techniques_total);
    expect(coverage.attribution).toContain('MITRE');
  });
});
