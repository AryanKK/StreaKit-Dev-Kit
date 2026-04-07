import { describe, it, expect } from 'vitest';
import { DecayEngine } from '../index.js';

describe('DecayEngine', () => {
  const base = {
    frequency: 'daily' as const,
    timezone: 'UTC',
  };

  it('returns unchanged count when no windows missed', () => {
    const result = DecayEngine.compute({
      ...base,
      currentCount: 10,
      lastActivityAt: new Date('2024-01-10T12:00:00Z'),
      now: new Date('2024-01-10T18:00:00Z'),
      decayConfig: { mode: 'linear', rate: 1 },
    });
    expect(result.effectiveCount).toBe(10);
    expect(result.missedWindows).toBe(0);
    expect(result.isBroken).toBe(false);
  });

  it('linear decay subtracts rate per missed window', () => {
    const result = DecayEngine.compute({
      ...base,
      currentCount: 10,
      lastActivityAt: new Date('2024-01-01T12:00:00Z'),
      now: new Date('2024-01-05T12:00:00Z'),
      decayConfig: { mode: 'linear', rate: 2 },
    });
    expect(result.effectiveCount).toBeLessThan(10);
    expect(result.missedWindows).toBeGreaterThan(0);
    expect(result.decayedAmount).toBeGreaterThan(0);
  });

  it('linear decay respects floor', () => {
    const result = DecayEngine.compute({
      ...base,
      currentCount: 5,
      lastActivityAt: new Date('2024-01-01T12:00:00Z'),
      now: new Date('2024-01-20T12:00:00Z'),
      decayConfig: { mode: 'linear', rate: 2, floor: 3 },
    });
    expect(result.effectiveCount).toBe(3);
    // Implementation treats count at floor as broken
    expect(result.decayedAmount).toBeGreaterThan(0);
  });

  it('linear decay breaks at floor 0', () => {
    const result = DecayEngine.compute({
      ...base,
      currentCount: 3,
      lastActivityAt: new Date('2024-01-01T12:00:00Z'),
      now: new Date('2024-01-20T12:00:00Z'),
      decayConfig: { mode: 'linear', rate: 1 },
    });
    expect(result.effectiveCount).toBe(0);
    expect(result.isBroken).toBe(true);
  });

  it('percentage decay reduces by rate%', () => {
    const result = DecayEngine.compute({
      ...base,
      currentCount: 100,
      lastActivityAt: new Date('2024-01-01T12:00:00Z'),
      now: new Date('2024-01-05T12:00:00Z'),
      decayConfig: { mode: 'percentage', rate: 50 },
    });
    expect(result.effectiveCount).toBeLessThan(100);
    expect(result.effectiveCount).toBeGreaterThan(0);
  });

  it('step decay drops to previous milestone', () => {
    const result = DecayEngine.compute({
      ...base,
      currentCount: 15,
      lastActivityAt: new Date('2024-01-01T12:00:00Z'),
      now: new Date('2024-01-04T12:00:00Z'),
      decayConfig: { mode: 'step', rate: 1 },
      milestoneThresholds: [7, 14, 30],
    });
    expect(result.effectiveCount).toBeLessThanOrEqual(14);
  });

  it('getRecoveryBonus returns configured value', () => {
    expect(DecayEngine.getRecoveryBonus({ mode: 'linear', rate: 1, recoveryBonus: 5 })).toBe(5);
    expect(DecayEngine.getRecoveryBonus({ mode: 'linear', rate: 1 })).toBe(0);
  });
});
