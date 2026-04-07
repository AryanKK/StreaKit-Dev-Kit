import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreaKit } from '../engine.js';
import type {
  StorageAdapter,
  Streak,
  Activity,
  Milestone,
  ThemeState,
} from '../types/index.js';

// ── In-memory adapter for tests ───────────────────────────────────────────

class TestMemoryAdapter implements StorageAdapter {
  private streaks = new Map<string, Streak>();
  private activities = new Map<string, Activity[]>();
  private milestones = new Map<string, Milestone[]>();
  private themeStates = new Map<string, ThemeState>();

  async getStreak(id: string) {
    return this.streaks.get(id) ?? null;
  }
  async saveStreak(s: Streak) {
    this.streaks.set(s.id, { ...s });
  }
  async listStreaks(filter?: { userId?: string; status?: Streak['status']; tags?: string[] }) {
    let list = Array.from(this.streaks.values());
    if (filter?.userId) list = list.filter((s) => s.userId === filter.userId);
    if (filter?.status) list = list.filter((s) => s.status === filter.status);
    if (filter?.tags?.length) list = list.filter((s) => filter.tags!.some((t) => s.tags.includes(t)));
    return list;
  }
  async deleteStreak(id: string) {
    this.streaks.delete(id);
    this.activities.delete(id);
    this.milestones.delete(id);
    for (const key of this.themeStates.keys()) {
      if (key.startsWith(`${id}:`)) this.themeStates.delete(key);
    }
  }
  async getActivities(sid: string, since?: Date) {
    const all = this.activities.get(sid) ?? [];
    return since ? all.filter((a) => a.performedAt >= since) : all;
  }
  async saveActivity(a: Activity) {
    const list = this.activities.get(a.streakId) ?? [];
    list.push({ ...a });
    this.activities.set(a.streakId, list);
  }
  async getMilestones(sid: string) {
    return this.milestones.get(sid) ?? [];
  }
  async saveMilestone(m: Milestone) {
    const list = this.milestones.get(m.streakId) ?? [];
    const idx = list.findIndex((x) => x.id === m.id);
    if (idx >= 0) list[idx] = { ...m };
    else list.push({ ...m });
    this.milestones.set(m.streakId, list);
  }
  async getThemeState(sid: string, tid: string) {
    return this.themeStates.get(`${sid}:${tid}`) ?? null;
  }
  async saveThemeState(s: ThemeState) {
    this.themeStates.set(`${s.streakId}:${s.themeId}`, { ...s });
  }
  async clear() {
    this.streaks.clear();
    this.activities.clear();
    this.milestones.clear();
    this.themeStates.clear();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Fixed base time to compute offsets from (avoids compounding when fake timers are active). */
const BASE_TIME = new Date('2025-07-01T12:00:00Z').getTime();

function dayOffset(days: number): Date {
  return new Date(BASE_TIME + days * 86_400_000);
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('StreaKit engine', () => {
  let storage: TestMemoryAdapter;
  let engine: StreaKit;

  beforeEach(() => {
    storage = new TestMemoryAdapter();
    engine = new StreaKit({ storage });
  });

  // ── Constructor & createStreak ────────────────────────────────────────

  describe('constructor and createStreak', () => {
    it('creates a streak with default values', async () => {
      const streak = await engine.createStreak({
        id: 'test-streak',
        frequency: 'daily',
      });

      expect(streak).toBeDefined();
      expect(streak.id).toBe('test-streak');

      const status = await streak.status();
      expect(status.count).toBe(0);
      expect(status.isActive).toBe(false);
      expect(status.isBroken).toBe(false);
      expect(status.isFrozen).toBe(false);
    });

    it('persists the streak via storage adapter', async () => {
      await engine.createStreak({ id: 's1', frequency: 'daily' });
      const stored = await storage.getStreak('s1');
      expect(stored).not.toBeNull();
      expect(stored!.id).toBe('s1');
      expect(stored!.currentCount).toBe(0);
      expect(stored!.status).toBe('active');
    });

    it('creates milestone entries when milestones are provided', async () => {
      await engine.createStreak({
        id: 's-ms',
        frequency: 'daily',
        milestones: [7, 30, 100],
      });

      const milestones = await storage.getMilestones('s-ms');
      expect(milestones).toHaveLength(3);
      expect(milestones.map((m) => m.threshold).sort((a, b) => a - b)).toEqual([7, 30, 100]);
      expect(milestones.every((m) => m.achievedAt === null)).toBe(true);
    });

    it('retrieves an existing streak via getStreak', async () => {
      await engine.createStreak({ id: 'existing', frequency: 'daily' });
      const instance = await engine.getStreak('existing');
      expect(instance).not.toBeNull();
      expect(instance!.id).toBe('existing');
    });

    it('returns null for a non-existent streak', async () => {
      const instance = await engine.getStreak('nope');
      expect(instance).toBeNull();
    });
  });

  // ── record() ──────────────────────────────────────────────────────────

  describe('streak.record()', () => {
    it('increments count from 0 to 1 on first record', async () => {
      const streak = await engine.createStreak({ id: 'r1', frequency: 'daily' });
      const status = await streak.record();
      expect(status.count).toBe(1);
      expect(status.isActive).toBe(true);
    });

    it('increments count on subsequent records in new frequency windows', async () => {
      vi.setSystemTime(dayOffset(0));
      const streak = await engine.createStreak({ id: 'r2', frequency: 'daily' });

      await streak.record();

      vi.setSystemTime(dayOffset(1));
      const status = await streak.record();
      expect(status.count).toBe(2);
      expect(status.longestCount).toBe(2);

      vi.useRealTimers();
    });
  });

  // ── status() ──────────────────────────────────────────────────────────

  describe('streak.status()', () => {
    it('returns correct StreakStatus shape', async () => {
      const streak = await engine.createStreak({
        id: 'st1',
        frequency: 'daily',
        milestones: [3, 7],
      });

      await streak.record();
      const status = await streak.status();

      expect(status).toHaveProperty('count');
      expect(status).toHaveProperty('longestCount');
      expect(status).toHaveProperty('isActive');
      expect(status).toHaveProperty('isAtRisk');
      expect(status).toHaveProperty('isFrozen');
      expect(status).toHaveProperty('isBroken');
      expect(status).toHaveProperty('lastActivity');
      expect(status).toHaveProperty('nextDeadline');
      expect(status).toHaveProperty('currentMilestone');
      expect(status).toHaveProperty('nextMilestone');
      expect(status).toHaveProperty('progressToNext');

      expect(status.count).toBe(1);
      expect(status.isActive).toBe(true);
      expect(status.isBroken).toBe(false);
      expect(status.isFrozen).toBe(false);
      expect(status.lastActivity).toBeInstanceOf(Date);
      expect(status.nextDeadline).toBeInstanceOf(Date);
    });

    it('returns milestone progress info', async () => {
      const streak = await engine.createStreak({
        id: 'st-mp',
        frequency: 'daily',
        milestones: [3, 7],
      });

      await streak.record();
      const status = await streak.status();

      expect(status.currentMilestone).toBeNull();
      expect(status.nextMilestone).toBe(3);
      expect(status.progressToNext).toBeCloseTo(1 / 3, 1);
    });
  });

  // ── Same-window duplicate prevention ──────────────────────────────────

  describe('same frequency window duplicate prevention', () => {
    it('does not double-count when recording twice in the same day', async () => {
      const streak = await engine.createStreak({ id: 'dup', frequency: 'daily' });

      const first = await streak.record();
      expect(first.count).toBe(1);

      const second = await streak.record();
      expect(second.count).toBe(1);
    });
  });

  // ── Milestone detection and events ────────────────────────────────────

  describe('milestone detection fires events', () => {
    it('fires milestone:reached when threshold is hit', async () => {
      vi.setSystemTime(dayOffset(0));
      const streak = await engine.createStreak({
        id: 'ms-fire',
        frequency: 'daily',
        milestones: [3],
      });

      const milestoneHandler = vi.fn();
      engine.on('milestone:reached', milestoneHandler);

      // Record day 1
      await streak.record();
      expect(milestoneHandler).not.toHaveBeenCalled();

      // Record day 2
      vi.setSystemTime(dayOffset(1));
      await streak.record();
      expect(milestoneHandler).not.toHaveBeenCalled();

      // Record day 3 — milestone 3 should fire
      vi.setSystemTime(dayOffset(2));
      await streak.record();
      expect(milestoneHandler).toHaveBeenCalledTimes(1);
      expect(milestoneHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          streakId: 'ms-fire',
          threshold: 3,
        }),
      );

      vi.useRealTimers();
    });

    it('fires activity:recorded on every successful record', async () => {
      const streak = await engine.createStreak({ id: 'ev-act', frequency: 'daily' });

      const activityHandler = vi.fn();
      engine.on('activity:recorded', activityHandler);

      await streak.record();
      expect(activityHandler).toHaveBeenCalledTimes(1);
      expect(activityHandler).toHaveBeenCalledWith(
        expect.objectContaining({ streakId: 'ev-act', count: 1 }),
      );
    });
  });

  // ── freeze() and unfreeze() ───────────────────────────────────────────

  describe('freeze and unfreeze', () => {
    it('freezes an active streak', async () => {
      const streak = await engine.createStreak({ id: 'frz', frequency: 'daily' });
      await streak.record();

      const frozenHandler = vi.fn();
      engine.on('streak:frozen', frozenHandler);

      await streak.freeze();

      const status = await streak.status();
      expect(status.isFrozen).toBe(true);
      expect(frozenHandler).toHaveBeenCalledWith(expect.objectContaining({ streakId: 'frz' }));
    });

    it('unfreezes a frozen streak', async () => {
      const streak = await engine.createStreak({ id: 'ufrz', frequency: 'daily' });
      await streak.record();
      await streak.freeze();

      const unfrozenHandler = vi.fn();
      engine.on('streak:unfrozen', unfrozenHandler);

      await streak.unfreeze();

      const status = await streak.status();
      expect(status.isFrozen).toBe(false);
      expect(status.isActive).toBe(true);
      expect(unfrozenHandler).toHaveBeenCalledWith({ streakId: 'ufrz' });
    });

    it('throws when trying to freeze a broken streak', async () => {
      const streak = await engine.createStreak({ id: 'frz-broken', frequency: 'daily' });
      await streak.record();
      await streak.reset();

      await expect(streak.freeze()).rejects.toThrow('Cannot freeze a broken streak');
    });

    it('is a no-op to freeze an already frozen streak', async () => {
      const streak = await engine.createStreak({ id: 'frz-dup', frequency: 'daily' });
      await streak.record();
      await streak.freeze();

      const frozenHandler = vi.fn();
      engine.on('streak:frozen', frozenHandler);

      await streak.freeze(); // should not throw or emit again
      expect(frozenHandler).not.toHaveBeenCalled();
    });
  });

  // ── reset() ───────────────────────────────────────────────────────────

  describe('reset()', () => {
    it('zeros the count and marks streak as broken', async () => {
      const streak = await engine.createStreak({ id: 'rst', frequency: 'daily' });
      await streak.record();

      const brokenHandler = vi.fn();
      engine.on('streak:broken', brokenHandler);

      await streak.reset();

      const status = await streak.status();
      expect(status.count).toBe(0);
      expect(status.isBroken).toBe(true);
      expect(brokenHandler).toHaveBeenCalledWith(
        expect.objectContaining({ streakId: 'rst', finalCount: 1 }),
      );
    });

    it('does not fire streak:broken if count was already 0', async () => {
      const streak = await engine.createStreak({ id: 'rst-zero', frequency: 'daily' });

      const brokenHandler = vi.fn();
      engine.on('streak:broken', brokenHandler);

      await streak.reset();

      expect(brokenHandler).not.toHaveBeenCalled();
    });
  });

  // ── Broken streak restarts on record() ────────────────────────────────

  describe('broken streak restarts on record()', () => {
    it('restarts with count=1 after a reset', async () => {
      vi.setSystemTime(dayOffset(0));
      const streak = await engine.createStreak({ id: 'restart', frequency: 'daily' });

      await streak.record();
      vi.setSystemTime(dayOffset(1));
      await streak.record();
      expect((await streak.status()).count).toBe(2);

      await streak.reset();
      expect((await streak.status()).count).toBe(0);
      expect((await streak.status()).isBroken).toBe(true);

      const status = await streak.record();
      expect(status.count).toBe(1);
      expect(status.isActive).toBe(true);

      vi.useRealTimers();
    });
  });

  // ── longestCount is preserved across breaks ───────────────────────────

  describe('longestCount preservation', () => {
    it('preserves longestCount across resets', async () => {
      vi.setSystemTime(dayOffset(0));
      const streak = await engine.createStreak({ id: 'longest', frequency: 'daily' });

      // Build up to 3
      await streak.record();
      vi.setSystemTime(dayOffset(1));
      await streak.record();
      vi.setSystemTime(dayOffset(2));
      await streak.record();

      const beforeReset = await streak.status();
      expect(beforeReset.count).toBe(3);
      expect(beforeReset.longestCount).toBe(3);

      await streak.reset();

      const afterReset = await streak.status();
      expect(afterReset.count).toBe(0);
      expect(afterReset.longestCount).toBe(3);

      // Restart and confirm longestCount stays
      vi.setSystemTime(dayOffset(3));
      await streak.record();

      const afterRestart = await streak.status();
      expect(afterRestart.count).toBe(1);
      expect(afterRestart.longestCount).toBe(3);

      vi.useRealTimers();
    });
  });

  // ── Grace period extends the deadline ─────────────────────────────────

  describe('grace period', () => {
    it('extends the next deadline by the grace duration', async () => {
      const withGrace = await engine.createStreak({
        id: 'grace',
        frequency: 'daily',
        gracePeriod: { hours: 6 },
      });

      const withoutGrace = await engine.createStreak({
        id: 'no-grace',
        frequency: 'daily',
      });

      await withGrace.record();
      await withoutGrace.record();

      const graceStatus = await withGrace.status();
      const noGraceStatus = await withoutGrace.status();

      expect(graceStatus.nextDeadline).toBeDefined();
      expect(noGraceStatus.nextDeadline).toBeDefined();

      const graceDl = graceStatus.nextDeadline!.getTime();
      const noGraceDl = noGraceStatus.nextDeadline!.getTime();

      // Grace period of 6 hours = 21,600,000 ms
      const diff = graceDl - noGraceDl;
      expect(diff).toBe(6 * 3_600_000);
    });

    it('prevents streak from breaking during grace period', async () => {
      vi.setSystemTime(dayOffset(0));
      const streak = await engine.createStreak({
        id: 'grace-safe',
        frequency: 'daily',
        gracePeriod: { days: 1 },
      });

      await streak.record();

      // Move to ~1.5 days later — beyond a normal daily deadline but within grace
      vi.setSystemTime(new Date(BASE_TIME + 1.5 * 86_400_000));

      const status = await streak.status();
      // With a 1-day grace period, the deadline is end-of-next-day + 1 day,
      // so at 1.5 days out the streak should still be active
      expect(status.isBroken).toBe(false);

      vi.useRealTimers();
    });
  });

  // ── Auto-detect broken on status() ────────────────────────────────────

  describe('auto-detect broken streak', () => {
    it('marks streak as broken when deadline has passed', async () => {
      vi.setSystemTime(dayOffset(0));
      const streak = await engine.createStreak({ id: 'auto-break', frequency: 'daily' });
      await streak.record();

      const brokenHandler = vi.fn();
      engine.on('streak:broken', brokenHandler);

      // Jump far into the future — well past any deadline
      vi.setSystemTime(dayOffset(10));

      const status = await streak.status();
      expect(status.isBroken).toBe(true);
      expect(brokenHandler).toHaveBeenCalledWith(
        expect.objectContaining({ streakId: 'auto-break', finalCount: 1 }),
      );

      vi.useRealTimers();
    });
  });

  // ── Event emitter on/off ──────────────────────────────────────────────

  describe('event emitter on/off', () => {
    it('off() removes a listener', async () => {
      const streak = await engine.createStreak({ id: 'ev-off', frequency: 'daily' });
      const handler = vi.fn();

      engine.on('activity:recorded', handler);
      engine.off('activity:recorded', handler);

      await streak.record();
      expect(handler).not.toHaveBeenCalled();
    });

    it('on() returns an unsubscribe function', async () => {
      const streak = await engine.createStreak({ id: 'ev-unsub', frequency: 'daily' });
      const handler = vi.fn();

      const unsub = engine.on('activity:recorded', handler);
      unsub();

      await streak.record();
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
