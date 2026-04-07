import type { DecayConfig, Frequency, Duration, DecayMode } from './types/index.js';
import { getNextDeadline } from './utils.js';

export interface DecayResult {
  effectiveCount: number;
  missedWindows: number;
  decayedAmount: number;
  isBroken: boolean;
}

export class DecayEngine {
  /**
   * Given the current count, last activity, and decay config, compute
   * the effective count after any missed windows.
   */
  static compute(opts: {
    currentCount: number;
    lastActivityAt: Date;
    now: Date;
    frequency: Frequency;
    timezone: string;
    gracePeriod?: Duration;
    decayConfig: DecayConfig;
    milestoneThresholds?: number[];
  }): DecayResult {
    // Count how many windows have been missed since lastActivityAt
    // by stepping through deadlines
    const missedWindows = DecayEngine.countMissedWindows(
      opts.lastActivityAt, opts.now, opts.frequency, opts.timezone, opts.gracePeriod
    );
    
    if (missedWindows <= 0) {
      return { effectiveCount: opts.currentCount, missedWindows: 0, decayedAmount: 0, isBroken: false };
    }

    const floor = opts.decayConfig.floor ?? 0;
    let newCount = opts.currentCount;

    switch (opts.decayConfig.mode) {
      case 'linear':
        newCount = Math.max(floor, opts.currentCount - (opts.decayConfig.rate * missedWindows));
        break;
      case 'percentage':
        for (let i = 0; i < missedWindows; i++) {
          newCount = Math.max(floor, Math.floor(newCount * (1 - opts.decayConfig.rate / 100)));
        }
        break;
      case 'step':
        // Drop to the previous milestone threshold for each missed window
        const thresholds = (opts.milestoneThresholds ?? []).sort((a, b) => b - a);
        let remaining = missedWindows;
        while (remaining > 0 && newCount > floor) {
          const prev = thresholds.find(t => t < newCount);
          newCount = prev !== undefined ? Math.max(floor, prev) : floor;
          remaining--;
        }
        break;
    }

    newCount = Math.max(floor, Math.round(newCount));
    const decayedAmount = opts.currentCount - newCount;
    const isBroken = newCount <= floor;

    return { effectiveCount: newCount, missedWindows, decayedAmount, isBroken };
  }

  /**
   * Count how many frequency windows have been missed between lastActivity and now.
   */
  static countMissedWindows(
    lastActivity: Date,
    now: Date,
    frequency: Frequency,
    timezone: string,
    gracePeriod?: Duration,
  ): number {
    let missed = 0;
    let cursor = lastActivity;
    const maxIterations = 1000; // safety cap
    
    for (let i = 0; i < maxIterations; i++) {
      const deadline = getNextDeadline(cursor, frequency, timezone, gracePeriod);
      if (deadline.getTime() >= now.getTime()) break;
      missed++;
      // Move cursor to just after the deadline for next window check
      cursor = new Date(deadline.getTime() + 1);
    }
    
    return missed;
  }

  /**
   * Compute the recovery bonus points when recording after a decay.
   */
  static getRecoveryBonus(decayConfig: DecayConfig): number {
    return decayConfig.recoveryBonus ?? 0;
  }
}
