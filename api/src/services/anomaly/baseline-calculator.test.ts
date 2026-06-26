/**
 * Baseline Calculator Tests
 *
 * Unit tests for statistical functions used in baseline calculation.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateEMA,
  calculateStdDev,
  calculateSMA,
  calculateDeviationScore,
} from './baseline-calculator.js';

describe('Baseline Calculator', () => {
  describe('calculateEMA', () => {
    it('should calculate exponential moving average for simple values', () => {
      const values = [10, 12, 11, 13, 12, 14];
      // Using default alpha of 0.3
      const ema = calculateEMA(values);
      // EMA should be a reasonable value (positive)
      expect(ema).toBeGreaterThan(0);
    });

    it('should weight recent values more heavily with high alpha', () => {
      const increasing = [10, 20, 30, 40, 50];
      const highAlpha = 0.9;

      const ema = calculateEMA(increasing, highAlpha);
      // With high alpha, EMA should be close to the most recent value (50)
      expect(ema).toBeGreaterThan(40);
    });

    it('should weight older values more with low alpha', () => {
      const increasing = [10, 20, 30, 40, 50];
      const lowAlpha = 0.1;

      const ema = calculateEMA(increasing, lowAlpha);
      // With low alpha, EMA should be closer to early values
      expect(ema).toBeLessThan(30);
    });

    it('should return 0 for empty array', () => {
      expect(calculateEMA([])).toBe(0);
    });

    it('should return single value for array with one element', () => {
      expect(calculateEMA([42])).toBe(42);
    });

    it('should converge to value with repeated constant inputs', () => {
      const values = [50, 50, 50, 50, 50];
      const ema = calculateEMA(values, 0.5);
      expect(ema).toBe(50);
    });
  });

  describe('calculateSMA', () => {
    it('should calculate simple moving average correctly', () => {
      const values = [10, 20, 30, 40, 50];
      const sma = calculateSMA(values);
      expect(sma).toBe(30); // (10+20+30+40+50)/5 = 30
    });

    it('should return 0 for empty array', () => {
      expect(calculateSMA([])).toBe(0);
    });

    it('should calculate correctly for single value', () => {
      expect(calculateSMA([100])).toBe(100);
    });

    it('should handle negative values', () => {
      const values = [-10, 0, 10];
      expect(calculateSMA(values)).toBe(0);
    });
  });

  describe('calculateStdDev', () => {
    it('should calculate standard deviation correctly', () => {
      // Known values: [2, 4, 4, 4, 5, 5, 7, 9] has stddev ≈ 2.0
      const values = [2, 4, 4, 4, 5, 5, 7, 9];
      const stddev = calculateStdDev(values);
      expect(stddev).toBeCloseTo(2.0, 1);
    });

    it('should return 0 for constant values', () => {
      const values = [5, 5, 5, 5, 5];
      const stddev = calculateStdDev(values);
      expect(stddev).toBe(0);
    });

    it('should return 0 for empty array', () => {
      expect(calculateStdDev([])).toBe(0);
    });

    it('should return 0 for single value', () => {
      expect(calculateStdDev([42])).toBe(0);
    });

    it('should handle negative values', () => {
      const values = [-10, -5, 0, 5, 10];
      const stddev = calculateStdDev(values);
      expect(stddev).toBeGreaterThan(0);
    });

    it('should use provided mean when given', () => {
      const values = [1, 2, 3, 4, 5];
      // With actual mean of 3, stddev should be calculated correctly
      const stddev = calculateStdDev(values, 3);
      expect(stddev).toBeGreaterThan(0);
    });
  });

  describe('calculateDeviationScore', () => {
    it('should return 0 when value equals mean', () => {
      const score = calculateDeviationScore(50, 50, 10);
      expect(score).toBe(0);
    });

    it('should return positive score when value is above mean', () => {
      const score = calculateDeviationScore(70, 50, 10);
      expect(score).toBe(2); // (70-50)/10 = 2 std devs
    });

    it('should return negative score when value is below mean', () => {
      const score = calculateDeviationScore(30, 50, 10);
      expect(score).toBe(-2); // (30-50)/10 = -2 std devs
    });

    it('should calculate z-score correctly', () => {
      // 3 standard deviations above mean
      const score = calculateDeviationScore(80, 50, 10);
      expect(score).toBe(3);
    });

    it('should handle fractional z-scores', () => {
      const score = calculateDeviationScore(55, 50, 10);
      expect(score).toBe(0.5);
    });
  });

  // Regression tests for issue #40: flat-baseline (stdDev === 0) scoring.
  // The old implementation returned a hard-coded +3 for ANY non-zero
  // difference, so a DROP below a flat baseline was scored +3 and
  // misclassified as a spike, and any tiny fluctuation maxed the score.
  describe('calculateDeviationScore - flat baseline (issue #40)', () => {
    it('should score a DROP below a flat baseline NEGATIVE (not +3)', () => {
      // Flat baseline at 50, observed 40 (a drop). Must be negative so the
      // detector classifies it as a drop, not a spike.
      const score = calculateDeviationScore(40, 50, 0);
      expect(score).toBeLessThan(0);
      expect(score).not.toBe(3);
    });

    it('should score a SPIKE above a flat baseline POSITIVE', () => {
      const score = calculateDeviationScore(100, 50, 0);
      expect(score).toBeGreaterThan(0);
    });

    it('should return exactly 0 when value equals a flat-baseline mean', () => {
      expect(calculateDeviationScore(50, 50, 0)).toBe(0);
    });

    it('should preserve sign symmetry around a flat baseline', () => {
      const up = calculateDeviationScore(60, 50, 0);
      const down = calculateDeviationScore(40, 50, 0);
      // Equal magnitude deviations in opposite directions -> opposite signs,
      // equal magnitude.
      expect(Math.sign(up)).toBe(1);
      expect(Math.sign(down)).toBe(-1);
      expect(up).toBeCloseTo(-down, 10);
    });

    it('should not let a tiny fluctuation on a flat baseline max out the score', () => {
      // A 1-unit change against a large flat mean should be a small score,
      // nowhere near the +3 spike threshold, thanks to the mean-scaled floor.
      const score = calculateDeviationScore(1001, 1000, 0);
      expect(Math.abs(score)).toBeLessThan(1);
    });

    it('should clamp extreme flat-baseline deviations to a bounded range', () => {
      // A huge jump against a small flat mean stays bounded (|score| <= 6)
      // rather than producing an absurd z-score.
      const big = calculateDeviationScore(1_000_000, 1, 0);
      expect(big).toBeLessThanOrEqual(6);
      expect(big).toBeGreaterThan(3); // still well past the spike threshold
    });
  });

  // End-to-end: a realistic normally-distributed sample yields the right
  // sign and magnitude for an observed value, using the same center+spread
  // pair (arithmetic mean + std-dev around that mean) the baseline stores.
  describe('calculateDeviationScore - normal distribution sample', () => {
    // Sample drawn around mean 100. Symmetric-ish for a stable mean/stddev.
    const sample = [100, 102, 98, 101, 99, 103, 97, 100, 104, 96, 100, 100];
    const mean = calculateSMA(sample);
    const stdDev = calculateStdDev(sample, mean);

    it('produces a valid (non-degenerate) mean and spread', () => {
      expect(mean).toBeCloseTo(100, 5);
      expect(stdDev).toBeGreaterThan(0);
    });

    it('scores a value above the sample mean as positive', () => {
      const observed = mean + 2 * stdDev;
      const score = calculateDeviationScore(observed, mean, stdDev);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeCloseTo(2, 5); // ~2 std devs above
    });

    it('scores a value below the sample mean as negative', () => {
      const observed = mean - 2 * stdDev;
      const score = calculateDeviationScore(observed, mean, stdDev);
      expect(score).toBeLessThan(0);
      expect(score).toBeCloseTo(-2, 5); // ~2 std devs below
    });

    it('scores a value at the sample mean as 0', () => {
      expect(calculateDeviationScore(mean, mean, stdDev)).toBe(0);
    });
  });
});
