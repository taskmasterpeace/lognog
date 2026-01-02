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

    it('should return 3 for non-zero difference when stddev is 0', () => {
      // When stddev is 0 but there's a difference, it returns 3 as significant
      const score = calculateDeviationScore(100, 50, 0);
      expect(score).toBe(3);
    });

    it('should return 0 when value equals mean and stddev is 0', () => {
      const score = calculateDeviationScore(50, 50, 0);
      expect(score).toBe(0);
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
});
