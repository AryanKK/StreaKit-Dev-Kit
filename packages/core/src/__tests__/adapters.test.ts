import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryAdapter } from '../adapters/memory.js';
import { LocalStorageAdapter } from '../adapters/local-storage.js';
import { AsyncStorageAdapter } from '../adapters/async-storage.js';
import type {
  StorageAdapter,
  Streak,
  Activity,
  Milestone,
  ThemeState,
} from '../types/index.js';

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeStreak(overrides?: Partial<Streak>): Streak {
  return {
    id: 'streak-1',
    frequency: 'daily',
    currentCount: 5,
    longestCount: 10,
    status: 'active',
    lastActivityAt: new Date('2025-07-01T12:00:00Z'),
    frozenAt: null,
    frozenUntil: null,
    timezone: 'UTC',
    createdAt: new Date('2025-06-01T00:00:00Z'),
    updatedAt: new Date('2025-07-01T12:00:00Z'),
    tags: [],
    metadata: {},
    targetCount: null,
    totalFreezes: 0,
    lastFreezeEndedAt: null,
    totalScore: 0,
    currentMultiplier: 1,
    skipDays: [],
    collectionId: null,
    decayConfig: null,
    scoringConfig: null,
    maxFreezes: null,
    freezeCooldownDays: null,
    maxFreezeDays: 7,
    totalResets: 0,
    ...overrides,
  };
}

function makeActivity(overrides?: Partial<Activity>): Activity {
  return {
    id: 'act-1',
    streakId: 'streak-1',
    performedAt: new Date('2025-07-01T12:00:00Z'),
    ...overrides,
  };
}

function makeMilestone(overrides?: Partial<Milestone>): Milestone {
  return {
    id: 'ms-1',
    streakId: 'streak-1',
    threshold: 7,
    rewards: [{ id: 'r-1', type: 'visual', payload: { threshold: 7 } }],
    achievedAt: null,
    repeatable: false,
    ...overrides,
  };
}

function makeThemeState(overrides?: Partial<ThemeState>): ThemeState {
  return {
    streakId: 'streak-1',
    themeId: 'forest',
    currentStage: 'seedling',
    stageData: { growth: 0.5 },
    history: [
      {
        from: 'seed',
        to: 'seedling',
        at: new Date('2025-07-01T08:00:00Z'),
        streakCount: 3,
      },
    ],
    ...overrides,
  };
}

// ── Mock localStorage ─────────────────────────────────────────────────────

function createMockLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
  };
}

// ── Mock AsyncStorage ─────────────────────────────────────────────────────

function createMockAsyncStorage() {
  const store = new Map<string, string>();
  return {
    async getItem(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async setItem(key: string, value: string): Promise<void> {
      store.set(key, value);
    },
    async removeItem(key: string): Promise<void> {
      store.delete(key);
    },
    async multiRemove(keys: string[]): Promise<void> {
      for (const k of keys) store.delete(k);
    },
    async getAllKeys(): Promise<string[]> {
      return [...store.keys()];
    },
  };
}

// ── Shared adapter test suite ─────────────────────────────────────────────

function adapterSuite(
  name: string,
  factory: () => StorageAdapter,
  opts?: { serializesJSON?: boolean },
) {
  describe(name, () => {
    let adapter: StorageAdapter;

    beforeEach(() => {
      adapter = factory();
    });

    // ── getStreak ───────────────────────────────────────────────────────

    describe('getStreak', () => {
      it('returns null for an unknown id', async () => {
        expect(await adapter.getStreak('nonexistent')).toBeNull();
      });
    });

    // ── saveStreak + getStreak round-trip ────────────────────────────────

    describe('saveStreak + getStreak round-trip', () => {
      it('persists and retrieves a streak', async () => {
        const streak = makeStreak();
        await adapter.saveStreak(streak);
        const loaded = await adapter.getStreak('streak-1');

        expect(loaded).not.toBeNull();
        expect(loaded!.id).toBe('streak-1');
        expect(loaded!.currentCount).toBe(5);
        expect(loaded!.longestCount).toBe(10);
        expect(loaded!.status).toBe('active');
        expect(loaded!.timezone).toBe('UTC');
      });

      it('overwrites on re-save', async () => {
        await adapter.saveStreak(makeStreak());
        await adapter.saveStreak(makeStreak({ currentCount: 99 }));

        const loaded = await adapter.getStreak('streak-1');
        expect(loaded!.currentCount).toBe(99);
      });

      it('stores multiple streaks independently', async () => {
        await adapter.saveStreak(makeStreak({ id: 'a' }));
        await adapter.saveStreak(makeStreak({ id: 'b', currentCount: 42 }));

        expect((await adapter.getStreak('a'))!.currentCount).toBe(5);
        expect((await adapter.getStreak('b'))!.currentCount).toBe(42);
      });
    });

    // ── saveActivity + getActivities ────────────────────────────────────

    describe('saveActivity + getActivities', () => {
      it('returns empty array when no activities exist', async () => {
        expect(await adapter.getActivities('streak-1')).toEqual([]);
      });

      it('round-trips an activity', async () => {
        const act = makeActivity();
        await adapter.saveActivity(act);

        const loaded = await adapter.getActivities('streak-1');
        expect(loaded).toHaveLength(1);
        expect(loaded[0]!.id).toBe('act-1');
        expect(loaded[0]!.streakId).toBe('streak-1');
      });

      it('appends multiple activities', async () => {
        await adapter.saveActivity(makeActivity({ id: 'a1' }));
        await adapter.saveActivity(makeActivity({ id: 'a2' }));
        await adapter.saveActivity(makeActivity({ id: 'a3' }));

        const loaded = await adapter.getActivities('streak-1');
        expect(loaded).toHaveLength(3);
      });

      if (opts?.serializesJSON) {
        it('filters by since parameter', async () => {
          await adapter.saveActivity(
            makeActivity({
              id: 'old',
              performedAt: new Date('2025-06-01T00:00:00Z'),
            }),
          );
          await adapter.saveActivity(
            makeActivity({
              id: 'new',
              performedAt: new Date('2025-07-15T00:00:00Z'),
            }),
          );

          const all = await adapter.getActivities('streak-1');
          expect(all).toHaveLength(2);

          const filtered = await adapter.getActivities(
            'streak-1',
            new Date('2025-07-01T00:00:00Z'),
          );
          expect(filtered).toHaveLength(1);
          expect(filtered[0]!.id).toBe('new');
        });
      }

      it('keeps activities separated by streakId', async () => {
        await adapter.saveActivity(
          makeActivity({ id: 'a1', streakId: 'streak-A' }),
        );
        await adapter.saveActivity(
          makeActivity({ id: 'a2', streakId: 'streak-B' }),
        );

        expect(await adapter.getActivities('streak-A')).toHaveLength(1);
        expect(await adapter.getActivities('streak-B')).toHaveLength(1);
      });
    });

    // ── saveMilestone + getMilestones ────────────────────────────────────

    describe('saveMilestone + getMilestones', () => {
      it('returns empty array when no milestones exist', async () => {
        expect(await adapter.getMilestones('streak-1')).toEqual([]);
      });

      it('round-trips a milestone', async () => {
        const ms = makeMilestone();
        await adapter.saveMilestone(ms);

        const loaded = await adapter.getMilestones('streak-1');
        expect(loaded).toHaveLength(1);
        expect(loaded[0]!.id).toBe('ms-1');
        expect(loaded[0]!.threshold).toBe(7);
        expect(loaded[0]!.achievedAt).toBeNull();
      });

      it('replaces a milestone with the same id', async () => {
        await adapter.saveMilestone(makeMilestone());
        await adapter.saveMilestone(
          makeMilestone({ achievedAt: new Date('2025-07-10T00:00:00Z') }),
        );

        const loaded = await adapter.getMilestones('streak-1');
        expect(loaded).toHaveLength(1);
        expect(loaded[0]!.achievedAt).not.toBeNull();
      });

      it('stores multiple milestones with different ids', async () => {
        await adapter.saveMilestone(makeMilestone({ id: 'ms-1', threshold: 7 }));
        await adapter.saveMilestone(
          makeMilestone({ id: 'ms-2', threshold: 30 }),
        );

        const loaded = await adapter.getMilestones('streak-1');
        expect(loaded).toHaveLength(2);
      });
    });

    // ── saveThemeState + getThemeState ───────────────────────────────────

    describe('saveThemeState + getThemeState', () => {
      it('returns null for unknown theme', async () => {
        expect(await adapter.getThemeState('streak-1', 'nope')).toBeNull();
      });

      it('round-trips a theme state', async () => {
        const ts = makeThemeState();
        await adapter.saveThemeState(ts);

        const loaded = await adapter.getThemeState('streak-1', 'forest');
        expect(loaded).not.toBeNull();
        expect(loaded!.currentStage).toBe('seedling');
        expect(loaded!.stageData).toEqual({ growth: 0.5 });
        expect(loaded!.history).toHaveLength(1);
      });

      it('overwrites theme state on re-save', async () => {
        await adapter.saveThemeState(makeThemeState());
        await adapter.saveThemeState(
          makeThemeState({ currentStage: 'tree' }),
        );

        const loaded = await adapter.getThemeState('streak-1', 'forest');
        expect(loaded!.currentStage).toBe('tree');
      });
    });

    // ── clear() ─────────────────────────────────────────────────────────

    describe('clear()', () => {
      it('removes all data', async () => {
        await adapter.saveStreak(makeStreak());
        await adapter.saveActivity(makeActivity());
        await adapter.saveMilestone(makeMilestone());
        await adapter.saveThemeState(makeThemeState());

        await adapter.clear();

        expect(await adapter.getStreak('streak-1')).toBeNull();
        expect(await adapter.getActivities('streak-1')).toEqual([]);
        expect(await adapter.getMilestones('streak-1')).toEqual([]);
        expect(await adapter.getThemeState('streak-1', 'forest')).toBeNull();
      });
    });

    // ── Date field round-trip ───────────────────────────────────────────

    if (opts?.serializesJSON) {
      describe('Date fields survive JSON round-trip', () => {
        it('streak dates are revived as Date instances', async () => {
          const streak = makeStreak({
            frozenAt: new Date('2025-07-02T00:00:00Z'),
            frozenUntil: new Date('2025-07-09T00:00:00Z'),
          });
          await adapter.saveStreak(streak);
          const loaded = await adapter.getStreak('streak-1');

          expect(loaded!.createdAt).toBeInstanceOf(Date);
          expect(loaded!.updatedAt).toBeInstanceOf(Date);
          expect(loaded!.lastActivityAt).toBeInstanceOf(Date);
          expect(loaded!.frozenAt).toBeInstanceOf(Date);
          expect(loaded!.frozenUntil).toBeInstanceOf(Date);
          expect(loaded!.createdAt.getTime()).toBe(
            new Date('2025-06-01T00:00:00Z').getTime(),
          );
          expect(loaded!.frozenUntil!.getTime()).toBe(
            new Date('2025-07-09T00:00:00Z').getTime(),
          );
        });

        it('activity performedAt is revived as a Date', async () => {
          await adapter.saveActivity(makeActivity());
          const loaded = await adapter.getActivities('streak-1');
          expect(loaded[0]!.performedAt).toBeInstanceOf(Date);
          expect(loaded[0]!.performedAt.getTime()).toBe(
            new Date('2025-07-01T12:00:00Z').getTime(),
          );
        });

        it('milestone achievedAt is revived as a Date when set', async () => {
          const achievedDate = new Date('2025-07-10T00:00:00Z');
          await adapter.saveMilestone(
            makeMilestone({ achievedAt: achievedDate }),
          );
          const loaded = await adapter.getMilestones('streak-1');
          expect(loaded[0]!.achievedAt).toBeInstanceOf(Date);
          expect(loaded[0]!.achievedAt!.getTime()).toBe(achievedDate.getTime());
        });

        it('themeState history dates are revived', async () => {
          await adapter.saveThemeState(makeThemeState());
          const loaded = await adapter.getThemeState('streak-1', 'forest');
          expect(loaded!.history[0]!.at).toBeInstanceOf(Date);
          expect(loaded!.history[0]!.at.getTime()).toBe(
            new Date('2025-07-01T08:00:00Z').getTime(),
          );
        });
      });
    }
  });
}

// ── Run suites ────────────────────────────────────────────────────────────

adapterSuite('MemoryAdapter', () => new MemoryAdapter());

describe('LocalStorageAdapter', () => {
  let originalLS: Storage | undefined;

  beforeEach(() => {
    originalLS = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      value: createMockLocalStorage(),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    if (originalLS !== undefined) {
      Object.defineProperty(globalThis, 'localStorage', {
        value: originalLS,
        writable: true,
        configurable: true,
      });
    } else {
      // @ts-expect-error — cleaning up mock
      delete globalThis.localStorage;
    }
  });

  adapterSuite(
    'LocalStorageAdapter',
    () => new LocalStorageAdapter(),
    { serializesJSON: true },
  );
});

describe('AsyncStorageAdapter', () => {
  adapterSuite(
    'AsyncStorageAdapter',
    () =>
      new AsyncStorageAdapter({
        asyncStorage: createMockAsyncStorage(),
      }),
    { serializesJSON: true },
  );
});
