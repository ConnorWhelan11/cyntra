/**
 * Shared UI component types
 * These are used across multiple Mission Control components
 */

/**
 * World/Universe information for display
 */
export interface WorldInfo {
  id: string;
  name: string;
  status: "idle" | "building" | "complete" | "failed";
  generation?: number;
  fitness?: number;
  progress?: number; // 0-100 if building
}

/**
 * Asset information for gallery display
 */
export interface AssetInfo {
  id: string;
  name: string;
  category: string;
  generation?: number;
  fitness?: number;
  passed?: boolean;
  thumbnailUrl?: string;
  modelUrl?: string;
  vertices?: number;
  materials?: string[];
  criticScores?: Record<string, number>;
}

/**
 * Asset classification types
 */
export type AssetType = 'building' | 'furniture' | 'vehicle' | 'lighting' | 'structure' | 'prop';

/**
 * Extended asset for Holodeck Gallery
 */
export interface GalleryAsset {
  // Identity
  id: string;
  name: string;

  // Classification
  type: AssetType;
  world: string;
  tags: string[];

  // Fitness
  fitness: number;
  passed: boolean;
  generation: number;

  // Media
  thumbnailUrl?: string;
  modelUrl?: string;
  has3D: boolean;

  // Metadata
  vertices?: number;
  materials?: string[];
  dimensions?: { x: number; y: number; z: number };

  // Provenance
  parentId?: string;
  runId?: string;
  createdAt: string;
  updatedAt: string;

  // Critics
  criticScores?: Record<string, number>;
  gateVerdict?: 'pass' | 'fail' | 'pending';
}

/**
 * Gallery lens filters
 */
export interface GalleryLensFilters {
  types: AssetType[];
  worlds: string[];
  tags: string[];
  fitnessRange: [number, number];
  has3D: boolean | null;
}

/**
 * Gallery sort options
 */
export type GallerySortField = 'name' | 'fitness' | 'generation' | 'updated';
export type GallerySortOrder = 'asc' | 'desc';

/**
 * Gallery inspector tabs
 */
export type GalleryInspectorTab = 'asset' | 'provenance' | 'gates' | 'actions';

/**
 * Gallery stage display mode
 */
export type GalleryStageMode = 'featured' | 'selected' | 'hover-preview';

/**
 * Link between memory items
 */
export interface MemoryLink {
  type: "supersedes" | "instance_of" | "related_to" | "derived_from";
  targetId: string;
  targetTitle: string;
}

/**
 * Memory item for agent memory graph
 */
export interface MemoryItem {
  id: string;
  type: "pattern" | "failure" | "dynamic" | "context" | "playbook" | "frontier";
  agent: string;
  scope: "individual" | "collective";
  importance: number;
  content: string;
  sourceRun?: string;
  sourceIssue?: string;
  accessCount?: number;
  createdAt?: string;
  links?: MemoryLink[];
}

/**
 * Genome parameter for evolution view
 */
export interface GenomeParameter {
  name: string;
  value: number | string;
  type: "number" | "string" | "enum";
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

// ============================================================================
// EVOLUTION TYPES - Biomorphic visualization data structures
// ============================================================================

/**
 * Single fitness data point for timeline visualization
 */
export interface FitnessPoint {
  generation: number;
  fitness: number;
  timestamp?: number;
}

/**
 * Point in the 3D Pareto frontier surface
 */
export interface ParetoPoint {
  id: string;
  generation: number;
  quality: number;      // X axis (0-1)
  speed: number;        // Y axis (0-1)
  complexity: number;   // Z axis (0-1)
  fitness: number;      // Color mapping
  isParetoOptimal: boolean;
  assetId?: string;
  genomeHash: string;
}

/**
 * Node in the mutation history tree
 */
export interface MutationNode {
  id: string;
  generation: number;
  genomeHash: string;
  parentId?: string;
  mutationType: "initial" | "mutation" | "crossover" | "selection";
  fitnessChange: number;
  fitness: number;
  timestamp: number;
  children: string[];
}

/**
 * Summary of a single generation for gallery display
 */
export interface GenerationSummary {
  generation: number;
  bestAsset: AssetInfo;
  fitnessScore: number;
  parentGeneration?: number;
  mutationType: "random" | "crossover" | "guided";
  timestamp: number;
  criticScores: Record<string, number>;
}

/**
 * Live statistics during evolution
 */
export interface EvolutionStats {
  mutationRate: number;        // 0-1
  convergenceSpeed: number;    // Generations to reach local optimum
  diversityIndex: number;      // Population diversity (0-1)
  generationSpeed: number;     // Gens per minute
  eliteCount: number;          // Assets on Pareto frontier
  totalGenerations: number;
  bestFitness: number;
  averageFitness: number;
}

/**
 * Complete evolution state for the view
 */
export interface EvolutionState {
  currentGeneration: number;
  isRunning: boolean;
  genome: GenomeParameter[];
  fitnessHistory: FitnessPoint[];
  paretoFrontier: ParetoPoint[];
  mutationHistory: MutationNode[];
  generationGallery: GenerationSummary[];
  liveStats: EvolutionStats;
}

// ============================================================================
// SPECIMEN-FIRST LAB TYPES - For the instrument-focused lab interface
// ============================================================================

/**
 * Candidate information for hero specimen display
 */
export interface CandidateInfo {
  id: string;
  generation: number;
  fitness: number;
  genome: GenomeParameter[];
  criticScores: Record<string, number>;
  thumbnailUrl?: string;
  modelUrl?: string;
  parentId?: string;
  isParetoOptimal: boolean;
  position: { x: number; y: number; z: number }; // In pareto space
}

/**
 * State for the specimen hero panel
 */
export interface SpecimenState {
  current: CandidateInfo | null;      // Currently displayed in hero
  hovered: CandidateInfo | null;      // Ghost preview candidate
  pinned: CandidateInfo[];            // Up to 3 pinned for comparison
  parent: CandidateInfo | null;       // Locked parent for next mutations
}

/**
 * Grouped genome parameters for console UI
 */
export interface GenomeGroup {
  id: string;
  label: string;                      // "Lighting", "Materials", "Layout"
  icon: string;
  parameters: GenomeParameter[];
  predictedDirection?: string;        // "→ warmer tones"
}

/**
 * Diff between two genomes
 */
export interface GenomeDiff {
  changed: Array<{
    name: string;
    oldValue: number | string;
    newValue: number | string;
    delta?: number;                   // For numeric parameters
  }>;
  unchanged: string[];                // Parameter names
  similarity: number;                 // 0-1
}

/**
 * Steering state from Exploit↔Explore dial
 */
export interface SteeringState {
  exploitExplore: number;             // 0 = pure exploit, 1 = pure explore
  // Derived values:
  mutationRate: number;               // Higher when explore
  selectionPressure: number;          // Higher when exploit
  diversityTarget: number;            // Higher when explore
}

/**
 * Run state for evolution control
 */
export type RunState = "idle" | "running" | "paused";

/**
 * Inspector drawer tab options
 */
export type InspectorTab = "overview" | "genomeDiff" | "lineage" | "notes";

// ============================================================================
// WORLD BUILDER TYPES - Home console and template system
// ============================================================================

/**
 * Runtime engine for world output
 */
export type WorldRuntime = 'godot' | 'three' | 'hybrid';

/**
 * Output types a world can generate
 */
export type WorldOutput = 'viewer' | 'build' | 'publish';

/**
 * Builder mode for creating worlds
 */
export type WorldBuilderMode = 'scratch' | 'template' | 'fork' | 'import';

/**
 * Submit state for world creation
 */
export type WorldSubmitState = 'idle' | 'submitting' | 'success' | 'error';

/**
 * Blueprint draft for world configuration
 */
export interface BlueprintDraft {
  name: string;
  runtime: WorldRuntime;
  outputs: WorldOutput[];
  gates: string[];
  tags: string[];
}

/**
 * World template (prompt pack) definition
 */
export interface WorldTemplate {
  id: string;
  title: string;
  description: string;
  icon: string;

  /** Prefill content for console */
  promptText: string;

  /** Default blueprint configuration */
  blueprintDefaults: Omit<BlueprintDraft, 'name'>;

  /** Preview bullets shown on hover */
  previewBullets: string[];

  /** Optional example output thumbnails */
  exampleOutputUrls?: string[];

  /** Recommended critics for this template */
  recommendedCritics?: string[];
}

/**
 * Recent world entry for home page
 */
export interface RecentWorld {
  id: string;
  name: string;
  status: 'idle' | 'building' | 'paused' | 'canceled' | 'evolving' | 'complete' | 'failed';
  lastPrompt?: string;
  generation?: number;
  fitness?: number;
  lastRunOutcome?: 'pass' | 'fail' | null;
  updatedAt: number;
}

// ============================================================================
// BUILDING CONSOLE TYPES - World generation monitoring and control
// ============================================================================

/**
 * Build status progression during world generation
 */
export type WorldBuildStatus =
  | 'queued'
  | 'scheduling'
  | 'generating'
  | 'rendering'
  | 'critiquing'
  | 'repairing'
  | 'exporting'
  | 'voting'      // Speculation vote in progress
  | 'complete'
  | 'failed'
  | 'paused';

/**
 * LLM toolchain identifier
 */
export type Toolchain = 'claude' | 'codex' | 'opencode' | 'crush';

/**
 * Per-agent state during world build (for speculation transparency)
 */
export interface AgentState {
  id: string;                       // workcell ID
  toolchain: Toolchain;
  status: 'pending' | 'running' | 'verifying' | 'passed' | 'failed';
  fitness: number;
  currentStage?: string;
  events: BuildEvent[];
  error?: string;
}

/**
 * Build event types for agent log
 */
export type BuildEventType = 'system' | 'agent' | 'critic' | 'user' | 'error' | 'vote';

/**
 * Single event in agent build log
 */
export interface BuildEvent {
  id: string;
  agentId?: string;                 // Which agent emitted this
  type: BuildEventType;
  message: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * User refinement message status
 */
export type RefinementStatus = 'pending' | 'queued' | 'applying' | 'applied';

/**
 * User refinement during world generation
 */
export interface RefinementMessage {
  id: string;
  text: string;
  issueId?: string;                 // Child issue ID if queued
  issueTitle?: string;              // Title of child issue (if created)
  timestamp: number;
  status: RefinementStatus;
}

/**
 * Preview viewport mode toggle
 */
export type PreviewMode = 'asset' | 'game';

/**
 * Complete world build state for BuildingConsole
 */
export interface WorldBuildState {
  issueId: string;
  runId?: string;
  status: WorldBuildStatus;
  prompt: string;
  blueprint: BlueprintDraft;

  // Multi-agent tracking (speculation transparency)
  isSpeculating: boolean;
  agents: AgentState[];             // All agents (1 for single, 2+ for speculate)
  leadingAgentId?: string;          // Current best candidate
  winnerAgentId?: string;           // Final winner after vote

  // Progress metrics
  generation: number;
  bestFitness: number;
  currentStage?: string;

  // Preview URLs
  previewGlbUrl?: string;           // Three.js GLB preview
  previewGodotUrl?: string;         // Godot Web export (when available)

  // Refinements
  refinements: RefinementMessage[];

  // Error handling
  error?: string;

  // Timestamps
  startedAt: number;
  completedAt?: number;
}

// ============================================================================
// STAGE VIEW TYPES - Game playtest and preview
// ============================================================================

/**
 * Game status for Stage view
 */
export type GameStatus = 'idle' | 'loading' | 'running' | 'error';

/**
 * Console log level
 */
export type ConsoleLogLevel = 'info' | 'warn' | 'error' | 'debug';

/**
 * Console filter options
 */
export type ConsoleFilter = 'all' | 'error' | 'warn' | 'info';

/**
 * Console log entry
 */
export interface ConsoleEntry {
  id: string;
  level: ConsoleLogLevel;
  message: string;
  timestamp: number;
  source?: string;
}

/**
 * World available for playtesting in Stage view
 */
export interface StageWorld {
  id: string;
  name: string;
  runtime: WorldRuntime;
  status: 'idle' | 'building' | 'complete' | 'failed';
  generation?: number;
  fitness?: number;
  hasGameBuild: boolean;
  gamePath?: string;
  updatedAt: number;
}

/**
 * Stage view state
 */
export interface StageState {
  // World selection
  selectedWorldId: string | null;
  worlds: StageWorld[];

  // Game state
  gameUrl: string | null;
  gameStatus: GameStatus;
  errorMessage: string | null;

  // Console
  consoleLogs: ConsoleEntry[];
  consoleOpen: boolean;
  consoleFilter: ConsoleFilter;
}
