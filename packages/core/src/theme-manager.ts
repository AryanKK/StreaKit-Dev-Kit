import type {
  AnimationCollection,
  StageDefinition,
  StageTransition,
  ThemeState,
  StorageAdapter,
} from './types/index.js';

export class ThemeManager {
  /**
   * Resolve the current stage for a given streak count.
   * Returns the stage with the highest minStreak that is <= count.
   */
  static resolveStage(collection: AnimationCollection, count: number): StageDefinition | null {
    return collection.stages.reduce<StageDefinition | null>((best, stage) => {
      if (stage.minStreak <= count && (!best || stage.minStreak > best.minStreak)) return stage;
      return best;
    }, null);
  }

  /**
   * Detect if a stage transition occurred between two counts.
   * Returns null if no transition happened.
   */
  static detectTransition(
    collection: AnimationCollection,
    prevCount: number,
    newCount: number,
  ): StageTransition | null {
    const prevStage = ThemeManager.resolveStage(collection, prevCount);
    const newStage = ThemeManager.resolveStage(collection, newCount);

    if (!prevStage || !newStage || prevStage.id === newStage.id) return null;

    return {
      from: prevStage.id,
      to: newStage.id,
      at: new Date(),
      streakCount: newCount,
    };
  }

  /**
   * Persist or update the theme state in storage.
   * Creates a new ThemeState if none exists, otherwise updates with transition history.
   */
  static async persist(
    storage: StorageAdapter,
    streakId: string,
    collection: AnimationCollection,
    prevCount: number,
    newCount: number,
  ): Promise<ThemeState> {
    const existing = await storage.getThemeState(streakId, collection.id);
    const currentStage = ThemeManager.resolveStage(collection, newCount);
    const transition = ThemeManager.detectTransition(collection, prevCount, newCount);

    const state: ThemeState = {
      streakId,
      themeId: collection.id,
      currentStage: currentStage?.id ?? 'unknown',
      stageData: {
        stageName: currentStage?.name ?? 'Unknown',
        stageDescription: currentStage?.description ?? '',
        minStreak: currentStage?.minStreak ?? 0,
        count: newCount,
      },
      history: existing?.history ?? [],
    };

    if (transition) {
      state.history = [...state.history, transition];
    }

    await storage.saveThemeState(state);
    return state;
  }

  /**
   * Get the current theme state from storage.
   */
  static async getState(
    storage: StorageAdapter,
    streakId: string,
    collectionId: string,
  ): Promise<ThemeState | null> {
    return storage.getThemeState(streakId, collectionId);
  }

  /**
   * Compute stage progress: how far through the current stage toward the next.
   */
  static computeProgress(collection: AnimationCollection, count: number): {
    stage: StageDefinition | null;
    nextStage: StageDefinition | null;
    progress: number;
  } {
    const stage = ThemeManager.resolveStage(collection, count);
    const stages = collection.stages;
    const nextStage = stages
      .filter(s => s.minStreak > count)
      .sort((a, b) => a.minStreak - b.minStreak)[0] ?? null;

    let progress = 1;
    if (nextStage && stage) {
      const range = nextStage.minStreak - stage.minStreak;
      progress = range > 0 ? Math.min(1, (count - stage.minStreak) / range) : 1;
    }

    return { stage, nextStage, progress };
  }
}
