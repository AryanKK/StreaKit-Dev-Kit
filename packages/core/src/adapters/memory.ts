import type {
  StorageAdapter,
  Streak,
  StreakFilter,
  Activity,
  Milestone,
  ThemeState,
} from '../types/index.js';

const DATE_FIELDS = new Set([
  'lastActivityAt', 'frozenAt', 'frozenUntil', 'createdAt', 'updatedAt',
  'performedAt', 'achievedAt', 'at', 'lastFreezeEndedAt',
]);

function reviveDates(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && DATE_FIELDS.has(_key)) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d;
  }
  return value;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value), reviveDates) as T;
}

export class MemoryAdapter implements StorageAdapter {
  private streaks = new Map<string, Streak>();
  private activities = new Map<string, Activity[]>();
  private milestones = new Map<string, Milestone[]>();
  private themeStates = new Map<string, ThemeState>();

  async getStreak(id: string): Promise<Streak | null> {
    const streak = this.streaks.get(id);
    return streak ? deepClone(streak) : null;
  }

  async saveStreak(streak: Streak): Promise<void> {
    this.streaks.set(streak.id, deepClone(streak));
  }

  async getActivities(streakId: string, since?: Date): Promise<Activity[]> {
    const all = this.activities.get(streakId) ?? [];
    const filtered = since
      ? all.filter((a) => a.performedAt >= since)
      : all;
    return deepClone(filtered);
  }

  async saveActivity(activity: Activity): Promise<void> {
    const list = this.activities.get(activity.streakId) ?? [];
    list.push(deepClone(activity));
    this.activities.set(activity.streakId, list);
  }

  async getMilestones(streakId: string): Promise<Milestone[]> {
    return deepClone(this.milestones.get(streakId) ?? []);
  }

  async saveMilestone(milestone: Milestone): Promise<void> {
    const list = this.milestones.get(milestone.streakId) ?? [];
    const idx = list.findIndex((m) => m.id === milestone.id);
    if (idx >= 0) {
      list[idx] = deepClone(milestone);
    } else {
      list.push(deepClone(milestone));
    }
    this.milestones.set(milestone.streakId, list);
  }

  async getThemeState(
    streakId: string,
    themeId: string,
  ): Promise<ThemeState | null> {
    const key = `${streakId}:${themeId}`;
    const state = this.themeStates.get(key);
    return state ? deepClone(state) : null;
  }

  async saveThemeState(state: ThemeState): Promise<void> {
    const key = `${state.streakId}:${state.themeId}`;
    this.themeStates.set(key, deepClone(state));
  }

  async listStreaks(filter?: StreakFilter): Promise<Streak[]> {
    let results = Array.from(this.streaks.values());
    if (filter?.userId) results = results.filter(s => s.userId === filter.userId);
    if (filter?.status) results = results.filter(s => s.status === filter.status);
    if (filter?.tags && filter.tags.length > 0) {
      results = results.filter(s => filter.tags!.some(t => s.tags.includes(t)));
    }
    return deepClone(results);
  }

  async deleteStreak(id: string): Promise<void> {
    this.streaks.delete(id);
    this.activities.delete(id);
    this.milestones.delete(id);
    // Remove theme states for this streak
    for (const key of this.themeStates.keys()) {
      if (key.startsWith(id + ':')) {
        this.themeStates.delete(key);
      }
    }
  }

  async clear(): Promise<void> {
    this.streaks.clear();
    this.activities.clear();
    this.milestones.clear();
    this.themeStates.clear();
  }
}
