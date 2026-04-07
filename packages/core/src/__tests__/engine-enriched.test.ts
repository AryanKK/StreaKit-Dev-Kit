import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreaKit } from '../index.js';
import type {
  StorageAdapter,
  Streak,
  Activity,
  Milestone,
  ThemeState,
} from '../index.js';

// Test adapter that preserves Date objects (MemoryAdapter uses JSON clone which loses them)
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
  async listStreaks(filter?: { userId?: string; status?: string; tags?: string[] }) {
    let results = Array.from(this.streaks.values());
    if (filter?.userId) results = results.filter((s) => s.userId === filter.userId);
    if (filter?.status) results = results.filter((s) => s.status === filter.status);
    if (filter?.tags?.length) {
      results = results.filter((s) => filter.tags!.some((t) => s.tags.includes(t)));
    }
    return results;
  }
  async deleteStreak(id: string) {
    this.streaks.delete(id);
    this.activities.delete(id);
    this.milestones.delete(id);
    for (const key of this.themeStates.keys()) {
      if (key.startsWith(id + ':')) this.themeStates.delete(key);
    }
  }
  async clear() {
    this.streaks.clear();
    this.activities.clear();
    this.milestones.clear();
    this.themeStates.clear();
  }
}

describe('Enriched StreaKit Engine', () => {
  let engine: StreaKit;

  beforeEach(() => {
    engine = new StreaKit({ storage: new TestMemoryAdapter() });
  });

  it('creates streak with enriched options', async () => {
    const streak = await engine.createStreak({
      id: 'daily-run',
      frequency: 'daily',
      milestones: [7, 14, { threshold: 30, repeatable: true }],
      scoring: { basePoints: 10, multiplier: { type: 'linear', scale: 0.1 }, milestoneBonus: 50 },
      maxFreezes: 3,
      freezeCooldownDays: 2,
      skipDays: [0, 6],
      targetCount: 365,
      tags: ['fitness', 'running'],
      metadata: { category: 'exercise' },
      decay: { mode: 'linear', rate: 1, floor: 0 },
    });

    const status = await streak.status();
    expect(status.count).toBe(0);
    expect(status.targetCount).toBe(365);
    expect(status.targetProgress).toBe(0);
    expect(status.canFreeze).toBe(true);
    expect(status.freezesRemaining).toBe(3);
  });

  it('records activities and earns score', async () => {
    const streak = await engine.createStreak({
      id: 'test',
      frequency: 'daily',
      scoring: { basePoints: 10, multiplier: { type: 'linear', scale: 0.1 } },
    });

    const s1 = await streak.record();
    expect(s1.count).toBe(1);
    expect(s1.score).toBeGreaterThan(0);
    expect(s1.multiplier).toBeGreaterThanOrEqual(1);
  });

  it('freeze policy enforces max freezes', async () => {
    const streak = await engine.createStreak({
      id: 'test',
      frequency: 'daily',
      maxFreezes: 1,
    });

    await streak.record();
    await streak.freeze();
    await streak.unfreeze();

    await expect(streak.freeze()).rejects.toThrow(/limit/i);
  });

  it('listStreaks filters by tags', async () => {
    await engine.createStreak({ id: 's1', frequency: 'daily', tags: ['fitness'] });
    await engine.createStreak({ id: 's2', frequency: 'daily', tags: ['reading'] });

    const fitness = await engine.listStreaks({ tags: ['fitness'] });
    expect(fitness).toHaveLength(1);
    expect(fitness[0]!.id).toBe('s1');
  });

  it('deleteStreak removes streak', async () => {
    await engine.createStreak({ id: 'deleteme', frequency: 'daily' });
    await engine.deleteStreak('deleteme');
    const result = await engine.getStreak('deleteme');
    expect(result).toBeNull();
  });

  it('getStats returns statistics', async () => {
    const streak = await engine.createStreak({ id: 'test', frequency: 'daily' });
    await streak.record();

    const stats = await engine.getStats('test');
    expect(stats.totalActivities).toBe(1);
    expect(stats.currentCount).toBe(1);
  });

  it('registerRewardHandler dispatches on milestone', async () => {
    const handler = vi.fn();
    engine.registerRewardHandler('visual', handler);

    const streak = await engine.createStreak({
      id: 'test',
      frequency: 'daily',
      milestones: [1],
    });

    await streak.record();
    expect(handler).toHaveBeenCalled();
  });

  it('emits events for recording', async () => {
    const listener = vi.fn();
    engine.on('activity:recorded', listener);

    const streak = await engine.createStreak({ id: 'test', frequency: 'daily' });
    await streak.record();

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ streakId: 'test', count: 1 }),
    );
  });

  it('heuristics return health score', async () => {
    const streak = await engine.createStreak({ id: 'test', frequency: 'daily' });
    await streak.record();

    const health = await engine.heuristics.getHealthScore('test');
    expect(health.overall).toBeGreaterThanOrEqual(0);
    expect(health.overall).toBeLessThanOrEqual(100);
    expect(health.grade).toBeTruthy();
  });
});
