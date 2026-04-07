import type {
  StorageAdapter,
  Streak,
  Activity,
  Milestone,
  StreakStatus,
  RiskAssessment,
  RiskFactor,
  DifficultyAdjustment,
  AdjustmentSuggestion,
  NudgeRecommendation,
  HealthScore,
  HealthGrade,
  BehavioralInsights,
  StreakPersona,
  Pattern,
  RewardRecommendation,
} from './types/index.js';
import { getHoursRemaining, getNextDeadline } from './utils.js';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export class HeuristicEngine {
  private storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  // ── Risk Prediction ──────────────────────────────────────────────────────

  async predictRisk(streakId: string): Promise<RiskAssessment> {
    const streak = await this.requireStreak(streakId);
    const activities = await this.storage.getActivities(streakId);
    const now = new Date();

    if (activities.length < 2) {
      return {
        breakProbability: 0.5,
        riskLevel: 'medium',
        factors: [],
        predictedBreakDay: null,
        confidence: 0.1,
      };
    }

    const factors: RiskFactor[] = [];
    let totalWeight = 0;
    let weightedRisk = 0;

    // Factor 1: Day-of-week pattern
    const dowRates = this.dayOfWeekRates(activities, streak.timezone);
    const todayDow = this.getDayOfWeek(now, streak.timezone);
    const todayRate = dowRates[todayDow] ?? 0.5;
    if (todayRate < 0.4) {
      const w = 0.25;
      factors.push({
        type: 'weekend-pattern',
        weight: w,
        description: `${DAY_NAMES[todayDow]} completion rate is only ${Math.round(todayRate * 100)}%`,
      });
      weightedRisk += w * (1 - todayRate);
      totalWeight += w;
    }

    // Factor 2: Declining consistency (gap trend)
    const gaps = this.computeGaps(activities);
    if (gaps.length >= 3) {
      const recentGaps = gaps.slice(-5);
      const olderGaps = gaps.slice(0, Math.max(1, gaps.length - 5));
      const recentAvg = avg(recentGaps);
      const olderAvg = avg(olderGaps);
      if (recentAvg > olderAvg * 1.3) {
        const w = 0.3;
        factors.push({
          type: 'declining-consistency',
          weight: w,
          description: `Average gap between activities increased from ${olderAvg.toFixed(1)}h to ${recentAvg.toFixed(1)}h`,
        });
        const severity = Math.min(1, (recentAvg - olderAvg) / olderAvg);
        weightedRisk += w * severity;
        totalWeight += w;
      }
    }

    // Factor 3: Historical break points
    const breakPoints = this.detectBreakPoints(activities);
    if (breakPoints.length > 0) {
      const nearBreakPoint = breakPoints.find(
        bp => Math.abs(bp - streak.currentCount) <= 3
      );
      if (nearBreakPoint !== undefined) {
        const w = 0.2;
        factors.push({
          type: 'historical-break-point',
          weight: w,
          description: `Historically, streaks tend to break around count ${nearBreakPoint}`,
        });
        weightedRisk += w * 0.7;
        totalWeight += w;
      }
    }

    // Factor 4: Approaching deadline
    if (streak.status === 'active' && streak.lastActivityAt) {
      const deadline = getNextDeadline(streak.lastActivityAt, streak.frequency, streak.timezone, streak.gracePeriod);
      const hoursLeft = getHoursRemaining(deadline, now);
      if (hoursLeft < 12 && hoursLeft > 0) {
        const w = 0.25;
        const severity = Math.max(0, 1 - hoursLeft / 12);
        factors.push({
          type: 'approaching-deadline',
          weight: w,
          description: `Only ${hoursLeft.toFixed(1)} hours remaining until deadline`,
        });
        weightedRisk += w * severity;
        totalWeight += w;
      }
    }

    // Factor 5: Post-milestone drop
    const milestones = await this.storage.getMilestones(streakId);
    const lastAchieved = milestones
      .filter(m => m.achievedAt !== null)
      .sort((a, b) => (b.achievedAt!.getTime() - a.achievedAt!.getTime()))[0];
    if (lastAchieved && lastAchieved.achievedAt) {
      const daysSinceMilestone = (now.getTime() - lastAchieved.achievedAt.getTime()) / 86_400_000;
      if (daysSinceMilestone < 5 && daysSinceMilestone > 1) {
        const recentAfterMilestone = activities.filter(
          a => a.performedAt.getTime() > lastAchieved.achievedAt!.getTime()
        );
        if (recentAfterMilestone.length < daysSinceMilestone * 0.5) {
          const w = 0.15;
          factors.push({
            type: 'post-milestone-drop',
            weight: w,
            description: `Activity dropped after reaching milestone ${lastAchieved.threshold}`,
          });
          weightedRisk += w * 0.6;
          totalWeight += w;
        }
      }
    }

    const breakProbability = totalWeight > 0
      ? Math.min(1, Math.max(0, weightedRisk / totalWeight))
      : 0.2;

    const confidence = Math.min(1, activities.length / 30);

    const riskLevel = breakProbability >= 0.75 ? 'critical'
      : breakProbability >= 0.5 ? 'high'
      : breakProbability >= 0.25 ? 'medium'
      : 'low';

    // Estimate days until break based on gap trend
    let predictedBreakDay: number | null = null;
    if (gaps.length >= 3 && streak.lastActivityAt) {
      const recentAvgGap = avg(gaps.slice(-3));
      const deadline = getNextDeadline(streak.lastActivityAt, streak.frequency, streak.timezone, streak.gracePeriod);
      const deadlineHours = getHoursRemaining(deadline, now);
      if (recentAvgGap > deadlineHours && deadlineHours > 0) {
        predictedBreakDay = Math.ceil(deadlineHours / 24);
      }
    }

    return { breakProbability, riskLevel, factors, predictedBreakDay, confidence };
  }

  // ── Adaptive Difficulty ──────────────────────────────────────────────────

  async suggestDifficulty(streakId: string): Promise<DifficultyAdjustment> {
    const streak = await this.requireStreak(streakId);
    const activities = await this.storage.getActivities(streakId);
    const now = new Date();

    const recentWindowDays = 14;
    const recentCutoff = new Date(now.getTime() - recentWindowDays * 86_400_000);
    const recentActivities = activities.filter(a => a.performedAt >= recentCutoff);

    const uniqueDays = new Set(recentActivities.map(a => this.formatDate(a.performedAt, streak.timezone)));
    const completionRate = uniqueDays.size / recentWindowDays;

    const suggestions: AdjustmentSuggestion[] = [];

    let currentDifficulty: 'easy' | 'moderate' | 'hard';
    let recommendation: 'ease' | 'maintain' | 'challenge';

    if (completionRate < 0.4) {
      currentDifficulty = 'hard';
      recommendation = 'ease';

      if (!streak.gracePeriod || (streak.gracePeriod.hours ?? 0) < 6) {
        suggestions.push({
          type: 'grace-period',
          current: streak.gracePeriod ?? { hours: 0 },
          suggested: { hours: 12 },
          reason: 'Low completion rate suggests a longer grace window would help',
        });
      }

      suggestions.push({
        type: 'freeze-grant',
        current: streak.totalFreezes,
        suggested: 'Grant 1 additional freeze',
        reason: 'A safety net freeze can prevent discouragement',
      });

    } else if (completionRate < 0.7) {
      currentDifficulty = 'moderate';
      recommendation = 'maintain';

    } else if (completionRate >= 0.95 && recentActivities.length >= 14) {
      currentDifficulty = 'easy';
      recommendation = 'challenge';

      suggestions.push({
        type: 'milestone-spacing',
        current: 'standard',
        suggested: 'Add stretch milestone',
        reason: `Perfect ${recentWindowDays}-day streak — user is ready for a challenge`,
      });

    } else {
      currentDifficulty = 'moderate';
      recommendation = 'maintain';
    }

    // Check for recovery scenario
    if (streak.status === 'active' && streak.currentCount < 5 && streak.totalResets > 0) {
      suggestions.push({
        type: 'bonus-milestone',
        current: null,
        suggested: 'Add milestone at count 3',
        reason: 'Recovering from a reset — early milestones boost motivation',
      });
    }

    return { currentDifficulty, recommendation, suggestions };
  }

  // ── Nudge Timing ─────────────────────────────────────────────────────────

  async getNudgeTime(streakId: string): Promise<NudgeRecommendation> {
    const streak = await this.requireStreak(streakId);
    const activities = await this.storage.getActivities(streakId);

    if (activities.length < 3) {
      return {
        optimalHour: 9,
        optimalMinute: 0,
        confidence: 0.1,
        windowStart: { hour: 8, minute: 0 },
        windowEnd: { hour: 10, minute: 0 },
        dayOfWeekModifiers: {},
      };
    }

    // Build hour histogram with exponential recency weighting
    const hourBuckets = new Array(24).fill(0);
    const now = new Date();
    for (const a of activities) {
      const ageHours = (now.getTime() - a.performedAt.getTime()) / 3_600_000;
      const weight = Math.exp(-ageHours / (24 * 30)); // 30-day half-life
      const hour = this.getHourInTz(a.performedAt, streak.timezone);
      hourBuckets[hour] += weight;
    }

    // Find peak hour
    let peakHour = 9;
    let peakWeight = 0;
    for (let h = 0; h < 24; h++) {
      if (hourBuckets[h] > peakWeight) {
        peakWeight = hourBuckets[h];
        peakHour = h;
      }
    }

    // Nudge time = 1 hour before typical record time
    const nudgeHour = (peakHour - 1 + 24) % 24;

    // Compute day-of-week modifiers
    const dowHours: Record<number, number[]> = {};
    for (const a of activities) {
      const dow = this.getDayOfWeek(a.performedAt, streak.timezone);
      const hour = this.getHourInTz(a.performedAt, streak.timezone);
      (dowHours[dow] ??= []).push(hour);
    }

    const dayOfWeekModifiers: Record<number, number> = {};
    for (let d = 0; d < 7; d++) {
      const hours = dowHours[d];
      if (hours && hours.length >= 2) {
        const dayAvg = avg(hours);
        dayOfWeekModifiers[d] = Math.round(dayAvg - peakHour);
      }
    }

    const totalWeight = hourBuckets.reduce((s, v) => s + v, 0);
    const confidence = Math.min(1, totalWeight / 10);

    return {
      optimalHour: nudgeHour,
      optimalMinute: 0,
      confidence,
      windowStart: { hour: (nudgeHour - 1 + 24) % 24, minute: 0 },
      windowEnd: { hour: (nudgeHour + 1) % 24, minute: 0 },
      dayOfWeekModifiers,
    };
  }

  // ── Health Score ─────────────────────────────────────────────────────────

  async getHealthScore(streakId: string): Promise<HealthScore> {
    const streak = await this.requireStreak(streakId);
    const activities = await this.storage.getActivities(streakId);
    const now = new Date();

    // Consistency: 100 - normalized standard deviation of gaps
    const gaps = this.computeGaps(activities);
    let consistency = 50;
    if (gaps.length >= 2) {
      const gapAvg = avg(gaps);
      const gapStd = stdDev(gaps);
      const cv = gapAvg > 0 ? gapStd / gapAvg : 0;
      consistency = Math.max(0, Math.min(100, 100 - cv * 100));
    } else if (activities.length >= 1) {
      consistency = 70;
    }

    // Momentum: slope of 14-day activity density
    let momentum = 50;
    if (activities.length >= 5) {
      const windowDays = 14;
      const halfPoint = new Date(now.getTime() - windowDays / 2 * 86_400_000);
      const firstHalf = activities.filter(a => a.performedAt < halfPoint && a.performedAt >= new Date(now.getTime() - windowDays * 86_400_000));
      const secondHalf = activities.filter(a => a.performedAt >= halfPoint);
      const firstRate = firstHalf.length / (windowDays / 2);
      const secondRate = secondHalf.length / (windowDays / 2);
      if (firstRate > 0) {
        const change = (secondRate - firstRate) / firstRate;
        momentum = Math.max(0, Math.min(100, 50 + change * 50));
      }
    }

    // Resilience: placeholder (we don't track at-risk recoveries directly)
    // Approximate from total resets vs streak age
    const ageMs = now.getTime() - streak.createdAt.getTime();
    const ageDays = Math.max(1, ageMs / 86_400_000);
    const resetsPerDay = streak.totalResets / ageDays;
    const resilience = Math.max(0, Math.min(100, 100 - resetsPerDay * 500));

    // Engagement: activities in last 7 days vs expected
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const recentCount = activities.filter(a => a.performedAt >= weekAgo).length;
    const expectedPerWeek = 7; // assume daily
    const engagement = Math.max(0, Math.min(100, (recentCount / expectedPerWeek) * 100));

    // Longevity
    const longevity = Math.min(100, Math.log2(Math.max(1, ageDays)) * 15);

    const overall = Math.round(
      consistency * 0.25 +
      momentum * 0.25 +
      resilience * 0.15 +
      engagement * 0.20 +
      longevity * 0.15
    );

    // Trend
    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (momentum > 60) trend = 'improving';
    else if (momentum < 40) trend = 'declining';

    // Grade
    const grade: HealthGrade = overall >= 90 ? 'S'
      : overall >= 80 ? 'A'
      : overall >= 65 ? 'B'
      : overall >= 50 ? 'C'
      : overall >= 35 ? 'D'
      : 'F';

    return {
      overall,
      components: {
        consistency: Math.round(consistency),
        momentum: Math.round(momentum),
        resilience: Math.round(resilience),
        engagement: Math.round(engagement),
        longevity: Math.round(longevity),
      },
      trend,
      grade,
    };
  }

  // ── Behavioral Insights ──────────────────────────────────────────────────

  async analyzePatterns(streakId: string): Promise<BehavioralInsights> {
    const streak = await this.requireStreak(streakId);
    const activities = await this.storage.getActivities(streakId);

    const patterns: Pattern[] = [];

    // Day-of-week analysis
    const dowCounts = new Array(7).fill(0);
    const dowTotal = new Array(7).fill(0);
    const now = new Date();
    const ageMs = now.getTime() - streak.createdAt.getTime();
    const ageDays = Math.max(7, Math.ceil(ageMs / 86_400_000));
    const weeksActive = Math.max(1, Math.floor(ageDays / 7));

    for (const a of activities) {
      const dow = this.getDayOfWeek(a.performedAt, streak.timezone);
      dowCounts[dow]++;
    }
    for (let d = 0; d < 7; d++) {
      dowTotal[d] = weeksActive;
    }

    const dowRates = dowCounts.map((c, i) => (dowTotal[i] ?? 1) > 0 ? c / (dowTotal[i] ?? 1) : 0);
    let strongestIdx = 0;
    let weakestIdx = 0;
    for (let d = 0; d < 7; d++) {
      if ((dowRates[d] ?? 0) > (dowRates[strongestIdx] ?? 0)) strongestIdx = d;
      if ((dowRates[d] ?? 0) < (dowRates[weakestIdx] ?? 0)) weakestIdx = d;
    }

    const strongestDay = { day: strongestIdx, name: DAY_NAMES[strongestIdx] ?? 'Unknown', rate: Math.round((dowRates[strongestIdx] ?? 0) * 100) / 100 };
    const weakestDay = { day: weakestIdx, name: DAY_NAMES[weakestIdx] ?? 'Unknown', rate: Math.round((dowRates[weakestIdx] ?? 0) * 100) / 100 };

    if (weakestDay.rate < 0.3 && strongestDay.rate > 0.7) {
      patterns.push({
        type: 'day-preference',
        description: `Strongest on ${strongestDay.name}s (${Math.round(strongestDay.rate * 100)}%), weakest on ${weakestDay.name}s (${Math.round(weakestDay.rate * 100)}%)`,
        confidence: Math.min(1, activities.length / 20),
        actionable: true,
        suggestion: `Consider setting ${weakestDay.name} as a skip day or setting a reminder`,
      });
    }

    // Time-of-day analysis
    const hours: number[] = [];
    for (const a of activities) {
      hours.push(this.getHourInTz(a.performedAt, streak.timezone));
    }
    const typicalHour = hours.length > 0 ? Math.round(avg(hours)) : 12;
    const typicalMinute = 0;

    // Gap analysis
    const gaps = this.computeGaps(activities);
    const averageGap = gaps.length > 0 ? Math.round(avg(gaps) * 10) / 10 : 0;

    // Break point detection: find counts where resets happened
    const historicalBreakPoints: number[] = [];
    let runLength = 0;
    for (let i = 0; i < activities.length; i++) {
      runLength++;
      const next = activities[i + 1];
      const curr = activities[i]!;
      if (next) {
        const gap = (next.performedAt.getTime() - curr.performedAt.getTime()) / 3_600_000;
        if (gap > 48) {
          historicalBreakPoints.push(runLength);
          runLength = 0;
        }
      }
    }

    // Improvement trend
    let improvementTrend = 0;
    if (gaps.length >= 6) {
      const firstThird = gaps.slice(0, Math.floor(gaps.length / 3));
      const lastThird = gaps.slice(-Math.floor(gaps.length / 3));
      const firstAvg = avg(firstThird);
      const lastAvg = avg(lastThird);
      if (firstAvg > 0) {
        improvementTrend = Math.max(-1, Math.min(1, (firstAvg - lastAvg) / firstAvg));
      }
    }

    if (improvementTrend > 0.2) {
      patterns.push({
        type: 'improving',
        description: `Consistency is improving — gaps between activities are shrinking`,
        confidence: Math.min(1, gaps.length / 15),
        actionable: false,
      });
    } else if (improvementTrend < -0.2) {
      patterns.push({
        type: 'declining',
        description: `Consistency is declining — gaps are growing larger`,
        confidence: Math.min(1, gaps.length / 15),
        actionable: true,
        suggestion: 'Consider adding a grace period or freeze to maintain momentum',
      });
    }

    // Persona classification
    const persona = this.classifyPersona(hours, dowRates, gaps, activities.length);

    patterns.push({
      type: 'persona',
      description: `Streak personality: ${persona}`,
      confidence: Math.min(1, activities.length / 14),
      actionable: false,
    });

    return {
      patterns,
      strongestDay,
      weakestDay,
      typicalRecordTime: { hour: typicalHour, minute: typicalMinute },
      averageGap,
      historicalBreakPoints,
      improvementTrend: Math.round(improvementTrend * 100) / 100,
      persona,
    };
  }

  // ── Smart Reward Suggestions ─────────────────────────────────────────────

  async getRewardSuggestions(streakId: string): Promise<RewardRecommendation[]> {
    const streak = await this.requireStreak(streakId);
    const milestones = await this.storage.getMilestones(streakId);
    const activities = await this.storage.getActivities(streakId);
    const now = new Date();
    const suggestions: RewardRecommendation[] = [];

    // Approaching milestone
    const unachieved = milestones
      .filter(m => m.achievedAt === null)
      .sort((a, b) => a.threshold - b.threshold);
    const nextMilestone = unachieved[0];
    if (nextMilestone) {
      const remaining = nextMilestone.threshold - streak.currentCount;
      const total = nextMilestone.threshold;
      if (remaining > 0 && remaining <= total * 0.2) {
        suggestions.push({
          type: 'milestone-preview',
          trigger: 'now',
          targetCount: nextMilestone.threshold,
          reason: `Only ${remaining} more to reach milestone ${nextMilestone.threshold}`,
          priority: 0.8,
          message: `Almost there! ${remaining} more day${remaining === 1 ? '' : 's'} to your next milestone!`,
        });
      }
    }

    // Post-milestone lull
    const lastAchieved = milestones
      .filter(m => m.achievedAt !== null)
      .sort((a, b) => b.achievedAt!.getTime() - a.achievedAt!.getTime())[0];
    if (lastAchieved?.achievedAt) {
      const daysSince = (now.getTime() - lastAchieved.achievedAt.getTime()) / 86_400_000;
      const recentActivities = activities.filter(a => a.performedAt > lastAchieved.achievedAt!);
      if (daysSince > 2 && daysSince < 7 && recentActivities.length < daysSince * 0.5) {
        suggestions.push({
          type: 'challenge',
          trigger: 'next-record',
          reason: 'Post-milestone engagement dip detected',
          priority: 0.6,
          message: `You crushed milestone ${lastAchieved.threshold}! Keep the momentum going.`,
        });
      }
    }

    // Comeback after break
    if (streak.status === 'active' && streak.currentCount <= 2 && streak.totalResets > 0) {
      suggestions.push({
        type: 'comeback',
        trigger: 'next-record',
        reason: 'User is rebuilding after a reset',
        priority: 0.9,
        message: 'Welcome back! Every streak starts with day one.',
      });
    }

    // Overdue for reward (10+ records since last milestone)
    if (lastAchieved) {
      const recordsSince = streak.currentCount - lastAchieved.threshold;
      if (recordsSince >= 10 && nextMilestone && nextMilestone.threshold - streak.currentCount > 5) {
        suggestions.push({
          type: 'celebration',
          trigger: 'now',
          reason: `${recordsSince} records since last milestone — user deserves recognition`,
          priority: 0.5,
          message: `${recordsSince} days strong! You're on fire!`,
        });
      }
    }

    // Encouragement if approaching deadline
    if (streak.status === 'active' && streak.lastActivityAt) {
      const deadline = getNextDeadline(streak.lastActivityAt, streak.frequency, streak.timezone, streak.gracePeriod);
      const hoursLeft = getHoursRemaining(deadline, now);
      if (hoursLeft > 0 && hoursLeft < 6) {
        suggestions.push({
          type: 'encouragement',
          trigger: 'now',
          reason: `Only ${hoursLeft.toFixed(1)} hours remaining`,
          priority: 0.95,
          message: `Don't break your ${streak.currentCount}-day streak! ${hoursLeft.toFixed(0)} hours left.`,
        });
      }
    }

    return suggestions.sort((a, b) => b.priority - a.priority);
  }

  // ── Private Helpers ──────────────────────────────────────────────────────

  private async requireStreak(streakId: string): Promise<Streak> {
    const streak = await this.storage.getStreak(streakId);
    if (!streak) throw new Error(`Streak "${streakId}" not found`);
    return streak;
  }

  private computeGaps(activities: Activity[]): number[] {
    if (activities.length < 2) return [];
    const sorted = [...activities].sort((a, b) => a.performedAt.getTime() - b.performedAt.getTime());
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const curr = sorted[i]!;
      const prev = sorted[i - 1]!;
      gaps.push((curr.performedAt.getTime() - prev.performedAt.getTime()) / 3_600_000);
    }
    return gaps;
  }

  private dayOfWeekRates(activities: Activity[], timezone: string): number[] {
    const counts = [0, 0, 0, 0, 0, 0, 0];

    for (const a of activities) {
      const dow = this.getDayOfWeek(a.performedAt, timezone);
      counts[dow] = (counts[dow] ?? 0) + 1;
    }

    const total = Math.max(1, Math.ceil(activities.length / 7));
    return counts.map(c => c / total);
  }

  private detectBreakPoints(activities: Activity[]): number[] {
    const breakCounts: number[] = [];
    const sorted = [...activities].sort((a, b) => a.performedAt.getTime() - b.performedAt.getTime());
    let runLength = 0;
    for (let i = 0; i < sorted.length; i++) {
      runLength++;
      const next = sorted[i + 1];
      const curr = sorted[i]!;
      if (next) {
        const gapHours = (next.performedAt.getTime() - curr.performedAt.getTime()) / 3_600_000;
        if (gapHours > 48) {
          breakCounts.push(runLength);
          runLength = 0;
        }
      }
    }
    return breakCounts;
  }

  private classifyPersona(
    hours: number[],
    dowRates: number[],
    gaps: number[],
    totalActivities: number,
  ): StreakPersona {
    if (hours.length === 0) return 'Steady Eddie';

    const avgHour = avg(hours);
    const hourStd = stdDev(hours);

    // Early Bird: avg hour < 9
    if (avgHour < 9) return 'Early Bird';

    // Night Owl: avg hour > 21
    if (avgHour > 21) return 'Night Owl';

    // Weekend Warrior: weekend rates significantly higher
    const weekdayRate = avg([dowRates[1]!, dowRates[2]!, dowRates[3]!, dowRates[4]!, dowRates[5]!]);
    const weekendRate = avg([dowRates[0]!, dowRates[6]!]);
    if (weekendRate > weekdayRate * 1.5) return 'Weekend Warrior';
    if (weekdayRate > weekendRate * 1.5) return 'Weekday Grinder';

    // Sprint & Rest: high variance in gaps
    if (gaps.length >= 3) {
      const gapCv = avg(gaps) > 0 ? stdDev(gaps) / avg(gaps) : 0;
      if (gapCv > 1.0) return 'Sprint & Rest';
    }

    // Steady Eddie: low variance in hours
    if (hourStd < 2) return 'Steady Eddie';

    // Slow Starter: typically records in later part of window
    if (avgHour > 18) return 'Slow Starter';

    // Overachiever: more activities than expected days
    // (simplified check)
    if (totalActivities > 0 && gaps.length > 0 && avg(gaps) < 18) return 'Overachiever';

    return 'Steady Eddie';
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

  private getHourInTz(date: Date, timezone: string): number {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).formatToParts(date);
      const hourPart = parts.find(p => p.type === 'hour')?.value ?? '12';
      return parseInt(hourPart, 10);
    } catch {
      return date.getHours();
    }
  }

  private formatDate(date: Date, timezone: string): string {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    } catch {
      return date.toISOString().slice(0, 10);
    }
  }
}

// ── Math helpers ────────────────────────────────────────────────────────────

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function stdDev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const mean = avg(nums);
  const squaredDiffs = nums.map(n => (n - mean) ** 2);
  return Math.sqrt(avg(squaredDiffs));
}
