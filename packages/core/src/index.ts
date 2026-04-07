// Engine
export { StreaKit, defineCollection } from './engine.js';
export { StreakInstance } from './streak.js';
export { EventEmitter } from './events.js';

// Subsystems
export { DecayEngine } from './decay.js';
export { ScoringEngine } from './scoring.js';
export { RewardRegistry } from './rewards.js';
export { ThemeManager } from './theme-manager.js';
export { StatsComputer } from './stats.js';
export { HeuristicEngine } from './heuristics.js';

// Types
export type {
  Frequency,
  Duration,
  StreakState,
  Streak,
  Activity,
  RewardType,
  RewardConfig,
  RewardCondition,
  RewardContext,
  RewardHandler,
  Milestone,
  MilestoneConfig,
  MilestoneDefinition,
  ThemeState,
  StageTransition,
  StreakStatus,
  CollectionCategory,
  AnimationFormat,
  StageDefinition,
  AssetManifest,
  AnimationCollection,
  StorageAdapter,
  StreakFilter,
  CreateStreakOptions,
  StreaKitConfig,
  StreakEvents,
  StreakEventName,
  DecayConfig,
  DecayMode,
  ScoringConfig,
  MultiplierRule,
  MultiplierTier,
  MultiplierType,
  StreakStats,
  CalendarDay,
  RiskAssessment,
  RiskFactor,
  RiskLevel,
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

// Utilities
export {
  generateId,
  getNextDeadline,
  getHoursRemaining,
  isWithinFrequencyWindow,
  isStreakExpired,
  durationToMs,
} from './utils.js';
