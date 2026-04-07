import { describe, it, expect, vi } from 'vitest';
import { RewardRegistry } from '../index.js';
import type { Streak, StreakStatus, Milestone } from '../index.js';

function makeStreak(overrides: Partial<Streak> = {}): Streak {
  return {
    id: 'test', userId: 'u1', frequency: 'daily', currentCount: 10,
    longestCount: 10, status: 'active', lastActivityAt: new Date(),
    frozenAt: null, frozenUntil: null, timezone: 'UTC',
    createdAt: new Date('2024-01-01'), updatedAt: new Date(),
    tags: [], metadata: {}, targetCount: null, totalFreezes: 0,
    lastFreezeEndedAt: null, totalScore: 0, currentMultiplier: 1,
    skipDays: [], collectionId: null, decayConfig: null, scoringConfig: null,
    maxFreezes: null, freezeCooldownDays: null, maxFreezeDays: 7, totalResets: 0,
    ...overrides,
  };
}

function makeStatus(overrides: Partial<StreakStatus> = {}): StreakStatus {
  return {
    count: 10, longestCount: 10, isActive: true, isAtRisk: false,
    isFrozen: false, isBroken: false, lastActivity: new Date(),
    nextDeadline: new Date(), currentMilestone: 7, nextMilestone: 14,
    progressToNext: 0.5, score: 0, multiplier: 1, freezesUsed: 0,
    freezesRemaining: null, canFreeze: true, targetCount: null,
    targetProgress: 0, isDecaying: false, decayedAmount: 0,
    streakAge: 10, completionRate: 1,
    ...overrides,
  };
}

function makeMilestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: 'ms1', streakId: 'test', threshold: 7, achievedAt: new Date(),
    rewards: [{ id: 'r1', type: 'badge', payload: { name: 'Week Warrior' } }],
    repeatable: false,
    ...overrides,
  };
}

describe('RewardRegistry', () => {
  it('dispatches to registered handlers', async () => {
    const reg = new RewardRegistry();
    const handler = vi.fn();
    reg.register('badge', handler);

    await reg.dispatch(makeMilestone(), makeStreak(), makeStatus());
    expect(handler).toHaveBeenCalledOnce();
  });

  it('returns unregister function', async () => {
    const reg = new RewardRegistry();
    const handler = vi.fn();
    const unsub = reg.register('badge', handler);
    unsub();

    await reg.dispatch(makeMilestone(), makeStreak(), makeStatus());
    expect(handler).not.toHaveBeenCalled();
  });

  it('evaluates never-frozen condition', () => {
    expect(RewardRegistry.evaluateCondition({ type: 'never-frozen' }, makeStreak({ totalFreezes: 0 }), makeStatus())).toBe(true);
    expect(RewardRegistry.evaluateCondition({ type: 'never-frozen' }, makeStreak({ totalFreezes: 1 }), makeStatus())).toBe(false);
  });

  it('evaluates min-longest condition', () => {
    expect(RewardRegistry.evaluateCondition({ type: 'min-longest', count: 10 }, makeStreak({ longestCount: 15 }), makeStatus())).toBe(true);
    expect(RewardRegistry.evaluateCondition({ type: 'min-longest', count: 20 }, makeStreak({ longestCount: 15 }), makeStatus())).toBe(false);
  });

  it('evaluates custom condition', () => {
    const cond = { type: 'custom' as const, check: (s: Streak) => s.currentCount > 5 };
    expect(RewardRegistry.evaluateCondition(cond, makeStreak({ currentCount: 10 }), makeStatus())).toBe(true);
    expect(RewardRegistry.evaluateCondition(cond, makeStreak({ currentCount: 3 }), makeStatus())).toBe(false);
  });

  it('skips rewards whose conditions fail', async () => {
    const reg = new RewardRegistry();
    const handler = vi.fn();
    reg.register('badge', handler);

    const ms = makeMilestone({ condition: { type: 'never-frozen' } });
    await reg.dispatch(ms, makeStreak({ totalFreezes: 1 }), makeStatus());
    expect(handler).not.toHaveBeenCalled();
  });
});
