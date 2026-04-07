import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreaKit } from '../engine.js';
import type {
  StorageAdapter,
  Streak,
  Activity,
  Milestone,
  ThemeState,
} from '../types/index.js';

// ── In-memory adapter (same pattern as engine.test.ts) ────────────────────

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

const BASE_TIME = new Date('2025-07-01T12:00:00Z').getTime();

function dayOffset(days: number): Date {
  return new Date(BASE_TIME + days * 86_400_000);
}

function hourOffset(hours: number): Date {
  return new Date(BASE_TIME + hours * 3_600_000);
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('StreakInstance edge cases', () => {
  let storage: TestMemoryAdapter;
  let engine: StreaKit;

  beforeEach(() => {
    storage = new TestMemoryAdapter();
    engine = new StreaKit({ storage });
  });

  // ── Frozen streak auto-unfreeze on record ───────────────────────────

  describe('recording on a frozen streak', () => {
    it('auto-unfreezes and increments count', async () => {
      vi.setSystemTime(dayOffset(0));
      const streak = await engine.createStreak({ id: 'frz-rec', frequency: 'daily' });

      await streak.record();
      vi.setSystemTime(dayOffset(1));
      await streak.record();
      expect((await streak.status()).count).toBe(2);

      await streak.freeze();
      expect((await streak.status()).isFrozen).toBe(true);

      vi.setSystemTime(dayOffset(2));
      const unfrozenHandler = vi.fn();
      engine.on('streak:unfrozen', unfrozenHandler);

      const status = await streak.record();
      expect(status.count).toBe(3);
      expect(status.isFrozen).toBe(false);
      expect(status.isActive).toBe(true);
      expect(unfrozenHandler).toHaveBeenCalledWith({ streakId: 'frz-rec' });

      vi.useRealTimers();
    });
  });

  // ── Frozen streak auto-expires after frozenUntil ────────────────────

  describe('frozen streak auto-expiry', () => {
    it('status() returns active (not frozen) after frozenUntil passes', async () => {
      vi.setSystemTime(dayOffset(0));
      const streak = await engine.createStreak({ id: 'frz-exp', frequency: 'daily' });
      await streak.record();

      await streak.freeze({ maxDays: 2 });
      expect((await streak.status()).isFrozen).toBe(true);

      // Jump past the frozenUntil (2 days + buffer)
      vi.setSystemTime(dayOffset(3));
      const status = await streak.status();
      expect(status.isFrozen).toBe(false);
      expect(status.isActive).toBe(true);

      vi.useRealTimers();
    });
  });

  // ── Weekly frequency ────────────────────────────────────────────────

  describe('weekly frequency', () => {
    it('recording twice in the same week is a no-op', async () => {
      // 2025-07-01 is a Tuesday
      vi.setSystemTime(dayOffset(0));
      const streak = await engine.createStreak({ id: 'wk-dup', frequency: 'weekly' });

      const first = await streak.record();
      expect(first.count).toBe(1);

      // Wednesday same week
      vi.setSystemTime(dayOffset(1));
      const second = await streak.record();
      expect(second.count).toBe(1);

      vi.useRealTimers();
    });

    it('recording in a new ISO week increments count', async () => {
      // Tuesday 2025-07-01
      vi.setSystemTime(dayOffset(0));
      const streak = await engine.createStreak({ id: 'wk-inc', frequency: 'weekly' });

      await streak.record();

      // Jump to next Monday (2025-07-07)
      vi.setSystemTime(dayOffset(6));
      const status = await streak.record();
      expect(status.count).toBe(2);

      vi.useRealTimers();
    });
  });

  // ── everyNDays frequency ────────────────────────────────────────────

  describe('everyNDays frequency', () => {
    it('does not increment when recorded too soon', async () => {
      vi.setSystemTime(dayOffset(0));
      const streak = await engine.createStreak({
        id: 'end-soon',
        frequency: { everyNDays: 3 },
      });

      const first = await streak.record();
      expect(first.count).toBe(1);

      // Only 1 day later — should be a no-op
      vi.setSystemTime(dayOffset(1));
      const second = await streak.record();
      expect(second.count).toBe(1);

      vi.useRealTimers();
    });

    it('increments when enough days have passed', async () => {
      vi.setSystemTime(dayOffset(0));
      const streak = await engine.createStreak({
        id: 'end-ok',
        frequency: { everyNDays: 3 },
      });

      await streak.record();

      // 2 days later — meets the everyNDays-1 threshold
      vi.setSystemTime(dayOffset(2));
      const status = await streak.record();
      expect(status.count).toBe(2);

      vi.useRealTimers();
    });
  });

  // ── Multiple milestones fire in order ───────────────────────────────

  describe('multiple milestones fire in order', () => {
    it('fires all pending milestones when count jumps past several at once', async () => {
      vi.setSystemTime(dayOffset(0));
      const streak = await engine.createStreak({
        id: 'ms-multi',
        frequency: 'daily',
        milestones: [1, 2, 3],
      });

      const milestoneHandler = vi.fn();
      engine.on('milestone:reached', milestoneHandler);

      // First record: count becomes 1 → milestone 1 fires
      await streak.record();
      expect(milestoneHandler).toHaveBeenCalledTimes(1);
      expect(milestoneHandler).toHaveBeenCalledWith(
        expect.objectContaining({ streakId: 'ms-multi', threshold: 1 }),
      );

      // Day 2: count becomes 2 → milestone 2 fires
      vi.setSystemTime(dayOffset(1));
      await streak.record();
      expect(milestoneHandler).toHaveBeenCalledTimes(2);
      expect(milestoneHandler).toHaveBeenLastCalledWith(
        expect.objectContaining({ threshold: 2 }),
      );

      // Day 3: count becomes 3 → milestone 3 fires
      vi.setSystemTime(dayOffset(2));
      await streak.record();
      expect(milestoneHandler).toHaveBeenCalledTimes(3);
      expect(milestoneHandler).toHaveBeenLastCalledWith(
        expect.objectContaining({ threshold: 3 }),
      );

      vi.useRealTimers();
    });
  });

  // ── Milestone only fires once ───────────────────────────────────────

  describe('milestone fires only once', () => {
    it('does not re-fire a milestone already achieved', async () => {
      vi.setSystemTime(dayOffset(0));
      const streak = await engine.createStreak({
        id: 'ms-once',
        frequency: 'daily',
        milestones: [1],
      });

      const milestoneHandler = vi.fn();
      engine.on('milestone:reached', milestoneHandler);

      await streak.record();
      expect(milestoneHandler).toHaveBeenCalledTimes(1);

      // Recording again in a new window should NOT re-fire milestone 1
      vi.setSystemTime(dayOffset(1));
      await streak.record();
      expect(milestoneHandler).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });

  // ── At-risk detection ───────────────────────────────────────────────

  describe('at-risk detection', () => {
    it('marks streak as at-risk when hours remaining < atRiskThresholdHours', async () => {
      const atRiskEngine = new StreaKit({
        storage,
        atRiskThresholdHours: 6,
      });

      vi.setSystemTime(dayOffset(0));
      const streak = await atRiskEngine.createStreak({
        id: 'at-risk',
        frequency: 'daily',
      });

      await streak.record();

      // Daily deadline is end of next day (day 1 23:59:59.999 UTC).
      // Move to ~5 hours before that deadline.
      const deadlineApprox = new Date('2025-07-02T23:59:59.999Z');
      const fiveHoursBefore = new Date(deadlineApprox.getTime() - 5 * 3_600_000);
      vi.setSystemTime(fiveHoursBefore);

      const atRiskHandler = vi.fn();
      atRiskEngine.on('streak:atrisk', atRiskHandler);

      const status = await streak.status();
      expect(status.isAtRisk).toBe(true);
      expect(atRiskHandler).toHaveBeenCalledWith(
        expect.objectContaining({ streakId: 'at-risk' }),
      );

      vi.useRealTimers();
    });

    it('is not at risk when plenty of time remains', async () => {
      const atRiskEngine = new StreaKit({
        storage,
        atRiskThresholdHours: 6,
      });

      vi.setSystemTime(dayOffset(0));
      const streak = await atRiskEngine.createStreak({
        id: 'not-at-risk',
        frequency: 'daily',
      });

      await streak.record();

      // Only a few hours into the window — plenty of time left
      vi.setSystemTime(hourOffset(2));
      const status = await streak.status();
      expect(status.isAtRisk).toBe(false);

      vi.useRealTimers();
    });
  });

  // ── Grace period ────────────────────────────────────────────────────

  describe('grace period edge cases', () => {
    it('prevents breaking during the grace window', async () => {
      vi.setSystemTime(dayOffset(0));
      const streak = await engine.createStreak({
        id: 'grace-safe',
        frequency: 'daily',
        gracePeriod: { hours: 12 },
      });

      await streak.record();

      // Move to just past the normal deadline (end of day 1) but within grace
      vi.setSystemTime(new Date('2025-07-03T06:00:00Z'));
      const status = await streak.status();
      expect(status.isBroken).toBe(false);
      expect(status.isActive).toBe(true);

      vi.useRealTimers();
    });

    it('allows breaking after grace window expires', async () => {
      vi.setSystemTime(dayOffset(0));
      const streak = await engine.createStreak({
        id: 'grace-expired',
        frequency: 'daily',
        gracePeriod: { hours: 6 },
      });

      await streak.record();

      // Normal daily deadline for day-0 activity: end of day 1 = 2025-07-02T23:59:59.999Z
      // With 6h grace: 2025-07-03T05:59:59.999Z
      // Jump well past that
      vi.setSystemTime(dayOffset(5));
      const status = await streak.status();
      expect(status.isBroken).toBe(true);

      vi.useRealTimers();
    });

    it('can still record during grace window to continue streak', async () => {
      vi.setSystemTime(dayOffset(0));
      const streak = await engine.createStreak({
        id: 'grace-record',
        frequency: 'daily',
        gracePeriod: { days: 1 },
      });

      await streak.record();

      // Normal deadline: end of 2025-07-02 (23:59:59.999 UTC)
      // Grace of 1 day extends to end of 2025-07-03 (23:59:59.999 UTC)
      // 2 days from BASE_TIME = 2025-07-03T12:00:00Z — within the grace window
      vi.setSystemTime(new Date(BASE_TIME + 2 * 86_400_000));

      const status = await streak.record();
      expect(status.isBroken).toBe(false);
      expect(status.count).toBeGreaterThanOrEqual(2);

      vi.useRealTimers();
    });
  });
});
