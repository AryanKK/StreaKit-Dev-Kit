import type { Duration, Frequency } from './types/index.js';

export function generateId(): string {
  const g = typeof globalThis !== 'undefined' ? globalThis : ({} as Record<string, unknown>);
  const c = (g as Record<string, unknown>)['crypto'] as
    | { randomUUID?: () => string }
    | undefined;
  if (c?.randomUUID) {
    return c.randomUUID();
  }
  return (
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2)
  );
}

export function durationToMs(d: Duration | undefined): number {
  if (!d) return 0;
  return (d.days ?? 0) * 86_400_000 + (d.hours ?? 0) * 3_600_000;
}

export function getHoursRemaining(deadline: Date, now: Date): number {
  return Math.max(0, (deadline.getTime() - now.getTime()) / 3_600_000);
}

/**
 * Returns the start-of-day in a given IANA timezone for a Date.
 * Falls back to UTC offset approximation if Intl is unavailable.
 */
function startOfDayInTz(date: Date, timezone: string): Date {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === 'year')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  const day = parts.find((p) => p.type === 'day')!.value;

  // Build an ISO string at midnight in the target timezone
  const iso = `${year}-${month}-${day}T00:00:00`;
  // Use a trick: format a known date to find the offset, then apply
  const tentative = new Date(iso + 'Z');
  const utcStr = tentative.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr = tentative.toLocaleString('en-US', { timeZone: timezone });
  const utcDate = new Date(utcStr);
  const tzDate = new Date(tzStr);
  const offset = utcDate.getTime() - tzDate.getTime();

  return new Date(tentative.getTime() + offset);
}

function endOfDayInTz(date: Date, timezone: string): Date {
  const sod = startOfDayInTz(date, timezone);
  return new Date(sod.getTime() + 86_400_000 - 1);
}

function getCalendarDay(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date); // YYYY-MM-DD
}

function getISOWeek(date: Date, timezone: string): string {
  const dayStr = getCalendarDay(date, timezone);
  const d = new Date(dayStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Calculates the deadline by which the next activity must occur.
 */
export function getNextDeadline(
  lastActivity: Date,
  frequency: Frequency,
  timezone: string,
  gracePeriod?: Duration,
): Date {
  const graceMs = durationToMs(gracePeriod);

  if (frequency === 'daily') {
    // Deadline = end of the NEXT calendar day + grace
    const nextDay = new Date(lastActivity.getTime() + 86_400_000);
    const eod = endOfDayInTz(nextDay, timezone);
    return new Date(eod.getTime() + graceMs);
  }

  if (frequency === 'weekly') {
    const nextWeek = new Date(lastActivity.getTime() + 7 * 86_400_000);
    const eod = endOfDayInTz(nextWeek, timezone);
    return new Date(eod.getTime() + graceMs);
  }

  if (typeof frequency === 'object' && 'everyNDays' in frequency) {
    const nextDay = new Date(lastActivity.getTime() + frequency.everyNDays * 86_400_000);
    const eod = endOfDayInTz(nextDay, timezone);
    return new Date(eod.getTime() + graceMs);
  }

  if (typeof frequency === 'object' && 'timesPerWeek' in frequency) {
    // For N-times-per-week, deadline is end of the current ISO week
    const weekEnd = new Date(lastActivity.getTime() + 7 * 86_400_000);
    const eod = endOfDayInTz(weekEnd, timezone);
    return new Date(eod.getTime() + graceMs);
  }

  // Custom frequency: deadline is 48h from last activity + grace (sensible default)
  return new Date(lastActivity.getTime() + 2 * 86_400_000 + graceMs);
}

/**
 * Checks if a new record() call is valid (not a duplicate within the same window).
 */
export function isWithinFrequencyWindow(
  lastActivity: Date | null,
  frequency: Frequency,
  now: Date,
  timezone: string,
): boolean {
  if (!lastActivity) return true; // first ever record is always valid

  if (frequency === 'daily') {
    return getCalendarDay(lastActivity, timezone) !== getCalendarDay(now, timezone);
  }

  if (frequency === 'weekly') {
    return getISOWeek(lastActivity, timezone) !== getISOWeek(now, timezone);
  }

  if (typeof frequency === 'object' && 'everyNDays' in frequency) {
    const msElapsed = now.getTime() - lastActivity.getTime();
    return msElapsed >= (frequency.everyNDays - 1) * 86_400_000;
  }

  if (typeof frequency === 'object' && 'timesPerWeek' in frequency) {
    // Allow multiple per week — just check not the same calendar day
    return getCalendarDay(lastActivity, timezone) !== getCalendarDay(now, timezone);
  }

  if (typeof frequency === 'object' && 'custom' in frequency) {
    return frequency.custom(lastActivity, now);
  }

  return true;
}

/**
 * Checks if the streak should be marked as broken.
 */
export function isStreakExpired(
  lastActivity: Date,
  frequency: Frequency,
  gracePeriod: Duration | undefined,
  now: Date,
  timezone: string,
): boolean {
  const deadline = getNextDeadline(lastActivity, frequency, timezone, gracePeriod);
  return now.getTime() > deadline.getTime();
}
