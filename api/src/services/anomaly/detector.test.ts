/**
 * Anomaly Detector Tests
 *
 * Unit tests for risk scoring and severity determination.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateRiskScore,
  determineSeverity,
} from './detector.js';

describe('Anomaly Detector', () => {
  describe('calculateRiskScore', () => {
    it('should return 0 for zero deviation', () => {
      const score = calculateRiskScore(0, 'spike', 'host');
      expect(score).toBe(0);
    });

    it('should increase with higher deviation', () => {
      const score1 = calculateRiskScore(1, 'spike', 'host');
      const score2 = calculateRiskScore(2, 'spike', 'host');
      const score3 = calculateRiskScore(3, 'spike', 'host');

      expect(score2).toBeGreaterThan(score1);
      expect(score3).toBeGreaterThan(score2);
    });

    it('should cap at 100', () => {
      const score = calculateRiskScore(100, 'spike', 'host');
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should weight user anomalies higher than host', () => {
      const hostScore = calculateRiskScore(3, 'spike', 'host');
      const userScore = calculateRiskScore(3, 'spike', 'user');

      expect(userScore).toBeGreaterThanOrEqual(hostScore);
    });

    it('should weight time anomalies higher', () => {
      const spikeScore = calculateRiskScore(2, 'spike', 'host');
      const timeScore = calculateRiskScore(2, 'time_anomaly', 'host');

      expect(timeScore).toBeGreaterThanOrEqual(spikeScore);
    });

    it('should treat negative deviation same as positive', () => {
      const positiveScore = calculateRiskScore(3, 'spike', 'host');
      const negativeScore = calculateRiskScore(-3, 'drop', 'host');

      // Both should have similar base scores (deviation magnitude)
      expect(Math.abs(positiveScore - negativeScore)).toBeLessThan(20);
    });
  });

  describe('determineSeverity', () => {
    // determineSeverity takes a riskScore (0-100), not deviation
    it('should return low for low risk scores', () => {
      expect(determineSeverity(0)).toBe('low');
      expect(determineSeverity(10)).toBe('low');
      expect(determineSeverity(39)).toBe('low');
    });

    it('should return medium for moderate risk scores', () => {
      expect(determineSeverity(40)).toBe('medium');
      expect(determineSeverity(50)).toBe('medium');
      expect(determineSeverity(59)).toBe('medium');
    });

    it('should return high for high risk scores', () => {
      expect(determineSeverity(60)).toBe('high');
      expect(determineSeverity(70)).toBe('high');
      expect(determineSeverity(79)).toBe('high');
    });

    it('should return critical for very high risk scores', () => {
      expect(determineSeverity(80)).toBe('critical');
      expect(determineSeverity(90)).toBe('critical');
      expect(determineSeverity(100)).toBe('critical');
    });

    it('should handle edge cases at thresholds', () => {
      expect(determineSeverity(39)).toBe('low');
      expect(determineSeverity(40)).toBe('medium');
      expect(determineSeverity(59)).toBe('medium');
      expect(determineSeverity(60)).toBe('high');
      expect(determineSeverity(79)).toBe('high');
      expect(determineSeverity(80)).toBe('critical');
    });
  });

  describe('Anomaly Types', () => {
    it('should recognize spike anomalies', () => {
      // Spike: value significantly above baseline
      const score = calculateRiskScore(4, 'spike', 'host');
      expect(score).toBeGreaterThan(30);
    });

    it('should recognize drop anomalies', () => {
      // Drop: value significantly below baseline
      const score = calculateRiskScore(-4, 'drop', 'host');
      expect(score).toBeGreaterThan(30);
    });

    it('should handle new behavior', () => {
      const score = calculateRiskScore(1, 'new_behavior', 'host');
      expect(score).toBeGreaterThan(0);
    });

    it('should handle peer anomalies', () => {
      const score = calculateRiskScore(3, 'peer_anomaly', 'host');
      expect(score).toBeGreaterThan(0);
    });
  });

  describe('Entity Types', () => {
    it('should handle all entity types', () => {
      const types = ['host', 'user', 'ip', 'app'] as const;

      for (const type of types) {
        const score = calculateRiskScore(3, 'spike', type);
        expect(score).toBeGreaterThan(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    });
  });
});
