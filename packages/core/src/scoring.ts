import type { ScoringConfig, MultiplierRule } from './types/index.js';

export interface ScoringResult {
  pointsEarned: number;
  multiplier: number;
  totalScore: number;
}

export class ScoringEngine {
  /**
   * Compute the multiplier for the current streak count.
   */
  static getMultiplier(count: number, rule?: MultiplierRule): number {
    if (!rule) return 1;
    
    let multiplier: number;
    
    switch (rule.type) {
      case 'linear': {
        const scale = rule.scale ?? 0.1;
        multiplier = 1 + (count * scale);
        break;
      }
      case 'logarithmic': {
        multiplier = count > 0 ? 1 + Math.log2(count) : 1;
        break;
      }
      case 'tiered': {
        const tiers = (rule.tiers ?? []).sort((a, b) => b.minStreak - a.minStreak);
        const tier = tiers.find(t => count >= t.minStreak);
        multiplier = tier?.value ?? 1;
        break;
      }
      default:
        multiplier = 1;
    }
    
    if (rule.cap !== undefined) {
      multiplier = Math.min(multiplier, rule.cap);
    }
    
    return Math.round(multiplier * 100) / 100; // 2 decimal places
  }

  /**
   * Calculate points for a single record() call.
   */
  static calculatePoints(opts: {
    count: number;
    config?: ScoringConfig | null;
    hitMilestone: boolean;
    previousScore: number;
  }): ScoringResult {
    const config = opts.config;
    if (!config) {
      return { pointsEarned: 0, multiplier: 1, totalScore: opts.previousScore };
    }
    
    const basePoints = config.basePoints ?? 1;
    const multiplier = ScoringEngine.getMultiplier(opts.count, config.multiplier);
    let pointsEarned = Math.round(basePoints * multiplier);
    
    if (opts.hitMilestone && config.milestoneBonus) {
      pointsEarned += config.milestoneBonus;
    }
    
    const totalScore = opts.previousScore + pointsEarned;
    
    return { pointsEarned, multiplier, totalScore };
  }
}
