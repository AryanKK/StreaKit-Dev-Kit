import { describe, it, expect } from 'vitest';
import {
  generateId,
  durationToMs,
  getHoursRemaining,
  isWithinFrequencyWindow,
  getNextDeadline,
} from '../utils.js';

describe('generateId', () => {
  it('returns a non-empty string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns unique values on successive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe('durationToMs', () => {
  it('returns 0 for undefined', () => {
    expect(durationToMs(undefined)).toBe(0);
  });

  it('converts days to milliseconds', () => {
    expect(durationToMs({ days: 1 })).toBe(86_400_000);
    expect(durationToMs({ days: 3 })).toBe(3 * 86_400_000);
  });

  it('converts hours to milliseconds', () => {
    expect(durationToMs({ hours: 1 })).toBe(3_600_000);
    expect(durationToMs({ hours: 12 })).toBe(12 * 3_600_000);
  });

  it('combines days and hours', () => {
    expect(durationToMs({ days: 1, hours: 6 })).toBe(86_400_000 + 6 * 3_600_000);
  });

  it('handles zero values', () => {
    expect(durationToMs({ days: 0, hours: 0 })).toBe(0);
  });
});

describe('getHoursRemaining', () => {
  it('returns positive hours when deadline is in the future', () => {
    const now = new Date('2025-06-15T12:00:00Z');
    const deadline = new Date('2025-06-15T18:00:00Z');
    expect(getHoursRemaining(deadline, now)).toBeCloseTo(6, 5);
  });

  it('returns 0 when deadline is in the past', () => {
    const now = new Date('2025-06-15T18:00:00Z');
    const deadline = new Date('2025-06-15T12:00:00Z');
    expect(getHoursRemaining(deadline, now)).toBe(0);
  });

  it('returns 0 when deadline equals now', () => {
    const now = new Date('2025-06-15T12:00:00Z');
    expect(getHoursRemaining(now, now)).toBe(0);
  });
});

describe('isWithinFrequencyWindow', () => {
  const tz = 'UTC';

  describe('daily frequency', () => {
    it('returns true when no previous activity exists', () => {
      const now = new Date('2025-06-15T10:00:00Z');
      expect(isWithinFrequencyWindow(null, 'daily', now, tz)).toBe(true);
    });

    it('returns false when last activity is on the same calendar day', () => {
      const lastActivity = new Date('2025-06-15T08:00:00Z');
      const now = new Date('2025-06-15T20:00:00Z');
      expect(isWithinFrequencyWindow(lastActivity, 'daily', now, tz)).toBe(false);
    });

    it('returns true when last activity is on a different calendar day', () => {
      const lastActivity = new Date('2025-06-15T23:00:00Z');
      const now = new Date('2025-06-16T01:00:00Z');
      expect(isWithinFrequencyWindow(lastActivity, 'daily', now, tz)).toBe(true);
    });
  });

  describe('weekly frequency', () => {
    it('returns false when last activity is in the same ISO week', () => {
      // Monday and Wednesday of the same week
      const lastActivity = new Date('2025-06-16T10:00:00Z'); // Monday
      const now = new Date('2025-06-18T10:00:00Z'); // Wednesday
      expect(isWithinFrequencyWindow(lastActivity, 'weekly', now, tz)).toBe(false);
    });

    it('returns true when last activity is in a different ISO week', () => {
      const lastActivity = new Date('2025-06-15T10:00:00Z'); // Sunday (week 24)
      const now = new Date('2025-06-16T10:00:00Z'); // Monday (week 25)
      expect(isWithinFrequencyWindow(lastActivity, 'weekly', now, tz)).toBe(true);
    });
  });

  describe('everyNDays frequency', () => {
    it('returns false when not enough days have passed', () => {
      const lastActivity = new Date('2025-06-15T10:00:00Z');
      const now = new Date('2025-06-16T10:00:00Z'); // 1 day later
      expect(isWithinFrequencyWindow(lastActivity, { everyNDays: 3 }, now, tz)).toBe(false);
    });

    it('returns true when enough days have passed', () => {
      const lastActivity = new Date('2025-06-15T10:00:00Z');
      const now = new Date('2025-06-17T10:00:00Z'); // 2 days later (>= everyNDays - 1)
      expect(isWithinFrequencyWindow(lastActivity, { everyNDays: 3 }, now, tz)).toBe(true);
    });
  });

  describe('custom frequency', () => {
    it('delegates to the custom function', () => {
      const lastActivity = new Date('2025-06-15T10:00:00Z');
      const now = new Date('2025-06-15T14:00:00Z');

      const alwaysTrue = { custom: () => true };
      expect(isWithinFrequencyWindow(lastActivity, alwaysTrue, now, tz)).toBe(true);

      const alwaysFalse = { custom: () => false };
      expect(isWithinFrequencyWindow(lastActivity, alwaysFalse, now, tz)).toBe(false);
    });
  });
});

describe('getNextDeadline', () => {
  const tz = 'UTC';

  describe('daily frequency', () => {
    it('returns end of the next calendar day in UTC', () => {
      const lastActivity = new Date('2025-06-15T14:00:00Z');
      const deadline = getNextDeadline(lastActivity, 'daily', tz);

      // Next day is June 16, end of day in UTC is 2025-06-16T23:59:59.999Z
      expect(deadline.getUTCFullYear()).toBe(2025);
      expect(deadline.getUTCMonth()).toBe(5); // June = 5
      expect(deadline.getUTCDate()).toBe(16);
      expect(deadline.getUTCHours()).toBe(23);
      expect(deadline.getUTCMinutes()).toBe(59);
    });

    it('adds grace period to the deadline', () => {
      const lastActivity = new Date('2025-06-15T14:00:00Z');
      const withoutGrace = getNextDeadline(lastActivity, 'daily', tz);
      const withGrace = getNextDeadline(lastActivity, 'daily', tz, { hours: 3 });

      expect(withGrace.getTime() - withoutGrace.getTime()).toBe(3 * 3_600_000);
    });
  });

  describe('weekly frequency', () => {
    it('returns a deadline ~7 days after last activity', () => {
      const lastActivity = new Date('2025-06-15T14:00:00Z');
      const deadline = getNextDeadline(lastActivity, 'weekly', tz);

      const diffMs = deadline.getTime() - lastActivity.getTime();
      const diffDays = diffMs / 86_400_000;
      // Should be roughly 7 days + end-of-day offset
      expect(diffDays).toBeGreaterThan(7);
      expect(diffDays).toBeLessThan(8.1);
    });
  });

  describe('everyNDays frequency', () => {
    it('returns a deadline N days after last activity', () => {
      const lastActivity = new Date('2025-06-15T14:00:00Z');
      const deadline = getNextDeadline(lastActivity, { everyNDays: 5 }, tz);

      const diffMs = deadline.getTime() - lastActivity.getTime();
      const diffDays = diffMs / 86_400_000;
      expect(diffDays).toBeGreaterThan(5);
      expect(diffDays).toBeLessThan(6.1);
    });
  });

  describe('custom frequency', () => {
    it('returns 48h after last activity as a sensible default', () => {
      const lastActivity = new Date('2025-06-15T14:00:00Z');
      const customFreq = { custom: () => true };
      const deadline = getNextDeadline(lastActivity, customFreq, tz);

      const diffMs = deadline.getTime() - lastActivity.getTime();
      expect(diffMs).toBe(2 * 86_400_000);
    });
  });
});
