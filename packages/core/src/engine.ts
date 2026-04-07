import type {
  StreaKitConfig,
  CreateStreakOptions,
  StorageAdapter,
  Streak,
  StreakEvents,
  StreakEventName,
  AnimationCollection,
  MilestoneConfig,
  MilestoneDefinition,
  StreakStats,
  CalendarDay,
  StreakFilter,
  RewardHandler,
  RiskAssessment,
  DifficultyAdjustment,
  NudgeRecommendation,
  HealthScore,
  BehavioralInsights,
  RewardRecommendation,
} from './types/index.js';
import { EventEmitter } from './events.js';
import { StreakInstance } from './streak.js';
import { generateId } from './utils.js';
import { RewardRegistry } from './rewards.js';
import { HeuristicEngine } from './heuristics.js';
import { StatsComputer } from './stats.js';

type Listener<T> = (data: T) => void;

const DEFAULT_TIMEZONE = 'UTC';
const DEFAULT_AT_RISK_HOURS = 6;

export class StreaKit {
  private storage: StorageAdapter;
  private emitter: EventEmitter;
  private defaultTimezone: string;
  private atRiskThresholdHours: number;
  private rewardRegistry: RewardRegistry;
  private collections = new Map<string, AnimationCollection>();

  readonly heuristics: HeuristicEngine;

  constructor(config: StreaKitConfig) {
    this.storage = config.storage;
    this.emitter = new EventEmitter();
    this.defaultTimezone = config.defaultTimezone ?? DEFAULT_TIMEZONE;
    this.atRiskThresholdHours = config.atRiskThresholdHours ?? DEFAULT_AT_RISK_HOURS;
    this.rewardRegistry = new RewardRegistry();
    this.heuristics = new HeuristicEngine(this.storage);
  }

  async createStreak(opts: CreateStreakOptions): Promise<StreakInstance> {
    const now = new Date();
    const timezone = opts.timezone ?? this.defaultTimezone;

    const streak: Streak = {
      id: opts.id,
      userId: opts.userId,
      frequency: opts.frequency,
      gracePeriod: opts.gracePeriod,
      currentCount: 0,
      longestCount: 0,
      status: 'active',
      lastActivityAt: null,
      frozenAt: null,
      frozenUntil: null,
      timezone,
      createdAt: now,
      updatedAt: now,
      tags: opts.tags ?? [],
      metadata: opts.metadata ?? {},
      targetCount: opts.targetCount ?? null,
      totalFreezes: 0,
      lastFreezeEndedAt: null,
      totalScore: 0,
      currentMultiplier: 1,
      skipDays: opts.skipDays ?? [],
      collectionId: opts.collectionId ?? null,
      decayConfig: opts.decay ?? null,
      scoringConfig: opts.scoring ?? null,
      maxFreezes: opts.maxFreezes ?? null,
      freezeCooldownDays: opts.freezeCooldownDays ?? null,
      maxFreezeDays: opts.maxFreezeDays ?? 7,
      totalResets: 0,
    };

    await this.storage.saveStreak(streak);

    // Create milestone entries
    if (opts.milestones) {
      for (const mc of opts.milestones) {
        const def = normalizeMilestoneConfig(mc);
        await this.storage.saveMilestone({
          id: generateId(),
          streakId: opts.id,
          threshold: def.threshold,
          rewards: def.rewards ?? [{ id: generateId(), type: 'visual', payload: { threshold: def.threshold } }],
          achievedAt: null,
          repeatable: def.repeatable ?? false,
          condition: def.condition,
        });
      }
    }

    const instance = new StreakInstance(opts.id, this.storage, this.emitter, {
      atRiskThresholdHours: this.atRiskThresholdHours,
      rewardRegistry: this.rewardRegistry,
      collections: this.collections,
    });

    await instance.loadMilestoneThresholds();
    return instance;
  }

  async getStreak(id: string): Promise<StreakInstance | null> {
    const streak = await this.storage.getStreak(id);
    if (!streak) return null;

    const instance = new StreakInstance(id, this.storage, this.emitter, {
      atRiskThresholdHours: this.atRiskThresholdHours,
      rewardRegistry: this.rewardRegistry,
      collections: this.collections,
    });

    await instance.loadMilestoneThresholds();
    return instance;
  }

  async listStreaks(filter?: StreakFilter): Promise<StreakInstance[]> {
    const streaks = await this.storage.listStreaks(filter);
    const instances: StreakInstance[] = [];
    for (const s of streaks) {
      const instance = new StreakInstance(s.id, this.storage, this.emitter, {
        atRiskThresholdHours: this.atRiskThresholdHours,
        rewardRegistry: this.rewardRegistry,
        collections: this.collections,
      });
      await instance.loadMilestoneThresholds();
      instances.push(instance);
    }
    return instances;
  }

  async deleteStreak(id: string): Promise<void> {
    await this.storage.deleteStreak(id);
  }

  // ── Statistics ──────────────────────────────────────────────────────────

  async getStats(id: string): Promise<StreakStats> {
    return StatsComputer.getStats(this.storage, id);
  }

  async getActivityCalendar(id: string, opts?: { from?: Date; to?: Date }): Promise<CalendarDay[]> {
    return StatsComputer.getActivityCalendar(this.storage, id, opts);
  }

  // ── Reward registration ────────────────────────────────────────────────

  registerRewardHandler(type: string, handler: RewardHandler): () => void {
    return this.rewardRegistry.register(type, handler);
  }

  // ── Collection registration ────────────────────────────────────────────

  registerCollection(collection: AnimationCollection): void {
    this.collections.set(collection.id, collection);
  }

  // ── Event delegation ───────────────────────────────────────────────────

  on<E extends StreakEventName>(event: E, listener: Listener<StreakEvents[E]>): () => void {
    return this.emitter.on(event, listener);
  }

  off<E extends StreakEventName>(event: E, listener: Listener<StreakEvents[E]>): void {
    this.emitter.off(event, listener);
  }

  getStorage(): StorageAdapter {
    return this.storage;
  }

  getEmitter(): EventEmitter {
    return this.emitter;
  }
}

export function defineCollection(collection: AnimationCollection): AnimationCollection {
  return collection;
}

function normalizeMilestoneConfig(mc: MilestoneConfig): MilestoneDefinition {
  if (typeof mc === 'number') {
    return { threshold: mc };
  }
  return mc;
}
