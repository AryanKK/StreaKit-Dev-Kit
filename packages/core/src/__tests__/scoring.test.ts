import { describe, it, expect } from 'vitest';
import { ScoringEngine } from '../index.js';

describe('ScoringEngine', () => {
  describe('getMultiplier', () => {
    it('returns 1 with no rule', () => {
      expect(ScoringEngine.getMultiplier(10)).toBe(1);
    });

    it('linear multiplier scales with count', () => {
      const m = ScoringEngine.getMultiplier(10, { type: 'linear', scale: 0.1 });
      expect(m).toBe(2); // 1 + 10*0.1
    });

    it('logarithmic multiplier uses log2', () => {
      const m = ScoringEngine.getMultiplier(8, { type: 'logarithmic' });
      expect(m).toBe(4); // 1 + log2(8) = 4
    });

    it('tiered multiplier picks correct tier', () => {
      const m = ScoringEngine.getMultiplier(15, {
        type: 'tiered',
        tiers: [
          { minStreak: 0, value: 1 },
          { minStreak: 7, value: 1.5 },
          { minStreak: 30, value: 2 },
        ],
      });
      expect(m).toBe(1.5);
    });

    it('respects cap', () => {
      const m = ScoringEngine.getMultiplier(100, { type: 'linear', scale: 0.1, cap: 5 });
      expect(m).toBe(5);
    });
  });

  describe('calculatePoints', () => {
    it('returns 0 points with no config', () => {
      const r = ScoringEngine.calculatePoints({ count: 5, config: null, hitMilestone: false, previousScore: 0 });
      expect(r.pointsEarned).toBe(0);
      expect(r.totalScore).toBe(0);
    });

    it('calculates base points with multiplier', () => {
      const r = ScoringEngine.calculatePoints({
        count: 10,
        config: { basePoints: 10, multiplier: { type: 'linear', scale: 0.1 } },
        hitMilestone: false,
        previousScore: 50,
      });
      expect(r.multiplier).toBe(2);
      expect(r.pointsEarned).toBe(20); // 10 * 2
      expect(r.totalScore).toBe(70);
    });

    it('adds milestone bonus', () => {
      const r = ScoringEngine.calculatePoints({
        count: 7,
        config: { basePoints: 1, milestoneBonus: 50 },
        hitMilestone: true,
        previousScore: 0,
      });
      expect(r.pointsEarned).toBe(51); // 1 + 50
    });
  });
});
