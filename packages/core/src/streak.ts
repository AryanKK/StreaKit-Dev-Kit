import type {
  StorageAdapter,
  Streak,
  StreakStatus,
  Milestone,
  Duration,
  AnimationCollection,
  ThemeState,
  CalendarDay,
  HealthScore,
  RiskAssessment,
  BehavioralInsights,
} from './types/index.js';
import { EventEmitter } from './events.js';
import {
  generateId,
  getNextDeadline,
  getHoursRemaining,
  isWithinFrequencyWindow,
  isStreakExpired,
  durationToMs,
} from './utils.js';
import { DecayEngine } from './decay.js';
import { ScoringEngine } from './scoring.js';
import { RewardRegistry } from './rewards.js';
import { ThemeManager } from './theme-manager.js';

export interface StreakInstanceConfig {
  atRiskThresholdHours: number;
  rewardRegistry?: RewardRegistry;
  collections?: Map<string, AnimationCollection>;
}

export class StreakInstance {
  readonly id: string;
  private storage: StorageAdapter;
  private emitter: EventEmitter;
  private config: StreakInstanceConfig;

  constructor(
    id: string,
    storage: StorageAdapter,
    emitter: EventEmitter,
    config: StreakInstanceConfig,
  ) {
    this.id = id;
    this.storage = storage;
    this.emitter = emitter;
    this.config = config;
  }

  async record(metadata?: Record<string, unknown>): Promise<StreakStatus> {
    const now = new Date();
    let streak = await this.requireStreak();

    // Check if today is a skip day
    if (this.isSkipDay(now, streak)) {
      return this.computeStatus(streak, now);
    }

    // Apply decay if configured (instead of hard break)
    if (streak.decayConfig && streak.status === 'active' && streak.lastActivityAt) {
      const decayConfig = streak.decayConfig;
      const result = DecayEngine.compute({
        currentCount: streak.currentCount,
        lastActivityAt: streak.lastActivityAt,
        now,
        frequency: streak.frequency,
        timezone: streak.timezone,
        gracePeriod: streak.gracePeriod,
        decayConfig,
        milestoneThresholds: (await this.loadMilestoneThresholds()),
      });

      if (result.missedWindows > 0) {
        const prevCount = streak.currentCount;
        streak = { ...streak, currentCount: result.effectiveCount, updatedAt: now };

        if (result.isBroken) {
          streak.status = 'broken';
          await this.storage.saveStreak(streak);
          this.emitter.emit('streak:broken', { streakId: this.id, finalCount: prevCount, longestCount: streak.longestCount });
        } else {
          this.emitter.emit('streak:decayed', { streakId: this.id, previousCount: prevCount, newCount: result.effectiveCount, mode: decayConfig.mode });
          // Add recovery bonus
          const bonus = DecayEngine.getRecoveryBonus(decayConfig);
          if (bonus > 0) {
            streak.currentCount = Math.min(streak.currentCount + bonus, prevCount);
          }
        }
        await this.storage.saveStreak(streak);
      }
    } else if (
      !streak.decayConfig &&
      streak.status === 'active' &&
      streak.lastActivityAt &&
      isStreakExpired(streak.lastActivityAt, streak.frequency, streak.gracePeriod, now, streak.timezone)
    ) {
      // Hard break (no decay configured)
      const finalCount = streak.currentCount;
      streak = { ...streak, status: 'broken', updatedAt: now };
      await this.storage.saveStreak(streak);
      this.emitter.emit('streak:broken', { streakId: this.id, finalCount, longestCount: streak.longestCount });
    }

    const prevCount = streak.currentCount;

    // Handle recording based on current state
    if (streak.status === 'broken' || streak.currentCount === 0) {
      streak = { ...streak, currentCount: 1, status: 'active', lastActivityAt: now, updatedAt: now };
    } else if (streak.status === 'frozen') {
      streak = {
        ...streak,
        currentCount: streak.currentCount + 1,
        longestCount: Math.max(streak.longestCount, streak.currentCount + 1),
        status: 'active',
        lastActivityAt: now,
        frozenAt: null,
        frozenUntil: null,
        updatedAt: now,
      };
      this.emitter.emit('streak:unfrozen', { streakId: this.id });
    } else {
      if (!isWithinFrequencyWindow(streak.lastActivityAt, streak.frequency, now, streak.timezone)) {
        return this.computeStatus(streak, now);
      }
      const newCount = streak.currentCount + 1;
      streak = {
        ...streak,
        currentCount: newCount,
        longestCount: Math.max(streak.longestCount, newCount),
        lastActivityAt: now,
        updatedAt: now,
      };
    }

    streak.longestCount = Math.max(streak.longestCount, streak.currentCount);

    // Check milestones and determine if any were hit
    const hitMilestone = await this.checkMilestones(streak.currentCount, streak);

    // Compute scoring
    const scoring = ScoringEngine.calculatePoints({
      count: streak.currentCount,
      config: streak.scoringConfig,
      hitMilestone,
      previousScore: streak.totalScore,
    });
    streak.totalScore = scoring.totalScore;
    streak.currentMultiplier = scoring.multiplier;

    await this.storage.saveStreak(streak);

    // Save activity with scoring info
    await this.storage.saveActivity({
      id: generateId(),
      streakId: this.id,
      performedAt: now,
      metadata,
      pointsEarned: scoring.pointsEarned,
      multiplierAtRecord: scoring.multiplier,
    });

    this.emitter.emit('activity:recorded', {
      streakId: this.id,
      count: streak.currentCount,
      points: scoring.pointsEarned,
      multiplier: scoring.multiplier,
    });

    if (scoring.pointsEarned > 0) {
      this.emitter.emit('score:updated', {
        streakId: this.id,
        totalScore: scoring.totalScore,
        pointsEarned: scoring.pointsEarned,
        multiplier: scoring.multiplier,
      });
    }

    // Update theme state if collection is bound
    if (streak.collectionId && this.config.collections) {
      const collection = this.config.collections.get(streak.collectionId);
      if (collection) {
        const transition = ThemeManager.detectTransition(collection, prevCount, streak.currentCount);
        await ThemeManager.persist(this.storage, this.id, collection, prevCount, streak.currentCount);
        if (transition) {
          this.emitter.emit('stage:change', {
            streakId: this.id,
            from: transition.from,
            to: transition.to,
            collection: collection.id,
          });
        }
      }
    }

    return this.computeStatus(streak, now);
  }

  async status(): Promise<StreakStatus> {
    const now = new Date();
    let streak = await this.requireStreak();

    // Auto-detect broken (with decay or hard break)
    if (streak.status === 'active' && streak.lastActivityAt) {
      if (streak.decayConfig) {
        const result = DecayEngine.compute({
          currentCount: streak.currentCount,
          lastActivityAt: streak.lastActivityAt,
          now,
          frequency: streak.frequency,
          timezone: streak.timezone,
          gracePeriod: streak.gracePeriod,
          decayConfig: streak.decayConfig,
          milestoneThresholds: (await this.loadMilestoneThresholds()),
        });
        if (result.isBroken) {
          const finalCount = streak.currentCount;
          streak = { ...streak, currentCount: result.effectiveCount, status: 'broken', updatedAt: now };
          await this.storage.saveStreak(streak);
          this.emitter.emit('streak:broken', { streakId: this.id, finalCount, longestCount: streak.longestCount });
        } else if (result.missedWindows > 0) {
          streak = { ...streak, currentCount: result.effectiveCount, updatedAt: now };
          await this.storage.saveStreak(streak);
        }
      } else if (isStreakExpired(streak.lastActivityAt, streak.frequency, streak.gracePeriod, now, streak.timezone)) {
        const finalCount = streak.currentCount;
        streak = { ...streak, status: 'broken', updatedAt: now };
        await this.storage.saveStreak(streak);
        this.emitter.emit('streak:broken', { streakId: this.id, finalCount, longestCount: streak.longestCount });
      }
    }

    // Auto-detect frozen expiry
    if (streak.status === 'frozen' && streak.frozenUntil && now.getTime() > streak.frozenUntil.getTime()) {
      streak = { ...streak, status: 'active', frozenAt: null, frozenUntil: null, updatedAt: now };
      await this.storage.saveStreak(streak);
    }

    return this.computeStatus(streak, now);
  }

  async freeze(opts?: { maxDays?: number }): Promise<void> {
    const now = new Date();
    const streak = await this.requireStreak();
    if (streak.status === 'broken') throw new Error('Cannot freeze a broken streak');
    if (streak.status === 'frozen') return;

    // Freeze policy checks
    if (streak.maxFreezes !== null && streak.totalFreezes >= streak.maxFreezes) {
      throw new Error(`Freeze limit reached (${streak.maxFreezes} max)`);
    }
    if (streak.freezeCooldownDays !== null && streak.lastFreezeEndedAt) {
      const cooldownMs = streak.freezeCooldownDays * 86_400_000;
      if (now.getTime() - streak.lastFreezeEndedAt.getTime() < cooldownMs) {
        const daysLeft = Math.ceil((cooldownMs - (now.getTime() - streak.lastFreezeEndedAt.getTime())) / 86_400_000);
        throw new Error(`Freeze cooldown active (${daysLeft} days remaining)`);
      }
    }

    const maxDays = opts?.maxDays ?? streak.maxFreezeDays;
    const frozenUntil = new Date(now.getTime() + maxDays * 86_400_000);

    await this.storage.saveStreak({
      ...streak,
      status: 'frozen',
      frozenAt: now,
      frozenUntil,
      totalFreezes: streak.totalFreezes + 1,
      updatedAt: now,
    });

    const freezesRemaining = streak.maxFreezes !== null
      ? streak.maxFreezes - streak.totalFreezes - 1
      : null;

    this.emitter.emit('streak:frozen', { streakId: this.id, freezesRemaining });
  }

  async unfreeze(): Promise<void> {
    const now = new Date();
    const streak = await this.requireStreak();
    if (streak.status !== 'frozen') return;

    await this.storage.saveStreak({
      ...streak,
      status: 'active',
      frozenAt: null,
      frozenUntil: null,
      lastActivityAt: now,
      lastFreezeEndedAt: now,
      updatedAt: now,
    });

    this.emitter.emit('streak:unfrozen', { streakId: this.id });
  }

  async reset(): Promise<void> {
    const now = new Date();
    const streak = await this.requireStreak();
    const finalCount = streak.currentCount;

    await this.storage.saveStreak({
      ...streak,
      currentCount: 0,
      status: 'broken',
      lastActivityAt: null,
      frozenAt: null,
      frozenUntil: null,
      totalResets: streak.totalResets + 1,
      updatedAt: now,
    });

    if (finalCount > 0) {
      this.emitter.emit('streak:broken', { streakId: this.id, finalCount, longestCount: streak.longestCount });
    }
  }

  async canFreeze(): Promise<boolean> {
    const streak = await this.requireStreak();
    const now = new Date();
    if (streak.status === 'broken' || streak.status === 'frozen') return false;
    if (streak.maxFreezes !== null && streak.totalFreezes >= streak.maxFreezes) return false;
    if (streak.freezeCooldownDays !== null && streak.lastFreezeEndedAt) {
      const cooldownMs = streak.freezeCooldownDays * 86_400_000;
      if (now.getTime() - streak.lastFreezeEndedAt.getTime() < cooldownMs) return false;
    }
    return true;
  }

  async getScore(): Promise<{ totalScore: number; multiplier: number }> {
    const streak = await this.requireStreak();
    return { totalScore: streak.totalScore, multiplier: streak.currentMultiplier };
  }

  async getThemeState(): Promise<ThemeState | null> {
    const streak = await this.requireStreak();
    if (!streak.collectionId) return null;
    return this.storage.getThemeState(this.id, streak.collectionId);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async requireStreak(): Promise<Streak> {
    const streak = await this.storage.getStreak(this.id);
    if (!streak) throw new Error(`Streak "${this.id}" not found`);
    return streak;
  }

  private isSkipDay(date: Date, streak: Streak): boolean {
    if (streak.skipDays.length === 0) return false;
    const dayOfWeek = this.getDayOfWeek(date, streak.timezone);
    return streak.skipDays.includes(dayOfWeek);
  }

  private getDayOfWeek(date: Date, timezone: string): number {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).formatToParts(date);
      const weekday = parts.find(p => p.type === 'weekday')?.value ?? '';
      const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      return map[weekday] ?? date.getDay();
    } catch {
      return date.getDay();
    }
  }

  private async checkMilestones(currentCount: number, streak: Streak): Promise<boolean> {
    const milestones = await this.storage.getMilestones(this.id);
    const now = new Date();
    let hitAny = false;

    for (const ms of milestones) {
      if (ms.threshold <= currentCount && (ms.achievedAt === null || ms.repeatable)) {
        if (ms.achievedAt !== null && ms.repeatable) {
          // Skip if already achieved this cycle (same count)
          continue;
        }
        const updated = { ...ms, achievedAt: now };
        await this.storage.saveMilestone(updated);
        hitAny = true;

        // Dispatch via reward registry if available
        if (this.config.rewardRegistry) {
          const status = this.computeStatus(streak, now);
          const dispatched = await this.config.rewardRegistry.dispatch(updated, streak, status);
          for (const reward of dispatched) {
            this.emitter.emit('reward:dispatched', {
              streakId: this.id,
              rewardId: reward.id,
              rewardType: reward.type,
              milestone: ms.threshold,
            });
          }
        }

        this.emitter.emit('milestone:reached', {
          streakId: this.id,
          threshold: ms.threshold,
          rewards: ms.rewards,
        });
      }
    }

    return hitAny;
  }

  private computeStatus(streak: Streak, now?: Date): StreakStatus {
    const _now = now ?? new Date();
    const isFrozen = streak.status === 'frozen';
    const isBroken = streak.status === 'broken';
    const isActive = streak.status === 'active' && streak.currentCount > 0;

    let nextDeadline: Date | null = null;
    let isAtRisk = false;

    if (isActive && streak.lastActivityAt) {
      nextDeadline = getNextDeadline(streak.lastActivityAt, streak.frequency, streak.timezone, streak.gracePeriod);
      const hoursLeft = getHoursRemaining(nextDeadline, _now);
      isAtRisk = hoursLeft > 0 && hoursLeft < this.config.atRiskThresholdHours;

      if (isAtRisk) {
        this.emitter.emit('streak:atrisk', { streakId: this.id, hoursRemaining: hoursLeft });
      }
    }

    const { currentMilestone, nextMilestone, progressToNext } = this.computeMilestoneProgress(streak.currentCount);

    // Enriched fields
    const multiplier = ScoringEngine.getMultiplier(streak.currentCount, streak.scoringConfig?.multiplier);
    const ageMs = _now.getTime() - streak.createdAt.getTime();
    const streakAge = Math.max(0, Math.ceil(ageMs / 86_400_000));

    const freezesRemaining = streak.maxFreezes !== null
      ? Math.max(0, streak.maxFreezes - streak.totalFreezes)
      : null;

    let canFreezeNow = streak.status === 'active';
    if (canFreezeNow && streak.maxFreezes !== null && streak.totalFreezes >= streak.maxFreezes) canFreezeNow = false;
    if (canFreezeNow && streak.freezeCooldownDays !== null && streak.lastFreezeEndedAt) {
      const cooldownMs = streak.freezeCooldownDays * 86_400_000;
      if (_now.getTime() - streak.lastFreezeEndedAt.getTime() < cooldownMs) canFreezeNow = false;
    }

    const targetProgress = streak.targetCount
      ? Math.min(1, streak.currentCount / streak.targetCount)
      : 0;

    // Decay status
    let isDecaying = false;
    let decayedAmount = 0;
    if (streak.decayConfig && streak.status === 'active' && streak.lastActivityAt) {
      const result = DecayEngine.compute({
        currentCount: streak.currentCount,
        lastActivityAt: streak.lastActivityAt,
        now: _now,
        frequency: streak.frequency,
        timezone: streak.timezone,
        gracePeriod: streak.gracePeriod,
        decayConfig: streak.decayConfig,
      });
      isDecaying = result.missedWindows > 0;
      decayedAmount = result.decayedAmount;
    }

    return {
      count: streak.currentCount,
      longestCount: streak.longestCount,
      isActive,
      isAtRisk,
      isFrozen,
      isBroken,
      lastActivity: streak.lastActivityAt,
      nextDeadline,
      currentMilestone,
      nextMilestone,
      progressToNext,
      score: streak.totalScore,
      multiplier,
      freezesUsed: streak.totalFreezes,
      freezesRemaining,
      canFreeze: canFreezeNow,
      targetCount: streak.targetCount,
      targetProgress,
      isDecaying,
      decayedAmount,
      streakAge,
      completionRate: 0, // computed by StatsComputer, not inline
    };
  }

  milestoneThresholds: number[] | null = null;

  async loadMilestoneThresholds(): Promise<number[]> {
    if (this.milestoneThresholds) return this.milestoneThresholds;
    const milestones = await this.storage.getMilestones(this.id);
    this.milestoneThresholds = milestones.map(m => m.threshold).sort((a, b) => a - b);
    return this.milestoneThresholds;
  }

  private computeMilestoneProgress(count: number): {
    currentMilestone: number | null;
    nextMilestone: number | null;
    progressToNext: number;
  } {
    const thresholds = this.milestoneThresholds ?? [];
    let currentMilestone: number | null = null;
    let nextMilestone: number | null = null;

    for (const t of thresholds) {
      if (t <= count) currentMilestone = t;
      else { nextMilestone = t; break; }
    }

    let progressToNext = 0;
    if (nextMilestone !== null) {
      const base = currentMilestone ?? 0;
      const range = nextMilestone - base;
      progressToNext = range > 0 ? Math.min(1, (count - base) / range) : 0;
    } else if (thresholds.length > 0) {
      progressToNext = 1;
    }

    return { currentMilestone, nextMilestone, progressToNext };
  }
}
