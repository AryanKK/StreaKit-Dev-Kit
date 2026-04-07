// ── Frequency ──────────────────────────────────────────────────────────────

export type Frequency =
  | 'daily'
  | 'weekly'
  | { everyNDays: number }
  | { timesPerWeek: number }
  | { custom: (lastActivity: Date, now: Date) => boolean };

// ── Duration ───────────────────────────────────────────────────────────────

export interface Duration {
  days?: number;
  hours?: number;
}

// ── Decay Config ───────────────────────────────────────────────────────────

export type DecayMode = 'linear' | 'percentage' | 'step';

export interface DecayConfig {
  mode: DecayMode;
  rate: number;
  floor?: number;
  recoveryBonus?: number;
}

// ── Scoring Config ─────────────────────────────────────────────────────────

export type MultiplierType = 'linear' | 'logarithmic' | 'tiered';

export interface MultiplierTier {
  minStreak: number;
  value: number;
}

export interface MultiplierRule {
  type: MultiplierType;
  cap?: number;
  scale?: number;
  tiers?: MultiplierTier[];
}

export interface ScoringConfig {
  basePoints?: number;
  multiplier?: MultiplierRule;
  milestoneBonus?: number;
}

// ── Reward Conditions ──────────────────────────────────────────────────────

export type RewardCondition =
  | { type: 'never-frozen' }
  | { type: 'min-longest'; count: number }
  | { type: 'within-days'; days: number }
  | { type: 'custom'; check: (streak: Streak, status: StreakStatus) => boolean };

// ── Milestone Config ───────────────────────────────────────────────────────

export interface MilestoneDefinition {
  threshold: number;
  rewards?: RewardConfig[];
  condition?: RewardCondition;
  repeatable?: boolean;
}

export type MilestoneConfig = number | MilestoneDefinition;

// ── Streak ─────────────────────────────────────────────────────────────────

export type StreakState = 'active' | 'broken' | 'frozen';

export interface Streak {
  id: string;
  userId?: string;
  frequency: Frequency;
  gracePeriod?: Duration;
  currentCount: number;
  longestCount: number;
  status: StreakState;
  lastActivityAt: Date | null;
  frozenAt: Date | null;
  frozenUntil: Date | null;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;

  // Enriched fields
  tags: string[];
  metadata: Record<string, unknown>;
  targetCount: number | null;
  totalFreezes: number;
  lastFreezeEndedAt: Date | null;
  totalScore: number;
  currentMultiplier: number;
  skipDays: number[];
  collectionId: string | null;
  decayConfig: DecayConfig | null;
  scoringConfig: ScoringConfig | null;
  maxFreezes: number | null;
  freezeCooldownDays: number | null;
  maxFreezeDays: number;
  totalResets: number;
}

// ── Activity ───────────────────────────────────────────────────────────────

export interface Activity {
  id: string;
  streakId: string;
  performedAt: Date;
  metadata?: Record<string, unknown>;
  pointsEarned?: number;
  multiplierAtRecord?: number;
}

// ── Rewards & Milestones ───────────────────────────────────────────────────

export type RewardType = 'visual' | 'badge' | 'callback' | 'custom';

export interface RewardConfig {
  id: string;
  type: RewardType;
  payload: Record<string, unknown>;
  condition?: RewardCondition;
}

export interface Milestone {
  id: string;
  streakId: string;
  threshold: number;
  rewards: RewardConfig[];
  achievedAt: Date | null;
  repeatable: boolean;
  condition?: RewardCondition;
}

export interface RewardContext {
  streakId: string;
  milestone: Milestone;
  reward: RewardConfig;
  streak: Streak;
  status: StreakStatus;
}

export type RewardHandler = (context: RewardContext) => void | Promise<void>;

// ── Theme / Animation State ────────────────────────────────────────────────

export interface ThemeState {
  streakId: string;
  themeId: string;
  currentStage: string;
  stageData: Record<string, unknown>;
  history: StageTransition[];
}

export interface StageTransition {
  from: string;
  to: string;
  at: Date;
  streakCount: number;
}

// ── Streak Status (computed, not persisted) ────────────────────────────────

export interface StreakStatus {
  count: number;
  longestCount: number;
  isActive: boolean;
  isAtRisk: boolean;
  isFrozen: boolean;
  isBroken: boolean;
  lastActivity: Date | null;
  nextDeadline: Date | null;
  currentMilestone: number | null;
  nextMilestone: number | null;
  progressToNext: number;
  currentStage?: string;

  // Enriched fields
  score: number;
  multiplier: number;
  freezesUsed: number;
  freezesRemaining: number | null;
  canFreeze: boolean;
  targetCount: number | null;
  targetProgress: number;
  isDecaying: boolean;
  decayedAmount: number;
  streakAge: number;
  completionRate: number;
}

// ── Animation Collection Standard ──────────────────────────────────────────

export type CollectionCategory =
  | 'nature'
  | 'creatures'
  | 'life'
  | 'worlds'
  | 'memory'
  | 'abstract'
  | 'seasonal'
  | 'entry-level';

/** Complexity tier for the animation collection */
export type AnimationTier = 'basic' | 'complex';

export type AnimationFormat = 'rive' | 'dotlottie' | 'canvas' | 'both';

export interface StageDefinition {
  id: string;
  name: string;
  minStreak: number;
  description: string;
}

export interface AssetManifest {
  rive?: string;
  dotlottie?: string;
  thumbnail: string;
}

// ── Complex Animation Extensions ───────────────────────────────────────────

/**
 * A biome is a visual world variant that users can choose from.
 * Complex animations expose multiple biomes, each with unique atmospherics,
 * color palettes, and stage-gated elements.
 */
export interface BiomeDefinition {
  id: string;
  name: string;
  description: string;
  palette: string[];           // hex colors defining the biome's look
  atmosphericEffects: string[]; // e.g. ['fog', 'shimmer', 'rain', 'aurora']
  stages: StageDefinition[];   // biome-specific stage progression
}

/**
 * Describes the visual sophistication of a complex animation.
 * Used to surface capabilities to developers and in the showcase UI.
 */
export interface ComplexitySpec {
  /** Pixel canvas dimensions (complex animations use canvas rendering) */
  canvasWidth: number;
  canvasHeight: number;
  /** Named layer types used in the renderer */
  layers: string[];
  /** Particle effects (e.g. 'bloom-particles', 'firefly-drift', 'bubble-rise') */
  particleEffects: string[];
  /** Atmospheric effects that run continuously */
  atmosphericEffects: string[];
  /** Number of unique biome world variants */
  biomeCount: number;
  /** Total unique scene elements across all stages */
  totalSceneElements: number;
}

export interface AnimationCollection {
  id: string;
  name: string;
  category: CollectionCategory;
  description: string;
  format: AnimationFormat;
  stages: StageDefinition[];
  defaultMilestones: number[];
  assets: AssetManifest;
  preview: string;
  tags: string[];
  version: string;

  // ── Tier & Complexity ─────────────────────────────────────────────────────
  /** 'basic' for entry-level single-animation collections; 'complex' for world-level multi-biome renderers */
  tier?: AnimationTier;
  /** For complex animations: the list of selectable world biomes */
  biomes?: BiomeDefinition[];
  /** For complex animations: canvas renderer complexity specification */
  complexity?: ComplexitySpec;
}

// ── Storage Adapter ────────────────────────────────────────────────────────

export interface StreakFilter {
  userId?: string;
  status?: StreakState;
  tags?: string[];
}

export interface StorageAdapter {
  getStreak(id: string): Promise<Streak | null>;
  saveStreak(streak: Streak): Promise<void>;
  listStreaks(filter?: StreakFilter): Promise<Streak[]>;
  deleteStreak(id: string): Promise<void>;
  getActivities(streakId: string, since?: Date): Promise<Activity[]>;
  saveActivity(activity: Activity): Promise<void>;
  getMilestones(streakId: string): Promise<Milestone[]>;
  saveMilestone(milestone: Milestone): Promise<void>;
  getThemeState(streakId: string, themeId: string): Promise<ThemeState | null>;
  saveThemeState(state: ThemeState): Promise<void>;
  clear(): Promise<void>;
}

// ── Streak Creation Options ────────────────────────────────────────────────

export interface CreateStreakOptions {
  id: string;
  frequency: Frequency;

  // Recovery behavior
  gracePeriod?: Duration;
  decay?: DecayConfig;

  // Freeze policy
  maxFreezes?: number;
  freezeCooldownDays?: number;
  maxFreezeDays?: number;

  // Schedule flexibility
  skipDays?: number[];

  // Goals
  targetCount?: number;
  milestones?: MilestoneConfig[];

  // Scoring
  scoring?: ScoringConfig;

  // Theme
  collectionId?: string;

  // Metadata
  userId?: string;
  timezone?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

// ── StreaKit Config ────────────────────────────────────────────────────────

export interface StreaKitConfig {
  storage: StorageAdapter;
  defaultTimezone?: string;
  atRiskThresholdHours?: number;
}

// ── Statistics ─────────────────────────────────────────────────────────────

export interface StreakStats {
  totalActivities: number;
  totalScore: number;
  currentCount: number;
  longestCount: number;
  averageStreakLength: number;
  completionRate: number;
  totalFreezes: number;
  totalResets: number;
  milestonesAchieved: number;
  milestonesRemaining: number;
  streakAge: number;
  activeDays: number;
  currentMultiplier: number;
}

export interface CalendarDay {
  date: string;
  hasActivity: boolean;
  count: number;
  milestone?: number;
  wasFrozen: boolean;
  wasSkipped: boolean;
}

// ── Heuristics ─────────────────────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskFactor {
  type: 'weekend-pattern' | 'declining-consistency' | 'historical-break-point'
    | 'long-gap-trend' | 'approaching-deadline' | 'post-milestone-drop';
  weight: number;
  description: string;
}

export interface RiskAssessment {
  breakProbability: number;
  riskLevel: RiskLevel;
  factors: RiskFactor[];
  predictedBreakDay: number | null;
  confidence: number;
}

export interface AdjustmentSuggestion {
  type: 'grace-period' | 'milestone-spacing' | 'frequency' | 'freeze-grant' | 'bonus-milestone';
  current: unknown;
  suggested: unknown;
  reason: string;
}

export interface DifficultyAdjustment {
  currentDifficulty: 'easy' | 'moderate' | 'hard';
  recommendation: 'ease' | 'maintain' | 'challenge';
  suggestions: AdjustmentSuggestion[];
}

export interface NudgeRecommendation {
  optimalHour: number;
  optimalMinute: number;
  confidence: number;
  windowStart: { hour: number; minute: number };
  windowEnd: { hour: number; minute: number };
  dayOfWeekModifiers: Record<number, number>;
}

export type HealthGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface HealthScore {
  overall: number;
  components: {
    consistency: number;
    momentum: number;
    resilience: number;
    engagement: number;
    longevity: number;
  };
  trend: 'improving' | 'stable' | 'declining';
  grade: HealthGrade;
}

export type StreakPersona =
  | 'Early Bird'
  | 'Night Owl'
  | 'Weekend Warrior'
  | 'Weekday Grinder'
  | 'Steady Eddie'
  | 'Sprint & Rest'
  | 'Slow Starter'
  | 'Overachiever';

export interface Pattern {
  type: string;
  description: string;
  confidence: number;
  actionable: boolean;
  suggestion?: string;
}

export interface BehavioralInsights {
  patterns: Pattern[];
  strongestDay: { day: number; name: string; rate: number };
  weakestDay: { day: number; name: string; rate: number };
  typicalRecordTime: { hour: number; minute: number };
  averageGap: number;
  historicalBreakPoints: number[];
  improvementTrend: number;
  persona: StreakPersona;
}

export interface RewardRecommendation {
  type: 'celebration' | 'encouragement' | 'challenge' | 'milestone-preview' | 'comeback';
  trigger: 'now' | 'next-record' | 'at-count';
  targetCount?: number;
  reason: string;
  priority: number;
  message?: string;
}

// ── Events ─────────────────────────────────────────────────────────────────

export interface StreakEvents {
  'activity:recorded': { streakId: string; count: number; points: number; multiplier: number };
  'milestone:reached': { streakId: string; threshold: number; rewards: RewardConfig[] };
  'streak:broken': { streakId: string; finalCount: number; longestCount: number };
  'streak:decayed': { streakId: string; previousCount: number; newCount: number; mode: DecayMode };
  'streak:atrisk': { streakId: string; hoursRemaining: number };
  'streak:frozen': { streakId: string; freezesRemaining: number | null };
  'streak:unfrozen': { streakId: string };
  'stage:change': { streakId: string; from: string; to: string; collection: string };
  'score:updated': { streakId: string; totalScore: number; pointsEarned: number; multiplier: number };
  'reward:dispatched': { streakId: string; rewardId: string; rewardType: string; milestone: number };
}

export type StreakEventName = keyof StreakEvents;
