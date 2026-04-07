import type {
  StorageAdapter,
  Streak,
  StreakFilter,
  Activity,
  Milestone,
  ThemeState,
} from '../types/index.js';

export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys?(): Promise<string[]>;
}

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

export class AsyncStorageAdapter implements StorageAdapter {
  private readonly storage: AsyncStorageLike;
  private readonly prefix: string;

  constructor(opts: { asyncStorage: AsyncStorageLike; prefix?: string }) {
    this.storage = opts.asyncStorage;
    this.prefix = opts.prefix ?? 'streakit:';
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
    const raw = await this.storage.getItem(this.streakKey(id));
    return raw ? parse<Streak>(raw) : null;
  }

  async saveStreak(streak: Streak): Promise<void> {
    await this.storage.setItem(
      this.streakKey(streak.id),
      JSON.stringify(streak),
    );
  }

  async getActivities(streakId: string, since?: Date): Promise<Activity[]> {
    const raw = await this.storage.getItem(this.activitiesKey(streakId));
    if (!raw) return [];
    const all = parse<Activity[]>(raw);
    return since ? all.filter((a) => a.performedAt >= since) : all;
  }

  async saveActivity(activity: Activity): Promise<void> {
    const key = this.activitiesKey(activity.streakId);
    const raw = await this.storage.getItem(key);
    const list: Activity[] = raw ? parse<Activity[]>(raw) : [];
    list.push(activity);
    await this.storage.setItem(key, JSON.stringify(list));
  }

  async getMilestones(streakId: string): Promise<Milestone[]> {
    const raw = await this.storage.getItem(this.milestonesKey(streakId));
    return raw ? parse<Milestone[]>(raw) : [];
  }

  async saveMilestone(milestone: Milestone): Promise<void> {
    const key = this.milestonesKey(milestone.streakId);
    const raw = await this.storage.getItem(key);
    const list: Milestone[] = raw ? parse<Milestone[]>(raw) : [];
    const idx = list.findIndex((m) => m.id === milestone.id);
    if (idx >= 0) {
      list[idx] = milestone;
    } else {
      list.push(milestone);
    }
    await this.storage.setItem(key, JSON.stringify(list));
  }

  async getThemeState(
    streakId: string,
    themeId: string,
  ): Promise<ThemeState | null> {
    const raw = await this.storage.getItem(this.themeKey(streakId, themeId));
    return raw ? parse<ThemeState>(raw) : null;
  }

  async saveThemeState(state: ThemeState): Promise<void> {
    await this.storage.setItem(
      this.themeKey(state.streakId, state.themeId),
      JSON.stringify(state),
    );
  }

  async listStreaks(filter?: StreakFilter): Promise<Streak[]> {
    if (!this.storage.getAllKeys) {
      throw new Error('AsyncStorageAdapter.listStreaks() requires getAllKeys()');
    }
    const allKeys = await this.storage.getAllKeys();
    const streakKeys = allKeys.filter(k => k.startsWith(this.prefix + 'streak:'));
    const results: Streak[] = [];
    for (const key of streakKeys) {
      const raw = await this.storage.getItem(key);
      if (raw) {
        const streak = parse<Streak>(raw);
        if (this.matchesFilter(streak, filter)) {
          results.push(streak);
        }
      }
    }
    return results;
  }

  async deleteStreak(id: string): Promise<void> {
    await this.storage.removeItem(this.streakKey(id));
    await this.storage.removeItem(this.activitiesKey(id));
    await this.storage.removeItem(this.milestonesKey(id));
    if (this.storage.getAllKeys) {
      const allKeys = await this.storage.getAllKeys();
      const themeKeys = allKeys.filter(k => k.startsWith(this.prefix + 'theme:' + id + ':'));
      await Promise.all(themeKeys.map(k => this.storage.removeItem(k)));
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
    if (!this.storage.getAllKeys) {
      throw new Error(
        'AsyncStorageAdapter.clear() requires getAllKeys() on the underlying storage.',
      );
    }
    const allKeys = await this.storage.getAllKeys();
    await Promise.all(
      allKeys
        .filter((key) => key.startsWith(this.prefix))
        .map((key) => this.storage.removeItem(key)),
    );
  }
}
