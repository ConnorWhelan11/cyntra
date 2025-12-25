/**
 * Gameplay Definition Types
 *
 * TypeScript interfaces matching gameplay.yaml schema for the
 * Fab Gameplay Definition System. Used for authoring, validation,
 * and runtime monitoring.
 */

// =============================================================================
// Core Config Types
// =============================================================================

export interface GameplayConfig {
  schema_version: string;
  world_id: string;
  player: PlayerConfig;
  entities: Record<string, EntityConfig>;
  interactions: Record<string, InteractionConfig>;
  triggers: Record<string, TriggerConfig>;
  audio_zones: Record<string, AudioZoneConfig>;
  objectives: ObjectiveConfig[];
  rules: RulesConfig;
}

export interface PlayerConfig {
  spawn_marker: string;
  spawn_rotation?: number;
  movement: MovementConfig;
  interaction: PlayerInteractionConfig;
}

export interface MovementConfig {
  walk_speed: number;
  run_speed: number;
  can_crouch: boolean;
  can_jump: boolean;
}

export interface PlayerInteractionConfig {
  reach_distance: number;
  prompt_key: string;
}

// =============================================================================
// Entity Types
// =============================================================================

export type EntityType =
  | 'npc'
  | 'key_item'
  | 'consumable'
  | 'equipment'
  | 'document'
  | 'decoration';

export interface EntityConfig {
  type: EntityType;
  display_name: string;
  marker?: string;
  description?: string;
  behavior?: string;
  patrol_path?: string;
  dialogue?: string;
  schedule?: ScheduleEntry[];
  effect?: ItemEffect;
  on_pickup?: GameplayAction[];
  on_read?: GameplayAction[];
}

export interface ScheduleEntry {
  time: [number, number]; // [start_hour, end_hour]
  location: string;
  behavior: string;
}

export interface ItemEffect {
  restore_health?: number;
  restore_stamina?: number;
  buff?: string;
}

// =============================================================================
// Interaction Types
// =============================================================================

export type InteractionType =
  | 'examine'
  | 'door'
  | 'container'
  | 'switch'
  | 'npc_talk';

export interface InteractionConfig {
  type: InteractionType;
  marker: string;
  display_name: string;
  description?: string;
  requires?: InteractionRequirement;
  actions?: GameplayAction[];
  locked_message?: string;
  contains?: string[];
  target?: string;
  initial_state?: 'open' | 'closed' | 'locked';
}

export interface InteractionRequirement {
  item?: string;
  flag?: string;
  any_of?: string[];
  all_of?: string[];
}

// =============================================================================
// Trigger Types
// =============================================================================

export type TriggerType =
  | 'enter'
  | 'exit'
  | 'proximity'
  | 'time'
  | 'flag_change';

export interface TriggerConfig {
  type: TriggerType;
  marker?: string;
  radius?: number;
  conditions?: TriggerCondition;
  once?: boolean;
  actions: GameplayAction[];
}

export interface TriggerCondition {
  flags?: Record<string, boolean>;
  has_items?: string[];
  time_range?: [number, number];
}

// =============================================================================
// Audio Zone Types
// =============================================================================

export interface AudioZoneConfig {
  marker: string;
  music_track?: string;
  ambient_sounds?: AmbientSound[];
  reverb_preset?: string;
  crossfade_time?: number;
}

export interface AmbientSound {
  sound: string;
  volume: number;
  loop: boolean;
}

// =============================================================================
// Objective Types
// =============================================================================

export type ObjectiveType = 'main' | 'side' | 'discovery' | 'final';

export type ObjectiveStatus = 'locked' | 'active' | 'completed' | 'failed';

export interface ObjectiveConfig {
  id: string;
  description: string;
  type: ObjectiveType;
  requires?: string[];
  unlock_flags?: string[];
  complete_flags?: string[];
  on_complete?: GameplayAction[];
  hint?: string;
  hidden?: boolean;
}

// =============================================================================
// Action Types
// =============================================================================

export interface GameplayAction {
  set_flag?: string;
  clear_flag?: string;
  show_message?: string;
  play_sound?: string;
  give_item?: string;
  remove_item?: string;
  spawn_entity?: string;
  despawn_entity?: string;
  start_dialogue?: string;
  teleport_player?: string;
  complete_objective?: string;
  fail_objective?: string;
  trigger_event?: string;
  unlock_door?: string;
  lock_door?: string;
  heal_player?: number;
}

// =============================================================================
// Rules Types
// =============================================================================

export interface RulesConfig {
  inventory?: InventoryRules;
  combat?: CombatRules;
  death?: DeathRules;
  save?: SaveRules;
}

export interface InventoryRules {
  max_slots: number;
  allow_drop: boolean;
  weight_limit?: number;
}

export interface CombatRules {
  enabled: boolean;
  friendly_fire?: boolean;
}

export interface DeathRules {
  respawn_marker?: string;
  drop_inventory?: boolean;
  load_checkpoint?: boolean;
}

export interface SaveRules {
  auto_save: boolean;
  save_points_only: boolean;
}

// =============================================================================
// Validation Types
// =============================================================================

export interface ValidationReport {
  valid: boolean;
  matched_npcs: string[];
  matched_items: string[];
  matched_triggers: string[];
  matched_interactions: string[];
  missing_markers: MarkerIssue[];
  orphaned_markers: string[];
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
}

export interface MarkerIssue {
  entity_id: string;
  expected_marker: string;
  entity_type: EntityType | 'trigger' | 'interaction' | 'audio_zone';
}

export interface ValidationMessage {
  code: string;
  message: string;
  entity_id?: string;
  details?: Record<string, unknown>;
}

// =============================================================================
// Runtime State Types
// =============================================================================

export interface RuntimeState {
  connected: boolean;
  objective_states: Record<string, ObjectiveStatus>;
  flags: Record<string, boolean>;
  activated_triggers: TriggerEvent[];
  inventory: InventoryItem[];
  current_zone?: string;
  play_time_seconds: number;
}

export interface TriggerEvent {
  trigger_id: string;
  timestamp: number;
  actions_executed: string[];
}

export interface InventoryItem {
  item_id: string;
  quantity: number;
  acquired_at: number;
}

// =============================================================================
// UI State Types
// =============================================================================

export type GameplayTab =
  | 'entities'
  | 'triggers'
  | 'objectives'
  | 'interactions'
  | 'audio'
  | 'validation';

export interface GameplayUIState {
  activeTab: GameplayTab;
  selectedEntityId: string | null;
  selectedTriggerId: string | null;
  selectedObjectiveId: string | null;
  selectedInteractionId: string | null;
  expandedSections: string[];
  showRuntimeMonitor: boolean;
  showValidationPanel: boolean;
}

// =============================================================================
// Graph Types (for Objectives DAG)
// =============================================================================

export interface ObjectiveGraphNode {
  id: string;
  label: string;
  status: ObjectiveStatus;
  type: ObjectiveType;
  weight: number;
  x?: number;
  y?: number;
  z?: number;
}

export interface ObjectiveGraphEdge {
  source: string;
  target: string;
  type: 'requires';
}

export interface ObjectiveGraphSnapshot {
  nodes: ObjectiveGraphNode[];
  edges: ObjectiveGraphEdge[];
}
