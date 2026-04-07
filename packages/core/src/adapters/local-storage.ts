import type {
  StorageAdapter,
  Streak,
  StreakFilter,
  Activity,
  Milestone,
  ThemeState,
} from '../types/index.js';

const DATE_FIELDS = new Set([
  'lastActivityAt',
  'frozenAt',
  'frozenUntil',
  'lastFreezeEndedAt',
  'createdAt',
  'updatedAt',
  'performedAt',
  'achievedAt',
  'at',
]);

function reviveDates(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && DATE_FIELDS.has(_key)) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d;
  }
  return value;
}

function parse<T>(json: string): T {
  return JSON.parse(json, reviveDates) as T;
}

export class LocalStorageAdapter implements StorageAdapter {
  private readonly prefix: string;

  constructor(opts?: { prefix?: string }) {
    if (typeof localStorage === 'undefined') {
      throw new Error(
        'LocalStorageAdapter requires a global localStorage object.',
      );
    }
    this.prefix = opts?.prefix ?? 'streakit:';
  }

  private streakKey(id: string): string {
    return `${this.prefix}streak:${id}`;
  }

  private activitiesKey(streakId: string): string {
    return `${this.prefix}activities:${streakId}`;
  }

  private milestonesKey(streakId: string): string {
    return `${this.prefix}milestones:${streakId}`;
  }

  private themeKey(streakId: string, themeId: string): string {
    return `${this.prefix}theme:${streakId}:${themeId}`;
  }

  async getStreak(id: string): Promise<Streak | null> {
    const raw = localStorage.getItem(this.streakKey(id));
    return raw ? parse<Streak>(raw) : null;
  }

  async saveStreak(streak: Streak): Promise<void> {
    localStorage.setItem(this.streakKey(streak.id), JSON.stringify(streak));
  }

  async getActivities(streakId: string, since?: Date): Promise<Activity[]> {
    const raw = localStorage.getItem(this.activitiesKey(streakId));
    if (!raw) return [];
    const all = parse<Activity[]>(raw);
    return since ? all.filter((a) => a.performedAt >= since) : all;
  }

  async saveActivity(activity: Activity): Promise<void> {
    const key = this.activitiesKey(activity.streakId);
    const raw = localStorage.getItem(key);
    const list: Activity[] = raw ? parse<Activity[]>(raw) : [];
    list.push(activity);
    localStorage.setItem(key, JSON.stringify(list));
  }

  async getMilestones(streakId: string): Promise<Milestone[]> {
    const raw = localStorage.getItem(this.milestonesKey(streakId));
    return raw ? parse<Milestone[]>(raw) : [];
  }

  async saveMilestone(milestone: Milestone): Promise<void> {
    const key = this.milestonesKey(milestone.streakId);
    const raw = localStorage.getItem(key);
    const list: Milestone[] = raw ? parse<Milestone[]>(raw) : [];
    const idx = list.findIndex((m) => m.id === milestone.id);
    if (idx >= 0) {
      list[idx] = milestone;
    } else {
      list.push(milestone);
    }
    localStorage.setItem(key, JSON.stringify(list));
  }

  async getThemeState(
    streakId: string,
    themeId: string,
  ): Promise<ThemeState | null> {
    const raw = localStorage.getItem(this.themeKey(streakId, themeId));
    return raw ? parse<ThemeState>(raw) : null;
  }

  async saveThemeState(state: ThemeState): Promise<void> {
    localStorage.setItem(
      this.themeKey(state.streakId, state.themeId),
      JSON.stringify(state),
    );
  }

  async listStreaks(filter?: StreakFilter): Promise<Streak[]> {
    const results: Streak[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.prefix + 'streak:')) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const streak = parse<Streak>(raw);
          if (this.matchesFilter(streak, filter)) {
            results.push(streak);
          }
        }
      }
    }
    return results;
  }

  async deleteStreak(id: string): Promise<void> {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.prefix) && (
        key === this.streakKey(id) ||
        key === this.activitiesKey(id) ||
        key === this.milestonesKey(id) ||
        key.startsWith(this.prefix + 'theme:' + id + ':')
      )) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  }

  private matchesFilter(streak: Streak, filter?: StreakFilter): boolean {
    if (!filter) return true;
    if (filter.userId && streak.userId !== filter.userId) return false;
    if (filter.status && streak.status !== filter.status) return false;
    if (filter.tags && filter.tags.length > 0) {
      if (!filter.tags.some(t => streak.tags.includes(t))) return false;
    }
    return true;
  }

  async clear(): Promise<void> {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.prefix)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  }
}
