import type {
  StorageAdapter,
  Streak,
  Activity,
  Milestone,
  StreakStats,
  CalendarDay,
  Frequency,
  Duration,
} from './types/index.js';
import { ScoringEngine } from './scoring.js';

export class StatsComputer {
  /**
   * Compute comprehensive statistics for a streak.
   */
  static async getStats(
    storage: StorageAdapter,
    streakId: string,
  ): Promise<StreakStats> {
    const streak = await storage.getStreak(streakId);
    if (!streak) throw new Error(`Streak "${streakId}" not found`);

    const activities = await storage.getActivities(streakId);
    const milestones = await storage.getMilestones(streakId);
    const achieved = milestones.filter(m => m.achievedAt !== null);

    const now = new Date();
    const ageMs = now.getTime() - streak.createdAt.getTime();
    const ageDays = Math.max(1, Math.ceil(ageMs / 86_400_000));

    // Unique active days (by calendar date in streak's timezone)
    const activeDaySet = new Set<string>();
    for (const a of activities) {
      activeDaySet.add(formatDateInTz(a.performedAt, streak.timezone));
    }

    const completionRate = ageDays > 0
      ? Math.min(1, activeDaySet.size / ageDays)
      : 0;

    // Average streak length: estimate from break patterns
    // If the streak has been reset, avg = totalActivities / (totalResets + 1)
    const runs = streak.totalResets + 1;
    const averageStreakLength = activities.length > 0
      ? Math.round(activities.length / runs)
      : 0;

    const multiplier = ScoringEngine.getMultiplier(
      streak.currentCount,
      streak.scoringConfig?.multiplier,
    );

    return {
      totalActivities: activities.length,
      totalScore: streak.totalScore,
      currentCount: streak.currentCount,
      longestCount: streak.longestCount,
      averageStreakLength,
      completionRate: Math.round(completionRate * 100) / 100,
      totalFreezes: streak.totalFreezes,
      totalResets: streak.totalResets,
      milestonesAchieved: achieved.length,
      milestonesRemaining: milestones.length - achieved.length,
      streakAge: ageDays,
      activeDays: activeDaySet.size,
      currentMultiplier: multiplier,
    };
  }

  /**
   * Generate an activity calendar for rendering heatmaps.
   */
  static async getActivityCalendar(
    storage: StorageAdapter,
    streakId: string,
    opts?: { from?: Date; to?: Date },
  ): Promise<CalendarDay[]> {
    const streak = await storage.getStreak(streakId);
    if (!streak) throw new Error(`Streak "${streakId}" not found`);

    const now = new Date();
    const from = opts?.from ?? streak.createdAt;
    const to = opts?.to ?? now;

    const activities = await storage.getActivities(streakId, from);
    const milestones = await storage.getMilestones(streakId);

    // Build activity lookup by date string
    const activityByDate = new Map<string, Activity[]>();
    for (const a of activities) {
      if (a.performedAt.getTime() > to.getTime()) continue;
      const dateStr = formatDateInTz(a.performedAt, streak.timezone);
      const list = activityByDate.get(dateStr) ?? [];
      list.push(a);
      activityByDate.set(dateStr, list);
    }

    // Build milestone lookup by date
    const milestoneByDate = new Map<string, number>();
    for (const m of milestones) {
      if (m.achievedAt) {
        const dateStr = formatDateInTz(m.achievedAt, streak.timezone);
        milestoneByDate.set(dateStr, m.threshold);
      }
    }

    const skipDaysSet = new Set(streak.skipDays);
    const calendar: CalendarDay[] = [];
    const cursor = new Date(from);
    cursor.setUTCHours(12, 0, 0, 0); // noon to avoid DST issues

    let runningCount = 0;

    while (cursor.getTime() <= to.getTime()) {
      const dateStr = formatDateInTz(cursor, streak.timezone);
      const dayActivities = activityByDate.get(dateStr);
      const hasActivity = !!dayActivities && dayActivities.length > 0;
      const dayOfWeek = getDayOfWeekInTz(cursor, streak.timezone);
      const wasSkipped = skipDaysSet.has(dayOfWeek);

      if (hasActivity) {
        runningCount += 1;
      }

      calendar.push({
        date: dateStr,
        hasActivity,
        count: runningCount,
        milestone: milestoneByDate.get(dateStr),
        wasFrozen: false, // simplified; would need freeze history for accuracy
        wasSkipped,
      });

      cursor.setTime(cursor.getTime() + 86_400_000);
    }

    return calendar;
  }
}

function formatDateInTz(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function getDayOfWeekInTz(date: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    }).formatToParts(date);
    const weekday = parts.find(p => p.type === 'weekday')?.value ?? '';
    const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return map[weekday] ?? date.getDay();
  } catch {
    return date.getDay();
  }
}
