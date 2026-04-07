import type {
  RewardConfig,
  RewardCondition,
  RewardContext,
  RewardHandler,
  Streak,
  StreakStatus,
  Milestone,
} from './types/index.js';

export class RewardRegistry {
  private handlers = new Map<string, RewardHandler[]>();

  /**
   * Register a handler for a reward type (e.g., 'badge', 'callback').
   * Multiple handlers can be registered for the same type.
   */
  register(type: string, handler: RewardHandler): () => void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
    return () => {
      const idx = list.indexOf(handler);
      if (idx >= 0) list.splice(idx, 1);
    };
  }

  /**
   * Dispatch all matching rewards for a milestone achievement.
   * Evaluates conditions before dispatching each reward.
   */
  async dispatch(
    milestone: Milestone,
    streak: Streak,
    status: StreakStatus,
  ): Promise<RewardConfig[]> {
    const dispatched: RewardConfig[] = [];

    for (const reward of milestone.rewards) {
      // Check milestone-level condition
      if (milestone.condition && !RewardRegistry.evaluateCondition(milestone.condition, streak, status)) {
        continue;
      }
      // Check reward-level condition
      if (reward.condition && !RewardRegistry.evaluateCondition(reward.condition, streak, status)) {
        continue;
      }

      const handlers = this.handlers.get(reward.type) ?? [];
      const context: RewardContext = { streakId: streak.id, milestone, reward, streak, status };

      for (const handler of handlers) {
        try {
          await handler(context);
        } catch {
          // handler errors should not break the reward dispatch chain
        }
      }

      dispatched.push(reward);
    }

    return dispatched;
  }

  /**
   * Evaluate a reward condition against the current streak and status.
   */
  static evaluateCondition(condition: RewardCondition, streak: Streak, status: StreakStatus): boolean {
    switch (condition.type) {
      case 'never-frozen':
        return streak.totalFreezes === 0;
      case 'min-longest':
        return streak.longestCount >= condition.count;
      case 'within-days': {
        const ageMs = Date.now() - streak.createdAt.getTime();
        const ageDays = ageMs / 86_400_000;
        return ageDays <= condition.days;
      }
      case 'custom':
        try {
          return condition.check(streak, status);
        } catch {
          return false;
        }
      default:
        return true;
    }
  }

  /**
   * Check if any handlers are registered for a given type.
   */
  hasHandlers(type: string): boolean {
    return (this.handlers.get(type)?.length ?? 0) > 0;
  }

  /**
   * Clear all registered handlers.
   */
  clear(): void {
    this.handlers.clear();
  }
}
